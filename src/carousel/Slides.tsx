// Кирпичики карусели: шапка, рубрика, заголовок, списки, карточки-цифры.
//
// Слайд — статичная картинка, поэтому здесь нет ни одной анимации: всё, что двигалось бы
// во времени, на выходе превратилось бы в случайный кадр этой анимации.
import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import {BODY, CopperText, HEAD, radius, useTheme} from '../shared/ui';

export const PAD = 96;
// Максимум слайдов — им задаётся длительность композиции (см. Root.tsx). Сколько слайдов
// в конкретной карусели, решает Carousel.tsx и передаёт числом: на проде истории нет,
// и слайдов шесть, а не семь. Поэтому номер «NN / total» в шапках приходит пропом.
export const TOTAL = 7;

/**
 * Безопасная зона сверху и снизу.
 *
 * Instagram НЕ поддерживает 9:16 в карусели: он обрезает такую картинку до 4:5, срезая
 * верх и низ. Из 1920 остаётся 1350 — по 285 с каждой стороны. Подпись, стоявшая внизу,
 * в ленту просто не попадала.
 *
 * TikTok показывает кадр целиком, но прячет низ под своей подписью и кнопками, так что
 * зона нужна и там. Поэтому один комплект слайдов годится обеим площадкам: фото идёт
 * во весь кадр, а текст живёт в середине.
 */
export const SAFE = Math.round((1920 - 1350) / 2);

/** Шапка: слева имя бренда, справа номер слайда. Одинаковая на всех слайдах. */
export const Header: React.FC<{index: number; total: number; brandName: string}> = ({index, total, brandName}) => {
  const C = useTheme();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 7,
      textTransform: 'uppercase', color: C.grey,
    }}>
      <span>{brandName}</span>
      <span>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
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
 * Фото в край: на всю ширину слайда, без рамки и полей.
 *
 * Рамка с бордюром и отступами читается как поле формы, а не как разворот журнала —
 * это и делало слайды «некинематографичными». Снизу кадр растворяется в фоне, поэтому
 * список под ним выглядит продолжением картинки, а не отдельным блоком.
 *
 * Шапка кладётся поверх фото: вынесенная над ним, она разрывает кадр.
 * Пустой адрес — серое поле с подписью: дыра честнее, чем слайд, молча съехавший.
 */
export const PhotoBand: React.FC<{
  src?: string; height: number; label?: string;
  index: number; total: number; brandName: string; focus?: string; trimTop?: number;
}> = ({src, height, label, index, total, brandName, focus = '50% 45%', trimTop = 0}) => {
  const C = useTheme();
  // Срезаем верх кадра принудительно: снимок шире рамки, и object-fit режет его по бокам,
  // а не сверху — вертикальное смещение на него не действует. А логотип Encar впечатан
  // именно вверху. Растягиваем картинку и сдвигаем вверх на ту же долю.
  const crop = trimTop > 0
    ? {height: `${100 / (1 - trimTop)}%`, marginTop: `${-100 * trimTop / (1 - trimTop)}%`}
    : {height: '100%'};
  return (
    <div style={{height, width: '100%', overflow: 'hidden', position: 'relative', background: C.panel}}>
      {src
        ? <Img src={src} style={{width: '100%', ...crop, objectFit: 'cover', objectPosition: focus}} />
        : (
          <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <span style={{fontFamily: BODY, fontSize: 30, color: C.grey}}>{label ?? 'нет фото'}</span>
          </div>
        )}
      {/* Сверху глушим впечатанный логотип Encar — он сидит в верхней трети кадра и
          светлый, поэтому затемнение держим плотным дольше. Снизу уводим кадр в фон. */}
      <AbsoluteFill style={{background:
        // Самый верх глухой: логотип Encar яркий, и сквозь 93% затемнения он ещё читался
        `linear-gradient(to bottom, ${C.bg} 0%, ${C.bg} 9%, ${C.bg}cc 18%, ${C.bg}55 30%, transparent 58%, ${C.bg} 100%)`}} />
      <div style={{
        position: 'absolute', top: SAFE, left: PAD, right: PAD, display: 'flex',
        justifyContent: 'space-between', fontFamily: BODY, fontWeight: 600, fontSize: 30,
        letterSpacing: 7, textTransform: 'uppercase', color: C.white,
      }}>
        <span>{brandName}</span>
        <span>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>
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
          <span style={{width: 10, height: 10, borderRadius: radius(C, 5), background: C.copper, flexShrink: 0}} />
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
      flex: 1, background: C.panel, borderRadius: radius(C, 18), border: `1px solid ${C.line}`,
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
export const Slide: React.FC<{index: number; total: number; brandName: string; children: React.ReactNode}> = ({index, total, brandName, children}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{
      background: C.bg, padding: `${SAFE}px ${PAD}px`, display: 'flex', flexDirection: 'column',
    }}>
      <Header index={index} total={total} brandName={brandName} />
      {children}
    </AbsoluteFill>
  );
};
