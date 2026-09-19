// ffmpeg / ffprobe. По умолчанию — сборка из Remotion (есть везде, где установлен проект);
// свою можно указать в FFMPEG_PATH / FFPROBE_PATH.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './store.mjs';

const REMOTION_BIN = path.join(ROOT, 'node_modules', '.bin', 'remotion');
const tool = (name) => {
  const custom = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  return custom ? {cmd: custom, pre: []} : {cmd: REMOTION_BIN, pre: [name]};
};

export const run = (name, args, {onLine} = {}) => new Promise((resolve, reject) => {
  const {cmd, pre} = tool(name);
  const child = spawn(cmd, [...pre, ...args], {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  let err = '';
  let pending = '';
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    out += text;
    if (!onLine) return;
    const parts = (pending + text).split('\n');
    pending = parts.pop();
    for (const line of parts) onLine(line.trim());
  });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) return resolve(out);
    const tail = err.trim().split('\n').filter((l) => !l.includes('root directory')).slice(-3).join(' ');
    reject(new Error(`${name}: ${tail || `код ${code}`}`));
  });
});

// Сведения о видео: длительность, размер кадра с учётом поворота, частота, есть ли звук
export const probe = async (file) => {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate:stream_side_data=rotation',
    '-of', 'json', file,
  ]);
  const data = JSON.parse(out.slice(out.indexOf('{')));
  const v = data.streams?.find((s) => s.codec_type === 'video');
  const rotation = Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const [num, den] = String(v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const turned = Math.abs(rotation) % 180 === 90;
  return {
    duration: Number(data.format?.duration ?? 0),
    size: Number(data.format?.size ?? 0),
    hasAudio: Boolean(data.streams?.some((s) => s.codec_type === 'audio')),
    video: v ? {
      codec: v.codec_name,
      width: turned ? v.height : v.width,
      height: turned ? v.width : v.height,
      fps: den ? Math.round((num / den) * 100) / 100 : 0,
      rotation,
    } : null,
  };
};

// Рабочая копия: H.264, до 1080×1920 с сохранением пропорций, 30 fps, ключевой кадр каждые 0,5 с (быстрая перемотка)
export const makeProxy = async (input, output, duration, onProgress) => {
  await run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-hwaccel', 'auto', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', 'scale=w=1080:h=1920:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p',
    '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '15', '-keyint_min', '15', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart',
    // Пишем во временный файл (.part) — формат указываем явно
    '-progress', 'pipe:1', '-nostats', '-f', 'mp4', output,
  ], {
    onLine: (line) => {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
      if (m && duration > 0) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / duration));
    },
  });
};

// Миниатюры для таймлайна: fps штук в секунду, 180 px по ширине
export const makeThumbs = async (input, dir, fps) => {
  await fs.mkdir(dir, {recursive: true});
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', input, '-an', '-r', String(fps), '-vf', 'scale=180:-2', '-q:v', '6', path.join(dir, '%04d.jpg')]);
  return (await fs.readdir(dir)).filter((f) => f.endsWith('.jpg')).length;
};
