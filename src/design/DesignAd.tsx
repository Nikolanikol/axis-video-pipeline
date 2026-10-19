// Сценарий ролика остаётся из formats.json: оформление меняет только его подачу.
// Фото по местам и сведения о страховых случаях — те же, что у прежних форматов.
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {carouselLang, carouselText} from '../carousel/i18n';
import {carouselPrice} from '../carousel/price';
import {fmt, getFormat, resolveAd, themeOf, totalInCurrency} from '../shared/model';
import {currencySign} from '../shared/currencies.js';
import {BackgroundMusic} from '../shared/music';
import {photoLayout} from '../shared/photoSlots';
import type {Ad, AdProps, Market} from '../shared/types';
import {clamp, ThemeProvider, useTheme} from '../shared/ui';
import {historyLines, priceFirstPhotos} from '../formats/price-first/PriceFirst';
import {DesignContent, DesignSlide} from './DesignSlide';
import {SceneMove, sceneOverlap} from './motion/scene';
import {resolveStyle} from './style/registry.js';

const contactOf = (ad: Ad) => {
  const telegram = ad.contactPrimary === 'telegram' && ad.telegram;
  const value = telegram || ad.whatsapp || ad.telegram || ad.site;
  return value ? {label: telegram ? 'Telegram' : ad.whatsapp ? (ad.texts.whatsappLabel || 'WhatsApp') : ad.telegram ? 'Telegram' : '',
    value, secondary: ad.site && value !== ad.site ? ad.site : undefined} : undefined;
};

export const adDesignContent = (ad: Ad, scene: string, formatId = 'price-ad', photo?: string | null, photos?: string[]): DesignContent => {
  const tx = carouselText(carouselLang(ad.language));
  const base = {title: ad.model, eyebrow: ad.brand, subtitle: [ad.year, ad.trim].filter(Boolean).join(' · '),
    photo: photo === undefined ? ad.photos[0] : photo, photos};
  const total = totalInCurrency(ad);
  const price = `${total === null ? '—' : fmt(total)} ${currencySign(ad.currency)}`;
  const priceLabel = (ad.texts.priceLabel || tx.s.price).replace('{port}', ad.port);
  if (scene === 'hook') return {...base, kind: 'cover', lines: ad.texts.hookTagline ? [ad.texts.hookTagline] : [],
    ...(formatId === 'price-first' ? {price, priceLabel} : {})};
  if (scene === 'price') return {...base, kind: 'price', price, priceLabel,
    lines: [ad.pricingMode !== 'domestic' ? [ad.origin, ad.port].filter(Boolean).join(' → ') : '',
      ad.texts.priceNoteIncluded, ad.texts.priceNoteExcluded].filter(Boolean)};
  if (scene === 'cta') return {...base, kind: 'cta', title: [ad.texts.ctaTitle, ad.texts.ctaAccent].filter(Boolean).join(' ') || tx.s.ctaTitle,
    lines: ad.texts.ctaBenefit ? [ad.texts.ctaBenefit] : [], contact: contactOf(ad)};
  if (scene === 'gallery') return {...base, kind: 'gallery'};
  if (scene === 'stack') return {...base, kind: 'facts', title: tx.s.specs, collage: true,
    facts: ad.specs.filter(Boolean).slice(0, 3).map((value) => ({value}))};
  const hist = scene === 'history' ? historyLines(ad.history, ad.language) : [];
  return {...base, kind: 'facts', title: hist.length ? tx.s.history : tx.s.specs,
    facts: [...hist, ...ad.specs.filter(Boolean).slice(0, hist.length ? 2 : 4)].slice(0, 5).map((value) => ({value}))};
};

const DesignedScene: React.FC<{ad: Ad; scene: string; formatId: string; index: number; total: number; variant: number; photos: string[]}> =
  ({ad, scene, formatId, index, total, variant, photos}) => {
    const frame = useCurrentFrame();
    const {fps} = useVideoConfig();
    const theme = useTheme();
    const shot = scene === 'gallery' && photos.length ? Math.min(photos.length - 1, Math.floor(frame / fps)) : 0;
    const photo = photos[shot] ?? null;
    const pair = (i: number) => [photos[i], photos[(i + 1) % photos.length]].filter(Boolean);
    const content = adDesignContent(ad, scene, formatId, photo, scene === 'gallery' ? pair(shot) : photos.slice(0, scene === 'stack' ? 3 : 2));
    // Запасные снимки для «Стопки» и «Крупнее о деталях» — другие фото этого же объявления
    content.spare = ad.photos.filter((url) => !content.photos?.includes(url) && url !== content.photo).slice(0, 2);
    // Меняем только изображения, не текст; растворение занимает 0,8 секунды, без резкой вспышки.
    if (scene === 'gallery' && shot > 0) {
      content.previousPhotos = pair(shot - 1);
      content.photoProgress = interpolate(frame - shot * fps, [0, Math.round(fps * .8)], [0, 1], clamp);
    }
    return <DesignSlide content={content} design={theme.design!} index={index} total={total} animated variant={variant} />;
  };

