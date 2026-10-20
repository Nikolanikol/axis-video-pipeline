// Стиль ролика = бренд компании, поверх — снимок оформления объявления (lot.look).
// Решение владельца 20.10: правка на экране ролика меняет только этот ролик, бренд и остальные — нет.
//
// Снимок целиком, а не разница с брендом: иначе новая палитра бренда смешалась бы со своими
// цветами ролика в сочетание, которое никто не выбирал и контраст которого не проверен.
// Движение и подача данных — в том же снимке: у объявления одна логика и одна кнопка
// «Как в бренде» (снять снимок), а не отдельные поля движения рядом с оформлением.
//
// Накладывается в одном месте — designed() в src/formats/index.ts, поэтому превью и серверный
// рендер видят одно и то же. Сервер проверяет снимок в checkLotLook (server/app.mjs).
import {PALETTE_KEYS} from '../../shared/contrast.js';
import {isDesign} from '../../shared/design.js';
import {resolveStyle, STYLE_CHOICES} from './registry.js';

/**
 * Снимок оформления темы для объявления. design: null — «Исходный» (прежние форматы), а не
 * «как в бренде». Поля стиля пишутся действующими значениями (с умолчаниями компоновки):
 * снимок не должен менять вид, если потом поменяются умолчания
 */
export const pickLook = (theme) => ({
  design: theme.design ?? null,
  designVariant: theme.designVariant ?? 0,
  ...Object.fromEntries(PALETTE_KEYS.map((k) => [k, theme[k]])),
  fonts: theme.fonts,
  style: theme.style,
  ...resolveStyle(theme, theme.design),
  // Подложка логотипа (src/shared/logoPlate.js) — владелец 20.10: управлять ею и в «Оформлении»
  // ролика. Нет своей у бренда — в снимок не пишем, ролик следует умолчанию
  ...(theme.logoPlate ? {logoPlate: theme.logoPlate} : {}),
});

/** Тема ролика: бренд, поверх — снимок объявления. Нет снимка — бренд как есть */
export const applyLook = (theme, look) => {
  if (!look || typeof look !== 'object') return theme;
  const {design, designVariant, ...rest} = look;
  const next = {...theme, ...rest};
  if (isDesign(design)) return {...next, design, designVariant: designVariant === 1 ? 1 : 0};
  delete next.design;
  delete next.designVariant;
  return next;
};

/** Поля снимка, которые относятся к стилю (движение и подача) — для проверки и интерфейса */
export const STYLE_FIELDS = Object.keys(STYLE_CHOICES);
