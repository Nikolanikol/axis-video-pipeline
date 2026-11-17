// Витрина KOK — статический сайт на axis-beauty.com (docs/projects/site/plan.md).
//
// Русский — без приставки в адресе, английский и албанский — /en/ и /sq/. Автоперехода по языку
// браузера нет намеренно: поисковик должен видеть каждую версию по своему адресу, а человек —
// то, по чему он пришёл. Sitemap и robots — свои страницы в src/pages: пакет @astrojs/sitemap
// тянет sitemap@10, которому нужен Node новее, чем на Mac владельца, а страниц у нас немного.
import {defineConfig} from 'astro/config';

export default defineConfig({
  site: 'https://axis-beauty.com',
  trailingSlash: 'always',
  // Панель разработчика Astro внизу экрана мешает смотреть вёрстку владельцу
  devToolbar: {enabled: false},
  build: {format: 'directory'},
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru', 'en', 'sq'],
    routing: {prefixDefaultLocale: false, redirectToDefaultLocale: false},
  },
  // Словари и вопросы берём из приложения (app/i18n, config/seo.json) — один источник текстов
  vite: {server: {fs: {allow: ['..']}}},
});
