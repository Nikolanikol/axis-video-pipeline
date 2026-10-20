// Карусель в семействе из пакета KOK_handoff_v1 (registry.js). Данные слайдов — те же, что у
// пресетов оформления (carouselDesignContent: факты, цена, контакты, тексты из texts.ts), вёрстка —
// своя у семейства. Тема — бренд компании (логотип, название, подложка логотипа), поверх — палитра
// и шрифты семейства: три цвета пакета разложены на роли темы, чтобы общие части (Logo, подложка)
// видели настоящий фон и акцент.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
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
import {CONTOUR_PLUM_SLIDES} from './ContourPlum';
import {H, W, type FamilySlideProps} from './kit';
import {familyById} from './registry.js';

const LAYOUTS: Record<string, Record<string, React.FC<FamilySlideProps>>> = {cobalt_shift: COBALT_SLIDES, type_drive: TYPE_DRIVE_SLIDES,
  pulse_grid: PULSE_GRID_SLIDES, wide_form: WIDE_FORM_SLIDES, urban_olive: URBAN_OLIVE_SLIDES,
  contour_plum: CONTOUR_PLUM_SLIDES};

export const FamilyCarousel: React.FC<CarouselProps & {texts: CarouselTexts}> = ({texts, ...props}) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
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
  const layouts = LAYOUTS[family.id] ?? {};
  // Слайды «Классики», которых нет в пакете: «Технологии» — вёрсткой салона, но с приборной
  // панелью и деталями первыми (иначе повторились бы фото салона); остальное — вёрсткой фактов
  const Slide = slide === 'technology' ? layouts.interior : layouts[slide] ?? layouts.engine;
  const car = slide === 'technology' ? {...props.car, photos: {...props.car.photos,
    interiorShot: props.car.photos.dashboard ?? props.car.photos.other[0] ?? props.car.photos.interiorShot,
    interior: [...props.car.photos.other, ...props.car.photos.interior.slice().reverse()]}} : props.car;
  const slideProps: FamilySlideProps = {slide, index: index + 1, car, tx: carouselText(lang, props.car.origin), ru: lang === 'ru',
    colors: family.colors, content: carouselDesignContent(props, slide, texts.slides[index]?.fields)};
  // Слайд вызываем как функцию, а не элементом: так видно его корневой фон, им заливаются полосы
  // над и под вёрсткой в 9:16. У слайдов семейств нет своих хуков (только у вложенных элементов),
  // поэтому прямой вызов безопасен — добавишь хук в сам слайд, переделай на явный цвет полос
  const node = Slide ? (Slide as (p: FamilySlideProps) => React.ReactElement)(slideProps) : null;
  // Полосы — корневым фоном слайда; если край вёрстки другого цвета (тёмная плоскость сверху у цены
  // Pulse Grid), слайд называет его сам: data-band-top / data-band-bottom
  const rootProps = (node?.props ?? {}) as {style?: React.CSSProperties; 'data-band-top'?: string; 'data-band-bottom'?: string};
  const band = (rootProps.style?.background as string | undefined) ?? family.colors.light;
  const bandTop = rootProps['data-band-top'] ?? band;
  const bandBottom = rootProps['data-band-bottom'] ?? band;
  // Вёрстка нарисована на 1080×1350 (4:5). В «Классике» (1080×1920) она стоит в середине кадра —
  // ровно в зоне, которую Instagram оставляет при обрезке 9:16 до 4:5; полосы сверху и снизу —
  // фоном слайда. Владелец 21.10: адаптация форматов, сначала 9:16
  const top = Math.max(0, Math.round((height - H) / 2));
  return <ThemeProvider value={theme}>
    <AbsoluteFill style={{background: band}}>
      {top > 0 && <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: top, background: bandTop}} />}
      {top > 0 && <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: top, background: bandBottom}} />}
      <div style={{position: 'absolute', left: 0, top, width: W, height: H, overflow: 'hidden'}}>{node}</div>
    </AbsoluteFill>
  </ThemeProvider>;
};
