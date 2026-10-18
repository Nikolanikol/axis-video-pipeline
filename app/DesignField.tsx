// Пресеты — готовый вид целиком: компоновка, цвета, шрифты и углы одним нажатием.
// Под ними в форме — прежние шрифты, оформление и палитра: ими пресет подстраивают вручную,
// компоновка при этом остаётся. «Исходный» — наши прежние форматы, не новая ветка поверх них.
import React from 'react';
import {applyDesignPreset, DESIGNS, matchDesignPreset} from '../src/shared/designs';
import type {Theme} from '../src/shared/types';
import './designs.css';

export const DesignField: React.FC<{theme: Theme; onChange: (theme: Theme) => void}> = ({theme, onChange}) => {
  const design = DESIGNS.find((d) => d.id === theme.design);
  const current = matchDesignPreset(theme);
  // «Исходный» снимает только компоновку: свои цвета и шрифты компании остаются как были
  const original = () => { const {design: _design, designVariant: _variant, ...rest} = theme; onChange(rest); };
  return <>
    <h2>Пресеты</h2>
    <p className="note">Готовый вид роликов и каруселей: компоновка, цвета и шрифты разом. Ниже их можно подправить вручную.</p>
    <div className="design-list" role="radiogroup" aria-label="Пресеты оформления">
      <button type="button" role="radio" aria-checked={!design} className={`design-choice${!design ? ' on' : ''}`} onClick={original}>
        <span className="design-mini design-mini-original" aria-hidden="true"
          style={{background: theme.bg, color: theme.white}}><i /><b>Auto</b><em style={{background: theme.copper}} /></span>
        <span className="design-choice-title">Исходный</span>
        <span className="design-choice-note">Прежние форматы роликов и каруселей, ваши цвета</span>
      </button>
      {DESIGNS.flatMap((item) => item.presets.map((preset) => {
        // Подсвечен пресет, совпадающий до цвета; после ручной правки — первый пресет той же компоновки
        const on = current ? current.id === preset.id : design?.id === item.id && item.presets[0].id === preset.id;
        return <button key={preset.id} type="button" role="radio" aria-checked={on}
          className={`design-choice${on ? ' on' : ''}`} onClick={() => onChange(applyDesignPreset(theme, preset.id))}>
          <span className={`design-mini design-mini-${item.id}`} aria-hidden="true"
            style={{background: preset.colors.bg, color: preset.colors.white}}><i /><b>Auto</b><em style={{background: preset.colors.copper}} /></span>
          <span className="design-choice-title">{item.title} · {preset.title}</span>
          <span className="design-choice-note">{item.note}</span>
        </button>;
      }))}
    </div>
    {design && <>
      {!current && <p className="hint">Компоновка «{design.title}», цвета или шрифты подправлены вручную</p>}
      <div className="switch-row"><span className="switch-label">Компоновка</span><div className="btn-row">
        {([0, 1] as const).map((variant) => <button key={variant} type="button" aria-pressed={(theme.designVariant ?? 0) === variant}
          className={`btn ${(theme.designVariant ?? 0) === variant ? 'primary' : 'ghost'}`}
          onClick={() => onChange({...theme, designVariant: variant})}>{variant ? 'Альтернативная' : 'Основная'}</button>)}
      </div></div>
    </>}
  </>;
};
