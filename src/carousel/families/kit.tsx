// Общие части вёрстки семейств каруселей (пакет KOK_handoff_v1): размер слайда 4:5, фото в окне,
// подгонка кегля по длине, пропсы слайда. Палитра и композиция — у каждого семейства свои.
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {BODY, HEAD, Logo} from '../../shared/ui';
import {contrast} from '../../shared/contrast.js';
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

/** Координата доски 4:5 → высота текущего слайда (квадрат — 1080), и множитель для кегля,
 *  упирающегося в высоту. В 4:5 и 9:16 оба — без изменений */
export const scale = (h: number) => ({y: (v: number) => Math.round(v * h / H), k: Math.min(1, h / H)});

/** Чем писать на акцентной заливке: фоном или светлым семейства — что контрастнее */
export const onAccent = (c: FamilyColors) => (contrast(c.bg, c.accent) >= contrast(c.light, c.accent) ? c.bg : c.light);

/**
 * «Галерея» квадратных форматов для семейств без своей: четыре фото сеткой 2×2 и плашка рубрики
 * акцентом. Шрифт — семейства (HEAD из темы), цвета — его палитра
 */
export const FamilyGallery: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const all = Array.from(new Set([...(content.photos ?? []), ...car.photos.exterior, ...car.photos.interior, car.photos.hero]
    .filter(Boolean))) as string[];
  const label = upper(content.kicker ?? content.title);
  const g = 24, cw = Math.round((W - g * 3) / 2), ch = Math.round((h - g * 3) / 2);
  return <AbsoluteFill style={{background: colors.light}}>
    {[0, 1, 2, 3].map((i) => <Photo key={i} src={all[i % Math.max(1, all.length)]}
      style={{left: g + (i % 2) * (cw + g), top: g + Math.floor(i / 2) * (ch + g), width: cw, height: ch, borderRadius: 36}} />)}
    <LogoCorner on={colors.light} left={g + 20} top={g + 18} />
    {label && <div style={{position: 'absolute', right: 52, top: 52, zIndex: 3, background: colors.accent, borderRadius: 30, padding: '14px 36px 18px',
      fontFamily: HEAD, fontWeight: 700, color: onAccent(colors), fontSize: fitW(label, 560, 96, 40, .55), lineHeight: 1, whiteSpace: 'nowrap'}}>{label}</div>}
  </AbsoluteFill>;
};

/**
 * «История» (страховые случаи, смены владельцев) для семейств без своей: заливка акцентом,
 * заголовок и числа крупно сеткой 2×2. Истории нет — честная фраза («Отчёт по запросу») и фото,
 * а не вёрстка фактов: она повторила бы слайд «Двигатель» с тем же пробегом
 */
export const FamilyHistory: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {k} = scale(h);
  const ink = onAccent(colors);
  const facts = (content.facts ?? []).slice(0, 4);
  const title = upper(content.title);
  return <AbsoluteFill style={{background: colors.accent, color: ink, fontFamily: HEAD}}>
    <LogoCorner on={colors.accent} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 150 * k, fontWeight: 700, fontSize: fitW(title, 1900, (facts.length ? 110 : 150) * k, 50, .55), lineHeight: .95}}>{title}</div>
    {facts.length
      ? <div style={{position: 'absolute', left: 60, right: 60, bottom: 70 * k, top: 420 * k, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: '0 60px'}}>
        {facts.map((f) => <div key={f.label} style={{borderTop: `4px solid ${ink}88`, paddingTop: 24 * k, display: 'flex', flexDirection: 'column', gap: 10}}>
          <div style={{fontWeight: 700, fontSize: 190 * k, lineHeight: .9}}>{f.value}</div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 32, opacity: .9}}>{f.label}</div>
        </div>)}
      </div>
      : <Photo src={car.photos.rear ?? car.photos.hero} style={{left: 60, right: 60, bottom: 60 * k, height: h * .45, borderRadius: 40}} />}
  </AbsoluteFill>;
};
