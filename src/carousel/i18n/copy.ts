// Тексты новых форматов карусели: заголовки, описания, преимущества — по типу слайда.
//
// Шаблоны, а не генерация: решение владельца 27 сентября — «шаблоны сейчас, Claude API
// потом». Чтобы посты одного дилера не были близнецами, у каждого слайда несколько
// вариантов, и вариант выбирается зерном карусели (кнопка «Другой вариант»).
//
// Разметка строк:
//   {слово}   — акцент: рисуется цветом акцента бренда («Комфорт в каждой {детали}»);
//   %model%   — марка и модель, %brand% — компания клиента, %engine% — объём («2,0 л»);
//   \n        — перенос строки в заголовке.
//
// Важно: в текстах нет утверждений про оснащение («LED-оптика», «панорамная крыша»).
// Шаблон один на все машины, а у конкретной машины этого может не быть — опции на слайд
// идут только из её данных, с иконками. Здесь — общие слова про класс и впечатление.
import type {CarouselLang} from './index';

export type Benefit = {icon: BenefitIcon; text: string};
export type BenefitIcon = 'shield' | 'plane' | 'file' | 'ship' | 'headset' | 'handshake' | 'search' | 'eye' | 'card';

type SlideCopy = {kicker: string[]; title: string[]; text: string[]};

type Copy = {
  cover: {tagline: string[]; strap: string[]; benefits: Benefit[][]};
  exterior: SlideCopy;
  interior: SlideCopy;
  details: SlideCopy;
  engine: SlideCopy;
  safety: SlideCopy;
  historyClean: SlideCopy;
  historyClaims: SlideCopy;
  historyNone: SlideCopy;
  rear: SlideCopy;
  gallery: {kicker: string[]};
  price: SlideCopy;
  why: SlideCopy & {benefits: Benefit[][]};
  cta: SlideCopy & {guarantees: Benefit[][]; button: {whatsapp: string; telegram: string}};
  engineRows: {fuel: string; transmission: string; mileage: string; volume: string};
};

