// Движения из пакета KOK_STYLE_MOTION_PACK (первый релиз): три появления заголовка, въезд цены
// и четыре смены сцен. Всё считается от номера кадра — превью и рендер дают одинаковую картинку.
// Тайминги — из data/motions.json пакета, в секундах (правило проекта: не в кадрах).
// В одном ролике — одно появление заголовков и одна смена сцен: случайной анимации на слово нет.
import React from 'react';
import {DEFAULT_MOTION, SCENE_TRANSITIONS, SLIDE_MOTIONS, TEXT_MOTIONS} from '../shared/design.js';
import type {DesignId, SlideMotionId, TextMotionId, Theme} from '../shared/types';

// ease-out и smoothstep — те же формулы, что в motion-engine.js пакета
const cut = (v: number) => Math.max(0, Math.min(1, v));
export const easeOut = (v: number) => 1 - Math.pow(1 - cut(v), 3);
export const smooth = (v: number) => { const x = cut(v); return x * x * (3 - 2 * x); };

export type Motion = {text: TextMotionId; slide: SlideMotionId};

export const TEXT_MOTION_TITLES: Record<TextMotionId, string> = {
  line_lift: 'Из-под строки', word_steps: 'Слова по очереди', wipe: 'Открыть слева', tracking: 'Собрать трекинг',
  focus: 'Навести резкость', underline: 'Подчеркнуть', highlight: 'Акцентная плашка', label: 'Собрать табличку',
  letters: 'Буквы волной', crossfade: 'Смена надписи', weight: 'Набрать вес',
};
export const SLIDE_MOTION_TITLES: Record<SlideMotionId, string> = {
  pan: 'Тихий проезд', window: 'Окно раскрывается', match: 'Общий объект', push: 'Вертикальная смена',
  stack: 'Стопка снимков', detail: 'Крупнее о деталях',
  dissolve: 'Мягкое растворение', push_side: 'Толчок вбок', wipe_cut: 'Строгая шторка', diagonal: 'Диагональный срез',
  iris: 'Диафрагма', depth_zoom: 'Наезд вглубь', whip: 'Резкая панорама', shutters: 'Шторки от центра',
};

// Не выбранное вручную берётся от компоновки: так сохранённые бренды получают подачу,
// задуманную для их дизайна, а не случайную
export const motionOf = (theme: Pick<Theme, 'textMotion' | 'slideMotion'>, design: DesignId): Motion => ({
  text: TEXT_MOTIONS.includes(theme.textMotion as TextMotionId) ? theme.textMotion! : DEFAULT_MOTION[design].text,
  slide: SLIDE_MOTIONS.includes(theme.slideMotion as SlideMotionId) ? theme.slideMotion! : DEFAULT_MOTION[design].slide,
});

// Подпись после фото: «Окно» — через 0,16 с (пакет), остальные — когда фото почти село:
// иначе заголовок приходит раньше картинки, к которой он относится
export const textDelay = (slide: SlideMotionId) =>
  ({window: .16, match: .35, stack: .35, detail: .45} as Partial<Record<SlideMotionId, number>>)[slide] ?? 0;

// Сколько сцены идут внахлёст. Растворению хватает 0,4 с (прежние 12 кадров при 30),
// вертикальной смене — 0,75 с из пакета: быстрее два слоя читаются как рывок
export const sceneOverlap = (slide: SlideMotionId, fps: number) => Math.round(fps * (slide === 'push' ? .75 : isSceneTransition(slide) ? sceneDuration(slide) : .4));

// ——— Переходы между сценами из KOK Motion Studio V3 (lib/transition-core.js, «KOK Originals»).
// Формулы и кривые — оттуда; сдвиги переведены из пикселей демо-карточки в доли кадра,
// как советует сама студия («нормализовать к размеру сцены»), иначе на 1080×1920 толчок
// не доезжал бы до края. Время — от номера кадра: уходящая сцена знает свою долю выхода,
// входящая — входа, на одном кадре они равны, и два слоя складываются в один переход
export type SceneTransitionId = typeof SCENE_TRANSITIONS[number];
export const isSceneTransition = (id: string): id is SceneTransitionId => (SCENE_TRANSITIONS as readonly string[]).includes(id);
// Длительность — студийная по умолчанию (0,8 с), у резкой панорамы — как у «Motion Blur» (0,65 с)
const sceneDuration = (id: SlideMotionId) => id === 'whip' ? .65 : .8;

