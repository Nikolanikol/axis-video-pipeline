// Границы фраз начитки по звуку (серверная часть): раскодировать дорожку, снять огибающую
// громкости и передать src/shared/voiceCuts.js — там объяснено, зачем и по какому правилу.
import fs from 'node:fs/promises';
import {envelopeOf, snapCuts} from '../src/shared/voiceCuts.js';
import {run} from './media.mjs';

const RATE = 16000; // для огибающей по 10 мс хватает с большим запасом

/** Отсчёты из WAV: ищем кусок «data» по меткам, а не по фиксированным 44 байтам заголовка */
const pcmOf = (wav) => {
  let at = 12; // «RIFF» + размер + «WAVE»
  while (at + 8 <= wav.length) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'data') {
      const bytes = Math.min(size, wav.length - at - 8) & ~1;
      // Копия, а не вид поверх буфера: у Buffer смещение бывает нечётным, а Int16Array требует чётного
      const samples = new Int16Array(bytes >> 1);
      Buffer.from(samples.buffer).set(wav.subarray(at + 8, at + 8 + bytes));
      return samples;
    }
    at += 8 + size + (size & 1);
  }
  throw new Error('в раскодированной дорожке нет звука');
};

/**
 * Уточнить отрезки строк по звуку дорожки.
 * @param {string} file — путь к mp3 начитки
 * @param {Record<string, {from: number, to: number}>} clips — отрезки по разметке ElevenLabs
 * @param {number} [duration] — длина дорожки, с
 */
export const refineCuts = async (file, clips, duration) => {
  const wav = `${file}.tmp.wav`;
  try {
    // WAV, а не сырой звук: встроенная сборка ffmpeg из Remotion собрана без остальных
    // мультиплексоров (s16le, flac отвергает). Через файл — потому что run() собирает вывод
    // строкой, а двоичные данные она испортила бы
    await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', file, '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', '-f', 'wav', wav]);
    return snapCuts(clips, envelopeOf(pcmOf(await fs.readFile(wav)), RATE), {duration});
  } finally {
    await fs.rm(wav, {force: true});
  }
};
