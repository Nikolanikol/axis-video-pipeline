// ffmpeg / ffprobe. По умолчанию — сборка из Remotion (есть везде, где установлен проект);
// свою можно указать в FFMPEG_PATH / FFPROBE_PATH.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {REVIEW_FPS} from '../src/shared/timeline.js';
import {ROOT} from './store.mjs';
import {remotionTool} from './remotion-bin.mjs';

const tool = (name) => {
  const custom = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  return custom ? {cmd: custom, pre: []} : remotionTool(name);
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

// Телефоны снимают в HDR (iPhone — Dolby Vision с кривой HLG). Такой цвет нужно перевести
// в обычный BT.709, иначе картинка выходит вялой: серое небо, приглушённые цвета.
// Размечено бывает по-разному: у одних файлов есть все три тега, у других только часть.
// Любой признак широкого охвата означает, что цвет надо переводить.
const HDR_TRANSFERS = ['arib-std-b67', 'smpte2084'];
const isHdr = (v) => Boolean(v && (
  HDR_TRANSFERS.includes(v.color_transfer)
  || v.color_primaries === 'bt2020'
  || String(v.color_space ?? '').startsWith('bt2020')
));

// Сведения о видео: длительность, размер кадра с учётом поворота, частота, есть ли звук, цвет
export const probe = async (file) => {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,color_space,color_transfer,color_primaries:stream_side_data=rotation',
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
      hdr: isHdr(v),
      transfer: v.color_transfer ?? '',
    } : null,
  };
};

// Рабочая копия: H.264, до 1080×1920 с сохранением пропорций, 30 fps, ключевой кадр каждые 0,5 с (быстрая перемотка)
// Уменьшаем до 1080×1920, но никогда не увеличиваем: апскейл резкости не добавляет,
// а вес файла и время рендера растут (сжатая копия 464×832 давала 53 МБ вместо 11).
const SCALE = "scale=w='min(1080,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";

/**
 * HDR → BT.709. Без этого шага 10-битная картинка HLG пишется как 8-битная, но с тегами HDR:
 * плееры трактуют её по-разному, и в ролике она выходит вялой — серое небо, приглушённые цвета.
 * Вход задаём явно: у части файлов размечен не весь цвет, и тогда zscale не знает, откуда переводить.
 */
const tonemapChain = (transfer) => {
  const tin = transfer === 'smpte2084' ? 'smpte2084' : 'arib-std-b67';
  return `zscale=tin=${tin}:min=bt2020nc:pin=bt2020:t=linear:npl=100,format=gbrpf32le,`
    + 'tonemap=tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:r=tv,';
};

export const makeProxy = async (input, output, duration, onProgress, {hdr = false, transfer = ''} = {}) => {
  const encode = (filters) => run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-hwaccel', 'auto', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', filters,
    // Теги цвета пишем честные — иначе файл снова объявит себя HDR
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    // Частота та же, что у ролика: лишние кадры обрабатывать незачем, недостающие взять неоткуда.
    // Ключевой кадр каждые полсекунды — от этого зависит, как быстро рендер перематывает копию.
    '-r', String(REVIEW_FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-g', String(REVIEW_FPS / 2), '-keyint_min', String(REVIEW_FPS / 2), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart',
    // Пишем во временный файл (.part) — формат указываем явно
    '-progress', 'pipe:1', '-nostats', '-f', 'mp4', output,
  ], {
    onLine: (line) => {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
      if (m && duration > 0) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / duration));
    },
  });

  const plain = `${SCALE},format=yuv420p`;
  if (!hdr) return encode(plain);
  // Уменьшаем ДО перевода цвета: тонмаппинг раскладывает каждый кадр в линейный свет с
  // плавающей точкой, и в 4K это вчетверо больше работы, чем в 1080. Замер на M1:
  // 110 с против 41 с на пяти секундах съёмки. Картинка при этом расходится на 0,6 из 255
  // по каналам — глазом не отличить.
  const fast = `${SCALE},${tonemapChain(transfer)}format=yuv420p`;
  try {
    return await encode(fast);
  } catch (e) {
    // Размеченный не по стандарту файл не должен ронять загрузку: берём его как есть
    console.warn('Перевод HDR не удался, собираю копию без него:', e.message);
    return encode(plain);
  }
};

// Миниатюры для таймлайна: fps штук в секунду, 180 px по ширине
export const makeThumbs = async (input, dir, fps) => {
  await fs.mkdir(dir, {recursive: true});
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', input, '-an', '-r', String(fps), '-vf', 'scale=180:-2', '-q:v', '6', path.join(dir, '%04d.jpg')]);
  return (await fs.readdir(dir)).filter((f) => f.endsWith('.jpg')).length;
};
