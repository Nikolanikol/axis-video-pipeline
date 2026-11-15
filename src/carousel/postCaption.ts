// Текст поста к карусели (подпись в Instagram и TikTok) — шаблоном из данных машины.
//
// Решения владельца 16.11:
//   • шаблон из данных машины, без ИИ — бесплатно и мгновенно;
//   • цену не указываем: она на слайде, а в подписи её легко забыть поправить вместе с наценкой;
//   • хэштеги — по стране, производителю и модели, не больше пяти.
// Слова данных — те же, что на слайдах (carouselText: топливо, коробка, цвет, опции на RU/EN/SQ).
// В тексте только хорошее о машине: «без ДТП» — если их ноль; число ДТП в рекламную подпись не идёт.
// seed — вариант: «Другой вариант» в интерфейсе меняет зачин, порядок опций и призыв.
import type {CarouselCar} from '../shared/types';
import {carouselLang, carouselText, type CarouselLang} from './i18n';

type Contacts = {whatsapp?: string | null; telegram?: string; primary?: 'whatsapp' | 'telegram'};
type Origin = 'KR' | 'CN' | 'JP';

const PHRASES: Record<CarouselLang, {
  hooks: Record<Origin, string[]>;
  mileage: string; engine: string; gearbox: string; color: string; seats: string;
  noAccidents: string; oneOwner: string; equipment: string;
  cta: string[]; ctaWa: string; ctaTg: string;
}> = {
  ru: {
    hooks: {
      KR: ['Привезём из Кореи под заказ', 'Свежий вариант из Кореи', 'Из Кореи — с проверкой перед покупкой'],
      CN: ['Привезём из Китая под заказ', 'Свежий вариант из Китая', 'Из Китая — с проверкой перед покупкой'],
      JP: ['Привезём из Японии под заказ', 'Свежий вариант из Японии', 'Из Японии — с проверкой перед покупкой'],
    },
    mileage: 'Пробег', engine: 'Двигатель', gearbox: 'Коробка', color: 'Цвет', seats: 'Мест',
    noAccidents: 'Без ДТП по страховой истории', oneOwner: 'Один владелец', equipment: 'В комплектации',
    cta: ['Посчитаем стоимость под ключ до вашего города', 'Подберём похожую, если эта уйдёт', 'Фото- и видеоотчёт перед покупкой — по запросу'],
    ctaWa: 'Пишите в WhatsApp: {v}', ctaTg: 'Пишите в Telegram: {v}',
  },
  en: {
    hooks: {
      KR: ['Imported from Korea to order', 'Fresh pick from Korea', 'From Korea — inspected before purchase'],
      CN: ['Imported from China to order', 'Fresh pick from China', 'From China — inspected before purchase'],
      JP: ['Imported from Japan to order', 'Fresh pick from Japan', 'From Japan — inspected before purchase'],
    },
    mileage: 'Mileage', engine: 'Engine', gearbox: 'Gearbox', color: 'Colour', seats: 'Seats',
    noAccidents: 'No accidents in the insurance history', oneOwner: 'One owner', equipment: 'Equipment',
    cta: ['We will calculate the full delivered price to your city', 'We will find a similar one if this one sells', 'Photo and video report before purchase — on request'],
    ctaWa: 'Message us on WhatsApp: {v}', ctaTg: 'Message us on Telegram: {v}',
  },
  sq: {
    hooks: {
      KR: ['E sjellim nga Korea me porosi', 'Ofertë e re nga Korea', 'Nga Korea — e kontrolluar para blerjes'],
      CN: ['E sjellim nga Kina me porosi', 'Ofertë e re nga Kina', 'Nga Kina — e kontrolluar para blerjes'],
      JP: ['E sjellim nga Japonia me porosi', 'Ofertë e re nga Japonia', 'Nga Japonia — e kontrolluar para blerjes'],
    },
    mileage: 'Kilometrazhi', engine: 'Motori', gearbox: 'Kambio', color: 'Ngjyra', seats: 'Vende',
    noAccidents: 'Pa aksidente në historikun e sigurimit', oneOwner: 'Një pronar', equipment: 'Pajisjet',
    cta: ['Llogarisim çmimin e plotë deri në qytetin tuaj', 'Gjejmë një të ngjashme nëse kjo shitet', 'Raport me foto dhe video para blerjes — me kërkesë'],
    ctaWa: 'Na shkruani në WhatsApp: {v}', ctaTg: 'Na shkruani në Telegram: {v}',
  },
};

// Хэштеги страны — по два на язык: «авто из …» и «… авто». Свой язык компании: дилер
// пишет для своих клиентов, английский хэштег русскоязычному покупателю не попадётся
const COUNTRY_TAGS: Record<CarouselLang, Record<Origin, [string, string]>> = {
  ru: {KR: ['автоизкореи', 'корейскиеавто'], CN: ['автоизкитая', 'китайскиеавто'], JP: ['автоизяпонии', 'японскиеавто']},
  en: {KR: ['carsfromkorea', 'koreancars'], CN: ['carsfromchina', 'chinesecars'], JP: ['carsfromjapan', 'japanesecars']},
  sq: {KR: ['makinangakorea', 'makinakoreane'], CN: ['makinangakina', 'makinakineze'], JP: ['makinangajaponia', 'makinajaponeze']},
};

