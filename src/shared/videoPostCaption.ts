// Бесплатная подпись к видео из текущих полей объявления, без запроса к ИИ и рендера.
// Характеристики уже на языке контента; цену не дублируем. Неизвестную страну и историю
// не додумываем. Ручная подпись сохраняется в lot.postCaption, шаблон её не перезаписывает.
import {carouselLang} from '../carousel/i18n';
import {idFromNote} from './encarLink.js';
import type {Lot, Market} from './types';

type CaptionLot = Lot & {note?: string};
const COPY = {
  ru: {
    hooks: ['Подробности об автомобиле', 'Присмотритесь к этому автомобилю', 'Вариант для вашего подбора'],
    from: 'Из', countries: {KR: 'Кореи', CN: 'Китая', JP: 'Японии'},
    clean: 'Без страховых случаев', owner: 'Один владелец',
    cta: ['Напишите нам — расскажем подробнее и рассчитаем стоимость', 'Свяжитесь с нами, чтобы уточнить наличие и условия покупки', 'Нужны подробности? Ответим на вопросы об автомобиле'],
    whatsapp: 'Пишите в WhatsApp', telegram: 'Пишите в Telegram',
    tags: {KR: ['автоизкореи', 'корейскиеавто'], CN: ['автоизкитая', 'китайскиеавто'], JP: ['автоизяпонии', 'японскиеавто']},
  },
  en: {
    hooks: ['A closer look at this car', 'Take a look at this option', 'A car to consider for your shortlist'],
    from: 'From', countries: {KR: 'Korea', CN: 'China', JP: 'Japan'},
    clean: 'No insurance claims', owner: 'One owner',
    cta: ['Message us for more details and a price calculation', 'Contact us to check availability and purchase terms', 'Want to know more? Ask us about this car'],
    whatsapp: 'Message us on WhatsApp', telegram: 'Message us on Telegram',
    tags: {KR: ['carsfromkorea', 'koreancars'], CN: ['carsfromchina', 'chinesecars'], JP: ['carsfromjapan', 'japanesecars']},
  },
  sq: {
    hooks: ['Më shumë detaje për këtë makinë', 'Shikoni këtë mundësi', 'Një makinë për listën tuaj të përzgjedhjes'],
    from: 'Nga', countries: {KR: 'Korea', CN: 'Kina', JP: 'Japonia'},
    clean: 'Pa dëme në sigurime', owner: 'Një pronar',
    cta: ['Na shkruani për më shumë detaje dhe përllogaritjen e çmimit', 'Na kontaktoni për disponueshmërinë dhe kushtet e blerjes', 'Dëshironi të dini më shumë? Na pyesni për këtë makinë'],
    whatsapp: 'Na shkruani në WhatsApp', telegram: 'Na shkruani në Telegram',
    tags: {KR: ['makinangakorea', 'makinakoreane'], CN: ['makinangakina', 'makinakineze'], JP: ['makinangajaponia', 'makinajaponeze']},
  },
};

const originOf = (lot: CaptionLot): 'KR' | 'CN' | 'JP' | null => {
  // origin у видео — город, не код страны. Явно изменённая страна важнее пометки источника.
  const country = lot.originCountry?.trim().toLowerCase();
  if (country) {
    if (['kr', 'korea', 'south korea', 'корея', 'южная корея', 'kore', 'korea e jugut'].includes(country)) return 'KR';
    if (['cn', 'china', 'китай', 'kina', 'kinë'].includes(country)) return 'CN';
    if (['jp', 'japan', 'япония', 'japonia', 'japoni'].includes(country)) return 'JP';
    return null;
  }
  const source = idFromNote(lot.note);
  return source ? source.startsWith('ch-') ? 'CN' : source.startsWith('cs-') ? 'JP' : 'KR' : null;
};
const seedOf = (seed: number) => Number.isSafeInteger(seed) && seed >= 0 ? seed : 0;
const tag = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const videoPostHashtags = (lot: CaptionLot, language?: string): string[] => {
  const copy = COPY[carouselLang(language)];
  const origin = originOf(lot);
  const brand = tag(lot.brand || '');
  const words = (lot.model || '').trim().split(/\s+/);
  const model = tag(/^\d+$/.test(words[0] ?? '') && words[1] ? `${words[0]}${words[1]}` : words[0] ?? '');
  return [...new Set([
    brand, brand && model ? `${brand}${model}` : '',
    ...(origin ? copy.tags[origin] : []),
    /\p{L}{3,}/u.test(model) ? model : '',
  ].filter(Boolean))].slice(0, 5).map((value) => `#${value}`);
};

export const videoPostText = (lot: CaptionLot, market: Market, language?: string, seed = 0): string => {
  const copy = COPY[carouselLang(language)];
  const at = seedOf(seed);
  const origin = originOf(lot);
  const specs = [...new Set((lot.specs ?? []).map((s) => s.trim()).filter(Boolean))];
  const offset = specs.length ? at % specs.length : 0;
  const facts = [
    ...(origin ? [`${copy.from} ${copy.countries[origin]}`] : []),
    ...specs.slice(offset), ...specs.slice(0, offset),
    ...(lot.history?.accidentsTotal === 0 ? [copy.clean] : []),
    ...(lot.history?.ownerChanges === 0 ? [copy.owner] : []),
  ];
  const whatsapp = lot.whatsapp === undefined ? market.whatsapp : lot.whatsapp;
  const telegram = lot.telegram === undefined ? market.telegram : lot.telegram;
  const primary = lot.contactPrimary ?? market.contactPrimary;
  const contact = primary === 'telegram' && telegram ? `${copy.telegram}: ${telegram}`
    : whatsapp ? `${copy.whatsapp}: ${whatsapp}` : telegram ? `${copy.telegram}: ${telegram}` : '';
  return [
    [lot.brand, lot.model, lot.year || '', lot.trim].filter(Boolean).join(' · '),
    copy.hooks[at % copy.hooks.length], '',
    ...[...new Set(facts)].map((fact) => `• ${fact}`), '',
    copy.cta[at % copy.cta.length], contact,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
