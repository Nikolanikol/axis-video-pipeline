// Общие цвета каруселей у конкретного ролика. Компоновка, шрифты и движение сохраняются.
import React from 'react';
import {VISUAL_THEMES, applyVisualTheme, matchVisualTheme} from '../../src/shared/visualThemes.js';
import {pickLook} from '../../src/design/style/look.js';
import {lotTheme} from './LookPanel';
import type {BodyProps} from './Palette';
import type {Lot} from '../../src/shared/types';
import {useT} from '../i18n';

export const VisualThemePicker: React.FC<Pick<BodyProps, 'lot' | 'brand' | 'onChange'>> = ({lot, brand, onChange}) => {
  const t = useT(), theme = lotTheme(brand, lot), selected = matchVisualTheme(theme);
  return <section className="video-theme-picker">
    <div className="video-theme-label">{t('vtheme.title')}{selected && <b>{selected.title}</b>}</div>
    <div className="video-theme-strip" role="group" aria-label={t('vtheme.title')}>
      {VISUAL_THEMES.map((v) => <button key={v.id} type="button" disabled={!theme.design} aria-pressed={selected?.id === v.id}
        aria-label={t('vtheme.choose', {name: v.title})} onClick={() => onChange({look: pickLook(applyVisualTheme(theme, v.id)) as Lot['look']})}>
        <span className="video-theme-colors" aria-hidden="true">{[v.colors.bg, v.colors.text, v.colors.accent].map((color, i) => <i key={i} style={{background: color}} />)}</span>{v.title}
      </button>)}
    </div>
    {!theme.design && <p className="hint">{t('vtheme.designFirst')}</p>}
  </section>;
};
