// Формат «Галерея» (gallery-ad): хук → склейки под бит → стопка из трёх фото с характеристиками
// → цена → призыв. Тайминги сцен — в config/formats.json.
//
// Сделан под фото Encar (30.09, по пробнику, который владелец одобрил): их у объявления два
// десятка, все горизонтальные. «Авто с ценой» берёт три фото — здесь до двенадцати: движение
// ролику дают склейки на долю темпа, а не камера (проход камеры вдоль машины укачивал).
//
// Фото по местам: 1-е — хук, 2–4-е — стопка (обзорные: перед, зад, салон — ровно то, что
// сетка Encar выбирает как «рекомендованные»), 5-е и дальше — галерея.
import React from 'react';
import {AbsoluteFill, Easing, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {getFormat, resolveAd, themeOf} from '../../shared/model';
import {BackgroundMusic} from '../../shared/music';
import type {Ad, AdProps} from '../../shared/types';
import {BODY, LANDSCAPE_BAND, Landscape, Metal, PAD, Shade, ThemeProvider, TopLogo, clamp, photoSrc, useTheme} from '../../shared/ui';
import {Cta, Hook, PriceScene} from '../price-ad/PriceAd';

const FORMAT = getFormat('gallery-ad');
// Доля темпа в кадрах: 120 ударов в минуту при 30 кадрах — полсекунды. Склейки галереи
// и появление фото стопки — на доли, чтобы с музыкой всё шло в такт
const BEAT = Math.round((60 / FORMAT.bpm) * FORMAT.fps);

/**
 * Фото для галереи: сначала пятое и дальше (их никто больше не показывает), потом 2–4-е из
 * стопки — если своих на все склейки не хватает. Раньше брали только с пятого, и у лота из
 * пяти фото все восемь склеек показывали один снимок (раскадровка 30.09). Хук не берём:
 * он и так открывает ролик. Одно фото на весь лот — повторяем его, пустой кадр хуже.
 */
export const galleryPhotos = (photos: string[], cuts: number): string[] => {
  const pool = [...photos.slice(4), ...photos.slice(1, 4)];
  const list = pool.length ? pool : photos;
  return list.length ? Array.from({length: cuts}, (_, i) => list[i % list.length]) : [];
};

// Кадр без движения камеры: фото стоит, внутри доли — едва заметное отдаление 3%,
// чтобы склейка не казалась застывшей картинкой
const Cut: React.FC<{src: string}> = ({src}) => {
  const C = useTheme();
  const f = useCurrentFrame();
  const zoom = interpolate(f, [0, BEAT], [1.03, 1], {...clamp, easing: Easing.out(Easing.quad)});
  const url = photoSrc(src);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Img src={url} style={{position: 'absolute', inset: -80, width: 'calc(100% + 160px)', height: 'calc(100% + 160px)',
        objectFit: 'cover', filter: 'blur(50px) brightness(0.35)'}} />
      <Landscape src={url} w={1080} h={LANDSCAPE_BAND} zoom={zoom} />
    </AbsoluteFill>
  );
};

// Сцена 2: склейки под бит
const Gallery: React.FC<{ad: Ad}> = ({ad}) => {
  const {durationInFrames} = useVideoConfig();
  const shots = galleryPhotos(ad.photos, Math.floor(durationInFrames / BEAT));
  return (
    <AbsoluteFill>
      {shots.map((src, i) => (
        <Sequence key={i} from={i * BEAT} durationInFrames={BEAT}><Cut src={src} /></Sequence>
      ))}
      <Shade />
      <TopLogo scrim={false} />
    </AbsoluteFill>
  );
};

// Сцена 3: три обзорных фото стопкой, целиком — 3 × 607 px это почти ровно высота кадра.
// Появляются по одному на долю; характеристики — поверх нижнего, выше подписи Reels
const Stack: React.FC<{ad: Ad}> = ({ad}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const H = 607;
  const GAP = 10;
  const top0 = Math.round((1920 - 3 * H - 2 * GAP) / 2);
  const [p0, p1, p2, p3] = ad.photos;
  const three = [p1 ?? p0, p2 ?? p1 ?? p0, p3 ?? p2 ?? p1 ?? p0].filter(Boolean) as string[];
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {three.map((src, n) => {
        const a = interpolate(f, [n * BEAT, n * BEAT + 8], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
        return (
          <div key={n} style={{position: 'absolute', left: 0, top: top0 + n * (H + GAP), opacity: a, transform: `translateY(${(1 - a) * 40}px)`}}>
            <Landscape src={photoSrc(src)} w={1080} h={H} />
          </div>
        );
      })}
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'flex-start', padding: PAD, gap: 16}}>
        {ad.specs.filter(Boolean).map((s, i) => {
          // Характеристики — после третьего фото, чтобы не спорили с ним за внимание
          const a = spring({frame: f - 3 * BEAT - i * 6, fps, config: {damping: 200}});
          return (
            <div key={i} style={{display: 'flex', alignItems: 'stretch', opacity: a, transform: `translateX(${(1 - a) * -60}px)`,
              background: `${C.panel}e6`}}>
              <Metal style={{width: 10}} />
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 46, color: C.white, padding: '18px 30px'}}>{s}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <TopLogo />
    </AbsoluteFill>
  );
};

const SCENES: Record<string, React.FC<{ad: Ad}>> = {hook: Hook, gallery: Gallery, stack: Stack, price: PriceScene, cta: Cta};

export const GalleryAd: React.FC<AdProps> = (props) => {
  const ad = resolveAd(props);
  const theme = themeOf(props.theme);
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {FORMAT.scenes.map((s) => {
          const Scene = SCENES[s.id];
          return <Sequence key={s.id} name={s.title} from={s.from} durationInFrames={s.frames}><Scene ad={ad} /></Sequence>;
        })}
        <BackgroundMusic music={ad.music} bpm={FORMAT.bpm} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