// Кубическая Безье тем же двоичным поиском, что в студии: кривые совпадают с её превью
// Концы — ровно 0 и 1: поиск сходится к 0,99999…, и сцена недоезжала бы на долю пикселя
const bezier = (x: number, a: number, b: number, c: number, d: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const f = (t: number, p1: number, p2: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (f(m, a, c) < cut(x)) lo = m; else hi = m; }
  return f((lo + hi) / 2, b, d);
};
const SCENE_EASE: Record<SceneTransitionId, (t: number) => number> = {
  dissolve: (t) => bezier(t, .65, 0, .35, 1), push_side: (t) => bezier(t, .65, 0, .35, 1), shutters: (t) => bezier(t, .65, 0, .35, 1),
  wipe_cut: (t) => bezier(t, .22, 1, .36, 1), iris: (t) => bezier(t, .22, 1, .36, 1), depth_zoom: (t) => bezier(t, .22, 1, .36, 1),
  diagonal: (t) => bezier(t, .18, .84, .17, 1), whip: (t) => bezier(t, .18, .84, .17, 1),
};

/**
 * Стиль слоя сцены в переходе. role: 'in' — входящая (сверху), 'out' — уходящая. raw — доля 0…1.
 * Размытие у «Резкой панорамы» — только на время перехода (0,65 с): в каждом кадре
 * оно вдвое замедляло бы рендер на сервере (CLAUDE.md)
 */
export const sceneLayer = (id: SceneTransitionId, role: 'in' | 'out', raw: number): React.CSSProperties => {
  const e = SCENE_EASE[id](raw);
  const inv = 1 - e;
  const blur = (px: number) => px > .05 ? {filter: `blur(${px.toFixed(2)}px)`} : {};
  switch (id) {
    case 'dissolve': return {opacity: role === 'in' ? e : 1 - e};
    case 'push_side': return {transform: `translateX(${role === 'in' ? inv * 100 : -e * 100}%)`};
    case 'wipe_cut': return role === 'in' ? {clipPath: `inset(0 ${100 * inv}% 0 0)`} : {};
    // В студии срез доходит лишь до 100% сверху и 65% снизу — в конце сцена открывалась скачком;
    // 135% доводят нижний край ровно до 100%
    case 'diagonal': return role === 'in' ? {clipPath: `polygon(0 0, ${135 * e}% 0, ${Math.max(0, 135 * e - 35)}% 100%, 0 100%)`} : {};
    case 'iris': return role === 'in' ? {clipPath: `circle(${e * 75}% at 50% 50%)`} : {};
    case 'depth_zoom': return role === 'in'
      ? {transform: `scale(${.78 + .22 * e})`, opacity: cut((e - .07) * 1.4)}
      : {transform: `scale(${1 + .56 * e})`, opacity: cut(1 - e * 1.2)};
    case 'whip': {
      const smear = 12 * Math.sin(Math.PI * e) * .8;
      return role === 'in'
        ? {transform: `translateX(${inv * 100}%)`, opacity: cut(e * 2), ...blur(smear)}
        : {transform: `translateX(${-e * 100}%)`, opacity: cut((1 - e) * 2), ...blur(smear)};
    }
    case 'shutters': return role === 'in' ? {clipPath: `inset(${50 * inv}% 0 ${50 * inv}% 0)`} : {};
  }
};

// Фото внутри сцены: t — секунды от начала сцены. Возвращает стиль рамки и картинки
export const photoMotion = (slide: SlideMotionId, t: number): {frame: React.CSSProperties; img?: string} => {
  if (slide === 'pan') return {frame: {}, img: `scale(${1 + .035 * cut(t / 3)})`};
  if (slide === 'window') {
    // Раскрытие от центра: края 50% → 0% за 0,7 с
    const side = (1 - easeOut(t / .7)) * 50;
    return {frame: {clipPath: `inset(0 ${side}% 0 ${side}%)`}};
  }
  if (slide === 'match') {
    // Один и тот же слой садится в свою карточку: 100/78 → 1 и сдвиг вверх на 12% за 0,85 с
    const v = easeOut(t / .85);
    return {frame: {transform: `translateY(${(1 - v) * 12}%) scale(${1 + (1 - v) * (1 / .78 - 1)})`, transformOrigin: '50% 0%'}};
  }
  return {frame: {}};
};

// Вертикальная смена: входящая сцена поднимается снизу, уходящая — вверх с той же скоростью.
// enter/exit — доля перехода 0…1; у первой сцены входа нет, у последней — выхода
export const pushOffset = (enter: number, exit: number) => (1 - smooth(enter)) * 100 - smooth(exit) * 100;

