// Разметка Schema.org главной: кто мы (Organization), что продаём (SoftwareApplication с ценой от
// самого дешёвого тарифа) и вопросы (FAQPage). Вопросы — ровно те, что видны на странице:
// за разметку, которой нет на странице, Google наказывает.
import offer from '../snapshot/offer.json';
import {faqFor, type Lang} from './i18n';
import {HOME_SEO, SITE, urlFor} from './site';
import type {Platform} from './platforms';
import {ARTICLES_PAGE, articlesFor} from './articles';
import {ARTICLE_UI} from './articleUi';

const strip = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

export const homeSchema = (lang: Lang) => {
  const prices = offer.packs.filter((p) => p.kind === 'plan').map((p) => p.price_usd);
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', name: 'KOK', url: SITE,
      logo: `${SITE}/shared/kok/icon-512.png`,
      sameAs: [offer.contacts?.instagram].filter(Boolean),
    },
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'KOK',
      url: urlFor(lang), description: HOME_SEO[lang].description, inLanguage: lang,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      offers: {'@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length},
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
      mainEntity: faqFor(lang).map((f) => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: strip(f.a)}})),
    },
  ];
};

/** Путь «KOK › Статьи › страница» на языке страницы */
const crumbs = (lang: Lang, page?: {name: string; path: string}) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [
    {'@type': 'ListItem', position: 1, name: 'KOK', item: urlFor(lang, '/')},
    {'@type': 'ListItem', position: 2, name: ARTICLE_UI[lang].articles, item: urlFor(lang, ARTICLES_PAGE)},
    ...(page ? [{'@type': 'ListItem', position: 3, name: page.name, item: urlFor(lang, page.path)}] : []),
  ],
});
const faqPage = (lang: Lang, faq: {q: string; a: string}[]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
  mainEntity: faq.map((f) => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
});

/** Страница площадки: путь от главной (BreadcrumbList) и вопросы (FAQPage) — те же, что на странице */
export const platformSchema = (p: Platform, lang: Lang) => [
  crumbs(lang, {name: ARTICLE_UI[lang].inLang(p.label ?? p.name), path: p.page}),
  faqPage(lang, p.faq),
];

/** Список статей: путь от главной и сам список (ItemList) */
export const articlesSchema = (lang: Lang) => [
  crumbs(lang),
  {
    '@context': 'https://schema.org', '@type': 'ItemList', inLanguage: lang,
    itemListElement: articlesFor(lang).map((a, i) => ({'@type': 'ListItem', position: i + 1, name: a.title, url: urlFor(lang, a.page)})),
  },
];

/** Обычная статья раздела: путь от главной и вопросы (те же, что на странице) */
export const articleSchema = (lang: Lang, page: string, name: string, faq: {q: string; a: string}[]) => [
  crumbs(lang, {name, path: page}),
  faqPage(lang, faq),
];
