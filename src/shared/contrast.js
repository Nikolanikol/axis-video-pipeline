// Контраст цветов бренда: что должно читаться на слайде и насколько.
//
// Проверяет палитры реестра (config/palettes.json — палитра, не прошедшая проверку, в список
// не попадает, см. tests/unit/palettes.test.ts) и свои цвета в «Тонкой настройке», где
// клиент видит предупреждение сразу, а не на готовом ролике. Формула и пороги — WCAG 2.1:
// 4,5:1 для обычного текста, 3:1 для крупного (от 24 px жирным), 7:1 — повышенный уровень.

/** Восемь цветов темы. Из них собрана вся вёрстка: заменить можно только все согласованно */
export const PALETTE_KEYS = /** @type {const} */ (['bg', 'panel', 'line', 'grey', 'white', 'copper', 'copperLight', 'copperDark']);

export const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Контраст двух цветов по WCAG, от 1 до 21 */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Что проверяем — пары, которые реально встречаются в вёрстке:
 *   основной текст — заголовки и характеристики на фоне и на плашках (7:1: их читают
 *     на бегу, на телефоне, поверх затемнённого фото);
 *   второстепенный — пробег, подписи, «цена до порта» (4,5:1);
 *   акцент — цена, марка, выделения на фоне (4,5:1);
 *   номер WhatsApp рисуется цветом фона поверх акцентной плашки — обратная пара (4,5:1),
 *     и на тёмном краю её перелива (3:1: номер крупный и жирный).
 */
export const CONTRAST_CHECKS = [
  {fg: 'white', bg: 'bg', min: 7, what: 'основной текст на фоне'},
  {fg: 'white', bg: 'panel', min: 7, what: 'основной текст на плашках'},
  {fg: 'grey', bg: 'bg', min: 4.5, what: 'второстепенный текст на фоне'},
  {fg: 'grey', bg: 'panel', min: 4.5, what: 'второстепенный текст на плашках'},
  {fg: 'copper', bg: 'bg', min: 4.5, what: 'акцент на фоне'},
  {fg: 'bg', bg: 'copper', min: 4.5, what: 'номер WhatsApp на акцентной плашке'},
  {fg: 'bg', bg: 'copperDark', min: 3, what: 'номер на тёмном краю акцентной плашки'},
];

/**
 * Проблемы с читаемостью: [{what, ratio, min}]. Пусто — всё читается.
 * Цвет, который ещё не допечатан в поле (#12), считается проблемой — проверять нечего.
 */
export const contrastIssues = (colors) => CONTRAST_CHECKS.flatMap((c) => {
  const fg = colors?.[c.fg];
  const bg = colors?.[c.bg];
  if (!isHex(fg) || !isHex(bg)) return [{what: c.what, ratio: 0, min: c.min}];
  const ratio = contrast(fg, bg);
  return ratio < c.min ? [{what: c.what, ratio, min: c.min}] : [];
});

/** Палитра, с которой совпадают цвета темы, — по всем восьми, без учёта регистра */
export const matchPalette = (theme, palettes) => palettes.find((p) =>
  PALETTE_KEYS.every((k) => String(theme?.[k] ?? '').toUpperCase() === String(p.colors[k]).toUpperCase()));
