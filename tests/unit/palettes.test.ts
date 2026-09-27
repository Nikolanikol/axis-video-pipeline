// Реестр палитр: каждая обязана читаться на слайде — иначе в список не попадает.
import {describe, expect, it} from 'vitest';
import palettes from '../../config/palettes.json';
import brand from '../../config/brand.json';
import {PALETTE_KEYS, contrast, contrastIssues, isHex, matchPalette} from '../../src/shared/contrast.js';

describe('палитры', () => {
  it('id уникальны, у каждой все восемь цветов в #RRGGBB', () => {
    expect(new Set(palettes.map((p) => p.id)).size).toBe(palettes.length);
    for (const p of palettes) {
      expect(p.title, p.id).toBeTruthy();
      for (const k of PALETTE_KEYS) expect(isHex((p.colors as Record<string, string>)[k]), `${p.id}.${k}`).toBe(true);
    }
  });

  it.each(palettes.map((p) => [p.id, p] as const))('%s — все пары читаются', (_id, p) => {
    expect(contrastIssues(p.colors)).toEqual([]);
  });

  it('первая — фирменная AXIS, и бренд по умолчанию с ней совпадает', () => {
    expect(palettes[0].id).toBe('copper');
    expect(matchPalette(brand, palettes)?.id).toBe('copper');
  });

  it('проверка ловит нечитаемые свои цвета — как на скриншоте владельца', () => {
    // Тёмно-синий фон, чёрный второстепенный текст, бордовый основной
    const bad = {bg: '#001E57', panel: '#5C0700', line: '#000000', grey: '#000000', white: '#561029',
      copper: '#B92D5D', copperLight: '#371A94', copperDark: '#7B219F'};
    const issues = contrastIssues(bad).map((i) => i.what);
    expect(issues).toEqual(expect.arrayContaining(['основной текст на фоне', 'второстепенный текст на фоне']));
  });

  it('контраст по WCAG: чёрное на белом — 21', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});
