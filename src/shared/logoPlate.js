// Подложка под логотип: когда она нужна, какого тона и формы.
//
// Зачем (владелец 20.10): белый логотип клиента на светлом пресете и чёрный на тёмном фоне
// «ни хера не видно». Основа — генератор подложек из Codex (logo-backplates): методика тона по
// непрозрачным точкам, контраст по WCAG, геометрия форм. Отличия от него — решения KOK:
//   • решает пара «логотип ↔ фон места», а не один логотип: белому знаку на тёмном фоне
//     подложка не нужна, и логотип AXIS на своём фоне остаётся как был;
//   • цвета подложки — из палитры ролика (самый тёмный и самый светлый из её цветов), акцент —
//     медь пресета; углы — по множителю скругления бренда;
//   • смешанный логотип (медный знак + чёрная надпись) не отдаётся на выбор человеку: берём
//     тёмный и светлый край его яркости (10-й и 90-й процентили) и подложку, при которой хуже
//     всего читаемая часть читается лучше;
//   • форм шесть, а не 18: «стекло» размывает конкретное фото (в ролике фон движется),
//     «вуаль» у нас уже есть — затемнение над верхним логотипом.
// Порог 3:1 — WCAG для нетекстовых элементов (логотип не текст). Хорошие практики брендбуков:
// плашка в цветах бренда на пёстром фоне, защитное поле от четверти до половины высоты знака,
// сам знак не перекрашивается — светлый или тёмный вариант, а не инверсия.
import {PALETTE_KEYS, luminance} from './contrast.js';

/** Логотипу нужен контраст с фоном хотя бы 3:1 (WCAG 1.4.11, нетекстовые элементы) */
export const PLATE_MIN_CONTRAST = 3;

/** Формы подложки — подписи для «Бренда» */
export const PLATE_SHAPES = /** @type {const} */ ([
  {id: 'soft', title: 'Мягкая'},
  {id: 'capsule', title: 'Капсула'},
  {id: 'chamfer', title: 'Срезанные углы'},
  {id: 'slant', title: 'Косая'},
  {id: 'keyline', title: 'С кантом'},
  {id: 'halo', title: 'По контуру'},
]);
/** Когда ставить: «Авто» — только если логотип плохо виден на фоне; «Всегда»; «Нет» */
export const PLATE_MODES = /** @type {const} */ ([
  {id: 'auto', title: 'Авто'},
  {id: 'always', title: 'Всегда'},
  {id: 'off', title: 'Нет'},
]);
export const DEFAULT_PLATE = {mode: 'auto', shape: 'soft'};

/** Настройка подложки бренда — неизвестное заменяется умолчанием */
export const plateSetting = (theme) => {
  const v = theme?.logoPlate ?? {};
  return {
    mode: PLATE_MODES.some((m) => m.id === v.mode) ? v.mode : DEFAULT_PLATE.mode,
    shape: PLATE_SHAPES.some((s) => s.id === v.shape) ? v.shape : DEFAULT_PLATE.shape,
  };
};

/** Ошибка настройки подложки для сервера или null */
export const plateError = (v) => {
  if (v === undefined) return null;
  if (!v || typeof v !== 'object') return 'Подложка логотипа — из списка';
  if (!PLATE_MODES.some((m) => m.id === v.mode)) return 'Подложка логотипа: «Авто», «Всегда» или «Нет»';
  if (!PLATE_SHAPES.some((s) => s.id === v.shape)) return 'Форма подложки логотипа — из списка';
  return null;
};

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * Яркость логотипа по его точкам (RGBA): тёмный и светлый край (10-й и 90-й процентили
 * относительной яркости непрозрачных точек) и пропорция видимой части. Прозрачные поля не
 * считаются. null — видимых точек нет
 * @param {Uint8Array|Buffer} data RGBA
 * @returns {{lo: number, hi: number, ratio: number} | null}
 */
export const analyzeInk = (data, width, height) => {
  const lums = [];
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] <= 5) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // Полупрозрачный край (сглаживание) смешан с фоном — для тона не годится
      if (data[i + 3] < 200) continue;
      lums.push(0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2]));
    }
  }
  if (!lums.length || maxX < 0) return null;
  lums.sort((a, b) => a - b);
  const at = (q) => lums[Math.min(lums.length - 1, Math.floor(q * lums.length))];
  const r = (n) => Math.round(n * 1000) / 1000;
  return {lo: r(at(0.1)), hi: r(at(0.9)), ratio: r((maxX - minX + 1) / (maxY - minY + 1))};
};

const contrastL = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** Как читается хуже всего видная часть логотипа на цвете hex */
export const inkContrast = (ink, hex) => {
  const l = luminance(hex);
  return Math.min(contrastL(ink.lo, l), contrastL(ink.hi, l));
};

/**
 * Цвета подложки из палитры ролика: тёмная — самый тёмный из восьми цветов, светлая — самый
 * светлый. Если палитра не даёт настоящего тёмного (или светлого) — нейтральный запасной
 */
export const plateColors = (theme) => {
  const colors = PALETTE_KEYS.map((k) => theme?.[k]).filter((v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
  const sorted = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0], lightest = sorted[sorted.length - 1];
  return {
    dark: darkest && luminance(darkest) < 0.04 ? darkest : '#141518',
    light: lightest && luminance(lightest) > 0.7 ? lightest : '#F4F1EC',
    accent: theme?.copper ?? '#B8734A',
  };
};

/**
 * Нужна ли подложка логотипу на фоне on и какая. null — не нужна (или неизвестен тон логотипа:
 * чужой адрес, файл не разобран — тогда ничего не меняем).
 * @returns {{fill: string, tone: 'dark'|'light', accent: string, shape: string} | null}
 */
export const platePlan = (theme, ink, on) => {
  const {mode, shape} = plateSetting(theme);
  if (mode === 'off' || !ink) return null;
  if (mode === 'auto' && on && inkContrast(ink, on) >= PLATE_MIN_CONTRAST) return null;
  const c = plateColors(theme);
  const tone = inkContrast(ink, c.dark) >= inkContrast(ink, c.light) ? 'dark' : 'light';
  return {fill: apart(c[tone], on, tone), tone, accent: c.accent, shape};
};

/**
 * Подложка не должна сливаться с фоном под ней: при «Всегда» белому логотипу на тёмном фоне
 * самый тёмный цвет палитры — это сам фон, и плашки не видно. Тогда тёмную чуть поднимаем,
 * светлую чуть притемняем — до заметного отличия от фона (1,25:1), тон остаётся тем же
 */
const apart = (fill, on, tone) => {
  if (!on || !/^#[0-9a-f]{6}$/i.test(on) || contrastL(luminance(fill), luminance(on)) >= 1.25) return fill;
  const step = tone === 'dark' ? ['#1D1E22', '#26282D', '#303238'] : ['#FFFFFF', '#ECE8E1', '#DDD8CF'];
  return step.find((x) => contrastL(luminance(x), luminance(on)) >= 1.25) ?? step[step.length - 1];
};
