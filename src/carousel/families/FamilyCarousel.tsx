// Карусель в семействе из пакета KOK_handoff_v1 (registry.js). Данные слайдов — те же, что у
// пресетов оформления (carouselDesignContent: факты, цена, контакты, тексты из texts.ts), вёрстка —
// своя у семейства. Тема — бренд компании (логотип, название, подложка логотипа), поверх — палитра
// и шрифты семейства: три цвета пакета разложены на роли темы, чтобы общие части (Logo, подложка)
// видели настоящий фон и акцент.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {carouselDesignContent} from '../../design/DesignCarousel';
import {themeOf} from '../../shared/model';
import type {CarouselProps, CarouselTexts} from '../../shared/types';
import {ThemeProvider} from '../../shared/ui';
import {carouselSlides} from '../formats';
import {carouselLang, carouselText} from '../i18n';
import {COBALT_SLIDES} from './CobaltShift';
import {TYPE_DRIVE_SLIDES} from './TypeDrive';
import {PULSE_GRID_SLIDES} from './PulseGrid';
import {WIDE_FORM_SLIDES} from './WideForm';
import {URBAN_OLIVE_SLIDES} from './UrbanOlive';
import type {FamilySlideProps} from './kit';
import {familyById} from './registry.js';

const LAYOUTS: Record<string, Record<string, React.FC<FamilySlideProps>>> = {cobalt_shift: COBALT_SLIDES, type_drive: TYPE_DRIVE_SLIDES,
  pulse_grid: PULSE_GRID_SLIDES, wide_form: WIDE_FORM_SLIDES, urban_olive: URBAN_OLIVE_SLIDES};

export const FamilyCarousel: React.FC<CarouselProps & {texts: CarouselTexts}> = ({texts, ...props}) => {
  const frame = useCurrentFrame();
  const family = familyById(props.family)!;
  const {bg, text, accent} = family.colors;
  const brand = themeOf(props.theme);
  // Роли темы из трёх цветов пакета: панель и линии — от фона, второстепенный текст — текст
  // приглушённый, оттенки акцента — сам акцент (градиент у семейства не используется)
  const theme = {...brand, design: undefined, bg, panel: bg, line: accent, grey: text, white: text,
    copper: accent, copperLight: accent, copperDark: accent, fonts: family.fonts};
  const slides = carouselSlides(props.format, props.includeHistory !== false, props.skip);
  const index = Math.min(slides.length - 1, Math.max(0, frame));
  const slide = slides[index];
  const lang = carouselLang(props.market.language);
  const Slide = LAYOUTS[family.id]?.[slide] ?? LAYOUTS[family.id]?.engine;
  return <ThemeProvider value={theme}>
    <AbsoluteFill style={{background: family.colors.light}}>
      {Slide && <Slide slide={slide} index={index + 1} car={props.car} tx={carouselText(lang, props.car.origin)} ru={lang === 'ru'} colors={family.colors}
        content={carouselDesignContent(props, slide, texts.slides[index]?.fields)} />}
    </AbsoluteFill>
  </ThemeProvider>;
};