const RU: Copy = {
  cover: {
    tagline: ['Автомобили\nиз Кореи', 'Прямой импорт\nиз Кореи', 'Проверенные авто\nиз Южной Кореи'],
    strap: ['Надёжный · Комфортный · Стильный', 'Проверен · Готов к отправке', 'Честная история · Прямой импорт'],
    benefits: [
      [{icon: 'shield', text: 'Проверенное\nкачество'}, {icon: 'plane', text: 'Прямой импорт\nиз Кореи'}, {icon: 'handshake', text: 'Выгодные\nусловия'}],
      [{icon: 'file', text: 'Честная\nистория'}, {icon: 'search', text: 'Осмотр перед\nпокупкой'}, {icon: 'ship', text: 'Доставка\nдо порта'}],
    ],
  },
  exterior: {
    kicker: ['Экстерьер', 'Внешний вид'],
    title: ['Современный\nи стильный {дизайн}', 'Выразительный\n{характер}', 'Узнаваемый\n{силуэт}'],
    text: [
      'Выразительный силуэт и фирменный стиль %model% — машина, которая выделяется в потоке.',
      'Чистые линии кузова и продуманные пропорции: %model% смотрится уверенно с любого ракурса.',
      'Узнаваемый облик %model% — сдержанный, современный и без лишнего.',
    ],
  },
  interior: {
    kicker: ['Интерьер', 'Салон'],
    title: ['Комфорт\nв каждой {детали}', 'Комфорт\nи {технологии}', 'Салон, в котором\n{хочется ехать}'],
    text: [
      'Просторный салон, качественные материалы и опции для комфорта в каждой поездке.',
      'Всё под рукой: продуманная эргономика и оснащение, которое работает на вас каждый день.',
      'Тихо, удобно и просторно — и в городе, и в дальней дороге.',
    ],
  },
  details: {
    kicker: ['Детали'],
    title: ['Детали, которые\n{впечатляют}', 'Продуманные\n{мелочи}'],
    text: ['Из таких мелочей и складывается впечатление от машины.', 'То, что замечаешь не сразу, но ценишь каждый день.'],
  },
  engine: {
    kicker: ['Двигатель', 'Динамика'],
    title: ['Надёжный\n{%engine%}', 'Уверенная\n{динамика}', 'Проверенный\n{агрегат}'],
    text: [
      'Проверенный двигатель обеспечивает уверенную динамику и спокойствие в любых условиях.',
      'Мощности хватает и на трассе, и в городе — без лишнего расхода.',
      'Агрегат, который знают и умеют обслуживать — без сюрпризов на годы вперёд.',
    ],
  },
  safety: {
    kicker: ['Безопасность'],
    title: ['Ваша уверенность\n{на дороге}', 'Безопасность\n{на первом месте}'],
    text: [
      'Системы помощи водителю делают каждую поездку безопаснее и спокойнее.',
      'Современная электроника бережёт водителя и пассажиров.',
    ],
  },
  historyClean: {
    kicker: ['История авто'],
    title: ['Страховых случаев\n{нет}', 'Чистая\n{история}'],
    text: ['По данным страховых — ни одного случая. Полный отчёт Encar — до покупки.'],
  },
  historyClaims: {
    kicker: ['История авто'],
    title: ['Честная\n{история}', 'Ничего\n{не скрываем}'],
    text: ['Каждый случай — с суммой выплаты. Полный отчёт Encar — до покупки.'],
  },
  historyNone: {
    kicker: ['История авто'],
    title: ['Отчёт\n{по запросу}'],
    text: ['Пришлём полный отчёт Encar о страховых случаях до покупки.'],
  },
  rear: {
    kicker: ['Внешний вид'],
    title: ['%model%'],
    text: ['Впечатляет с любого ракурса', 'Качество, проверенное временем'],
  },
  gallery: {kicker: ['Галерея', 'Фото']},
  price: {
    kicker: ['Цена'],
    title: ['Цена\n{в Корее}'],
    text: [''],
  },
  why: {
    kicker: ['Почему %brand%?', 'Как мы работаем'],
    title: ['С нами просто\n{и безопасно}', 'Работаем\n{честно}'],
    text: [''],
    benefits: [
      [
        {icon: 'shield', text: 'Полная проверка\nавто перед покупкой'}, {icon: 'file', text: 'Оформление\nи экспорт из Кореи'},
        {icon: 'ship', text: 'Надёжная логистика\nдо вашего порта'}, {icon: 'headset', text: 'Поддержка\nна всех этапах сделки'},
      ],
    ],
  },
  cta: {
    kicker: ['Готовы к сотрудничеству?', 'На связи'],
    title: ['%model%\n{уже доступен}', 'Хотите\n{эту машину?}'],
    text: [
      'Свяжитесь с нами, чтобы получить консультацию, актуальную цену и условия доставки.',
      'Напишите нам — посчитаем полную стоимость с доставкой до вашей страны.',
    ],
    guarantees: [
      [{icon: 'eye', text: 'Прозрачные\nусловия'}, {icon: 'search', text: 'Проверка\nперед покупкой'}, {icon: 'ship', text: 'Доставка\nдо порта'}],
      [{icon: 'shield', text: 'Быстрая\nпроверка'}, {icon: 'card', text: 'Прозрачные\nусловия'}, {icon: 'handshake', text: 'Надёжный\nпартнёр'}],
    ],
    button: {whatsapp: 'Написать в WhatsApp', telegram: 'Написать в Telegram'},
  },
  engineRows: {fuel: 'Топливо', transmission: 'Трансмиссия', mileage: 'Пробег', volume: 'Объём'},
};

