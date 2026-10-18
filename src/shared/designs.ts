// Готовое сочетание меняет дизайн, восемь цветов и пару шрифтов одним действием.
// Логотип, имя компании и загруженные файлы остаются частью её бренда.
import registry from '../../config/designs.json';
import fonts from '../../config/fonts.json';
import {PALETTE_KEYS} from './contrast.js';
import type {DesignId, Theme} from './types';

export type DesignPreset = {id: string; title: string; fontPair: string; colors: Pick<Theme,
  'bg' | 'panel' | 'line' | 'grey' | 'white' | 'copper' | 'copperLight' | 'copperDark'>};
export type DesignDefinition = {id: DesignId; title: string; note: string; presets: DesignPreset[]};
export const DESIGNS = registry as DesignDefinition[];

export const applyDesignPreset = (theme: Theme, presetId: string): Theme => {
  const design = DESIGNS.find((d) => d.presets.some((p) => p.id === presetId));
  const preset = design?.presets.find((p) => p.id === presetId);
  const pair = fonts.find((p) => p.id === preset?.fontPair);
  if (!design || !preset || !pair) throw new Error(`Неизвестное сочетание дизайна: ${presetId}`);
  return {...theme, ...preset.colors, design: design.id, designVariant: theme.designVariant ?? 0, style: {gradient: false, radius: design.id === 'catalog' ? 0.6 : 0},
    fonts: {head: pair.head, body: pair.body, url: pair.url}};
};

// Настроенный вручную цвет или шрифт снимает отметку готового сочетания, но не сам дизайн.
export const matchDesignPreset = (theme: Theme): DesignPreset | undefined => {
  const design = DESIGNS.find((d) => d.id === theme.design);
  return design?.presets.find((preset) => {
    const applied = applyDesignPreset(theme, preset.id);
    return PALETTE_KEYS.every((k) => theme[k]?.toUpperCase() === applied[k].toUpperCase())
      && theme.fonts?.head === applied.fonts.head && theme.fonts?.body === applied.fonts.body
      && theme.style?.gradient === applied.style.gradient && theme.style?.radius === applied.style.radius;
  });
};

export const fontPairTitle = (id: string) => fonts.find((pair) => pair.id === id)?.title ?? id;
