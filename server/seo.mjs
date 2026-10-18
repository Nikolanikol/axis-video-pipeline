// Поисковики и аналитика (19.10): robots.txt, sitemap.xml, заголовки страниц, разметка для Google
// и готовый HTML витрины для роботов.
//
// Почему так. Интерфейс — одностраничное приложение: сервер отдавал пустой <div id="root">, а витрина
// появлялась только после скрипта и запроса /api/auth/me. Google такое дорисовывает с опозданием и не
// всегда, Яндекс — хуже. Поэтому гостю без cookie входа на «/» сразу кладём в страницу витрину,
// отрисованную заранее (renderLanding) — тот же компонент Landing, что видит человек, а не отдельный
// «текст для роботов»: показывать роботу не то, что людям, поисковики наказывают.
//
// Индексируется только боевой адрес (legal.site в config/platform.json). Превью PR, копии на Mac и
// любые чужие адреса, которые смотрят на этот сервер, получают «Disallow: /» и noindex — иначе
// в поиск попали бы копии прода с тестовой меткой. Счётчики и коды подтверждения — тоже только там.
import fs from 'node:fs/promises';
import path from 'node:path';
import {CONFIG_DIR, readJson} from './store.mjs';
import {previewId} from './db/index.mjs';

const seoConfig = () => readJson(path.join(CONFIG_DIR, 'seo.json'));
const siteUrl = async () => {
  const {legal = {}} = await readJson(path.join(CONFIG_DIR, 'platform.json'));
  return (legal.site?.trim() || 'https://app.axis-beauty.com').replace(/\/+$/, '');
};

// Страницы, которые пускаем в поиск. Оферта и политика — на настоящих адресах (/offer, /privacy):
// адрес с «#» для поисковика — та же главная, отдельной страницей он его не увидит
export const INDEXED = ['/', '/offer', '/privacy'];
// /offer/refunds — та же оферта с прокруткой к разделу: каноническим адресом у неё остаётся /offer
const pageOf = (p) => INDEXED.find((x) => x !== '/' && (p === x || p.startsWith(`${x}/`))) ?? (p === '/' || p === '/index.html' ? '/' : null);

/** Свой ли это боевой адрес: только его пускаем в поиск и только на нём включаем счётчики */
export const isPrimary = async (req) => !previewId() && req.hostname === new URL(await siteUrl()).hostname;

export const robotsTxt = async (req) => {
  if (!(await isPrimary(req))) return 'User-agent: *\nDisallow: /\n';
  const site = await siteUrl();
  // Кабинет живёт на «/» за «#», его не закрыть отдельно — и не нужно: без входа робот видит витрину.
  // Закрываем служебное: API, файлы компаний, миниатюры, возврат из кассы
  return ['User-agent: *', 'Disallow: /api/', 'Disallow: /data/', 'Disallow: /thumbs/', 'Disallow: /pay-return/', '',
    `Sitemap: ${site}/sitemap.xml`, ''].join('\n');
};

export const sitemapXml = async () => {
  const site = await siteUrl();
  const urls = INDEXED.map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc><changefreq>${p === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${p === '/' ? '1.0' : '0.3'}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON внутри <script>: «</script>» в тексте закрыл бы тег раньше времени
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
// Ответ витрины в разметке — без ссылок-скобок: [оферте](/offer) → «оферте»
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

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

const structuredData = async (site) => {
  const [{pages, faq}, platform, credits] = await Promise.all([
    seoConfig(), readJson(path.join(CONFIG_DIR, 'platform.json')), readJson(path.join(CONFIG_DIR, 'credits.json'))]);
  const org = {'@type': 'Organization', '@id': `${site}/#org`, name: 'KOK', alternateName: 'Контент одной кнопкой', url: `${site}/`,
    logo: `${site}/kok/icon-512.png`, ...(platform.instagram ? {sameAs: [platform.instagram]} : {})};
  return {'@context': 'https://schema.org', '@graph': [
    org,
    {'@type': 'WebSite', '@id': `${site}/#site`, url: `${site}/`, name: 'KOK', inLanguage: 'ru', publisher: {'@id': `${site}/#org`}},
    {'@type': 'WebApplication', name: 'KOK', url: `${site}/`, description: pages['/'].description,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'ru', provider: {'@id': `${site}/#org`},
      // Цена «0» — пробные кредиты; тарифы в базе и меняются из админки, в разметку их не тащим
      offers: {'@type': 'Offer', price: '0', priceCurrency: 'KRW', description: `${credits.signup.credits} кредитов бесплатно на ${credits.signup.days} дней`}},
    {'@type': 'FAQPage', mainEntity: faq.map((f) => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: plain(f.a)}}))},
  ]};
};

