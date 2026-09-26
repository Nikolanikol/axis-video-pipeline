// Подготовка звуковых эффектов: node tools/prep-sfx.mjs <исходник> <выход.wav> [peak-dBFS]
//
// Исходник — любой звук (mp3 из библиотеки или свой синтез). На выходе WAV 48 кГц стерео:
//   • тишина в начале срезана — иначе звук опаздывает на неё относительно плашки;
//   • пик выровнен (по умолчанию −3 дБ) — все эффекты набора звучат ровно, громкость в ролике
//     дальше задаётся одним числом на событие;
//   • в конце короткое затухание — без щелчка на обрыве;
//   • WAV, а не MP3: у MP3 задержка кодера около 25 мс, а звук должен совпасть с кадром.
// Печатает длину и где у звука пик («удар»): у перехода и удара на цене он не в начале,
// и в ролике звук ставится так, чтобы на появление плашки пришёлся пик, а не начало.
//
// Декодирует ffmpeg из сборки Remotion (как вся обработка видео), остальное — здесь: в этой
// сборке нет фильтра silenceremove, а тащить зависимость от полного ffmpeg ради четырёх
// звуков незачем.
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import {promisify} from 'node:util';
import {remotionTool} from '../server/remotion-bin.mjs';

const run = promisify(execFile);
const [src, out, peakArg] = process.argv.slice(2);
if (!src || !out) {
  console.error('node tools/prep-sfx.mjs <исходник> <выход.wav> [peak-dBFS]');
  process.exit(1);
}
const RATE = 48000;
const PEAK_DB = Number(peakArg ?? -3);
const START_THRESHOLD = 10 ** (-50 / 20);   // −50 дБ: всё тише — тишина
const FADE_SEC = 0.08;

// В сборке Remotion нет и «сырого» вывода (f32le) — декодируем во временный WAV и читаем его
const {cmd, pre} = remotionTool('ffmpeg');
const tmp = `${out}.decode.wav`;
await run(cmd, [...pre, '-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', tmp]);
const wav = await fs.readFile(tmp);
await fs.rm(tmp, {force: true});
const dataAt = wav.indexOf('data', 12);
const bytes = wav.readUInt32LE(dataAt + 4);
const frames = Math.floor(Math.min(bytes, wav.length - dataAt - 8) / 4);
const pcm = new Float32Array(frames * 2);
for (let i = 0; i < frames * 2; i++) pcm[i] = wav.readInt16LE(dataAt + 8 + i * 2) / 32768;
const amp = (i) => Math.max(Math.abs(pcm[2 * i]), Math.abs(pcm[2 * i + 1]));

let start = 0;
while (start < frames && amp(start) < START_THRESHOLD) start++;
let peak = 0;
let peakAt = start;
for (let i = start; i < frames; i++) if (amp(i) > peak) { peak = amp(i); peakAt = i; }
if (!peak) throw new Error('В файле тишина');

const gain = 10 ** (PEAK_DB / 20) / peak;
const len = frames - start;
const fade = Math.min(len, Math.round(FADE_SEC * RATE));
const pcm16 = Buffer.alloc(len * 4);
for (let i = 0; i < len; i++) {
  const k = i >= len - fade ? (len - i) / fade : 1;
  for (let c = 0; c < 2; c++) {
    const v = Math.max(-1, Math.min(1, pcm[2 * (start + i) + c] * gain * k));
    pcm16.writeInt16LE(Math.round(v * 32767), (2 * i + c) * 2);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm16.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm16.length, 40);
await fs.writeFile(out, Buffer.concat([header, pcm16]));
console.log(JSON.stringify({out, durationSec: +(len / RATE).toFixed(3), peakSec: +((peakAt - start) / RATE).toFixed(3),
  trimmedSec: +(start / RATE).toFixed(3), gainDb: +(20 * Math.log10(gain)).toFixed(1)}));
