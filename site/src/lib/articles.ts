// Раздел «Статьи» (/articles/, владелец 18.11): материалы, которые читают, а не только листают, —
// разборы площадок, КП, дальше сюда же блог из P3 (docs/projects/site/plan.md). Адреса статей
// короткие (/encar/, /che168/): ближе к запросу «encar на русском», чем /articles/encar/.
// У статьи свой набор языков: Encar и «Где искать машины в Корее» — ru/en/sq, che168 и КП — пока ru.
import type {Lang} from './i18n';
import {PLATFORMS} from './platforms';
import {SOURCES} from './sources';
import {OFFER_ARTICLE} from './offerArticle';
import {CAR_SITES, CAR_SITES_PAGE} from './carSites';

export type Article = {page: string; title: string; description: string; eyebrow: string; logo?: string};

export const ARTICLES_PAGE = '/articles/';
export const ARTICLES_SEO: Record<Lang, {title: string; description: string}> = {
  ru: {
    title: 'Статьи KOK: Encar и che168 на русском, площадки Кореи, КП на авто',
    description: 'Как читать объявления Encar и che168 на русском, где искать машины в Корее, коммерческое предложение на автомобиль: образец и структура.',
  },
  en: {
    title: 'KOK articles: Encar in English, Korean used car sites',
    description: 'How to read Encar listings in English and where to find used cars in Korea: Encar, KB Chachacha, K Car and dealer auctions.',
  },
  sq: {
    title: 'Artikuj KOK: Encar në shqip, faqet e makinave në Kore',
    description: 'Si të lexoni njoftimet e Encar në shqip dhe ku të gjeni makina të përdorura në Kore: Encar, KB Chachacha, K Car dhe ankandet.',
  },
};

const KOK_ICON = '/shared/kok/icon-512.png';

/** Статьи на языке — в порядке показа в списке */
export const articlesFor = (lang: Lang): Article[] => {
  const out: Article[] = [];
  for (const [id, byLang] of Object.entries(PLATFORMS)) {
    const p = byLang[lang];
    if (p) out.push({page: p.page, title: p.h1, description: p.seo.description, eyebrow: p.eyebrow, logo: SOURCES.find((s) => s.id === id)?.logo});
  }
  const sites = CAR_SITES[lang];
  out.push({page: CAR_SITES_PAGE, title: sites.h1, description: sites.seo.description, eyebrow: sites.eyebrow, logo: KOK_ICON});
  if (lang === 'ru') out.push({page: OFFER_ARTICLE.page, title: OFFER_ARTICLE.h1, description: OFFER_ARTICLE.seo.description, eyebrow: OFFER_ARTICLE.eyebrow, logo: KOK_ICON});
  return out;
};
