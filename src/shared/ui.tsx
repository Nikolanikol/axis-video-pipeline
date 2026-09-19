// Общие детали роликов AXIS: тема, шрифты, медь, фото, затемнение, логотип.
import React, {createContext, useContext, useEffect, useState} from 'react';
import {AbsoluteFill, Img, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import '@fontsource/oswald/cyrillic-700.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/cyrillic-500.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/montserrat/cyrillic-500.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/cyrillic-600.css';
import '@fontsource/montserrat/latin-600.css';
import {BRAND} from './model';
import type {Theme} from './types';

export const HEAD = 'Oswald, sans-serif';
export const BODY = 'Montserrat, sans-serif';
// Безопасная зона TikTok/Reels: снизу подпись и музыка, справа кнопки
export const PAD = '0 150px 360px 80px';
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const lines = (s = '') => s.split('\n').map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>);
const src = (s: string) => (s.startsWith('http') || s.startsWith('/') ? s : staticFile(s));

// Цвета бренда: config/brand.json, можно переопределить через props.theme
const ThemeCtx = createContext<Theme>(BRAND);
export const ThemeProvider = ThemeCtx.Provider;
export const useTheme = () => useContext(ThemeCtx);

const copper = (C: Theme) =>
  `linear-gradient(115deg, ${C.copperDark} 0%, ${C.copper} 30%, ${C.copperLight} 55%, ${C.copper} 80%, ${C.copperDark} 100%)`;

// Текст с медным градиентом
export const CopperText: React.FC<{style?: React.CSSProperties; children: React.ReactNode}> = ({style, children}) => (
  <span style={{backgroundImage: copper(useTheme()), WebkitBackgroundClip: 'text', backgroundClip: 'text',
    WebkitTextFillColor: 'transparent', color: 'transparent', ...style}}>{children}</span>
);

// Медная плашка с текстурой шлифованного металла
export const Metal: React.FC<{style?: React.CSSProperties; children?: React.ReactNode}> = ({style, children}) => (
  <div style={{backgroundImage: `url(${staticFile('brand/brushed-copper.jpg')}), ${copper(useTheme())}`,
    backgroundSize: 'cover', backgroundBlendMode: 'overlay', ...style}}>{children}</div>
);

// Соотношение сторон фото (ждём загрузку, чтобы выбрать раскладку)
const usePhotoRatio = (url: string) => {
  const [ratio, setRatio] = useState<number | null>(null);
  const [handle] = useState(() => delayRender(`photo ${url}`));
  useEffect(() => {
    if (!url) { continueRender(handle); return; }
    const img = new Image();
    img.onload = () => { setRatio(img.naturalWidth / img.naturalHeight); continueRender(handle); };
    img.onerror = () => { setRatio(1.5); continueRender(handle); };
    img.src = url;
  }, [url, handle]);
  return ratio;
};

// Фото в вертикальном кадре. Вертикальное — сверху во всю ширину (3:4 → 1080×1440),
// горизонтальное — целиком полосой под логотипом, вокруг размытый фон.
export const Photo: React.FC<{src?: string; dur: number}> = ({src: s, dur}) => {
  const C = useTheme();
  const f = useCurrentFrame();
  const url = s ? src(s) : '';
  const ratio = usePhotoRatio(url);
  const zoom = interpolate(f, [0, dur], [1.0, 1.07]);
  if (!url || ratio === null) return <AbsoluteFill style={{background: C.bg}} />;
  const portrait = ratio < 1;
  const h = Math.min(1920, Math.round(1080 / ratio));
  const top = portrait ? 0 : 230;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Img src={url} style={{position: 'absolute', inset: -80, width: 'calc(100% + 160px)', height: 'calc(100% + 160px)',
        objectFit: 'cover', filter: 'blur(50px) brightness(0.35)'}} />
      <div style={{position: 'absolute', top, left: 0, width: 1080, height: h, overflow: 'hidden'}}>
        <Img src={url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}} />
      </div>
    </AbsoluteFill>
  );
};

// Затемнение снизу под текст + лёгкое сверху под логотип
export const Shade: React.FC = () => {
  const {bg} = useTheme();
  const a = (o: number) => `${bg}${Math.round(o * 255).toString(16).padStart(2, '0')}`;
  return <AbsoluteFill style={{background: `linear-gradient(180deg, ${a(0.75)} 0%, ${a(0)} 14%, ${a(0)} 36%, ${a(0.8)} 54%, ${a(0.95)} 66%, ${bg} 76%)`}} />;
};

/**
 * Горизонтальный логотип вверху кадра.
 * Поверх съёмки логотип легко теряется: светлое небо съедает и медь, и белую подпись.
 * Поэтому под ним своя подложка — короткий градиент, плотный там, где лежит логотип (9–13 %
 * высоты кадра), и сходящий на нет к 20 %: небо остаётся небом, а не тёмной полосой.
 * Плюс мягкая тень на самих буквах — отделяет их от светлого фона, когда градиента мало.
 * scrim={false} — там, где затемнение уже есть (в рекламе это делает Shade) и второе лишнее.
 */
export const TopLogo: React.FC<{scrim?: boolean}> = ({scrim = true}) => {
  const {bg} = useTheme();
  const a = (o: number) => `${bg}${Math.round(o * 255).toString(16).padStart(2, '0')}`;
  return (
    <>
      {scrim && (
        <AbsoluteFill style={{
          background: `linear-gradient(180deg, ${a(0.55)} 0%, ${a(0.45)} 9%, ${a(0.3)} 13%, ${a(0)} 20%)`,
        }} />
      )}
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 170}}>
        <Img src={staticFile('brand/logo-horizontal.svg')}
          style={{height: 78, filter: scrim ? 'drop-shadow(0 3px 10px rgba(0,0,0,0.5))' : undefined}} />
      </AbsoluteFill>
    </>
  );
};
