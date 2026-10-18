// Пресет ролика — сразу под форматом, без захода в «Оформление ролика» (владелец 20.10).
// Как и вся панель оформления, пишет снимок в объявление: бренд и другие ролики не меняются
import React from 'react';
import {applyDesignPreset, DESIGNS, matchDesignPreset} from '../../src/shared/designs';
import {pickLook} from '../../src/shared/look.js';
import type {Lot, Theme} from '../../src/shared/types';

type Props = {lot: Lot; theme: Theme; onChange: (patch: Partial<Lot>) => void; onMore: () => void};

export const PresetChips: React.FC<Props> = ({lot, theme, onChange, onMore}) => {
  const current = matchDesignPreset(theme);
  const design = DESIGNS.find((d) => d.id === theme.design);
  const set = (next: Theme) => onChange({look: pickLook(next) as Lot['look']});
  // «Исходный» снимает только компоновку — цвета и шрифты ролика остаются, как в «Бренде»
  const original = () => { const {design: _d, designVariant: _v, ...rest} = theme; set(rest as Theme); };
  const chip = (key: string, on: boolean, title: string, colors: {bg: string; copper: string}, onClick: () => void) =>
    <button key={key} type="button" role="radio" aria-checked={on} className={`preset-chip${on ? ' on' : ''}`} onClick={onClick} title={title}>
      <span className="preset-swatch" style={{background: colors.bg}}><em style={{background: colors.copper}} /></span>{title}
    </button>;
  return <div className="preset-chips">
    <div className="preset-head"><span className="quick-label">Пресет</span>
      <button type="button" className="motion-reset" onClick={onMore}>Цвета, шрифты, углы…</button></div>
    {/* Строка на компоновку, в ней — её сочетания цветов: так семь вариантов занимают четыре
        короткие строки, а «Собрать ролик» остаётся в первом экране */}
    <div className="preset-grid" role="radiogroup" aria-label="Пресет ролика">
      <span className="preset-design">Исходный</span>
      <div className="preset-row">{chip('original', !design, 'Прежние форматы', {bg: theme.bg, copper: theme.copper}, original)}</div>
      {DESIGNS.map((d) => <React.Fragment key={d.id}>
        <span className="preset-design">{d.title}</span>
        <div className="preset-row">{d.presets.map((p) => chip(p.id,
          // После ручной правки цвета подсвечен первый пресет той же компоновки — как в «Бренде»
          current ? current.id === p.id : design?.id === d.id && d.presets[0].id === p.id,
          p.title, p.colors, () => set(applyDesignPreset(theme, p.id))))}</div>
      </React.Fragment>)}
    </div>
    {lot.look && <div className="preset-own">Своё оформление у этого ролика ·{' '}
      <button type="button" className="motion-reset" onClick={() => onChange({look: undefined})}>как в бренде</button></div>}
  </div>;
};