const EN: Copy = {
  cover: {
    tagline: ['Cars\nfrom Korea', 'Direct import\nfrom Korea', 'Verified cars\nfrom South Korea'],
    strap: ['Reliable · Comfortable · Stylish', 'Inspected · Ready to ship', 'Honest history · Direct import'],
    benefits: [
      [{icon: 'shield', text: 'Verified\nquality'}, {icon: 'plane', text: 'Direct import\nfrom Korea'}, {icon: 'handshake', text: 'Fair\nterms'}],
      [{icon: 'file', text: 'Honest\nhistory'}, {icon: 'search', text: 'Pre-purchase\ninspection'}, {icon: 'ship', text: 'Shipping\nto your port'}],
    ],
  },
  exterior: {
    kicker: ['Exterior', 'Design'],
    title: ['Modern\nand {stylish}', 'Distinctive\n{character}', 'Unmistakable\n{silhouette}'],
    text: [
      'A confident silhouette and signature styling — the %model% stands out on the road.',
      'Clean body lines and balanced proportions: the %model% looks right from every angle.',
      'The recognisable %model% look — understated, modern and clean.',
    ],
  },
  interior: {
    kicker: ['Interior', 'Cabin'],
    title: ['Comfort\nin every {detail}', 'Comfort\nand {technology}', 'A cabin you\n{want to drive in}'],
    text: [
      'A spacious cabin, quality materials and features that make every trip comfortable.',
      'Everything within reach: thoughtful ergonomics and equipment that works for you daily.',
      'Quiet, comfortable and roomy — in the city and on long drives.',
    ],
  },
  details: {
    kicker: ['Details'],
    title: ['Details that\n{impress}', 'Thoughtful\n{touches}'],
    text: ['Small things add up to how a car feels.', 'Things you notice later and appreciate every day.'],
  },
  engine: {
    kicker: ['Engine', 'Performance'],
    title: ['Reliable\n{%engine%}', 'Confident\n{performance}', 'Proven\n{powertrain}'],
    text: [
      'A proven engine delivers confident performance and peace of mind in any conditions.',
      'Enough power for the highway and the city — without excess fuel.',
      'A powertrain mechanics know well — no surprises for years to come.',
    ],
  },
  safety: {
    kicker: ['Safety'],
    title: ['Confidence\n{on the road}', 'Safety\n{comes first}'],
    text: ['Driver assistance systems make every trip safer and calmer.', 'Modern electronics look after the driver and passengers.'],
  },
  historyClean: {
    kicker: ['Vehicle history'],
    title: ['No insurance\n{claims}', 'A clean\n{record}'],
    text: ['Nothing on record with the insurers. Full Encar report supplied before purchase.'],
  },
  historyClaims: {
    kicker: ['Vehicle history'],
    title: ['An honest\n{history}', 'Nothing\n{hidden}'],
    text: ['Every claim with its payout. Full Encar report supplied before purchase.'],
  },
  historyNone: {
    kicker: ['Vehicle history'],
    title: ['Report\n{on request}'],
    text: ['We will send the full Encar insurance report before purchase.'],
  },
  rear: {
    kicker: ['Exterior'],
    title: ['%model%'],
    text: ['Impressive from every angle', 'Quality that stands the test of time'],
  },
  gallery: {kicker: ['Gallery', 'Photos']},
  price: {kicker: ['Price'], title: ['Price\n{in Korea}'], text: ['']},
  why: {
    kicker: ['Why %brand%?', 'How we work'],
    title: ['Simple\n{and safe}', 'We work\n{honestly}'],
    text: [''],
    benefits: [
      [
        {icon: 'shield', text: 'Full inspection\nbefore purchase'}, {icon: 'file', text: 'Paperwork\nand export from Korea'},
        {icon: 'ship', text: 'Reliable shipping\nto your port'}, {icon: 'headset', text: 'Support\nat every step'},
      ],
    ],
  },
  cta: {
    kicker: ['Ready to talk?', 'Get in touch'],
    title: ['%model%\n{is available}', 'Want\n{this car?}'],
    text: [
      'Message us for a consultation, the current price and delivery terms.',
      'Write to us — we will quote the full landed cost to your country.',
    ],
    guarantees: [
      [{icon: 'eye', text: 'Transparent\nterms'}, {icon: 'search', text: 'Pre-purchase\ninspection'}, {icon: 'ship', text: 'Shipping\nto your port'}],
      [{icon: 'shield', text: 'Fast\ninspection'}, {icon: 'card', text: 'Transparent\nterms'}, {icon: 'handshake', text: 'Reliable\npartner'}],
    ],
    button: {whatsapp: 'Message on WhatsApp', telegram: 'Message on Telegram'},
  },
  engineRows: {fuel: 'Fuel', transmission: 'Transmission', mileage: 'Mileage', volume: 'Engine'},
};

export const COPY: Record<CarouselLang, Copy> = {ru: RU, en: EN};

/**
 * Вариант по зерну: одно и то же зерно — один и тот же выбор (пересборка той же карусели
 * даёт те же слайды), другое зерно — другой. Ключ слайда подмешан, чтобы все слайды не
 * брали вариант с одним номером разом.
 */
export const pick = <T,>(items: T[], seed: number, key: string): T => {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0;
  return items[h % items.length];
};

/** Подставить данные машины: %model%, %brand%, %engine% */
export const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/%(\w+)%/g, (_m, k) => vars[k] ?? '');