const pick = <T,>(list: T[], seed: number, shift = 0): T => list[Math.abs(seed + shift) % list.length];
const tag = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * До пяти хэштегов: производитель, производитель + модель, два — страна, и пятый — модель
 * без производителя, если она узнаваема сама («#kona»). Длинное «#bmw4seriescoupe» никто не ищет —
 * у модели берём первое слово
 */
export const postHashtags = (car: Pick<CarouselCar, 'brand' | 'model' | 'origin'>, language?: string): string[] => {
  const lang = carouselLang(language);
  const origin: Origin = car.origin === 'CN' || car.origin === 'JP' ? car.origin : 'KR';
  const brand = tag(car.brand || '');
  // Цифра в начале («3 Series», «4 Series Coupe») — берём со следующим словом: «#bmw3series», не «#bmw3»
  const words = (car.model || '').split(/\s+/).filter(Boolean);
  const modelWord = tag(/^\d+$/.test(words[0] ?? '') && words[1] ? `${words[0]}${words[1]}` : words[0] ?? '');
  const out = [
    brand,
    brand && modelWord ? `${brand}${modelWord}` : '',
    ...COUNTRY_TAGS[lang][origin],
    // Модель отдельно — только словом из букв: «#4» или «#300» как хэштег бессмысленны
    modelWord && /\p{L}{3,}/u.test(modelWord) ? modelWord : '',
  ].filter(Boolean);
  return [...new Set(out)].slice(0, 5).map((t) => `#${t}`);
};

/** Текст поста без хэштегов. Цены нет намеренно (владелец 16.11) */
export const postText = (car: CarouselCar, language: string | undefined, seed = 0, contacts: Contacts = {}): string => {
  const lang = carouselLang(language);
  const x = carouselText(lang, car.origin);
  const p = PHRASES[lang];
  const origin: Origin = car.origin === 'CN' || car.origin === 'JP' ? car.origin : 'KR';
  const title = [car.brand, car.model, car.year].filter(Boolean).join(' ');
  const trim = [car.grade, car.trim].filter(Boolean).join(' ').trim();

  const engine = [car.displacementCc ? x.liters(car.displacementCc) : '', car.fuel ? x.value(car.fuel).toLowerCase() : '']
    .filter(Boolean).join(', ');
  const facts = [
    car.mileageKm !== null && car.mileageKm !== undefined ? `${p.mileage}: ${x.km(car.mileageKm)}` : '',
    engine ? `${p.engine}: ${engine}` : '',
    car.transmission ? `${p.gearbox}: ${x.value(car.transmission).toLowerCase()}` : '',
    car.color ? `${p.color}: ${x.value(car.color).toLowerCase()}` : '',
    car.seats && car.seats > 5 ? `${p.seats}: ${car.seats}` : '',
    // Только хорошее: история у машин из Китая и Японии отсутствует вовсе — молчим
    car.history && car.history.accidentsTotal === 0 ? p.noAccidents : '',
    car.history && car.history.ownerChanges === 0 ? p.oneOwner : '',
  ].filter(Boolean).map((s) => `• ${s}`);

  // Три опции из комфорта и безопасности; вариант сдвигает выборку — «Другой вариант» не повторяется
  const pool = [...(car.options?.comfort ?? []), ...(car.options?.safety ?? [])];
  const start = pool.length ? Math.abs(seed * 3) % pool.length : 0;
  // Словари опций пишут то с заглавной, то со строчной — в одной строке приводим: первая с
  // заглавной, остальные со строчной. Аббревиатуры («LED», «HID») не трогаем: смотрим вторую букву
  const caseFix = (o: string, i: number) => (/^\p{Lu}\p{Ll}/u.test(o) || /^\p{Ll}/u.test(o)
    ? (i === 0 ? o[0].toUpperCase() : o[0].toLowerCase()) + o.slice(1) : o);
  const options = pool.length ? [...pool.slice(start), ...pool.slice(0, start)].slice(0, 3).map((o, i) => caseFix(x.option(o), i)) : [];

  const channel = contacts.primary === 'telegram' && contacts.telegram ? p.ctaTg.replace('{v}', contacts.telegram)
    : contacts.whatsapp ? p.ctaWa.replace('{v}', contacts.whatsapp)
      : contacts.telegram ? p.ctaTg.replace('{v}', contacts.telegram) : '';

  return [
    `${title}${trim ? ` · ${trim}` : ''}`,
    pick(p.hooks[origin], seed),
    '',
    ...facts,
    ...(options.length ? ['', `${p.equipment}: ${options.join(', ')}`] : []),
    '',
    pick(p.cta, seed, 1),
    ...(channel ? [channel] : []),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