/**
 * Страница приложения для запроса: подставляет заголовок и описание адреса, canonical, полные адреса
 * Open Graph, коды подтверждения Search Console и Вебмастера, номера счётчиков и витрину для гостя.
 * html — index.html после сборки (или после transformIndexHtml в разработке), landing — готовая
 * разметка витрины или null
 */
export const renderPage = async (html, req, {landing = null} = {}) => {
  const site = await siteUrl();
  const primary = await isPrimary(req);
  const {pages, keywords, counters = {}} = await seoConfig();
  const page = pageOf(req.path);
  const meta = pages[page ?? '/'];
  // Окружение перекрывает config/seo.json — поменять код без выкладки
  const pick = (name, field) => process.env[name]?.trim() || counters[field]?.trim() || '';
  const env = {GOOGLE_SITE_VERIFICATION: pick('GOOGLE_SITE_VERIFICATION', 'googleVerification'),
    YANDEX_VERIFICATION: pick('YANDEX_VERIFICATION', 'yandexVerification'),
    GA_MEASUREMENT_ID: pick('GA_MEASUREMENT_ID', 'gaMeasurementId'), YANDEX_METRIKA_ID: pick('YANDEX_METRIKA_ID', 'yandexMetrikaId')};
  const head = [
    `<link rel="canonical" href="${site}${page && page !== '/' ? page : '/'}" />`,
    `<meta name="keywords" content="${esc(keywords)}" />`,
    `<meta property="og:url" content="${site}${page && page !== '/' ? page : '/'}" />`,
    `<meta property="og:image" content="${site}/kok/og.png" />`,
    `<meta name="twitter:image" content="${site}/kok/og.png" />`,
    // Неиндексируемые адреса: превью, копии, кабинетные пути вне списка — подстраховка к robots.txt
    ...(!primary || !page ? ['<meta name="robots" content="noindex, nofollow" />'] : []),
    // Коды подтверждения владения — config/seo.json или окружение Coolify
    ...(primary && env.GOOGLE_SITE_VERIFICATION ? [`<meta name="google-site-verification" content="${esc(env.GOOGLE_SITE_VERIFICATION)}" />`] : []),
    ...(primary && env.YANDEX_VERIFICATION ? [`<meta name="yandex-verification" content="${esc(env.YANDEX_VERIFICATION)}" />`] : []),
    // Номера счётчиков интерфейсу (app/analytics.ts). Сами счётчики грузятся только после согласия
    ...(primary && (env.GA_MEASUREMENT_ID || env.YANDEX_METRIKA_ID) ? [`<script>window.__KOK_ANALYTICS=${jsonScript({
      ga: env.GA_MEASUREMENT_ID, ym: env.YANDEX_METRIKA_ID})}</script>`] : []),
    ...(primary && env.GA_MEASUREMENT_ID ? googleTag(env.GA_MEASUREMENT_ID) : []),
    ...(page === '/' ? [`<script type="application/ld+json">${jsonScript(await structuredData(site))}</script>`] : []),
  ].map((l) => `    ${l}`).join('\n');
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(meta.description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(meta.title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(meta.description)}`)
    // Относительная картинка превью ссылок — мессенджеры её не находят; полная ставится выше
    .replace(/\s*<meta property="og:image" content="\/[^"]*" \/>/, '')
    .replace('<!--seo-->', head.trimStart());
  if (landing) out = out.replace('<!--prerender-->', `<div id="prerender">${landing}</div>`);
  return out;
};

/** Гость ли на главной: только ему кладём витрину. Вошедший увидел бы её на миг перед кабинетом */
export const wantsLanding = (req, hasSession) => pageOf(req.path) === '/' && !hasSession;

/**
 * Витрина строкой HTML — тот же компонент Landing, что у гостя в браузере. load — способ загрузить
 * модуль интерфейса: ssrLoadModule от Vite (разработка и сборка). Условия — подарок из
 * config/credits.json; тарифов из базы здесь нет, витрина показывает «тарифы — в кабинете»,
 * а живые цены дорисует браузер
 */
export const renderLanding = async (load) => {
  const [{createElement}, {renderToString}, {Landing}, credits] = await Promise.all([
    import('react'), import('react-dom/server'), load('/Landing.tsx'), readJson(path.join(CONFIG_DIR, 'credits.json'))]);
  return renderToString(createElement(Landing, {signup: credits.signup, notice: ''}));
};

// Готовая витрина в бою — файл рядом со сборкой (tools/prerender.mjs). Нет файла — живём без неё
export const readPrerendered = (dist) => fs.readFile(path.join(dist, 'landing.html'), 'utf8').catch(() => null);
