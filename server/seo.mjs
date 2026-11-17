// Поисковики и аналитика (19.10): robots.txt, sitemap.xml, заголовки страниц, разметка для Google.
//
// С 17.11 витрина KOK и всё, что продвигаем в поиске, — на axis-beauty.com (site/, docs/projects/site/).
// Главная приложения гостю — экран входа (app/GuestEntry.tsx), в поиск её не пускаем: две одинаковые
// главные отбирали бы друг у друга место. Индексируются только оферта и политика — пока они живут здесь.
// Готовую витрину для роботов (prerender, Landing.tsx) сервер больше не кладёт: экран входа роботу не
// нужен, а показывать в HTML не то, что людям, поисковики наказывают.
//
// Индексируется только боевой адрес (legal.site в config/platform.json). Превью PR, копии на Mac и
// любые чужие адреса, которые смотрят на этот сервер, получают «Disallow: /» и noindex — иначе
// в поиск попали бы копии прода с тестовой меткой. Счётчики и коды подтверждения — тоже только там:
// превью — копия прода, и его визиты испортили бы статистику, а подтверждение владения — чужим адресом.
//
// Что здесь собирается и где тексты:
// - robots.txt, sitemap.xml — маршруты в server/app.mjs, до статики;
// - страница (renderPage) — в бою и на Mac одинаково (server/index.mjs): заголовки, Open Graph,
//   коды Search Console и Вебмастера, тег Google в режиме согласия;
// - тексты, ключевые слова, вопросы витрины, коды и номера счётчиков — config/seo.json;
// - картинка превью — tools/og-image.mjs, значки — tools/kok-assets.mjs.
// Подробно и с причинами — CONTEXT.md, «Поисковики и счётчики».
import path from 'node:path';
import {CONFIG_DIR, readJson} from './store.mjs';
import {previewId} from './db/index.mjs';

const seoConfig = () => readJson(path.join(CONFIG_DIR, 'seo.json'));
const siteUrl = async () => {
  const {legal = {}} = await readJson(path.join(CONFIG_DIR, 'platform.json'));
  return (legal.site?.trim() || 'https://app.axis-beauty.com').replace(/\/+$/, '');
};

// Страницы, которые пускаем в поиск. Оферта и политика — на настоящих адресах (/offer, /privacy):
// адрес с «#» для поисковика — та же главная, отдельной страницей он его не увидит. Главной «/» здесь
// нет с 17.11: она — экран входа, витрина — на axis-beauty.com
export const INDEXED = ['/offer', '/privacy'];
// /offer/refunds — та же оферта с прокруткой к разделу: каноническим адресом у неё остаётся /offer.
// null — адрес вне списка (в том числе главная): noindex
const pageOf = (p) => INDEXED.find((x) => p === x || p.startsWith(`${x}/`)) ?? null;

/** Свой ли это боевой адрес: только его пускаем в поиск и только на нём включаем счётчики */
export const isPrimary = async (req) => !previewId() && req.hostname === new URL(await siteUrl()).hostname;

export const robotsTxt = async (req) => {
  if (!(await isPrimary(req))) return 'User-agent: *\nDisallow: /\n';
  const site = await siteUrl();
  // Кабинет живёт на «/» за «#»; главная закрыта от индексации своим noindex (renderPage), но не
  // запрещена здесь — иначе робот не прочитал бы этот noindex. Закрываем служебное: API, файлы
  // компаний, миниатюры, возврат из кассы.
  // Allow — два гостевых адреса API, без которых витрина не собирается: «кто вошёл» и условия витрины.
  // Без них (21.10, проверка URL в Search Console) рендер Google обрывал запрос входа (499), экран
  // входа показывал «Сервер ответил ошибкой» вместо витрины — и это видел поиск. Более точное правило
  // важнее общего Disallow: так читают robots.txt и Google, и Яндекс
  return ['User-agent: *', 'Allow: /api/auth/me', 'Allow: /api/public/', 'Disallow: /api/', 'Disallow: /data/', 'Disallow: /thumbs/',
    'Disallow: /pay-return/', '',
    `Sitemap: ${site}/sitemap.xml`, ''].join('\n');
};

