// Цветокоррекция: чистка настроек, CSS-фильтр, теплота каналами
import {describe, expect, it} from 'vitest';
import {
  COLOUR_RANGE, NEUTRAL, colourFilter, isNeutral, mergeColour, sanitizeColour, warmthChannels,
} from '../../src/shared/colour.js';

describe('чистка настроек цвета', () => {
  it('за шкалу не выходит, дробное округляется', () => {
    const c = sanitizeColour({exposure: 999, contrast: -999, saturation: 12.6, warmth: -3.2});
    expect(c).toEqual({exposure: COLOUR_RANGE, contrast: -COLOUR_RANGE, saturation: 13, warmth: -3});
  });

  it('мусор и лишние поля отбрасываются', () => {
    expect(sanitizeColour({exposure: 'жарко', lift: 50} as never)).toEqual(NEUTRAL);
    expect(sanitizeColour(null)).toEqual(NEUTRAL);
    expect(sanitizeColour(undefined)).toEqual(NEUTRAL);
    expect(Object.keys(sanitizeColour({junk: 1} as never))).toEqual(['exposure', 'contrast', 'saturation', 'warmth']);
  });

  it('нейтраль видно по нулям', () => {
    expect(isNeutral(undefined)).toBe(true);
    expect(isNeutral(NEUTRAL)).toBe(true);
    expect(isNeutral({...NEUTRAL, warmth: 1})).toBe(false);
  });
});

describe('фильтр для съёмки', () => {
  it('нейтраль ничего не накладывает', () => {
    expect(colourFilter(NEUTRAL, 'w')).toBeUndefined();
    expect(colourFilter(undefined, 'w')).toBeUndefined();
  });

  it('в фильтр идут только заданные поля', () => {
    expect(colourFilter({...NEUTRAL, exposure: 50}, 'w')).toBe('brightness(1.2)');
    expect(colourFilter({...NEUTRAL, saturation: -100}, 'w')).toBe('saturate(0)');
    const all = colourFilter({exposure: 25, contrast: 20, saturation: 10, warmth: 40}, 'w');
    expect(all).toBe('brightness(1.1) contrast(1.1) saturate(1.1) url(#w)');
  });

  it('без id SVG-фильтра теплота не применяется — ссылаться не на что', () => {
    expect(colourFilter({...NEUTRAL, warmth: 40})).toBeUndefined();
    expect(colourFilter({...NEUTRAL, warmth: 40, exposure: 25})).toBe('brightness(1.1)');
  });

  it('края шкалы не выворачивают картинку', () => {
    const max = colourFilter({exposure: 100, contrast: 100, saturation: 100, warmth: 100}, 'w')!;
    expect(max).toContain('brightness(1.4)');
    expect(max).toContain('contrast(1.5)');
    expect(max).toContain('saturate(2)');
    const min = colourFilter({exposure: -100, contrast: -100, saturation: -100, warmth: -100}, 'w')!;
    expect(min).toContain('brightness(0.6)');
    expect(min).toContain('contrast(0.5)');
    expect(min).toContain('saturate(0)');
  });
});

describe('теплота', () => {
  it('в плюс — больше красного и меньше синего, в минус наоборот', () => {
    const warm = warmthChannels({...NEUTRAL, warmth: 100});
    expect(warm.r).toBeGreaterThan(1);
    expect(warm.b).toBeLessThan(1);
    const cold = warmthChannels({...NEUTRAL, warmth: -100});
    expect(cold.r).toBeLessThan(1);
    expect(cold.b).toBeGreaterThan(1);
    expect(warm.r).toBeCloseTo(cold.b, 6);
  });

  it('ноль — каналы не трогаются', () => {
    expect(warmthChannels(NEUTRAL)).toEqual({r: 1, b: 1});
    expect(warmthChannels(undefined)).toEqual({r: 1, b: 1});
  });
});

describe('настройки фрагмента поверх ролика', () => {
  it('фрагмент перебивает только то, что задал', () => {
    const review = {exposure: 20, contrast: 10, saturation: 0, warmth: 5};
    expect(mergeColour(review, {contrast: -30})).toEqual({exposure: 20, contrast: -30, saturation: 0, warmth: 5});
    expect(mergeColour(review, undefined)).toEqual(review);
    expect(mergeColour(undefined, undefined)).toEqual(NEUTRAL);
  });
});
