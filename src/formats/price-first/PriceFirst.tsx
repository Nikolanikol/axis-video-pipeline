// Формат «Цена сразу» (price-first): машина с ценой в первом кадре → галерея → история →
// призыв. Тайминги сцен — в config/formats.json.
//
// Зачем (обсуждение с владельцем 29.09): в «Авто с ценой» цена появляется на 7-й секунде,
// а в ленте Reels и TikTok многие листают дальше уже на 2–3-й. Для дилера цена — главный
// крючок, поэтому здесь она в первом же кадре, а подробности — для тех, кто остался.
//
// Фото по местам: 1-е — первый кадр, 2-е — фон сцены истории, 3-е и дальше — галерея.
import React from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {carouselLang} from '../../carousel/i18n';
import {currencySign} from '../../shared/blocks';
import {fmt, getFormat, resolveAd, themeOf, totalInCurrency} from '../../shared/model';
import {BackgroundMusic} from '../../shared/music';
import type {Layout} from '../../shared/photoSlots';
import type {Ad, AdProps} from '../../shared/types';
import {BODY, CopperText, HEAD, Metal, PAD, Photo, Shade, ThemeProvider, TopLogo, clamp, useTheme} from '../../shared/ui';
import {Gallery, SCENE_XFADE, SHOT, SceneFade} from '../gallery-ad/GalleryAd';
import {Cta} from '../price-ad/PriceAd';

const FORMAT = getFormat('price-first');
// Склеек в галерее — сколько кадров по SHOT (секунда) в её сцене; SHOT общий с «Галереей»
const CUTS = Math.floor(FORMAT.scenes.find((s) => s.id === 'gallery')!.frames / SHOT);

/** Фото по местам: первый кадр, фон истории и галерея (своих мало — добираем, пустой кадр хуже) */
export const priceFirstPhotos = (photos: string[], cuts = CUTS) => {
  const [hook = null, history = null] = photos;
  const own = photos.slice(2);
  const pool = own.length >= 3 ? own : [...own, ...photos.slice(0, 2)];
  const gallery = pool.length ? Array.from({length: cuts}, (_, i) => pool[i % pool.length]) : [];
  return {hook, history: history ?? hook, gallery};
};

// Слова сцены истории. Точные: Encar знает о страховых случаях, а не о «ДТП» вообще
const WORDS = {
  ru: {
    history: 'История авто', specs: 'Характеристики',
    noClaims: 'Страховых случаев нет', claims: (n: number) => `Страховые случаи: ${n}`,
    oneOwner: 'Один владелец',
    owners: (n: number) => `Смены владельца: ${n}`,
    clean: 'Угонов и затоплений нет', theft: (n: number) => `Угоны: ${n}`, flood: (n: number) => `Затопления: ${n}`,
  },
  en: {
    history: 'Vehicle history', specs: 'Specifications',
    noClaims: 'No insurance claims', claims: (n: number) => `Insurance claims: ${n}`,
    oneOwner: 'One owner',
    owners: (n: number) => `Owner changes: ${n}`,
    clean: 'No theft or flood records', theft: (n: number) => `Theft records: ${n}`, flood: (n: number) => `Flood records: ${n}`,
  },
};

/**
 * Строки истории. Показываем как есть, и хорошее, и нет: история, в которой видно только
 * хорошее, выглядит как реклама, а не как отчёт, — и доверия к ней нет. Истории нет — пусто
 * (сцена покажет характеристики): «нет данных» и «чисто» — не одно и то же.
 */
export const historyLines = (h: Ad['history'], language?: string): string[] => {
  if (!h) return [];
  const w = WORDS[carouselLang(language)];
  const lines = [h.accidentsTotal === 0 ? w.noClaims : w.claims(h.accidentsTotal),
    h.ownerChanges === 0 ? w.oneOwner : w.owners(h.ownerChanges)];
  if (h.theft === 0 && h.flood === 0) lines.push(w.clean);
  else {
    if (h.theft) lines.push(w.theft(h.theft));
    if (h.flood) lines.push(w.flood(h.flood));
  }
  return lines;
};

// Плашка строки — как характеристики в остальных форматах: медная полоска слева
const Chip: React.FC<{text: string; delay: number}> = ({text, delay}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const a = spring({frame: f - delay, fps, config: {damping: 200}});
  return (
    <div style={{display: 'flex', alignItems: 'stretch', opacity: a, transform: `translateX(${(1 - a) * -60}px)`, background: `${C.panel}e6`}}>
      <Metal style={{width: 10}} />
      <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 44, color: C.white, padding: '16px 28px'}}>{text}</div>
    </div>
  );
};

