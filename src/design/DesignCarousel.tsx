// Содержимое карусели не зависит от оформления: факты, цена, язык и пропуски — из прежних данных.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {carouselLang, carouselText} from '../carousel/i18n';
import {carouselSlides} from '../carousel/formats';
import {carouselPrice} from '../carousel/price';
import type {CarouselProps} from '../shared/types';
import {ThemeProvider} from '../shared/ui';
import {themeOf} from '../shared/model';
import {DesignContent, DesignSlide} from './DesignSlide';

export const carouselDesignContent = (props: CarouselProps, slide: string): DesignContent => {
  const {car, market} = props;
  const tx = carouselText(carouselLang(market.language), car.origin);
  const ru = carouselLang(market.language) === 'ru';
  const labels = ru ? {exterior: 'Экстерьер', rear: 'Внешний вид', engine: 'Двигатель', safety: 'Безопасность',
    details: 'Детали', gallery: 'Галерея', why: 'О компании'} : {exterior: 'Exterior', rear: 'Exterior', engine: 'Engine', safety: 'Safety',
    details: 'Details', gallery: 'Gallery', why: 'About us'};
  const all = Array.from(new Set([car.photos.hero, ...car.photos.exterior, ...car.photos.interior, ...car.photos.other].filter(Boolean))) as string[];
  const base = {title: car.model, eyebrow: car.brand, subtitle: [car.year, car.grade, car.trim].filter(Boolean).join(' · '), photo: car.photos.hero,
    photos: [car.photos.hero, car.photos.exterior[1]].filter(Boolean) as string[]};
  const specFacts = [
    {label: tx.s.year, value: car.year === null ? '' : String(car.year)},
    {label: tx.s.mileage, value: car.mileageKm === null ? '' : tx.km(car.mileageKm)},
    {label: tx.s.engine, value: [car.displacementCc ? `${(car.displacementCc / 1000).toFixed(1).replace('.', ru ? ',' : '.')} ${ru ? 'л' : 'L'}` : '', tx.value(car.fuel)].filter(Boolean).join(' · ')},
    {label: tx.s.transmission, value: tx.value(car.transmission)},
  ].filter((f) => f.value);
  if (slide === 'cover') return {...base, kind: 'cover'};
  if (slide === 'history') {
    const h = car.history;
    return {...base, photos: undefined, kind: 'facts', title: h ? (h.accidentsTotal ? tx.s.nothingHidden : tx.s.noAccidents) : tx.s.reportOnRequest,
      facts: h ? [{label: tx.s.insuranceClaims, value: String(h.accidentsTotal)}, {label: tx.s.ownerChangesLabel, value: String(h.ownerChanges)},
        {label: tx.s.theft, value: String(h.theft)}, {label: tx.s.flood, value: String(h.flood)}] : [],
      lines: []};
  }
  if (slide === 'price') {
    const price = carouselPrice(car, market, props.priceOverride);
    return {...base, photos: undefined, kind: 'price', title: [car.brand, car.model].filter(Boolean).join(' '), priceLabel: tx.s.priceInKorea,
      price: price === null ? '—' : tx.money(price, market.currency), lines: tx.s.priceNotes.slice(0, 2)};
  }
  if (slide === 'cta' || slide === 'why') {
    const telegram = market.contactPrimary === 'telegram' && market.telegram;
    const contact = telegram || market.whatsapp || market.telegram || market.site;
    return {...base, photos: undefined, kind: 'cta', title: slide === 'why' ? labels.why : tx.s.ctaTitle, lines: [tx.s.ctaText],
      contact: contact ? {label: telegram ? 'Telegram' : market.whatsapp ? 'WhatsApp' : market.telegram ? 'Telegram' : '', value: contact,
        secondary: market.site && market.site !== contact ? market.site : undefined} : undefined};
  }
  if (['gallery', 'details', 'rear', 'exterior', 'masked-exterior'].includes(slide)) {
    const photos = slide === 'rear' ? [car.photos.rear, ...car.photos.exterior.slice(1)] : slide === 'details' ? [...car.photos.other, ...all] : all.slice(1);
    return {...base, kind: 'gallery', title: slide === 'masked-exterior' || slide === 'exterior' ? labels.exterior : labels[slide as keyof typeof labels] || labels.gallery,
      photos: photos.filter(Boolean) as string[], photo: car.photos.hero};
  }
  const interior = slide === 'interior';
  const safety = slide === 'safety';
  const options = interior ? car.options.comfort : safety ? car.options.safety : slide === 'technology' ? car.options.other : [];
  const photo = interior ? car.photos.interiorShot : safety || slide === 'technology' ? car.photos.dashboard : car.photos.exterior[2] || car.photos.hero;
  return {...base, kind: 'facts', title: interior ? tx.s.interior : safety ? labels.safety : slide === 'technology' ? tx.s.technology : slide === 'engine' ? labels.engine : tx.s.specs,
    photo, photos: undefined, facts: options.length ? options.slice(0, 4).map((option) => ({value: tx.option(option)})) : specFacts};
};

export const DesignCarousel: React.FC<CarouselProps> = (props) => {
  const frame = useCurrentFrame();
  const theme = themeOf(props.theme);
  const slides = carouselSlides(props.format, props.includeHistory !== false, props.skip);
  const index = Math.min(slides.length - 1, Math.max(0, frame));
  return <ThemeProvider value={theme}><DesignSlide design={theme.design!} content={carouselDesignContent(props, slides[index])}
    index={index + 1} total={slides.length} variant={(Math.abs(props.seed ?? 0) % 2) ^ (theme.designVariant ?? 0)} /></ThemeProvider>;
};
