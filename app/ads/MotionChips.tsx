// Движение ролика у объявления — рядом с форматом: подбирают, глядя в превью.
// Подсвечено действующее: выбранное у объявления, иначе из бренда, иначе по компоновке.
// Работает только при пресете оформления — прежние форматы рисуются своими компонентами
import React, {useState} from 'react';
import {SLIDE_MOTIONS, TEXT_MOTIONS} from '../../src/shared/design.js';
import {SLIDE_MOTION_TITLES, TEXT_MOTION_TITLES, motionOf} from '../../src/design/motion';
import type {Lot, Theme} from '../../src/shared/types';

type Props = {lot: Pick<Lot, 'textMotion' | 'slideMotion'>; brand: Theme; onChange: (patch: Partial<Lot>) => void};

// Первый релиз пакета виден сразу, остальное — под «Ещё приёмы»: так советует сам пакет,
// и иначе 17 кнопок сталкивали «Собрать ролик» за край экрана
const FIRST_TEXT = 3;
const FIRST_SLIDE = 4;

export const MotionChips: React.FC<Props> = ({lot, brand, onChange}) => {
  const [more, setMore] = useState(false);
  // Свёрнуто в одну строку с выбранным: с рядом пресетов кнопки движения сталкивали
  // «Собрать ролик» ниже экрана (замер 20.10, окно 1440×1000). Раскрытие помним до смены экрана
  const [open, setOpen] = useState(false);
  if (!brand.design) return null;
  const motion = motionOf({textMotion: lot.textMotion ?? brand.textMotion, slideMotion: lot.slideMotion ?? brand.slideMotion}, brand.design);
  const own = Boolean(lot.textMotion || lot.slideMotion);
  // Выбранный приём из расширенного списка виден и в свёрнутом виде — иначе не понять, что включено
  const texts = more ? TEXT_MOTIONS : TEXT_MOTIONS.filter((id, i) => i < FIRST_TEXT || id === motion.text);
  const slides = more ? SLIDE_MOTIONS : SLIDE_MOTIONS.filter((id, i) => i < FIRST_SLIDE || id === motion.slide);
  if (!open) return <div className="motion-chips">
    <div className="preset-head"><span className="quick-label">Движение</span>
      <button type="button" className="motion-reset" aria-expanded={false} onClick={() => setOpen(true)}>Изменить</button></div>
    <div className="motion-summary">{TEXT_MOTION_TITLES[motion.text]} · {SLIDE_MOTION_TITLES[motion.slide]}{own ? ' — своё у ролика' : ''}</div>
  </div>;
  return <div className="motion-chips">
    <div className="preset-head"><span className="quick-label">Появление текста</span>
      <button type="button" className="motion-reset" aria-expanded onClick={() => setOpen(false)}>Свернуть</button></div>
    <div className="motion-row" role="radiogroup" aria-label="Появление текста">
      {texts.map((id) => <button key={id} type="button" role="radio" aria-checked={motion.text === id}
        className={`btn ${motion.text === id ? 'primary' : 'ghost'}`} onClick={() => onChange({textMotion: id})}>{TEXT_MOTION_TITLES[id]}</button>)}
    </div>
    <div className="quick-label">Смена сцен</div>
    <div className="motion-row" role="radiogroup" aria-label="Смена сцен">
      {slides.map((id) => <button key={id} type="button" role="radio" aria-checked={motion.slide === id}
        className={`btn ${motion.slide === id ? 'primary' : 'ghost'}`} onClick={() => onChange({slideMotion: id})}>{SLIDE_MOTION_TITLES[id]}</button>)}
    </div>
    <button type="button" className="motion-reset" aria-expanded={more} onClick={() => setMore(!more)}>
      {more ? 'Только основные' : `Ещё приёмы (${TEXT_MOTIONS.length - FIRST_TEXT + SLIDE_MOTIONS.length - FIRST_SLIDE})`}</button>
    {/* Сервер сохраняет объявление целиком (PUT), поэтому undefined — это «поля нет», то есть как в бренде */}
    {own && <button type="button" className="motion-reset" onClick={() => onChange({textMotion: undefined, slideMotion: undefined})}>
      Как в настройках бренда</button>}
  </div>;
};
