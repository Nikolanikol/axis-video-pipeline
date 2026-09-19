// Цвет съёмки: экспозиция, контраст, насыщенность, теплота. Превью пересчитывается сразу.
import React from 'react';
import {COLOUR_RANGE, NEUTRAL, isNeutral, sanitizeColour} from '../../src/shared/colour.js';
import type {Colour} from '../../src/shared/types';

type Props = {
  colour?: Colour;
  hdrSource?: boolean;
  onChange: (colour: Colour) => void;
};

const SLIDERS: {key: keyof Colour; label: string; hint: string}[] = [
  {key: 'exposure', label: 'Экспозиция', hint: 'светлее или темнее'},
  {key: 'contrast', label: 'Контраст', hint: 'разница между тенями и светами'},
  {key: 'saturation', label: 'Насыщенность', hint: 'сила цвета; −100 — чёрно-белое'},
  {key: 'warmth', label: 'Теплота', hint: 'в плюс — теплее, в минус — холоднее'},
];

// Наборы под типичные съёмки на стоянке: пасмурно, солнце в лоб, сумерки в помещении
const PRESETS: {name: string; title: string; colour: Colour}[] = [
  {name: 'Пасмурно', title: 'Серое небо: добавить контраст и цвет', colour: {exposure: 4, contrast: 18, saturation: 14, warmth: 10}},
  {name: 'Солнце', title: 'Жёсткий свет: убрать пересветы и тепло', colour: {exposure: -8, contrast: -6, saturation: 6, warmth: -8}},
  {name: 'В помещении', title: 'Тусклый свет ламп: поднять и охладить', colour: {exposure: 10, contrast: 8, saturation: 4, warmth: -12}},
];

export const ColourPanel: React.FC<Props> = ({colour, hdrSource, onChange}) => {
  const value = sanitizeColour(colour);
  const set = (key: keyof Colour, v: number) => onChange({...value, [key]: v});

  return (
    <>
      <h2>Цвет съёмки <span className="muted">{isNeutral(value) ? 'как снято' : 'настроен'}</span></h2>
      <p className="hint">
        Накладывается только на видео — логотип, плашки и карточка цены остаются фирменных цветов.
        {hdrSource ? ' Съёмка в HDR уже переведена в обычный цвет при сборке рабочей копии.' : ''}
      </p>
      <div className="btn-row">
        {PRESETS.map((p) => (
          <button key={p.name} className="btn ghost" title={p.title} onClick={() => onChange(p.colour)}>{p.name}</button>
        ))}
        <button className="btn ghost" disabled={isNeutral(value)} onClick={() => onChange({...NEUTRAL})}>Сбросить</button>
      </div>
      {SLIDERS.map(({key, label, hint}) => (
        <div className="colour-row" key={key}>
          <label title={hint}>
            {label} <span className="muted">{value[key] > 0 ? `+${value[key]}` : value[key]}</span>
          </label>
          <input type="range" min={-COLOUR_RANGE} max={COLOUR_RANGE} step={1} value={value[key]}
            onChange={(e) => set(key, Number(e.target.value))} onDoubleClick={() => set(key, 0)} />
        </div>
      ))}
      <p className="hint">Двойной щелчок по ползунку возвращает его в ноль.</p>
    </>
  );
};
