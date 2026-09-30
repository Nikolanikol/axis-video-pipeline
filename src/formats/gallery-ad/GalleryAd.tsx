// Формат «Галерея» (gallery-ad): хук → склейки под бит → стопка из трёх фото с характеристиками
// → цена → призыв. Тайминги сцен — в config/formats.json.
//
// Сделан под фото Encar (30.09, по пробнику, который владелец одобрил): их у объявления два
// десятка, все горизонтальные. «Авто с ценой» берёт три фото — здесь до двенадцати: движение
// ролику дают склейки на долю темпа, а не камера (проход камеры вдоль машины укачивал).
//
// Фото по местам — src/shared/photoSlots.ts: по умолчанию по порядку (1-е хук, 2–4-е стопка —
// обзорные, как «рекомендованные» из Encar, — остальные галерея), а в форме лота у каждого
// фото можно выбрать место руками.
import React from 'react';
import {AbsoluteFill, Easing, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {getFormat, resolveAd, themeOf} from '../../shared/model';
import {photoLayout, type Layout} from '../../shared/photoSlots';
import {BackgroundMusic} from '../../shared/music';
import type {Ad, AdProps} from '../../shared/types';
import {BODY, CopperText, HEAD, LANDSCAPE_BAND, Landscape, Metal, PAD, Shade, ThemeProvider, TopLogo, clamp, photoSrc, useTheme} from '../../shared/ui';
import {Cta, Hook, PriceScene} from '../price-ad/PriceAd';

const FORMAT = getFormat('gallery-ad');
// Доля темпа в кадрах: 120 ударов в минуту при 30 кадрах — полсекунды. Склейки галереи
// и появление фото стопки — на доли, чтобы с музыкой всё шло в такт
const BEAT = Math.round((60 / FORMAT.bpm) * FORMAT.fps);
// Фото галереи стоит две доли (секунду) и растворяется в следующее за долю.
// Было полсекунды и растворение 8 кадров — владелец: «очень сильно моргает». Замер яркости
// по кадрам готового ролика (30.09): 27 → 59 → 43 → 27 → 59 дважды в секунду — тёмный салон,
// яркая фара, снова салон. Это мигание 2 Гц, и растворение его лишь размазывало. Секунда
// на кадр и растворение в полсекунды превращают смену в плавный переход, а не в мигание.
const SHOT = 2 * BEAT;
const XFADE = BEAT;
// Между сценами — растворение 12 кадров: там меняется вся раскладка кадра
const SCENE_XFADE = 12;

// Кадр галереи: фото стоит на месте. Прежнее отдаление 3% на каждом кадре давало «пульс»
// дважды в секунду — движение здесь только в самой смене кадров
const Cut: React.FC<{src: string}> = ({src}) => {
  const C = useTheme();
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, XFADE], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  const url = photoSrc(src);
  return (
    <AbsoluteFill style={{background: C.bg, opacity}}>
      <Img src={url} style={{position: 'absolute', inset: -80, width: 'calc(100% + 160px)', height: 'calc(100% + 160px)',
        objectFit: 'cover', filter: 'blur(50px) brightness(0.35)'}} />
      <Landscape src={url} w={1080} h={LANDSCAPE_BAND} />
    </AbsoluteFill>
  );
};

/**
 * Модель и год под фото галереи. Без них нижняя половина кадра пять секунд стояла пустой
 * и тёмной (владелец 30.09: «внизу галереи можно поставить модель и год»). Компактнее, чем
 * в хуке, — чтобы не повторять его один в один; появляется один раз и стоит, пока меняются фото.
 */
