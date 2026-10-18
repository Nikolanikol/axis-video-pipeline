// Оформление одного объявления поверх бренда компании: пресет, компоновка, цвета, шрифты, углы.
// Решение владельца 20.10: правка на экране ролика меняет только этот ролик, бренд и остальные — нет.
// Храним снимок целиком, а не разницу с брендом: иначе смена палитры в бренде смешалась бы
// со своими цветами ролика в сочетание, которое никто не выбирал и контраст которого не проверен.
import {PALETTE_KEYS} from './contrast.js';
import {isDesign} from './design.js';

/** Снимок оформления темы. design: null — «Исходный» (прежние форматы), а не «как в бренде» */
export const pickLook = (theme) => ({
  design: theme.design ?? null,
  designVariant: theme.designVariant ?? 0,
  ...Object.fromEntries(PALETTE_KEYS.map((k) => [k, theme[k]])),
  fonts: theme.fonts,
  style: theme.style,
});

/** Тема ролика: бренд, поверх — оформление объявления. Нет снимка — бренд как есть */
export const applyLook = (theme, look) => {
  if (!look || typeof look !== 'object') return theme;
  const {design, designVariant, ...rest} = look;
  const next = {...theme, ...rest};
  if (isDesign(design)) return {...next, design, designVariant: designVariant === 1 ? 1 : 0};
  delete next.design;
  delete next.designVariant;
  return next;
};
