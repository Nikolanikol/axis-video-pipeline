// Язык слайдов карусели: подписи вёрстки, данные из Encar и числа.
//
// Язык берётся из профиля клиента (profile.language) — тот же, что у рекламы. С 15.11 его
// ставит переключатель языка KOK (RU · EN · SQ): интерфейс, слайды, ролики и письма — на одном
// языке. Умеем английский, русский и албанский; незнакомый код получает английский — лучше
// английский, чем пустые плашки.
//
// Два источника слов:
//   • подписи вёрстки («История авто», «Цена в Корее») — здесь, по языкам;
//   • данные машины — шлюз kmotors отдаёт их по-английски. Русские пары для опций,
//     топлива и коробки взяты из словарей самого kmotors (ru-values.json, генерирует
//     tools/sync-kmotors-dict.mjs) — на слайде то же слово, что на kmotors.shop/ru.
//     Цветов в русском словаре kmotors нет — они в COLORS_RU ниже.
// Албанские слова данных — sq-values.ts (пишутся руками, у kmotors албанского нет).
// Слово, которого нет в словаре, остаётся английским: лучше английское слово, чем пустое место.
import dict from './ru-values.json';
import {copyFor, forOrigin} from './copy';
import {currencySign} from '../../shared/currencies.js';
import {SQ_OPTIONS, SQ_VALUES} from './sq-values';

// Албанский — с 15.11: язык контента идёт за переключателем языка KOK (RU · EN · SQ)
export type CarouselLang = 'en' | 'ru' | 'sq';
export const CAROUSEL_LANGS: CarouselLang[] = ['en', 'ru', 'sq'];
export const carouselLang = (language?: string): CarouselLang => (language === 'ru' ? 'ru' : language === 'sq' ? 'sq' : 'en');

// Цвета: в словаре kmotors по-английски их десять, по-русски нет ни одного. Список с запасом:
// шлюз отдаёт то, что есть в его английском словаре, и новые цвета появятся там же
const COLORS_RU: Record<string, string> = {
  Black: 'Чёрный', White: 'Белый', Gray: 'Серый', Silver: 'Серебристый', Red: 'Красный',
  Blue: 'Синий', Green: 'Зелёный', Brown: 'Коричневый', Yellow: 'Жёлтый', Beige: 'Бежевый',
  Gold: 'Золотистый', Orange: 'Оранжевый', Purple: 'Фиолетовый', Navy: 'Тёмно-синий',
  Wine: 'Бордовый', Pearl: 'Перламутровый', 'Gray + Black': 'Серый + чёрный', 'Gray + White': 'Серый + белый',
};

/** Русское число с правильным словом: 1 смена, 2 смены, 5 смен */
const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

const STRINGS = {
  en: {
    swipe: 'Swipe →',
    ownerChanges: (n: number) => `${n} owner change${n === 1 ? '' : 's'}`,
    history: 'Vehicle history',
    reportOnRequest: 'Report available on request',
    noAccidents: 'No accident record',
    insuranceClaims: 'Insurance claims',
    ownerChangesLabel: 'Owner changes',
    theft: 'Theft records',
    flood: 'Flood damage',
    cleanNote: 'Nothing on record with the insurers. Full Encar report supplied before purchase.',
    nothingHidden: 'Nothing hidden',
    date: 'Date', fault: 'Fault', paidOut: 'Paid out', own: 'own', other: 'other',
    parts: 'parts', labour: 'labour', paint: 'paint',
    andMore: (n: number) => `and ${n} more in the full report`,
    summary: (own: number, other: number, theft: number, flood: number) =>
      `${own} at fault, ${other} third-party. Theft ${theft} · Flood ${flood}. Full Encar report supplied before purchase.`,
    interior: 'Interior', technology: 'Technology & safety', specs: 'Specifications',
    year: 'Year', engine: 'Engine', fuel: 'Fuel', transmission: 'Transmission', mileage: 'Mileage', seats: 'Seats',
    price: 'Price', priceInKorea: 'Price in Korea',
    priceNotes: [
      'Shipping and customs are calculated separately',
      'Full landed cost quoted for your country',
      'Inspection report and walkaround video before purchase',
    ],
    ctaTitle: 'Want this car?',
    ctaText: 'Message us for the full landed cost to your country',
  },
  ru: {
    swipe: 'Листайте →',
    ownerChanges: (n: number) => `${n} ${plural(n, 'смена владельца', 'смены владельца', 'смен владельца')}`,
    history: 'История авто',
    reportOnRequest: 'Отчёт — по запросу',
    noAccidents: 'Страховых случаев нет',
    insuranceClaims: 'Страховые случаи',
    ownerChangesLabel: 'Смены владельца',
    theft: 'Угоны',
    flood: 'Затопления',
    cleanNote: 'У страховых компаний записей нет. Полный отчёт Encar — до покупки.',
    nothingHidden: 'Ничего не скрываем',
    date: 'Дата', fault: 'Вина', paidOut: 'Выплата', own: 'своя', other: 'чужая',
    parts: 'запчасти', labour: 'работа', paint: 'покраска',
    andMore: (n: number) => `и ещё ${n} в полном отчёте`,
    summary: (own: number, other: number, theft: number, flood: number) =>
      `По своей вине — ${own}, по чужой — ${other}. Угоны: ${theft} · затопления: ${flood}. Полный отчёт Encar — до покупки.`,
    interior: 'Салон', technology: 'Технологии и безопасность', specs: 'Характеристики',
    year: 'Год', engine: 'Двигатель', fuel: 'Топливо', transmission: 'Коробка', mileage: 'Пробег', seats: 'Мест',
    price: 'Цена', priceInKorea: 'Цена в Корее',
    priceNotes: [
      'Доставка и растаможка — отдельно',
      'Посчитаем полную стоимость до вашей страны',
      'Отчёт об осмотре и видеообзор до покупки',
    ],
    ctaTitle: 'Хотите эту машину?',
    ctaText: 'Напишите нам — посчитаем полную стоимость с доставкой до вашей страны',
  },
  // Машинный перевод — перед запуском вычитывает носитель. Страна — «Kore» / «Koreja»:
  // ORIGIN_SWAP в copy.ts меняет именно эти формы на Китай и Японию
  sq: {
    swipe: 'Rrëshqit →',
    ownerChanges: (n: number) => `${n} ${n === 1 ? 'ndërrim pronari' : 'ndërrime pronari'}`,
    history: 'Historia e makinës',
    reportOnRequest: 'Raporti — me kërkesë',
    noAccidents: 'Pa dëme në sigurime',
    insuranceClaims: 'Dëme në sigurime',
    ownerChangesLabel: 'Ndërrime pronari',
    theft: 'Vjedhje',
    flood: 'Përmbytje',
    cleanNote: 'Siguruesit nuk kanë asnjë regjistrim. Raporti i plotë Encar — para blerjes.',
    nothingHidden: 'Asgjë e fshehur',
    date: 'Data', fault: 'Faji', paidOut: 'Paguar', own: 'i vetë', other: 'i tjetrit',
    parts: 'pjesë', labour: 'punë', paint: 'bojë',
    andMore: (n: number) => `dhe ${n} të tjera në raportin e plotë`,
    summary: (own: number, other: number, theft: number, flood: number) =>
      `Me faj: ${own}, pa faj: ${other}. Vjedhje: ${theft} · përmbytje: ${flood}. Raporti i plotë Encar — para blerjes.`,
    interior: 'Interieri', technology: 'Teknologji dhe siguri', specs: 'Të dhënat teknike',
    year: 'Viti', engine: 'Motori', fuel: 'Karburanti', transmission: 'Kambio', mileage: 'Kilometrat', seats: 'Vende',
    price: 'Çmimi', priceInKorea: 'Çmimi në Kore',
    priceNotes: [
      'Transporti dhe dogana — veçmas',
      'Llogarisim koston e plotë deri në vendin tuaj',
      'Raport inspektimi dhe video para blerjes',
    ],
    ctaTitle: 'E doni këtë makinë?',
    ctaText: 'Na shkruani — llogarisim koston e plotë me transport deri në vendin tuaj',
  },
};