const GalleryTitle: React.FC<{ad: Ad}> = ({ad}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  // После растворения сцены: иначе надпись проступала бы вместе с первым фото и терялась
  const a = spring({frame: f - 14, fps, config: {damping: 200}});
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: PAD}}>
      <div style={{opacity: a, transform: `translateY(${(1 - a) * 30}px)`}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 600, fontSize: 40, letterSpacing: 12, textTransform: 'uppercase'}}>{ad.brand}</CopperText>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 28, flexWrap: 'wrap'}}>
          {/* Кегль по длине названия: «5-Series» и «Grand Starex» должны влезть в строку до кнопок Reels */}
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: Math.min(150, Math.floor(1300 / Math.max(1, ad.model.length))),
            lineHeight: 1, color: C.white, textTransform: 'uppercase'}}>{ad.model}</div>
          <CopperText style={{fontFamily: HEAD, fontWeight: 700, fontSize: 96, lineHeight: 1}}>{ad.year}</CopperText>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Сцена 2: склейки под бит
const Gallery: React.FC<{ad: Ad; layout: Layout}> = ({ad, layout}) => {
  const shots = layout.gallery;
  return (
    <AbsoluteFill>
      {shots.map((src, i) => (
        // Кадр живёт долю плюс растворение следующего поверх него. Первый не растворяется:
        // появление галереи целиком растворяет переход между сценами
        // premountFor — фото монтируется (и начинает грузиться) за кадр до появления. В превью
        // интерфейса иначе картинка грузилась в момент появления, и кадр на миг проваливался
        // в тёмный фон; в готовом ролике рендер сам ждёт загрузку, там этого не было
        <Sequence key={i} from={i === 0 ? -XFADE : i * SHOT} durationInFrames={SHOT + XFADE * 2} premountFor={SHOT}><Cut src={src} /></Sequence>
      ))}
      <Shade />
      <GalleryTitle ad={ad} />
      <TopLogo scrim={false} />
    </AbsoluteFill>
  );
};

// Сцена 3: три обзорных фото стопкой, целиком — 3 × 607 px это почти ровно высота кадра.
// Появляются по одному на долю; характеристики — поверх нижнего, выше подписи Reels
const Stack: React.FC<{ad: Ad; layout: Layout}> = ({ad, layout}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const H = 607;
  const GAP = 10;
  const top0 = Math.round((1920 - 3 * H - 2 * GAP) / 2);
  // Меньше трёх (фото мало или отмечено «не брать») — повторяем последнее, пустая полоса хуже
  const own = layout.stack.length ? layout.stack : layout.hook ? [layout.hook] : [];
  const three = own.length ? Array.from({length: 3}, (_, i) => own[Math.min(i, own.length - 1)]) : [];
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

// Хук — общая сцена «Авто с ценой», она берёт первое фото: подкладываем ей выбранное
const HookScene: React.FC<{ad: Ad; layout: Layout}> = ({ad, layout}) => <Hook ad={{...ad, photos: layout.hook ? [layout.hook] : []}} />;

const SCENES: Record<string, React.FC<{ad: Ad; layout: Layout}>> = {hook: HookScene, gallery: Gallery, stack: Stack, price: PriceScene, cta: Cta};
// Склеек в галерее — сколько долей в её сцене
const CUTS = Math.floor(FORMAT.scenes.find((s) => s.id === 'gallery')!.frames / SHOT);

export const GalleryAd: React.FC<AdProps> = (props) => {
  const ad = resolveAd(props);
  const theme = themeOf(props.theme);
  const layout = photoLayout(ad.photos, props.lot.slots, CUTS);
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {FORMAT.scenes.map((s, i) => {
          const Scene = SCENES[s.id];
          // Сцена живёт на SCENE_XFADE дольше — под растворяющейся поверх следующей.
          // Следующая начинается ровно на своём кадре (склейка на долю темпа не сдвигается)
          const last = i === FORMAT.scenes.length - 1;
          return (
            // premountFor — сцена и её фото готовы заранее (см. склейки галереи): иначе в превью
            // на стыке сцен мелькал пустой фон
            <Sequence key={s.id} name={s.title} from={s.from} durationInFrames={s.frames + (last ? 0 : SCENE_XFADE)} premountFor={30}>
              <SceneFade first={i === 0}><Scene ad={ad} layout={layout} /></SceneFade>
            </Sequence>
          );
        })}
        <BackgroundMusic music={ad.music} bpm={FORMAT.bpm} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
