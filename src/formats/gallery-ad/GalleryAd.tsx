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
// Растворение вместо жёсткой склейки. Жёсткие склейки каждые полсекунды «били по глазам»
// (владелец, 30.09): яркая фара сразу после тёмного салона, восемь раз подряд. Новое фото
// проступает поверх прежнего; склейка по-прежнему начинается на долю темпа.
// 8 кадров из 15 — больше половины доли: мягко, но кадр ещё успевает постоять чистым
const XFADE = 8;
// Между сценами — чуть длиннее: там меняется вся раскладка кадра (полоса → стопка → цена)
const SCENE_XFADE = 12;

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
  // Отдаление за всю жизнь кадра (доля + растворение следующего), а не за долю: иначе
  // под растворением картинка замирала бы и движение шло рывками
  const zoom = interpolate(f, [0, BEAT + XFADE], [1.03, 1], {...clamp, easing: Easing.out(Easing.quad)});
  const opacity = interpolate(f, [0, XFADE], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  const url = photoSrc(src);
  return (
    <AbsoluteFill style={{background: C.bg, opacity}}>
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
        // Кадр живёт долю плюс растворение следующего поверх него. Первый не растворяется:
        // появление галереи целиком растворяет переход между сценами
        <Sequence key={i} from={i === 0 ? -XFADE : i * BEAT} durationInFrames={BEAT + XFADE * 2}><Cut src={src} /></Sequence>
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
        // Появление мягче, чем было (8 кадров и сдвиг 40 px — «по глазам»): 14 кадров, сдвиг 16
        const a = interpolate(f, [n * BEAT, n * BEAT + 14], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
        return (
          <div key={n} style={{position: 'absolute', left: 0, top: top0 + n * (H + GAP), opacity: a, transform: `translateY(${(1 - a) * 16}px)`}}>
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

// Растворение сцены поверх предыдущей за SCENE_XFADE кадров; первая сцена — без него
const SceneFade: React.FC<{first: boolean; children: React.ReactNode}> = ({first, children}) => {
  const f = useCurrentFrame();
  const opacity = first ? 1 : interpolate(f, [0, SCENE_XFADE], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

const SCENES: Record<string, React.FC<{ad: Ad}>> = {hook: Hook, gallery: Gallery, stack: Stack, price: PriceScene, cta: Cta};

export const GalleryAd: React.FC<AdProps> = (props) => {
  const ad = resolveAd(props);
  const theme = themeOf(props.theme);
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {FORMAT.scenes.map((s, i) => {
          const Scene = SCENES[s.id];
          // Сцена живёт на SCENE_XFADE дольше — под растворяющейся поверх следующей.
          // Следующая начинается ровно на своём кадре (склейка на долю темпа не сдвигается)
          const last = i === FORMAT.scenes.length - 1;
          return (
            <Sequence key={s.id} name={s.title} from={s.from} durationInFrames={s.frames + (last ? 0 : SCENE_XFADE)}>
              <SceneFade first={i === 0}><Scene ad={ad} /></SceneFade>
            </Sequence>
          );
        })}
        <BackgroundMusic music={ad.music} bpm={FORMAT.bpm} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
