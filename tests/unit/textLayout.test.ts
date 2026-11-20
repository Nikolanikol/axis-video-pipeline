import {describe, expect, it} from 'vitest';
import {fitTextBlock, graphemeCount} from '../../src/shared/textLayout.js';

const box = {width: 120, height: 100, minSize: 10, maxSize: 20, lineHeight: 1.1, maxLines: 4};
const measure = (text: string, size: number) => ({width: graphemeCount(text) * size, ascent: size * .8, descent: size * .2});

describe('укладка текста без потери исходника', () => {
  it('переносит слова, сохраняя полный текст', () => {
    const source = 'Первый второй третий';
    const result = fitTextBlock(source, box, measure);
    expect(result.fits).toBe(true);
    expect(result.lines.join(' ')).toBe(source);
    expect(result.source).toBe(source);
    expect(result.fontSize).toBeGreaterThanOrEqual(box.minSize);
  });

  it('не сокращает телефон, даже когда он не помещается на минимуме', () => {
    const source = '+82 10 1234 5678';
    const result = fitTextBlock(source, {...box, wrap: false, breakWords: false, maxLines: 1}, measure);
    expect(result).toMatchObject({fits: false, status: 'overflow', reason: 'width', fontSize: 10, source});
    expect(result.lines).toEqual([source]);
  });

  it('учитывает реальные вертикальные метрики, а не только кегль', () => {
    const result = fitTextBlock('abc', {...box, height: 15}, (text, size) => ({width: text.length * size, ascent: 12, descent: 5}));
    expect(result).toMatchObject({fits: false, reason: 'height', height: 17});
  });

  it('сохраняет ручные пустые строки и вынос курсива', () => {
    const result = fitTextBlock('a\n\nb', box, (text, size) => ({...measure(text, size), left: 4}));
    expect(result.fits).toBe(true);
    expect(result.lines).toEqual(['a', '', 'b']);
    expect(result.lineOffsets).toEqual([4, 4, 4]);
  });

  it('не разрывает семейный эмодзи между строками', () => {
    const emoji = '👨‍👩‍👧‍👦';
    const result = fitTextBlock(emoji.repeat(3), {...box, width: 20}, measure);
    expect(graphemeCount(emoji)).toBe(1);
    expect(result.lines).toEqual([emoji, emoji, emoji]);
    expect(result.fits).toBe(true);
  });

  it('сохраняет всё описание при отказе по числу строк', () => {
    const source = 'Полное описание автомобиля '.repeat(20);
    const result = fitTextBlock(source, {...box, maxLines: 1}, measure);
    expect(result.fits).toBe(false);
    expect(result.source).toBe(source);
    expect(result.lines.join(' ')).toBe(source.trim());
    expect(result.fontSize).toBe(box.minSize);
  });
});
