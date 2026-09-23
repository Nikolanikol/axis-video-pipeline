// Кирпичики карусели: шапка, рубрика, заголовок, списки, карточки-цифры.
//
// Слайд — статичная картинка, поэтому здесь нет ни одной анимации: всё, что двигалось бы
// во времени, на выходе превратилось бы в случайный кадр этой анимации.
import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import {BODY, CopperText, HEAD, useTheme} from '../shared/ui';

export const PAD = 96;
export const TOTAL = 7;

/** Шапка: слева имя бренда, справа номер слайда. Одинаковая на всех семи. */
export const Header: React.FC<{index: number; brandName: string}> = ({index, brandName}) => {
  const C = useTheme();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 7,
      textTransform: 'uppercase', color: C.grey,
    }}>
      <span>{brandName}</span>
      <span>{String(index).padStart(2, '0')} / {String(TOTAL).padStart(2, '0')}</span>
    </div>
  );
};

/** Рубрика медью и крупный заголовок под ней — общий вход в каждый слайд */
export const Title: React.FC<{kicker: string; children: React.ReactNode}> = ({kicker, children}) => (
  <div style={{marginTop: 52}}>
    <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9, textTransform: 'uppercase'}}>
      {kicker}
    </CopperText>
    <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: 92, lineHeight: 1.05, marginTop: 20}}>
      {children}
    </div>
  </div>
);

/**
 * Фото с рамкой. Пустой адрес — вместо картинки серое поле с подписью:
 * дыра в вёрстке честнее, чем слайд, молча съехавший из-за отсутствующего фото.
 */
export const Photo: React.FC<{src?: string; height: number; label?: string}> = ({src, height, label}) => {
  const C = useTheme();
  return (
    <div style={{
      height, width: '100%', borderRadius: 18, overflow: 'hidden',
      border: `2px solid ${C.line}`, background: C.panel,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        ? <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        : <span style={{fontFamily: BODY, fontSize: 30, color: C.grey}}>{label ?? 'нет фото'}</span>}
    </div>
  );
};

/** Список через точку-акцент с линиями-разделителями */
export const Bullets: React.FC<{items: string[]; size?: number}> = ({items, size = 40}) => {
  const C = useTheme();
  return (
    <div style={{marginTop: 40}}>
      {items.map((t, i) => (
        <div key={t} style={{
          display: 'flex', alignItems: 'center', gap: 22,
          padding: '26px 0', borderTop: i ? `1px solid ${C.line}` : undefined,
        }}>
          <span style={{width: 10, height: 10, borderRadius: 5, background: C.copper, flexShrink: 0}} />
          <span style={{fontFamily: BODY, fontWeight: 500, fontSize: size, color: C.white, lineHeight: 1.25}}>{t}</span>
        </div>
      ))}
    </div>
  );
};

/** Карточка-цифра для слайда истории */
export const NumberCard: React.FC<{value: string; label: string; alarm?: boolean}> = ({value, label, alarm}) => {
  const C = useTheme();
  return (
    <div style={{
      flex: 1, background: C.panel, borderRadius: 18, border: `1px solid ${C.line}`,
      padding: '34px 30px', minWidth: 0,
    }}>
      <div style={{
        fontFamily: HEAD, fontWeight: 700, fontSize: 96, lineHeight: 1,
        color: alarm ? C.copperLight : C.white,
      }}>{value}</div>
      <div style={{
        fontFamily: BODY, fontWeight: 600, fontSize: 26, letterSpacing: 3,
        textTransform: 'uppercase', color: C.grey, marginTop: 14, lineHeight: 1.3,
      }}>{label}</div>
    </div>
  );
};

/** Строка таблицы «ключ → значение» для характеристик */
export const Row: React.FC<{k: string; v: string; first?: boolean}> = ({k, v, first}) => {
  const C = useTheme();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 30,
      padding: '28px 0', borderTop: first ? undefined : `1px solid ${C.line}`,
    }}>
      <span style={{fontFamily: BODY, fontWeight: 600, fontSize: 32, letterSpacing: 3,
        textTransform: 'uppercase', color: C.grey}}>{k}</span>
      <span style={{fontFamily: HEAD, fontWeight: 600, fontSize: 48, color: C.white, textAlign: 'right'}}>{v}</span>
    </div>
  );
};

/** Общая рамка слайда: фон, поля, шапка сверху */
export const Slide: React.FC<{index: number; brandName: string; children: React.ReactNode}> = ({index, brandName, children}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{background: C.bg, padding: PAD, display: 'flex', flexDirection: 'column'}}>
      <Header index={index} brandName={brandName} />
      {children}
    </AbsoluteFill>
  );
};