// Сцена 1: машина, модель с годом и сразу цена
const PriceHook: React.FC<{ad: Ad; photo: string | null}> = ({ad, photo}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const total = totalInCurrency(ad);
  // Счётчик короткий (0,3–1 с): цена должна читаться, пока человек ещё не пролистнул
  const count = interpolate(f, [9, 30], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const num = total === null ? null : count >= 1 ? total : Math.round((total * count) / 10) * 10;
  const sign = currencySign(ad.currency);
  const label = num === null ? `XX XXX ${sign}` : `${fmt(num)} ${sign}`;
  const title = spring({frame: f - 2, fps, config: {damping: 200}});
  const priceIn = spring({frame: f - 9, fps, config: {damping: 14, mass: 0.6}});
  const tag = interpolate(f, [30, 42], [0, 1], clamp);
  const tagline = ad.texts.hookTagline;
  return (
    <AbsoluteFill>
      <Photo src={photo ?? undefined} dur={durationInFrames} />
      <Shade />
      <AbsoluteFill style={{justifyContent: 'flex-end', padding: PAD}}>
        <div style={{opacity: title, transform: `translateY(${(1 - title) * 40}px)`}}>
          <CopperText style={{fontFamily: BODY, fontWeight: 600, fontSize: 40, letterSpacing: 12, textTransform: 'uppercase'}}>{ad.brand}</CopperText>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 26, flexWrap: 'wrap'}}>
            <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: Math.min(140, Math.floor(1200 / Math.max(1, ad.model.length))),
              lineHeight: 1, color: C.white, textTransform: 'uppercase'}}>{ad.model}</div>
            <CopperText style={{fontFamily: HEAD, fontWeight: 700, fontSize: 90, lineHeight: 1}}>{ad.year}</CopperText>
          </div>
        </div>
        <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 34, color: C.grey, textTransform: 'uppercase', letterSpacing: 5, marginTop: 34, opacity: title}}>
          {(ad.texts.priceLabel ?? '').replace('{port}', ad.port)}
        </div>
        <div style={{transform: `scale(${0.85 + 0.15 * priceIn})`, transformOrigin: 'left center', opacity: Math.min(1, priceIn * 1.5)}}>
          {/* Кегль по длине — как в «Авто с ценой»: вона длиннее доллара вдвое */}
          <CopperText style={{fontFamily: HEAD, fontWeight: 700, fontSize: Math.min(200, Math.floor(850 / (label.length * 0.5))), lineHeight: 1.1,
            display: 'inline-block', whiteSpace: 'nowrap'}}>{label}</CopperText>
        </div>
        {tagline && (
          <div style={{fontFamily: HEAD, fontWeight: 500, fontSize: 56, color: C.white, textTransform: 'uppercase', letterSpacing: 2, marginTop: 8, opacity: tag}}>
            {tagline}
          </div>
        )}
      </AbsoluteFill>
      <TopLogo scrim={false} />
    </AbsoluteFill>
  );
};

// Сцена 3: история, а без неё — характеристики
const History: React.FC<{ad: Ad; photo: string | null}> = ({ad, photo}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {durationInFrames} = useVideoConfig();
  const w = WORDS[carouselLang(ad.language)];
  const hist = historyLines(ad.history, ad.language);
  // С историей — две главные характеристики (пробег, двигатель), без неё — все
  const specs = ad.specs.filter(Boolean).slice(0, hist.length ? 2 : 4);
  const head = interpolate(f, [4, 16], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Photo src={photo ?? undefined} dur={durationInFrames} />
      <Shade />
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'flex-start', padding: PAD, gap: 14}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 600, fontSize: 38, letterSpacing: 10, textTransform: 'uppercase', opacity: head, marginBottom: 6}}>
          {hist.length ? w.history : w.specs}
        </CopperText>
        {[...hist, ...specs].map((s, i) => <Chip key={i} text={s} delay={10 + i * 7} />)}
      </AbsoluteFill>
      <TopLogo scrim={false} />
    </AbsoluteFill>
  );
};

// Сцены собираются здесь, а не по реестру, как у «Галереи»: у первого кадра и истории
// свои фото (priceFirstPhotos), а галерея общая
export const PriceFirst: React.FC<AdProps> = (props) => {
  const ad = resolveAd(props);
  const theme = themeOf(props.theme);
  const p = priceFirstPhotos(ad.photos);
  // Галерея общая с форматом «Галерея» — ей нужна раскладка; хук и стопка ей не нужны
  const layout: Layout = {hook: p.hook, stack: [], gallery: p.gallery, placed: {}};
  const scenes: Record<string, React.ReactNode> = {
    hook: <PriceHook ad={ad} photo={p.hook} />,
    gallery: <Gallery ad={ad} layout={layout} />,
    history: <History ad={ad} photo={p.history} />,
    cta: <Cta ad={ad} />,
  };
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {FORMAT.scenes.map((s, i) => {
          const last = i === FORMAT.scenes.length - 1;
          // Растворение сцен и предзагрузка — как в «Галерее» (см. там, почему)
          return (
            <Sequence key={s.id} name={s.title} from={s.from} durationInFrames={s.frames + (last ? 0 : SCENE_XFADE)} premountFor={30}>
              <SceneFade first={i === 0}>{scenes[s.id]}</SceneFade>
            </Sequence>
          );
        })}
        <BackgroundMusic music={ad.music} bpm={FORMAT.bpm} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
