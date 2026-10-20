// Общие части вёрстки семейств каруселей (пакет KOK_handoff_v1): размер слайда 4:5, фото в окне,
// подгонка кегля по длине, пропсы слайда. Палитра и композиция — у каждого семейства свои.
import React from 'react';
import {Img, staticFile} from 'remotion';
import {Logo} from '../../shared/ui';
import type {CarouselCar} from '../../shared/types';
import type {DesignContent} from '../../design/DesignSlide';
import type {CarouselText} from '../i18n';

export const W = 1080, H = 1350;
const asset = (url: string) => /^(https?:|data:|blob:|\/)/.test(url) ? url : staticFile(url);
// Кегль по длине: Oswald заглавными — около 0,46–0,52 кегля на знак (k)
export const fitW = (text: string, width: number, max: number, min = 40, k = .46) =>
  Math.round(Math.max(min, Math.min(max, width / (Math.max(1, text.length) * k))));
export const upper = (s?: string) => (s ?? '').toLocaleUpperCase('ru');

export type FamilyColors = {bg: string; text: string; accent: string; light: string};
// index — номер слайда с 1 (контурный индекс у Contour Plum)
// h — высота слайда: 1350 (4:5, и 4:5 в середине 9:16) или 1080 (квадрат 1:1, у семейств, которые его умеют)
export type FamilySlideProps = {slide: string; index: number; h: number; content: DesignContent; car: CarouselCar; tx: CarouselText; ru: boolean; colors: FamilyColors};

/** Логотип бренда слева сверху; on — фон под ним (по нему Logo решает про подложку); line — черта под знаком */
export const LogoCorner: React.FC<{on: string; line?: string; left?: number; top?: number}> = ({on, line, left = 44, top = 34}) =>
  <div style={{position: 'absolute', left, top, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 10}}>
    <Logo asset="logoHorizontal" height={50} width={230} on={on} style={{textAlign: 'left', objectPosition: 'left'}} />
    {line && <div style={{width: 56, height: 5, borderRadius: 3, background: line}} />}
  </div>;

/** Пробег числом с разрядами по языку карусели (как на обложке: «67,842» / «67 842») */
export const kmNumber = (km: number | null, ru: boolean) =>
  km === null ? '' : new Intl.NumberFormat(ru ? 'ru-RU' : 'en-US').format(km).replace(/\s/g, ' ');

/** Заголовок фразой: всё, кроме последнего слова, и последнее слово отдельно (две массы заголовка) */
export const splitLast = (text: string) => {
  const words = upper(text).split(/\s+/).filter(Boolean);
  const last = words.pop() ?? '';
  return {first: words.join(' '), last};
};

/** Фото ролей: экстерьер (задний ракурс первым), салон, деталь — без повторов, с запасом из любых */
export const photosOf = (car: CarouselCar) => {
  const uniq = (list: (string | null | undefined)[]) => Array.from(new Set(list.filter(Boolean))) as string[];
  const all = uniq([car.photos.hero, ...car.photos.exterior, car.photos.rear, ...car.photos.interior, car.photos.interiorShot, car.photos.dashboard, ...car.photos.other]);
  return {
    hero: car.photos.hero ?? all[0],
    exterior: uniq([car.photos.rear, ...car.photos.exterior, car.photos.hero, ...all]),
    interior: uniq([car.photos.interiorShot, ...car.photos.interior, car.photos.dashboard, ...all]),
    detail: car.photos.other[0] ?? car.photos.exterior[2] ?? car.photos.hero ?? all[0],
  };
};

/** Фото в окне со скруглением: снимок целиком с окружением (без вырезки машины), кадрирование — cover */
export const Photo: React.FC<{src?: string | null; style: React.CSSProperties; position?: string}> = ({src, style, position = '50% 55%'}) =>
  <div style={{position: 'absolute', overflow: 'hidden', background: '#C9D2DE', ...style}}>
    {src && <Img src={asset(src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: position}} />}
  </div>;
