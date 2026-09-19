// Цветокоррекция съёмки. Общий модуль: ролик, интерфейс, сервер и тесты считают одно и то же.
// Накладывается только на видео — логотип, плашки и карточка цены остаются фирменных цветов.

/** @typedef {{exposure: number, contrast: number, saturation: number, warmth: number}} Colour */

/** Нейтраль: ничего не меняем */
export const NEUTRAL = {exposure: 0, contrast: 0, saturation: 0, warmth: 0};
export const COLOUR_KEYS = /** @type {const} */ (['exposure', 'contrast', 'saturation', 'warmth']);
export const COLOUR_RANGE = 100;

// Шаг ползунка в множитель. Границы подобраны так, чтобы край шкалы был заметным, но не ломал картинку.
const STEP = {
  exposure: 0.004,    // ±100 → яркость 0,6…1,4
  contrast: 0.005,    // ±100 → контраст 0,5…1,5
  saturation: 0.01,   // −100 → чёрно-белое, +100 → вдвое насыщеннее
  warmth: 0.0025,     // ±100 → красный и синий расходятся на четверть
};

const clampValue = (v) => Math.min(COLOUR_RANGE, Math.max(-COLOUR_RANGE, Math.round(Number(v) || 0)));

/** Приводит настройки из формы к допустимым: только известные поля, целые в пределах шкалы */
export const sanitizeColour = (raw) => {
  const out = {...NEUTRAL};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of COLOUR_KEYS) out[k] = clampValue(raw[k]);
  return out;
};

/** @param {Colour} [colour] @returns {boolean} — что-то настроено, или всё по нулям */
export const isNeutral = (colour) => COLOUR_KEYS.every((k) => !clampValue(colour?.[k]));

/** Настройки фрагмента поверх настроек ролика (фрагмент задаёт только то, что отличается) */
export const mergeColour = (review, segment) => sanitizeColour({...sanitizeColour(review), ...(segment ?? {})});

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Множители красного и синего для теплоты. Тёплое — больше красного, меньше синего.
 * @param {Colour} [colour]
 */
export const warmthChannels = (colour) => {
  const w = clampValue(colour?.warmth) * STEP.warmth;
  return {r: round(1 + w), b: round(1 - w)};
};

/**
 * CSS-фильтр для съёмки. Теплота делается матрицей каналов (SVG-фильтр по ссылке filterId),
 * остальное — обычными функциями CSS.
 * @param {Colour} [colour]
 * @param {string} [filterId] — id SVG-фильтра теплоты; без него теплота не применяется
 * @returns {string | undefined} — undefined, если менять нечего
 */
export const colourFilter = (colour, filterId) => {
  const c = sanitizeColour(colour);
  const parts = [];
  if (c.exposure) parts.push(`brightness(${round(1 + c.exposure * STEP.exposure)})`);
  if (c.contrast) parts.push(`contrast(${round(1 + c.contrast * STEP.contrast)})`);
  if (c.saturation) parts.push(`saturate(${round(1 + c.saturation * STEP.saturation)})`);
  if (c.warmth && filterId) parts.push(`url(#${filterId})`);
  return parts.length ? parts.join(' ') : undefined;
};