// Слова заголовка с оценкой строки. Перенос делает браузер; строку для шага каскада
// оцениваем той же шириной буквы 0,55 кегля, что DesignSlide для высоты заголовка, —
// реальный перенос по ней не меняется, сбивается разве что задержка на одно слово
const wordsWithLines = (text: string, size: number, width: number) => {
  let line = 0;
  let used = 0;
  return text.split(/\s+/).filter(Boolean).map((word) => {
    const w = (word.length + 1) * size * .55;
    if (used > 0 && used + w > width) { line += 1; used = 0; }
    used += w;
    return {word, line};
  });
};

// Цвета для приёмов с плашкой и линией — из темы слайда
export type TitleColors = {accent: string; onAccent: string; panel: string};

// Из-под строки: слова строки выходят из маски вместе, строки — с шагом 0,09 с, вход 0,52 с.
// Маска с запасом сверху и снизу: иначе срезает «Й», «Ё» и хвосты «у», «р» при межстрочном 1,06
const lineLift = (text: string, t: number, size: number, width: number) => {
  const words = wordsWithLines(text, size, width);
  return words.map(({word, line}, i) => {
    const v = easeOut((t - line * .09) / .52);
    return <React.Fragment key={i}><span style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top',
      padding: '.14em 0 .1em', margin: '-.14em 0 -.1em'}}>
      <span style={{display: 'inline-block', transform: `translateY(${(1 - v) * 125}%)`}}>{word}</span>
    </span>{i < words.length - 1 ? ' ' : ''}</React.Fragment>;
  });
};

