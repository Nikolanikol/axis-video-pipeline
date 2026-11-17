// Адреса и SEO-тексты витрины. Всё, что относится к ссылкам между витриной и приложением, — здесь,
// чтобы при переезде (app/ для гостя → корень) правка была в одном месте.
import type {Lang} from './i18n';
import {LANGS} from './i18n';
import seo from '../../../config/seo.json';

export const SITE = 'https://axis-beauty.com';
// Адрес приложения — настройкой: на проде боевое app., на превью PR — превью приложения
// (N.preview.axis-beauty.com, там уже новая логика входа), локально — копия на Mac. Задаётся при сборке:
// PUBLIC_APP_URL=http://localhost:3214 npm run dev
export const APP = (import.meta.env.PUBLIC_APP_URL || 'https://app.axis-beauty.com').replace(/\/+$/, '');

// Вход и регистрация живут в приложении — настоящими адресами /login и /register (не #/…: их
// понятно копировать, а старая версия приложения на них просто покажет свою главную). Приложение
// разбирает их до отрисовки (app/entry.ts): гостю открывает нужное окно, вошедшему — кабинет.
// ?lang= — язык страницы витрины (app/i18n/index.tsx): с английской витрины — в английский кабинет.
export const signupUrl = (lang: Lang) => `${APP}/register?lang=${lang}`;
export const loginUrl = (lang: Lang) => `${APP}/login?lang=${lang}`;
// Оферта и политика живут в приложении: касса проходила модерацию на этом адресе, а реквизиты
// владельца на витрину не выводим (решение владельца 18.11, docs/projects/site/plan.md, P1)
export const OFFER_URL = `${APP}/offer`;
export const PRIVACY_URL = `${APP}/privacy`;

/** Адрес страницы на языке: русский — без приставки, остальные — /en/, /sq/ */
export const pathFor = (lang: Lang, page = '/') => (lang === 'ru' ? page : `/${lang}${page}`);
export const urlFor = (lang: Lang, page = '/') => SITE + pathFor(lang, page);
export const alternates = (page = '/') => langsOf(page).map((l) => ({lang: l, href: urlFor(l, page)}));

// Заголовок до ~60 знаков, описание до ~160 — длиннее поисковик обрежет. Русские — те же, что у
// нынешней витрины на app/ (config/seo.json, подобраны по подсказкам Google и Яндекса 19.10).
// Английский и албанский — перевод; албанский перед запуском вычитывает носитель.
export const HOME_SEO: Record<Lang, {title: string; description: string}> = {
  ru: seo.pages['/'],
  en: {
    title: 'Car dealer ads & SMM: videos and carousels from a link | KOK',
    description: 'A Reels and TikTok video and an Instagram carousel from an Encar, che168 or Carsensor listing link. Cars from Korea, China and Japan. Start free.',
  },
  sq: {
    title: 'Reklama dhe SMM për autosallone: video dhe karusele nga linku | KOK',
    description: 'Video për Reels dhe TikTok dhe karusel për Instagram nga linku i njoftimit në Encar, che168 ose Carsensor. Makina nga Koreja, Kina dhe Japonia. Fillo falas.',
  },
};

/**
 * Страницы сайта: адрес без языка → на каких языках она есть. По ним строятся sitemap, hreflang
 * и переключатель языка. Статья есть не на всех языках: Encar и площадки Кореи — ru/en/sq (их ищут
 * Албания, Косово и весь мир по-английски), che168 и КП — пока ru (docs/projects/site/wordstat.md);
 * пустых и машинных переводов план не допускает. Должно совпадать с lib/articles.ts
 */
export const PAGES: Record<string, readonly Lang[]> = {
  '/': LANGS,
  '/encar/': ['ru', 'en', 'sq'],
  '/che168/': ['ru'],
  '/articles/': LANGS,
  '/korean-car-sites/': LANGS,
  '/kommercheskoe-predlozhenie-na-avtomobil/': ['ru'],
};
export const langsOf = (page: string): readonly Lang[] => PAGES[page] ?? LANGS;
