import {describe, expect, it} from 'vitest';
import {applyVisualTheme, matchVisualTheme, visualThemeTokens, VISUAL_THEMES, withoutAccentRoles} from '../../src/shared/visualThemes.js';
import {contrast} from '../../src/shared/contrast.js';
import {applyDesignPreset} from '../../src/shared/designs';
import brand from '../../config/brand.json';

describe('общие темы видео и каруселей', () => {
  it.each(VISUAL_THEMES)('$id сохраняет акцентную заливку и даёт читаемый акцентный текст', ({id, colors}) => {
    const roles = visualThemeTokens(id);
    expect(roles.accent).toBe(colors.accent);
    expect(contrast(roles.accentInk, roles.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(roles.muted, roles.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('смена темы сохраняет компоновку, шрифты, движение и файлы компании', () => {
    const current = {...brand, design: 'editorial', textMotion: 'focus', company: 'DEMO'};
    const next = applyVisualTheme(current, 'cobalt_shift');
    expect(next).toMatchObject({design: 'editorial', textMotion: 'focus', company: 'DEMO', fonts: current.fonts, assets: current.assets});
    expect(matchVisualTheme(next)?.id).toBe('cobalt_shift');
    expect(current).not.toHaveProperty('accentInk');
  });

  it('старый пресет очищает цветовые роли прежней темы', () => {
    const themed = applyVisualTheme(brand, 'type_drive');
    const preset = applyDesignPreset(themed, 'porcelain-cobalt');
    expect(preset).not.toHaveProperty('accentInk');
    expect(preset).not.toHaveProperty('onAccent');
    expect(withoutAccentRoles(themed).name).toBe(brand.name);
  });
});
