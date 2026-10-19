// Движение ролика у объявления — рядом с форматом: подбирают, глядя в превью.
// Три выбора из реестра стиля: появление текста, движение фото, переход между сценами.
// Пишет в тот же снимок оформления объявления (lot.look), что пресет и цвета: у объявления
// одна логика и один сброс — «Как в бренде» под пресетом (PresetChips).
// Работает только при пресете оформления — прежние форматы рисуются своими компонентами.
import React, {useState} from 'react';
import {MOTION_FIELDS, optionTitle, resolveStyle} from '../../src/design/style/registry.js';
import {pickLook} from '../../src/design/style/look.js';
import type {Lot, Theme} from '../../src/shared/types';
import {StyleChoices, type StyleField} from '../StyleChoices';

/** theme — уже итоговая тема ролика: бренд + снимок объявления (lotTheme) */
type Props = {theme: Theme; onChange: (patch: Partial<Lot>) => void};

export const MotionChips: React.FC<Props> = ({theme, onChange}) => {
  // Свёрнуто в одну строку с выбранным: с рядом пресетов кнопки движения сталкивали
  // «Собрать ролик» ниже экрана (замер 20.10, окно 1440×1000)
  const [open, setOpen] = useState(false);
  if (!theme.design) return null;
  const current = resolveStyle(theme, theme.design);
  const fields = MOTION_FIELDS as readonly StyleField[];
  if (!open) return <div className="motion-chips">
    <div className="preset-head"><span className="quick-label">Движение</span>
      <button type="button" className="motion-reset" aria-expanded={false} onClick={() => setOpen(true)}>Изменить</button></div>
    <div className="motion-summary">{fields.map((f) => optionTitle(f, current[f])).join(' · ')}</div>
  </div>;
  return <div className="motion-chips">
    <div className="preset-head"><span className="quick-label">Движение</span>
      <button type="button" className="motion-reset" aria-expanded onClick={() => setOpen(false)}>Свернуть</button></div>
    <StyleChoices theme={theme} fields={[...fields]} look="side" compact
      onChange={(field, id) => onChange({look: pickLook({...theme, [field]: id}) as Lot['look']})} />
  </div>;
};
