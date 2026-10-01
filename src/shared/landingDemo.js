// Демо-компания витрины KOK (app/Landing.tsx) и образцов для неё (tools/landing-samples.mjs).
//
// Владелец 01.10: на публичной витрине — нейтральный демо-бренд, а не работы настоящего
// клиента. «Ваша компания» без логотипа (название текстом) — так образец заодно говорит
// гостю: «здесь будет ваше имя». Контакты — заведомо ненастоящие, чтобы ни с кем не совпасть.
// Цена — в Корее и в долларах: её понимает любой покупатель, без расчёта доставки до порта.

export const DEMO_COMPANY = 'Ваша компания';

/** Профиль демо-компании — в том же виде, что профиль клиента (src/shared/profile.js) */
export const DEMO_PROFILE = {
  company: DEMO_COMPANY,
  language: 'ru',
  contacts: {whatsapp: '+82 10 1234 5678', site: 'your-site.com'},
  pricing: {mode: 'domestic', currency: 'USD'},
  texts: {},
};

/**
 * Тема демо-компании: оформление бренда + цвета палитры. Логотипы — пустые строки: так
 * Logo (src/shared/ui.tsx) рисует название текстом. Отсутствующий ключ значил бы
 * «встроенный файл» — и на витрине стоял бы логотип AXIS
 * @param {object} brand — базовое оформление (config/brand.json)
 * @param {object} colors — восемь цветов палитры (config/palettes.json)
 */
export const demoTheme = (brand, colors) => ({
  ...brand,
  ...colors,
  name: DEMO_COMPANY,
  assets: {...brand.assets, logoStacked: '', logoHorizontal: '', sign: ''},
});
