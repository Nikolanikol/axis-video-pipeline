// Общие помощники тестов
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {remotionTool} from '../server/remotion-bin.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Временные папки данных и настроек: тесты не трогают настоящие config/ и data/.
// Вызывать ДО импорта модулей сервера — они читают пути при загрузке.
export const useTempEnv = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axis-video-test-'));
  const config = path.join(dir, 'config');
  await fs.cp(path.join(ROOT, 'config'), config, {recursive: true});
  process.env.CONFIG_DIR = config;
  process.env.DATA_DIR = path.join(dir, 'data');
  return {dir, config, data: process.env.DATA_DIR, cleanup: () => fs.rm(dir, {recursive: true, force: true})};
};

// ffmpeg/ffprobe из Remotion
const run = promisify(execFile);
export const remotionBin = (tool, args) => {
  const {cmd, pre} = remotionTool(tool);
  return run(cmd, [...pre, ...args], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
};

export const probe = async (file) => {
  const {stdout} = await remotionBin('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,nb_frames', '-of', 'json', file]);
  return JSON.parse(stdout.slice(stdout.indexOf('{'))).streams;
};

// Аудио ролика → моно PCM 16 бит
export const decodeAudio = async (file, sampleRate = 22050) => {
  const wav = `${file}.wav`;
  await remotionBin('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-c:a', 'pcm_s16le', wav]);
  const buf = await fs.readFile(wav);
  let pos = 12;
  while (pos < buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'data') {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(pos + 8 + i * 2) / 32768;
      return {samples, sampleRate};
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error(`В ${wav} нет данных`);
};

// Низкочастотный фильтр (бочка) без фазового сдвига: RBJ biquad вперёд и назад
const lowpass = (x, sr, fc) => {
  const w = 2 * Math.PI * fc / sr, alpha = Math.sin(w) / (2 * Math.SQRT1_2), cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, b2 = b0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  const pass = (src) => {
    const y = new Float32Array(src.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const v = b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = src[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  return pass(pass(x).reverse()).reverse();
};

// Смещение атаки бочки относительно сетки долей (сек): медиана по долям
export const beatOffset = ({samples, sampleRate: sr}, period, {skipSec = 0.5, tailSec = 1} = {}) => {
  const low = lowpass(samples, sr, 120);
  const k = Math.round(sr * 0.004);
  const env = new Float32Array(low.length);
  let acc = 0;
  for (let i = 0; i < low.length; i++) {
    acc += Math.abs(low[i]) - (i >= k ? Math.abs(low[i - k]) : 0);
    env[i] = acc / k;
  }
  const shift = Math.floor(k / 2); // скользящее среднее запаздывает на полокна
  const offsets = [];
  for (let t0 = skipSec; t0 < samples.length / sr - tailSec; t0 += period) {
    const a = Math.round((t0 - 0.22) * sr), b = Math.round((t0 + 0.26) * sr);
    const w = Array.from(env.subarray(a, b));
    let ip = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[ip]) ip = i;
    const base = [...w].sort((p, q) => p - q)[Math.floor(w.length * 0.1)];
    const thr = base + 0.5 * (w[ip] - base);
    let j = ip;
    while (j > 0 && w[j] > thr) j--;
    offsets.push((a + j - shift) / sr - t0);
  }
  offsets.sort((p, q) => p - q);
  return offsets[Math.floor(offsets.length / 2)];
};

export const peak = ({samples}) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// Тестовое видео: градиент с бегущим прямоугольником. rotation — поворот в метаданных, как у iPhone.
export const makeTestVideo = async (file, {width, height, seconds, fps = 10, rotation = 0, audio = false}) => {
  const {default: sharp} = await import('sharp');
  const frames = await fs.mkdtemp(path.join(os.tmpdir(), 'axis-frames-'));
  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) {
    const hue = Math.round((360 * i) / total);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,55%)"/>`
      + `<stop offset="1" stop-color="hsl(${(hue + 150) % 360},70%,25%)"/></linearGradient></defs>`
      + `<rect width="100%" height="100%" fill="url(#g)"/>`
      + `<rect x="${(i * 13) % width}" y="${height / 3}" width="${width / 5}" height="${height / 6}" fill="#fff"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(frames, `${String(i).padStart(4, '0')}.png`));
  }
  const plain = rotation ? `${file}.plain.mp4` : file;
  const videoIn = ['-framerate', String(fps), '-i', path.join(frames, '%04d.png')];
  // Звук: простая синусоида в WAV — чтобы было что распознавать
  let audioIn = [];
  if (audio) {
    const wav = path.join(frames, 'tone.wav');
    await fs.writeFile(wav, sineWav(seconds));
    audioIn = ['-i', wav, '-c:a', 'aac', '-b:a', '96k', '-shortest'];
  }
  await remotionBin('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...videoIn, ...audioIn,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', plain]);
  if (rotation) {
    await remotionBin('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-display_rotation', String(rotation), '-i', plain, '-c', 'copy', file]);
    await fs.rm(plain, {force: true});
  }
  await fs.rm(frames, {recursive: true, force: true});
  return file;
};

// WAV с синусоидой (моно, 16 кГц)
export const sineWav = (seconds, rate = 16000, freq = 440) => {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

// Простой http-сервер для папки (рендер берёт видео по http)
export const serveDir = async (dir) => {
  const http = await import('node:http');
  const server = http.createServer(async (req, res) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(file);
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : data.length - 1;
        res.writeHead(206, {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1});
        res.end(data.subarray(start, end + 1));
      } else {
        res.writeHead(200, {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': data.length});
        res.end(data);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r))};
};

// Дождаться условия (опрос)
export const waitFor = async (fn, {timeout = 60_000, every = 300} = {}) => {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error('Не дождались');
    await new Promise((r) => setTimeout(r, every));
  }
};
