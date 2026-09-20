// Субтитры: слова с таймингами → строки для ролика. Общий модуль (ролик, интерфейс, сервер, тесты).
import {clipOf} from './narration.js';

/**
 * @typedef {{text: string, start: number, end: number, type?: string, speaker_id?: string}} Word
 * @typedef {{id: string, start: number, end: number, text: string, translation?: string}} Line
 */

export const MAX_LINE_CHARS = 48;   // столько влезает в две строки на 1080 px
export const MAX_LINE_SEC = 3.2;    // дольше строку держать не стоит
export const PAUSE_SEC = 0.6;       // пауза в речи — новая строка
export const MAX_LINES = 200;

const round = (v) => Math.round(v * 100) / 100;
const ENDS_SENTENCE = /[.!?…]$/;
const ENDS_CLAUSE = /[,;:—]$/;
const SHORT_TAIL_CHARS = 16;
const SHORT_TAIL_SEC = 1;

/**
 * Собирает строки: по паузам, знакам конца предложения, длине и времени.
 * Служебные пометки вроде [tone] в субтитры не идут.
 * @param {Word[]} words
 * @returns {Line[]}
 */
export const linesFromWords = (words, {maxChars = MAX_LINE_CHARS, maxSec = MAX_LINE_SEC, pause = PAUSE_SEC} = {}) => {
  const lines = [];
  let current = null;
  for (const w of Array.isArray(words) ? words : []) {
    if (!w || typeof w.text !== 'string') continue;
    if (w.type && w.type !== 'word' && w.type !== 'spacing') continue;
    const text = w.text.trim();
    if (!text) continue;
    const start = Number(w.start) || 0;
    const end = Math.max(start, Number(w.end) || start);
    const tooLong = current && (current.text.length + 1 + text.length > maxChars || end - current.start > maxSec);
    const afterPause = current && start - current.end > pause;
    const afterSentence = current && ENDS_SENTENCE.test(current.text);
    // После запятой рвём, только если строка уже больше половины — иначе фраза распадается
    const afterClause = current && ENDS_CLAUSE.test(current.text) && current.text.length > maxChars * 0.6;
    if (!current || tooLong || afterPause || afterSentence || afterClause) {
      current = {id: `l${lines.length + 1}`, start: round(start), end: round(end), text};
      lines.push(current);
      if (lines.length >= MAX_LINES) break;
    } else {
      current.text += ` ${text}`;
      current.end = round(end);
    }
  }
  // Короткий хвост подклеиваем к предыдущей строке, если влезает
  for (let i = lines.length - 1; i > 0; i--) {
    const tail = lines[i];
    const prev = lines[i - 1];
    const short = tail.text.length <= SHORT_TAIL_CHARS || tail.end - tail.start <= SHORT_TAIL_SEC;
    const fits = prev.text.length + 1 + tail.text.length <= maxChars + 8 && tail.end - prev.start <= maxSec + 1;
    if (short && fits && tail.start - prev.end <= pause && !ENDS_SENTENCE.test(prev.text)) {
      prev.text += ` ${tail.text}`;
      prev.end = tail.end;
      lines.splice(i, 1);
    }
  }
  return lines.map((l, i) => ({...l, id: `l${i + 1}`}));
};

/** Чистит строки из формы: порядок, границы, длина текста */
export const sanitizeLines = (raw, duration) => {
  if (!Array.isArray(raw)) return [];
  const limit = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return raw.slice(0, MAX_LINES).map((l, i) => {
    const start = Math.min(Math.max(0, Number(l?.start) || 0), limit);
    const end = Math.min(Math.max(start + 0.2, Number(l?.end) || start + 0.2), limit);
    return {
      id: typeof l?.id === 'string' && /^[\w-]{1,20}$/.test(l.id) ? l.id : `l${i + 1}`,
      start: round(start),
      end: round(end),
      text: String(l?.text ?? '').slice(0, 200),
      translation: String(l?.translation ?? '').slice(0, 200),
    };
  }).filter((l) => l.text || l.translation);
};

/** Текст строки для показа: перевод, если он есть и выбран */
export const lineText = (line, useTranslation) => (useTranslation && line.translation ? line.translation : line.text);

/**
 * Строка, попадающая в момент времени ролика.
 * Субтитры сдвигаются вместе с фрагментами: время исходника → время ролика.
 * @param {Line[]} lines
 * @param {number} sourceTime
 */
export const lineAtSourceTime = (lines, sourceTime) =>
  lines.find((l) => sourceTime >= l.start && sourceTime <= l.end) ?? null;

