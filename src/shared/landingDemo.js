// Демо-компания витрины KOK (axis-beauty.com, site/) и образцов для неё (tools/landing-samples.mjs).
//
// Владелец 01.10: на публичной витрине — нейтральный демо-бренд, а не работы настоящего
// клиента. «Ваша компания» без логотипа (название текстом) — так образец заодно говорит
// гостю: «здесь будет ваше имя». Контакты — заведомо ненастоящие, чтобы ни с кем не совпасть.
// Цена — в Корее и в долларах: её понимает любой покупатель, без расчёта доставки до порта.

export const DEMO_COMPANY = 'Ваша компания';

// Витрина идёт за переключателем языка (15.11): живое превью гостя — на его языке, и название
// демо-компании тоже. Образцы (tools/landing-samples.mjs) собираются по-русски, как раньше
const DEMO_NAMES = {ru: DEMO_COMPANY, en: 'Your company', sq: 'Kompania juaj'};
export const demoCompany = (lang = 'ru') => DEMO_NAMES[lang] ?? DEMO_COMPANY;

/** Профиль демо-компании — в том же виде, что профиль клиента (src/shared/profile.js) */
export const demoProfile = (lang = 'ru') => ({
  company: demoCompany(lang),
  language: lang,
  contacts: {whatsapp: '+82 10 1234 5678', site: 'your-site.com'},
  pricing: {mode: 'domestic', currency: 'USD'},
  texts: {},
});
export const DEMO_PROFILE = demoProfile('ru');

// Строки демо-объявления (public/landing/demo/lot.json) записаны по-русски — на других языках
// подменяем их целиком: объявление одно, переводить его словарём не стоит
export const DEMO_LOT_TEXTS = {
  en: {specs: ['35,626 km', '1.6 L · petrol + electric', 'Automatic · white'], hookTagline: 'One owner'},
  sq: {specs: ['35 626 km', '1,6 L · benzinë + elektrik', 'Automatik · e bardhë'], hookTagline: 'Një pronar'},
};

/**
 * Тема демо-компании: оформление бренда + цвета палитры. Логотипы — пустые строки: так
 * Logo (src/shared/ui.tsx) рисует название текстом. Отсутствующий ключ значил бы
 * «встроенный файл» — и на витрине стоял бы логотип AXIS
 * @param {object} brand — базовое оформление (config/brand.json)
 * @param {object} colors — восемь цветов палитры (config/palettes.json)
 */
export const demoTheme = (brand, colors, lang = 'ru') => ({
  ...brand,
  ...colors,
  name: demoCompany(lang),
  assets: {...brand.assets, logoStacked: '', logoHorizontal: '', sign: ''},
});