// Единицы на крупных цифрах семейств каруселей (src/carousel/families) и дробная запятая
const UNITS: Record<CarouselLang, {year: string; km: string; l: string; dec: string}> = {
  en: {year: 'YEAR', km: 'KM', l: 'L', dec: '.'},
  ru: {year: 'ГОД', km: 'КМ', l: 'Л', dec: ','},
  sq: {year: 'VITI', km: 'KM', l: 'L', dec: ','},
};
const LOCALES: Record<CarouselLang, string> = {en: 'en-US', ru: 'ru-RU', sq: 'sq-AL'};

export type CarouselText = ReturnType<typeof carouselText>;

/**
 * Всё языковое для слайдов: подписи, тексты, перевод данных и числа по правилам языка.
 * origin — страна машины (CarouselCar.origin): у машины из Китая «Цена в Китае» и «Импорт из
 * Китая» вместо Кореи, у японской — «Япония» (copy.ts, copyFor). Нет — Корея, как было
 */
export const carouselText = (lang: CarouselLang, origin?: string) => {
  const locale = LOCALES[lang];
  // В русской записи разряды — пробелом; toLocaleString ставит неразрывный, он и нужен:
  // «239 601 км» не должен переноситься посередине числа
  const n = (v: number) => v.toLocaleString(locale);
  const ru = lang === 'ru';
  const sq = lang === 'sq';
  return {
    lang,
    locale,
    u: UNITS[lang],
    origin: origin === 'CN' || origin === 'JP' ? origin : 'KR',
    s: forOrigin(STRINGS[lang], lang, origin),
    // Тексты слайдов новых форматов (Deck) — уже для страны машины
    copy: copyFor(lang, origin),
    /** Топливо, коробка, цвет, кузов */
    value: (en: string) => (!en ? en : ru ? ((dict.values as Record<string, string>)[en] ?? COLORS_RU[en] ?? en) : sq ? (SQ_VALUES[en] ?? en) : en),
    /** Название опции */
    option: (en: string) => (ru ? ((dict.options as Record<string, string>)[en] ?? en) : sq ? (SQ_OPTIONS[en] ?? en) : en),
    num: n,
    km: (v: number | null) => (v === null ? '—' : `${n(v)} ${ru ? 'км' : 'km'}`),
    usd: (v: number | null | undefined) => (v ? `$${n(v)}` : '—'),
    krw: (v: number) => `₩${n(v)}`,
    /** Цена в валюте компании: $, € и £ — перед числом, как принято; остальные значки — после */
    money: (v: number | null | undefined, code?: string) => {
      if (!v) return '—';
      const sign = currencySign(code);
      return ['$', '€', '£'].includes(sign) ? `${sign}${n(v)}` : `${n(v)} ${sign}`;
    },
    liters: (cc: number | null) => (cc ? `${(cc / 1000).toLocaleString(locale, {minimumFractionDigits: 1, maximumFractionDigits: 1})} ${ru ? 'л' : 'L'}` : '—'),
  };
};