/**
 * Куски озвучки внутри фрагмента: фразы идут по своим местам, без нахлёста.
 * Берём строки, которые начинаются внутри фрагмента, — так фраза звучит ровно один раз.
 * offset — откуда играть файл: в единой начитке это отрезок общей дорожки.
 * @param {Line[]} lines
 * @param {{clips?: object, track?: {file: string}} | null | undefined} voice
 * @param {{start: number, duration: number, speed: number, voiceLine?: string}} seg
 * @param {number} segFrames
 * @param {number} fps
 * @returns {{id: string, from: number, frames: number, file: string, offset: number, line: Line}[]}
 */
export const voiceForSegment = (lines, voice, seg, segFrames, fps) => {
  if (!voice?.clips || seg.speed !== 1) return [];
  // Фрагмент знает свою фразу (раскладка «под озвучку») — играем ровно её, с начала фрагмента
  if (seg.voiceLine) {
    const line = (Array.isArray(lines) ? lines : []).find((l) => l.id === seg.voiceLine);
    const clip = line && clipOf(voice, line.id);
    if (!clip) return [];
    const frames = Math.min(segFrames, Math.round(clip.duration * fps));
    return frames < 2 ? [] : [{id: line.id, from: 0, frames, file: clip.file, offset: clip.offset, line}];
  }
  const segEnd = seg.start + (segFrames / fps) * seg.speed;
  const out = [];
  // Раньше этого кадра ставить нельзя: предыдущая фраза ещё звучит
  let next = 0;
  for (const l of Array.isArray(lines) ? lines : []) {
    if (l.start < seg.start - 1e-6 || l.start >= segEnd) continue;
    const clip = clipOf(voice, l.id);
    if (!clip) continue;
    // Фраза звучит там, где она была у автора, — иначе озвучка убегает вперёд от картинки
    const want = Math.round(((l.start - seg.start) / seg.speed) * fps);
    const from = Math.max(next, want);
    if (from >= segFrames) break;
    const frames = Math.min(segFrames - from, Math.round(clip.duration * fps));
    if (frames < 2) break;
    out.push({id: l.id, from, frames, file: clip.file, offset: clip.offset, line: l});
    next = from + frames;
  }
  return out;
};

/**
 * Куски строк, попавшие во фрагмент ролика.
 * Ускоренные фрагменты идут без звука — субтитров на них тоже нет.
 * @param {Line[]} lines
 * @param {{start: number, duration: number, speed: number}} seg — фрагмент исходника
 * @param {number} segFrames — сколько кадров занимает фрагмент в ролике
 * @param {number} fps
 * @returns {{id: string, from: number, frames: number, line: Line}[]} — кадры внутри фрагмента
 */
export const linesForSegment = (lines, seg, segFrames, fps) => {
  if (seg.speed !== 1) return [];
  const out = [];
  const segEnd = seg.start + (segFrames / fps) * seg.speed;
  for (const l of lines) {
    if (l.end <= seg.start || l.start >= segEnd) continue;
    const from = Math.max(0, Math.round(((l.start - seg.start) / seg.speed) * fps));
    const to = Math.min(segFrames, Math.round(((l.end - seg.start) / seg.speed) * fps));
    if (to - from < 2) continue;
    out.push({id: l.id, from, frames: to - from, line: l});
  }
  return out;
};

/**
 * Относится ли распознанная речь к тому видео, которое сейчас в обзоре.
 * Видео можно заменить в любой момент, а тайминги строк считаны по прежнему файлу: если
 * не проверять, начитка и субтитры лягут на чужую съёмку и не совпадут с ней ничем.
 * @param {{source?: {name?: string, duration?: number}, lines?: Line[]} | null | undefined} speech
 * @param {{name?: string, duration?: number} | null | undefined} source
 * @returns {boolean}
 */
export const speechStale = (speech, source) => {
  if (!speech?.lines?.length || !source) return false;
  const known = speech.source;
  if (known) {
    if (known.name && source.name && known.name !== source.name) return true;
    if (Number.isFinite(known.duration) && Number.isFinite(source.duration)
      && Math.abs(known.duration - source.duration) > 0.5) return true;
    return false;
  }
  // У старых обзоров пометки нет — ловим хотя бы явное: речь длиннее самой съёмки
  const last = speech.lines[speech.lines.length - 1]?.end ?? 0;
  return Number.isFinite(source.duration) && last > source.duration + 0.5;
};