export const DesignAd: React.FC<AdProps & {formatId: string}> = ({formatId, ...props}) => {
  const ad = resolveAd(props);
  // Оформление объявления (lot.look) уже наложено на тему в formats/index.ts — здесь только бренд + снимок
  const theme = themeOf(props.theme);
  const format = getFormat(formatId);
  const cuts = Math.floor((format.scenes.find((s) => s.id === 'gallery')?.frames ?? 0) / format.fps);
  const layout = photoLayout(ad.photos, props.lot.slots, Math.max(1, cuts));
  const first = priceFirstPhotos(ad.photos, Math.max(1, cuts));
  const scenePhotos = (scene: string) => {
    if (formatId === 'gallery-ad') return scene === 'hook' ? [layout.hook].filter(Boolean) as string[]
      : scene === 'gallery' ? layout.gallery : scene === 'stack' ? layout.stack : [layout.hook, ...layout.stack, ...layout.gallery].filter(Boolean).slice(0, 2) as string[];
    if (formatId === 'price-first') return scene === 'hook' ? [first.hook, ad.photos[1]].filter(Boolean) as string[]
      : scene === 'gallery' ? first.gallery : scene === 'history' ? [first.history].filter(Boolean) as string[] : ad.photos.slice(0, 2);
    return scene === 'specs' ? ad.photos.slice(1, 3).length ? ad.photos.slice(1, 3) : ad.photos.slice(0, 1) : ad.photos.slice(0, 2);
  };
  // Переход между сценами — один на весь ролик (motion/scene.tsx)
  const transition = resolveStyle(theme, theme.design ?? 'catalog').sceneTransition;
  const overlap = sceneOverlap(transition, format.fps);
  return <ThemeProvider value={theme}><AbsoluteFill style={{background: theme.bg, overflow: 'hidden'}}>
    {format.scenes.map((s, i) => <Sequence key={s.id} name={s.title} from={s.from}
      durationInFrames={s.frames + (i === format.scenes.length - 1 ? 0 : overlap)} premountFor={format.fps}>
      <SceneMove id={transition} first={i === 0} last={i === format.scenes.length - 1} frames={s.frames} overlap={overlap}><DesignedScene ad={ad} scene={s.id} formatId={formatId} index={i + 1} total={format.scenes.length}
        variant={theme.designVariant ?? 0} photos={scenePhotos(s.id)} /></SceneMove>
    </Sequence>)}
    <BackgroundMusic music={ad.music} bpm={format.bpm} />
  </AbsoluteFill></ThemeProvider>;
};

// Для карусели цена без фрахта и свои подписи; рекламный ролик выше сохраняет экспортную цену.
export const carouselSamplerContent = (ad: Ad, market: Market, scene: string): DesignContent => {
  const content = adDesignContent(ad, scene, 'price-ad', ad.photos[0], ad.photos.slice(0, 2));
  const tx = carouselText(carouselLang(market.language), ad.originCountry);
  if (scene === 'price') {
    const amount = carouselPrice({price: {krw: ad.carPriceKrw ?? null, usd: ad.carPriceUsd ?? null, krwToUsd: null, quotedAt: null, rateSource: ''}}, market);
    return {...content, title: [ad.brand, ad.model].filter(Boolean).join(' '), price: amount === null ? '—' : tx.money(amount, market.currency),
      priceLabel: tx.s.priceInKorea, lines: tx.s.priceNotes.slice(0, 2)};
  }
  if (scene === 'cta') return {...content, title: tx.s.ctaTitle, lines: [tx.s.ctaText],
    contact: contactOf({...ad, whatsapp: market.whatsapp, telegram: market.telegram, site: market.site, contactPrimary: market.contactPrimary})};
  return content;
};

// Образец в настройках использует тот же компонент, что рендер, без анимации и обращения к шлюзу.
export const DesignSampler: React.FC<AdProps & {scene?: string}> = ({scene = 'hook', ...props}) => {
  const theme = themeOf(props.theme);
  const ad = resolveAd(props);
  return <ThemeProvider value={theme}><DesignSlide design={theme.design ?? 'catalog'}
    content={carouselSamplerContent(ad, props.market, scene)}
    index={['hook', 'specs', 'price', 'cta'].indexOf(scene) + 1} total={4} variant={theme.designVariant ?? 0} /></ThemeProvider>;
};
