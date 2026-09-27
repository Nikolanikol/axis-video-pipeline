// Язык слайдов карусели: подписи вёрстки, данные из Encar и числа.
//
// Язык берётся из профиля клиента («Язык постов») — тот же, что у рекламы: язык выбран,
// тексты уже есть. Умеем английский и русский; остальные языки профиля (македонский,
// албанский…) пока получают английский — как тексты постов откатываются на английский,
// а не оставляют пустые плашки.
//
// Два источника слов:
//   • подписи вёрстки («История авто», «Цена в Корее») — здесь, по языкам;
//   • данные машины — шлюз kmotors отдаёт их по-английски. Русские пары для опций,
//     топлива и коробки взяты из словарей самого kmotors (ru-values.json, генерирует
//     tools/sync-kmotors-dict.mjs) — на слайде то же слово, что на kmotors.shop/ru.
//     Цветов в русском словаре kmotors нет — они в COLORS_RU ниже.
// Слово, которого нет в словаре, остаётся английским: лучше английское слово, чем пустое место.
import dict from './ru-values.json';

export type CarouselLang = 'en' | 'ru';
export const CAROUSEL_LANGS: CarouselLang[] = ['en', 'ru'];
export const carouselLang = (language?: string): CarouselLang => (language === 'ru' ? 'ru' : 'en');

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
    ownerChanges: (n: number) => `${n} owner changes`,
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
};

export type CarouselText = ReturnType<typeof carouselText>;

/** Всё языковое для слайдов: подписи, перевод данных и числа по правилам языка */
export const carouselText = (lang: CarouselLang) => {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  // В русской записи разряды — пробелом; toLocaleString ставит неразрывный, он и нужен:
  // «239 601 км» не должен переноситься посередине числа
  const n = (v: number) => v.toLocaleString(locale);
  const ru = lang === 'ru';
  return {
    lang,
    s: STRINGS[lang],
    /** Топливо, коробка, цвет, кузов */
    value: (en: string) => (ru && en ? ((dict.values as Record<string, string>)[en] ?? COLORS_RU[en] ?? en) : en),
    /** Название опции */
    option: (en: string) => (ru ? ((dict.options as Record<string, string>)[en] ?? en) : en),
    num: n,
    km: (v: number | null) => (v === null ? '—' : `${n(v)} ${ru ? 'км' : 'km'}`),
    usd: (v: number | null | undefined) => (v ? `$${n(v)}` : '—'),
    krw: (v: number) => `₩${n(v)}`,
    liters: (cc: number | null) => (cc ? `${(cc / 1000).toLocaleString(locale, {minimumFractionDigits: 1, maximumFractionDigits: 1})} ${ru ? 'л' : 'L'}` : '—'),
  };
};
