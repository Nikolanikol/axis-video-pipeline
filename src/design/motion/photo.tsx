// Движение фото внутри сцены — пакет KOK_STYLE_MOTION_PACK («Тихий проезд», «Окно раскрывается»,
// «Общий объект», «Стопка снимков», «Крупнее о деталях») и «Без эффекта».
// Переход между сценами — отдельный выбор (scene.tsx): их можно сочетать, например стопка + диафрагма.
// t — секунды от начала сцены.
import React from 'react';
import type {PhotoMotionId} from '../../shared/types';
import {cut, easeOut} from './easing';

/**
 * Приём, которому не хватает фото, заменяется «Окном» — как советует пакет. «Стопке» нужны два
 * других снимка объявления, «Деталям» — один; коллажу и галерее оба не подходят: там несколько
 * фото в одной рамке
 */
export const photoFallback = (id: PhotoMotionId, {single, spare}: {single: boolean; spare: number}): PhotoMotionId =>
  id === 'stack' ? (single && spare >= 2 ? 'stack' : 'window')
    : id === 'detail' ? (single && spare >= 1 ? 'detail' : 'window') : id;

/**
 * Подписи ждут фото, если оно раскрывается: «Окно» — 0,16 с (пакет), остальные — пока фото
 * почти не село. Иначе заголовок приходит раньше картинки, к которой относится
 */
export const textDelay = (id: PhotoMotionId) =>
  ({window: .16, match: .35, stack: .35, detail: .45} as Partial<Record<PhotoMotionId, number>>)[id] ?? 0;

/** Рамка и картинка для простых приёмов (проезд, окно, общий объект). Стопка и детали — компоненты ниже */
export const photoFrame = (id: PhotoMotionId, t: number): {frame: React.CSSProperties; img?: string} => {
  // Масштаб 1,00 → 1,035 за 3 с; текст стоит
  if (id === 'pan') return {frame: {}, img: `scale(${1 + .035 * cut(t / 3)})`};
  if (id === 'window') {
    // Раскрытие от центра: края 50% → 0% за 0,7 с
    const side = (1 - easeOut(t / .7)) * 50;
    return {frame: {clipPath: `inset(0 ${side}% 0 ${side}%)`}};
  }
  if (id === 'match') {
    // Один и тот же слой садится в свою карточку: 100/78 → 1 и сдвиг вверх на 12% за 0,85 с
    const v = easeOut(t / .85);
    return {frame: {transform: `translateY(${(1 - v) * 12}%) scale(${1 + (1 - v) * (1 / .78 - 1)})`, transformOrigin: '50% 0%'}};
  }
  return {frame: {}};
};

type Layered = {t: number; frame: React.CSSProperties; fill: (url: string) => React.ReactNode; children: React.ReactNode};

/** Стопка: два других снимка лежат сзади под ±4°, главный садится снизу за 0,8 с с мягкой тенью — без отскока */
export const PhotoStack: React.FC<Layered & {spare: string[]}> = ({t, frame, fill, spare, children}) => {
  const v = easeOut(t / .8);
  return <div style={frame}>
    {[4, -4].map((deg, i) => <div key={deg} style={{position: 'absolute', inset: 0, transform: `scale(.86) rotate(${deg}deg)`,
      boxShadow: '0 16px 40px rgba(0,0,0,.35)', overflow: 'hidden'}}>{fill(spare[i])}</div>)}
    <div style={{position: 'absolute', inset: 0, transform: `translateY(${(1 - v) * 38}%)`, boxShadow: v < 1 ? '0 -12px 40px rgba(0,0,0,.35)' : undefined}}>
      {children}
    </div>
  </div>;
};

/**
 * Детали: общий вид — другое настоящее фото объявления; поверх него из угла раскрывается фото
 * сцены (с 0,45 с за 0,7 с). Деталь не выдумываем и не увеличиваем кадр — только настоящие снимки.
 * Ролей «салон / кузов» у фото лота нет, поэтому «интерьер» пакета у нас — просто другое фото
 */
export const PhotoDetail: React.FC<Layered & {spare: string}> = ({t, frame, fill, spare, children}) => {
  const z = easeOut((t - .45) / .7);
  return <div style={frame}>
    {fill(spare)}
    <div style={{position: 'absolute', right: 0, bottom: 0, width: `${z * 100}%`, height: `${z * 100}%`, overflow: 'hidden'}}>
      {children}
    </div>
  </div>;
};
