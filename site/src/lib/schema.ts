// Разметка Schema.org главной: кто мы (Organization), что продаём (SoftwareApplication с ценой от
// самого дешёвого тарифа) и вопросы (FAQPage). Вопросы — ровно те, что видны на странице:
// за разметку, которой нет на странице, Google наказывает.
import offer from '../snapshot/offer.json';
import {faqFor, type Lang} from './i18n';
import {HOME_SEO, SITE, urlFor} from './site';

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
