// Кнопки выбора стиля ролика из реестра (src/design/style/registry.js): появление текста,
// движение фото, переход между сценами, подача данных. Один компонент для «Бренда» и для
// экрана ролика — подписи, порядок и «Ещё» берутся из реестра, здесь их не повторяем.
import React, {useState} from 'react';
import {STYLE_CHOICES, resolveStyle} from '../src/design/style/registry.js';
import type {Theme} from '../src/shared/types';

export type StyleField = keyof typeof STYLE_CHOICES;

type Props = {
  theme: Theme;
  fields: StyleField[];
  onChange: (field: StyleField, id: string) => void;
  // Свёрнутый вид: только основные варианты и выбранный, остальное — под «Ещё приёмы».
  // На экране ролика иначе десятки кнопок сталкивали «Собрать ролик» ниже окна
  compact?: boolean;
  // side — узкая правая колонка экрана ролика (подпись над кнопками), settings — строка формы «Бренда»
  look?: 'settings' | 'side';
};

export const StyleChoices: React.FC<Props> = ({theme, fields, onChange, compact = false, look = 'settings'}) => {
  const [more, setMore] = useState(false);
  // Подсвечено действующее: выбранное, а не выбранное — умолчание компоновки
  const current = resolveStyle(theme, theme.design ?? 'catalog');
  const hidden = fields.reduce((n, f) => n + STYLE_CHOICES[f].options.filter((o) => !('main' in o && o.main)).length, 0);
  return <>
    {fields.map((field) => {
      const choice = STYLE_CHOICES[field];
      // Выбранный вариант из «Ещё» виден и в свёрнутом виде — иначе не понять, что включено
      const options = compact && !more ? choice.options.filter((o) => ('main' in o && o.main) || o.id === current[field]) : choice.options;
      return <div key={field} className={look === 'side' ? 'style-side' : 'switch-row'}>
        <span className={look === 'side' ? 'quick-label' : 'switch-label'}>{choice.title}</span>
        <div className={look === 'side' ? 'motion-row' : 'btn-row'} role="radiogroup" aria-label={choice.title}>
          {options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={current[field] === o.id}
            className={`btn ${current[field] === o.id ? 'primary' : 'ghost'}`} onClick={() => onChange(field, o.id)}>{o.title}</button>)}
        </div>
      </div>;
    })}
    {compact && hidden > 0 && <button type="button" className="motion-reset" aria-expanded={more} onClick={() => setMore(!more)}>
      {more ? 'Только основные' : `Ещё приёмы (${hidden})`}</button>}
  </>;
};
