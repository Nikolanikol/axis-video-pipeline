// Начитка перевода: весь текст синтезируется одним запросом, а не строка за строкой.
//
// Построчный синтез давал рваные паузы и «плавающий» тембр: каждый запрос — отдельная попытка,
// модель не знает, что звучало до и что будет после. Одной начиткой голос ровный, а паузы между
// фразами расставляет сама модель — по смыслу, а не по нашей формуле.
//
// Чтобы разложить начитку по таймлайну, ElevenLabs отдаёт разметку по символам: где в звуке
// начинается и кончается каждый символ. По ней считаем, с какой по какую секунду звучит строка.

/** @typedef {{id: string, translation?: string}} Line */
/** @typedef {{characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[]}} Alignment */

// Строки склеиваем пробелом: перевод строк модель иногда читает как паузу разной длины
export const SCRIPT_JOIN = ' ';

/**
 * Текст начитки и где в нём лежит каждая строка.
 * @param {Line[]} lines
 * @returns {{text: string, spans: {id: string, from: number, to: number}[]}} — from/to: индексы символов
 */
export const buildScript = (lines) => {
  const spans = [];
  let text = '';
  for (const l of Array.isArray(lines) ? lines : []) {
    const part = String(l?.translation ?? '').trim();
    if (!part || !l?.id) continue;
    if (text) text += SCRIPT_JOIN;
    spans.push({id: l.id, from: text.length, to: text.length + part.length - 1});
    text += part;
  }
  return {text, spans};
};

/**
 * Разметка по символам → отрезки строк в секундах.
 * Разметка приходит для того же текста, что отправляли, поэтому индексы совпадают.
 * @param {{id: string, from: number, to: number}[]} spans
 * @param {Alignment} alignment
 * @returns {Record<string, {from: number, to: number}>}
 */
export const lineTimes = (spans, alignment) => {
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const out = {};
  for (const s of spans ?? []) {
    const from = starts[s.from];
    const to = ends[s.to];
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    out[s.id] = {from: Math.round(from * 1000) / 1000, to: Math.round(to * 1000) / 1000};
  }
  return out;
};

/**
 * Где взять звук строки: в единой начитке (отрезок) или в отдельном клипе (прежний способ).
 * Прежние обзоры не ломаем — у них у каждой строки свой файл.
 * @returns {{file: string, offset: number, duration: number} | null}
 */
export const clipOf = (voice, lineId) => {
  const c = voice?.clips?.[lineId];
  if (!c) return null;
  // Единая начитка: отрезок внутри общей дорожки
  if (voice.track?.file && Number.isFinite(c.from) && Number.isFinite(c.to) && c.to > c.from) {
    return {file: voice.track.file, offset: c.from, duration: Math.round((c.to - c.from) * 1000) / 1000};
  }
  // Прежний способ: свой файл на строку
  if (c.file && Number(c.duration) > 0) return {file: c.file, offset: 0, duration: c.duration};
  return null;
};

/** Сколько строк озвучено (для подписи в интерфейсе) */
export const voicedCount = (voice) =>
  Object.keys(voice?.clips ?? {}).filter((id) => clipOf(voice, id)).length;

/**
 * Сколько секунд отвести каждой фразе на таймлайне.
 * В единой начитке между фразами уже есть паузы, поставленные моделью, — отводим строке время
 * до начала следующей, тогда отрезки идут встык и дорожка звучит непрерывно. Если добавлять
 * свой зазор поверх, эти паузы вырезаются и заменяются тишиной — ровно то, от чего уходили.
 * @param {{id: string}[]} lines
 * @param {{clips?: object, track?: {file: string, duration?: number}}} voice
 * @param {{gap?: number}} [options] — зазор для прежних обзоров, где у каждой строки свой файл
 * @returns {{id: string, seconds: number}[]}
 */
export const narrationSlots = (lines, voice, {gap = 0.15} = {}) => {
  const usable = (Array.isArray(lines) ? lines : []).filter((l) => clipOf(voice, l?.id));
  const single = Boolean(voice?.track?.file);
  return usable.map((l, i) => {
    const clip = clipOf(voice, l.id);
    if (!single) return {id: l.id, seconds: Math.round((clip.duration + gap) * 1000) / 1000};
    const next = usable[i + 1] ? clipOf(voice, usable[i + 1].id) : null;
    // До начала следующей фразы — вместе с паузой, которую поставила модель
    const seconds = next ? next.offset - clip.offset : clip.duration + gap;
    return {id: l.id, seconds: Math.round(Math.max(clip.duration, seconds) * 1000) / 1000};
  });
};

/**
 * Куда положить каждую фразу озвучки на всём ролике.
 *
 * Считаем один раз по всему таймлайну, а не по фрагментам: начитка непрерывна, и граница
 * фрагмента картинки не должна её обрывать. Раньше фраза, попавшая на стык, обрезалась
 * концом своего фрагмента — в ролике это слышно как оборванное слово.
 *
 * @param {{seg: object, from: number, frames: number}[]} items — фрагменты в кадрах ролика
 * @param {import('./subtitles.js').Line[]} lines
 * @param {{clips?: object, track?: {file: string}} | null | undefined} voice
 * @param {number} fps
 * @returns {{id: string, from: number, frames: number, file: string, offset: number, line: import('./subtitles.js').Line}[]}
 */
export const voicePlan = (items, lines, voice, fps) => {
  if (!voice?.clips || !Array.isArray(items) || !items.length) return [];
  const all = Array.isArray(lines) ? lines : [];
  const rollEnd = items[items.length - 1].from + items[items.length - 1].frames;
  const out = [];
  const used = new Set();
  // Раньше этого кадра ставить нельзя: предыдущая фраза ещё звучит
  let next = 0;
  for (const {seg, from: segFrom, frames: segFrames} of items) {
    if (seg.speed !== 1) continue;
    // Фрагмент под озвучку знает свою фразу; у обычного берём те, что начинаются внутри него
    const mine = seg.voiceLine
      ? all.filter((l) => l.id === seg.voiceLine)
      : all.filter((l) => {
        const segEnd = seg.start + (segFrames / fps) * seg.speed;
        return l.start >= seg.start - 1e-6 && l.start < segEnd;
      });
    for (const line of mine) {
      if (used.has(line.id)) continue;
      const clip = clipOf(voice, line.id);
      if (!clip) continue;
      // Фраза звучит там, где она была у автора: время исходника → кадр ролика
      const want = seg.voiceLine ? segFrom : segFrom + Math.round(((line.start - seg.start) / seg.speed) * fps);
      const at = Math.max(next, want);
      if (at >= rollEnd) break;
      // Обрезаем только концом ролика — граница фрагмента фразе не указ
      const frames = Math.min(rollEnd - at, Math.round(clip.duration * fps));
      if (frames < 2) break;
      used.add(line.id);
      out.push({id: line.id, from: at, frames, file: clip.file, offset: clip.offset, line});
      next = at + frames;
    }
  }
  return out;
};
