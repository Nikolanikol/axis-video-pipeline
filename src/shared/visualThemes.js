// Общие исходные цвета семейств. Композиция и шрифты пока принадлежат карусели;
// подключение темы к ролику не должно менять их автоматически.
import {contrast} from './contrast.js';

/** @typedef {{bg: string, text: string, accent: string, light: string}} VisualColors */
/** @typedef {{id: string, title: string, colors: VisualColors}} VisualTheme */

/** @type {VisualTheme[]} */
export const VISUAL_THEMES = [
  {id: 'type_drive', title: 'Type Drive', colors: {bg: '#191B1C', text: '#F3EEE3', accent: '#7B243D', light: '#F3EEE3'}},
  {id: 'cobalt_shift', title: 'Cobalt Shift', colors: {bg: '#111925', text: '#EDF2F4', accent: '#2455DE', light: '#F4F7FB'}},
  {id: 'pulse_grid', title: 'Pulse Grid', colors: {bg: '#F6F2E8', text: '#111315', accent: '#81243C', light: '#F6F2E8'}},
  {id: 'wide_form', title: 'Wide Form', colors: {bg: '#1A1D1C', text: '#F5EDDF', accent: '#DD8852', light: '#F5EDDF'}},
  {id: 'urban_olive', title: 'Urban Olive', colors: {bg: '#1B2822', text: '#EEEBDD', accent: '#C3CE78', light: '#EEEBDD'}},
  {id: 'contour_plum', title: 'Contour Plum', colors: {bg: '#342434', text: '#F2EDF0', accent: '#B6A4C8', light: '#F2EDF0'}},
];

/** @returns {VisualTheme} */
export const visualTheme = (id) => {
  const theme = VISUAL_THEMES.find((item) => item.id === id);
  if (!theme) throw new Error(`Неизвестная цветовая тема: ${id}`);
  return theme;
};

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const mix = (from, to, part) => {
  const a = rgb(from), b = rgb(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * part).toString(16).padStart(2, '0')).join('').toUpperCase();
};
// Подбираем только цвет надписи; исходная заливка акцента не меняется.
const readableInk = (ink, background, fallback, minimum = 4.5) => {
  if (contrast(ink, background) >= minimum) return ink;
  for (let step = 1; step <= 100; step++) {
    const candidate = mix(ink, fallback, step / 100);
    if (contrast(candidate, background) >= minimum) return candidate;
  }
  return fallback;
};

/**
 * Роли для видео: акцентная заливка и цвет акцентного текста
 * разделены. Старое поле copper совмещает их, поэтому слепое копирование восьми цветов
 * не сохраняет одновременно исходный синий Cobalt и читаемость текста на тёмном фоне.
 * Общие роли используются стендом и снимком оформления ролика.
 */
export const visualThemeTokens = (id) => {
  const {bg, text, accent} = visualTheme(id).colors;
  const onAccent = contrast(bg, accent) >= contrast(text, accent) ? bg : text;
  const surface = mix(bg, text, .045);
  return {
    background: bg, surface, foreground: text,
    muted: readableInk(mix(text, bg, .32), surface, text),
    border: mix(bg, text, .2), accent, onAccent,
    accentInk: readableInk(accent, surface, text),
  };
};

export const ACCENT_ROLE_KEYS = ['accentInk', 'onAccent'];
/** Старый пресет/ручная палитра возвращает прежнюю связь текста и заливки. */
export const withoutAccentRoles = (theme) => {
  const {accentInk, onAccent, ...rest} = theme;
  return rest;
};
/** Цвета сохраняются снимком; шрифты, компоновка и анимации не меняются. */
export const applyVisualTheme = (theme, id) => {
  const t = visualThemeTokens(id);
  return {...theme, bg: t.background, panel: t.surface, line: t.border, grey: t.muted,
    white: t.foreground, copper: t.accent, copperLight: t.accent, copperDark: t.accent,
    accentInk: t.accentInk, onAccent: t.onAccent};
};
export const matchVisualTheme = (theme) => VISUAL_THEMES.find(({id}) => {
  const expected = applyVisualTheme({}, id);
  return ['bg', 'panel', 'line', 'grey', 'white', 'copper', 'copperLight', 'copperDark', ...ACCENT_ROLE_KEYS]
    .every((key) => String(theme[key] ?? '').toUpperCase() === expected[key]?.toUpperCase());
});