// Заголовок с появлением. t — секунды от начала появления (уже с учётом задержки).
// swap — вторая надпись для «Смены надписи» (у обложки — год и комплектация)
export const MotionTitle: React.FC<{text: string; kind: TextMotionId; t: number; size: number; width: number;
  colors: TitleColors; swap?: string; weight?: number}> = ({text, kind, t, size, width, colors, swap, weight = 600}) => {
  const words = wordsWithLines(text, size, width);
  const oneLine = words.every((w) => w.line === 0);
  // Приём не подходит к этому тексту — построчное появление, как советует пакет:
  // трекинг — только в одну строку, волна букв — до 24 знаков, смена — только при второй надписи
  if ((kind === 'tracking' && !oneLine) || (kind === 'letters' && text.length > 24) || (kind === 'crossfade' && !swap)) {
    return <>{lineLift(text, t, size, width)}</>;
  }
  if (kind === 'wipe') {
    // Неподвижный текст открывается маской слева направо за 0,6 с
    const v = easeOut(t / .6);
    return <span style={{display: 'block', clipPath: `inset(-20% ${(1 - v) * 100}% -20% 0)`}}>{text}</span>;
  }
  if (kind === 'tracking') {
    // Трекинг 0,10 em → 0 и проявление за 0,65 с. Без переноса: строка в одну — так пакет и
    // задумал, а перенос на лишней ширине разорвал бы название на первых кадрах
    const v = easeOut(t / .65);
    return <span style={{display: 'block', whiteSpace: 'nowrap', opacity: v, letterSpacing: `${(1 - v) * .1}em`}}>{text}</span>;
  }
  if (kind === 'focus') {
    // Размытие 7 px → 0, масштаб 1,025 → 1 за 0,55 с. Фильтр — только на эти полсекунды:
    // размытие в каждом кадре вдвое замедляло рендер на сервере (CLAUDE.md), здесь его 17 кадров на сцену
    const v = easeOut(t / .55);
    return <span style={{display: 'block', opacity: v, transformOrigin: '0 50%', transform: `scale(${1 + (1 - v) * .025})`,
      ...(v < 1 ? {filter: `blur(${(7 * (1 - v)).toFixed(2)}px)`} : {})}}>{text}</span>;
  }
  if (kind === 'underline') {
    // Текст проявляется за 0,46 с; линия растёт слева направо с 0,18 с за 0,5 с
    const v = easeOut(t / .46);
    const line = easeOut((t - .18) / .5);
    return <span style={{display: 'block', opacity: v}}>{text}
      <span style={{display: 'block', height: Math.max(4, size * .045), width: `${line * 50}%`, background: colors.accent, marginTop: '.16em', borderRadius: 3}} />
    </span>;
  }
  if (kind === 'highlight') {
    // Текст проявляется, затем под последним словом раскрывается плашка: с 0,16 с за 0,56 с
    const v = easeOut(t / .46);
    const plate = easeOut((t - .16) / .56);
    return <span style={{display: 'block', opacity: v}}>{words.map(({word}, i) => i < words.length - 1
      ? <React.Fragment key={i}>{word} </React.Fragment>
      : <span key={i} style={{position: 'relative', display: 'inline-block'}}>{word}
        <span aria-hidden style={{position: 'absolute', inset: '-.02em -.12em', padding: '.02em .12em', background: colors.accent, color: colors.onAccent,
          clipPath: `inset(0 ${(1 - plate) * 100}% 0 0)`}}>{word}</span>
      </span>)}</span>;
  }
  if (kind === 'label') {
    // Плашка раскрывается за 0,56 с, текст проявляется с 0,14 с — табличка, как у характеристик
    const v = easeOut(t / .56);
    const tv = easeOut((t - .14) / .42);
    return <span style={{position: 'relative', display: 'inline-block', padding: '.12em .3em .16em', margin: '0 -.3em'}}>
      <span aria-hidden style={{position: 'absolute', inset: 0, background: colors.panel, borderRadius: '.12em', clipPath: `inset(0 ${(1 - v) * 100}% 0 0)`}} />
      <span style={{position: 'relative', opacity: tv, display: 'inline-block', transform: `translateX(${(1 - tv) * .12}em)`}}>{text}</span>
    </span>;
  }
  if (kind === 'letters') {
    // Буквы +0,32 em → 0 с шагом 0,028 с, каждая 0,42 с. Слово держится целиком — переносим по словам
    let n = 0;
    return <>{words.map(({word}, i) => <React.Fragment key={i}><span style={{display: 'inline-block', whiteSpace: 'nowrap'}}>
      {Array.from(word).map((ch, j) => {
        const v = easeOut((t - (n++) * .028) / .42);
        return <span key={j} style={{display: 'inline-block', opacity: v, transform: `translateY(${(1 - v) * .32}em)`}}>{ch}</span>;
      })}</span>{i < words.length - 1 ? ' ' : ''}</React.Fragment>)}</>;
  }
  if (kind === 'crossfade') {
    // Модель выходит из-под строки, на 1,25 с уступает второй надписи: ±0,3 em и растворение
    // за 0,6 с (smoothstep). Обе в одной ячейке сетки — высота блока не прыгает при смене
    const v = smooth((t - 1.25) / .6);
    return <span style={{display: 'grid'}}>
      <span style={{gridArea: '1 / 1', opacity: 1 - v, transform: `translateY(${-v * .3}em)`}}>{lineLift(text, t, size, width)}</span>
      <span style={{gridArea: '1 / 1', opacity: v, transform: `translateY(${(1 - v) * .3}em)`}}>{swap}</span>
    </span>;
  }
  if (kind === 'weight') {
    // Толщина 400 → рабочая за 0,7 с. Конечная — та же, что у заголовка, поэтому перенос
    // в последнем кадре совпадает с неподвижным слайдом. Шрифт без плавной толщины
    // переключится ступенькой — она прячется в проявлении
    const v = easeOut(t / .7);
    return <span style={{display: 'block', opacity: v, fontWeight: Math.round(400 + (weight - 400) * v)}}>{text}</span>;
  }
  if (kind === 'word_steps') {
    // Каждое слово +0,32 em → 0 и проявление: 0,42 с, шаг 0,095 с
    return <>{words.map(({word}, i) => {
      const v = easeOut((t - i * .095) / .42);
      return <React.Fragment key={i}><span style={{display: 'inline-block', opacity: v, transform: `translateY(${(1 - v) * .32}em)`}}>{word}</span>{i < words.length - 1 ? ' ' : ''}</React.Fragment>;
    })}</>;
  }
  return <>{lineLift(text, t, size, width)}</>;
};

// Въезд цены: сумма целиком поднимается из маски за 0,56 с — сразу правильная, без счётчика
export const priceMotion = (t: number) => {
  const v = easeOut(t / .56);
  return {
    mask: {overflow: 'hidden', padding: '.08em 0', margin: '-.08em 0'} as React.CSSProperties,
    figure: {display: 'inline-block', transform: `translateY(${(1 - v) * 110}%)`} as React.CSSProperties,
    // Пояснение — следом, с 0,38 с за 0,3 с
    label: {opacity: easeOut((t - .38) / .3)} as React.CSSProperties,
  };
};
