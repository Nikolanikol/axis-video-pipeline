// Пресеты — готовый вид целиком: компоновка, цвета, шрифты и углы одним нажатием.
// Под ними в форме — прежние шрифты, оформление и палитра: ими пресет подстраивают вручную,
// компоновка при этом остаётся. «Исходный» — наши прежние форматы, не новая ветка поверх них.
import React from 'react';
import {applyDesignPreset, DESIGNS, matchDesignPreset} from '../src/shared/designs';
import {MOTION_FIELDS} from '../src/design/style/registry.js';
import {StyleChoices, type StyleField} from './StyleChoices';
import type {Theme} from '../src/shared/types';
import './designs.css';
import {useT} from './i18n';

// motion = false — на экране ролика: движение там выбирается отдельными кнопками под форматом
export const DesignField: React.FC<{theme: Theme; onChange: (theme: Theme) => void; motion?: boolean; note?: string; presets?: boolean}> = ({theme, onChange, motion: showMotion = true, note, presets = true}) => {
  const t = useT();
  const design = DESIGNS.find((d) => d.id === theme.design);
  const current = matchDesignPreset(theme);
  // «Исходный» снимает только компоновку: свои цвета и шрифты компании остаются как были
  const original = () => { const {design: _design, designVariant: _variant, ...rest} = theme; onChange(rest); };
  return <>
    {presets && <><h2>{t('design.title')}</h2>
    <p className="note">{note ?? t('design.note')}</p>
    <div className="design-list" role="radiogroup" aria-label={t('design.aria')}>
      <button type="button" role="radio" aria-checked={!design} className={`design-choice${!design ? ' on' : ''}`} onClick={original}>
        <span className="design-mini design-mini-original" aria-hidden="true"
          style={{background: theme.bg, color: theme.white}}><i /><b>Auto</b><em style={{background: theme.copper}} /></span>
        <span className="design-choice-title">{t('design.original')}</span>
        <span className="design-choice-note">{t('design.originalNote')}</span>
      </button>
      {DESIGNS.flatMap((item) => item.presets.map((preset) => {
        // Подсвечен пресет, совпадающий до цвета; после ручной правки — первый пресет той же компоновки
        const on = current ? current.id === preset.id : design?.id === item.id && item.presets[0].id === preset.id;
        return <button key={preset.id} type="button" role="radio" aria-checked={on}
          className={`design-choice${on ? ' on' : ''}`} onClick={() => onChange(applyDesignPreset(theme, preset.id))}>
          <span className={`design-mini design-mini-${item.id}`} aria-hidden="true"
            style={{background: preset.colors.bg, color: preset.colors.white}}><i /><b>Auto</b><em style={{background: preset.colors.copper}} /></span>
          <span className="design-choice-title">{t.cfg(item.title)} · {t.cfg(preset.title)}</span>
          <span className="design-choice-note">{t.cfg(item.note)}</span>
        </button>;
      }))}
    </div></>}
    {design && <>
      {!current && <p className="hint">{t('design.edited', {title: t.cfg(design.title)})}</p>}
      <div className="switch-row"><span className="switch-label">{t('design.layout')}</span><div className="btn-row">
        {([0, 1] as const).map((variant) => <button key={variant} type="button" aria-pressed={(theme.designVariant ?? 0) === variant}
          className={`btn ${(theme.designVariant ?? 0) === variant ? 'primary' : 'ghost'}`}
          onClick={() => onChange({...theme, designVariant: variant})}>{t(variant ? 'design.alt' : 'design.main')}</button>)}
      </div></div>
      {/* Подача данных и движение — кнопки из реестра стиля (src/design/style/registry.js), подсвечено действующее.
          Подача данных — и в роликах, и на слайдах карусели; движение — только в роликах */}
      <StyleChoices theme={theme} fields={showMotion ? ['plates', ...MOTION_FIELDS as readonly StyleField[]] : ['plates']}
        onChange={(field, id) => onChange({...theme, [field]: id})} />
      {showMotion && <p className="hint">{t('design.motionHint')}</p>}
    </>}
  </>;
};