// lastmod не пишем: точной даты правки страницы у нас нет, а неверную Google учится игнорировать
export const sitemapXml = async () => {
  const site = await siteUrl();
  const urls = INDEXED.map((p) => `  <url><loc>${site}${p}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

// Версия картинки превью в адресе: Telegram и WhatsApp кэшируют превью по адресу картинки неделями.
// Пересобрал public/kok/og.png (tools/og-image.mjs) — подними число
const OG_IMAGE = '/kok/og.png?v=2';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON внутри <script>: «</script>» в тексте закрыл бы тег раньше времени
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
/**
 * Тег Google в самой странице — в режиме согласия Consent Mode v2 (19.10). Раньше gtag.js грузился
 * только после «Принять», и проверка установки в GA4 не находила тег в HTML: «добавьте тег на сайт».
 * Теперь тег стоит у всех, но по умолчанию всё «denied»: без cookie и без идентификатора посетителя,
 * Google получает лишь обезличенные сигналы и по ним достраивает статистику. «Принять» на плашке
 * (app/analytics.tsx) открывает только analytics_storage; рекламные хранилища закрыты всегда —
 * рекламы у нас нет. Порядок важен: consent default — до config, иначе первый просмотр уйдёт с cookie.
 * Согласие, данное раньше, читаем из того же ключа localStorage до config — вернувшийся посетитель
 * не теряет первый просмотр
 */
const googleTag = (id) => [
  `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
  + `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});`
  + `try{if(localStorage.getItem('kok:analytics-consent')==='yes')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}`
  + `gtag('js',new Date());gtag('config',${jsonScript(id)});</script>`,
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}"></script>`,
];

/**
 * Страница приложения для запроса: подставляет заголовок и описание адреса, canonical, полные адреса
 * Open Graph, коды подтверждения Search Console и Вебмастера, номера счётчиков.
 * html — index.html после сборки (или после transformIndexHtml в разработке)
 */
export const renderPage = async (html, req) => {
  const site = await siteUrl();
  const primary = await isPrimary(req);
  const {pages, keywords, counters = {}} = await seoConfig();
  const page = pageOf(req.path);
  // Главная приложения — экран входа: свой заголовок («app»), рекламный «/» — у витрины (site/).
  // Без «app» в файле — прежний «/»
  const meta = page ? pages[page] : pages.app ?? pages['/'];
  // Окружение Coolify перекрывает config/seo.json — так код или номер меняют без выкладки. Коды не секрет:
  // их видно в коде страницы любому, поэтому основное место — файл в репозитории
  const pick = (name, field) => process.env[name]?.trim() || counters[field]?.trim() || '';
  const env = {GOOGLE_SITE_VERIFICATION: pick('GOOGLE_SITE_VERIFICATION', 'googleVerification'),
    YANDEX_VERIFICATION: pick('YANDEX_VERIFICATION', 'yandexVerification'),
    GA_MEASUREMENT_ID: pick('GA_MEASUREMENT_ID', 'gaMeasurementId'), YANDEX_METRIKA_ID: pick('YANDEX_METRIKA_ID', 'yandexMetrikaId')};
  const head = [
    `<link rel="canonical" href="${site}${page ?? '/'}" />`,
    `<meta name="keywords" content="${esc(keywords)}" />`,
    `<meta property="og:url" content="${site}${page ?? '/'}" />`,
    `<meta property="og:image" content="${site}${OG_IMAGE}" />`,
    `<meta name="twitter:image" content="${site}${OG_IMAGE}" />`,
    // Неиндексируемые адреса: превью, копии, кабинетные пути вне списка — подстраховка к robots.txt
    ...(!primary || !page ? ['<meta name="robots" content="noindex, nofollow" />'] : []),
    // Коды подтверждения владения — config/seo.json или окружение Coolify
    ...(primary && env.GOOGLE_SITE_VERIFICATION ? [`<meta name="google-site-verification" content="${esc(env.GOOGLE_SITE_VERIFICATION)}" />`] : []),
    ...(primary && env.YANDEX_VERIFICATION ? [`<meta name="yandex-verification" content="${esc(env.YANDEX_VERIFICATION)}" />`] : []),
    // Номера счётчиков интерфейсу (app/analytics.tsx): по ним он решает, показывать ли плашку согласия,
    // и инициализирует Метрику после «Принять». Тег Google — следующей строкой, у всех, в режиме «denied»
    ...(primary && (env.GA_MEASUREMENT_ID || env.YANDEX_METRIKA_ID) ? [`<script>window.__KOK_ANALYTICS=${jsonScript({
      ga: env.GA_MEASUREMENT_ID, ym: env.YANDEX_METRIKA_ID})}</script>`] : []),
    ...(primary && env.GA_MEASUREMENT_ID ? googleTag(env.GA_MEASUREMENT_ID) : []),
  ].map((l) => `    ${l}`).join('\n');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(meta.description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(meta.title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(meta.description)}`)
    // Относительная картинка превью ссылок — мессенджеры её не находят; полная ставится выше
    .replace(/\s*<meta property="og:image" content="\/[^"]*" \/>/, '')
    .replace('<!--seo-->', head.trimStart());
};
