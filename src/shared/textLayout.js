// Подбор текста в прямоугольник без зависимости от DOM/React/Remotion.
// measure вызывающая сторона связывает с фактическим шрифтом, а не числом символов.
// Исходный текст не сокращается: если минимум не помещается, результат явно не готов.

/** @typedef {{width: number, height: number, minSize: number, maxSize: number,
 * lineHeight?: number, maxLines?: number, wrap?: boolean, breakWords?: boolean}} TextBox */
/** @typedef {{fontSize: number, lines: string[], lineCount: number, width: number, height: number,
 * baseline: number, lineAdvance: number, lineOffsets: number[], lineWidths: number[], fits: boolean,
 * status: 'original' | 'adapted' | 'overflow', reason: string | null, source: string}} TextLayout */
/** @typedef {number | {width: number, ascent: number, descent: number, left?: number}} TextMeasurement */

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
const graphemes = (text) => segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
/** Число видимых знаков для межбуквенного интервала; семейный эмодзи считается одним. */
export const graphemeCount = (text) => graphemes(text).length;

/** @param {string} source @param {TextBox} box @param {(text: string, size: number) => TextMeasurement} measure
 * @returns {TextLayout} */
export const fitTextBlock = (source, box, measure) => {
  const {width, height, minSize, maxSize, lineHeight = 1.12, maxLines = Infinity, wrap = true, breakWords = true} = box;
  if (![width, height, minSize, maxSize, lineHeight].every((n) => Number.isFinite(n) && n > 0)
    || maxSize < minSize || !(maxLines >= 1)) throw new Error('Некорректные границы текстового блока');
  const text = String(source).replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  const metrics = (value, size) => {
    const raw = measure(value, size);
    const result = typeof raw === 'number' ? {width: raw, ascent: size * .8, descent: size * .2, left: 0} : {...raw, left: raw.left ?? 0};
    if (![result.width, result.ascent, result.descent, result.left].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Не удалось измерить текст');
    return result;
  };
  const measured = (value, size) => metrics(value, size).width;
  const atSize = (fontSize) => {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      if (!wrap) { lines.push(paragraph); continue; }
      // Обычный пробел допускает перенос; неразрывный пробел остаётся частью слова.
      const words = paragraph.split(/ +/).filter(Boolean);
      let line = '';
      const flush = () => { if (line) lines.push(line); line = ''; };
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (measured(candidate, fontSize) <= width) { line = candidate; continue; }
        flush();
        if (breakWords && measured(word, fontSize) > width) {
          for (const part of graphemes(word)) {
            if (line && measured(line + part, fontSize) > width) flush();
            line += part;
          }
        } else line = word;
      }
      if (line || !words.length) lines.push(line);
    }
    const rows = lines.map((line) => metrics(line, fontSize));
    const usedWidth = Math.max(0, ...rows.map((row) => row.width));
    const ascent = Math.max(0, ...rows.map((row) => row.ascent));
    const descent = Math.max(0, ...rows.map((row) => row.descent));
    const lineAdvance = Math.max(fontSize * lineHeight, ascent + descent);
    const usedHeight = ascent + descent + Math.max(0, lines.length - 1) * lineAdvance;
    const reason = usedWidth > width + .01 ? 'width' : lines.length > maxLines ? 'lines' : usedHeight > height + .01 ? 'height' : null;
    return {fontSize, lines, lineCount: lines.length, width: usedWidth, height: usedHeight,
      baseline: ascent, lineAdvance, lineOffsets: rows.map((row) => row.left), lineWidths: rows.map((row) => row.width), fits: reason === null,
      status: reason ? 'overflow' : fontSize === maxSize ? 'original' : 'adapted', reason, source: String(source)};
  };
  const original = atSize(maxSize);
  if (original.fits) return original;
  let best = atSize(minSize);
  if (!best.fits) return best;
  // Фиксированная сетка 0,25 px не зависит от масштаба превью и номера кадра.
  let lo = Math.ceil(minSize * 4), hi = Math.floor(maxSize * 4);
  while (lo <= hi) {
    const middle = Math.floor((lo + hi) / 2), candidate = atSize(middle / 4);
    if (candidate.fits) { best = candidate; lo = middle + 1; } else hi = middle - 1;
  }
  return best;
};
