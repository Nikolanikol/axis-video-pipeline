// Тексты слайдов карусели: заголовки, описания, преимущества — по типу слайда.
//
// Шаблоны, а не генерация: решение владельца 27 сентября — «шаблоны сейчас, Claude API
// потом», 19.10 — платных генераций пока не делаем. Чтобы посты одного дилера не были
// близнецами, разнообразие держится на трёх вещах:
//   • у каждого слайда несколько вариантов фраз;
//   • часть фраз — от данных машины: помечены [признак] и попадают в выбор, только если
//     признак у машины есть (малый пробег, гибрид, без смены владельца… — carFacts ниже);
//   • выбор помнит, что дилер уже получал (choose ниже, память — server/carousel.mjs):
//     сначала берётся фраза, которой у него ещё не было, потом — самая давняя.
//
// Разметка строк:
//   [признак] — в начале строки: фраза только для машин с этим признаком (CarFact);
//   {слово}   — акцент: рисуется цветом акцента бренда («Комфорт в каждой {детали}»);
//   %model%   — марка и модель, %brand% — компания клиента, %engine% — объём («2,0 л»),
//   %mileage% — пробег («28 000 км»), %year% — год, %options% — «44 опции»,
//   %seats% — «7 мест»;
//   \n        — перенос строки в заголовке.
//
// Важно: в текстах нет утверждений про оснащение («LED-оптика», «панорамная крыша»).
// Шаблон один на все машины, а у конкретной машины этого может не быть — опции на слайд
// идут только из её данных, с иконками. Здесь — общие слова про класс и впечатление, а
// конкретика — только через признаки, посчитанные по данным этой машины.
import type {CarouselCar} from '../../shared/types';
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
  // «Классика» (7 слайдов 9:16): у неё своя вёрстка без акцентов в заголовках, поэтому и
  // фразы свои — простым текстом
  classic: {
    tagline: string[]; swipe: string[];
    interior: string[]; technology: string[]; specs: string[];
    price: string[]; priceLabel: string[];
    historyClean: string[]; historyClaims: string[]; historyNone: string[]; cleanNote: string[];
    ctaTitle: string[]; ctaText: string[];
  };
};

const RU: Copy = {
  cover: {
    tagline: [
      'Автомобили\nиз Кореи', 'Прямой импорт\nиз Кореи', 'Проверенные авто\nиз Южной Кореи', 'Авто под заказ\nиз Кореи',
      '[premium] Премиум\nиз Кореи', '[low] Малый пробег\nиз Кореи',
    ],
    strap: [
      'Надёжный · Комфортный · Стильный', 'Проверен · Готов к отправке', 'Честная история · Прямой импорт',
      '[low] Пробег всего %mileage%', '[oneOwner] Без смены владельца · %year%', '[clean] Без страховых случаев · %year%',
      '[rich] %options% в комплектации', '[fresh] %year% год · %mileage%',
    ],
    benefits: [
      [{icon: 'shield', text: 'Проверенное\nкачество'}, {icon: 'plane', text: 'Прямой импорт\nиз Кореи'}, {icon: 'handshake', text: 'Выгодные\nусловия'}],
      [{icon: 'file', text: 'Честная\nистория'}, {icon: 'search', text: 'Осмотр перед\nпокупкой'}, {icon: 'ship', text: 'Доставка\nдо порта'}],
      [{icon: 'shield', text: 'Проверка\nдо покупки'}, {icon: 'file', text: 'Документы\nдля экспорта'}, {icon: 'handshake', text: 'Сопровождение\nсделки'}],
    ],
  },
  exterior: {
    kicker: ['Экстерьер', 'Внешний вид', 'Кузов'],
    title: [
      'Современный\nи стильный {дизайн}', 'Выразительный\n{характер}', 'Узнаваемый\n{силуэт}', 'Уверенный\n{стиль}',
      '[premium] Премиальный\n{облик}', '[fresh] Современный\n{облик}',
    ],
    text: [
      'Выразительный силуэт и фирменный стиль %model% — машина, которая выделяется в потоке.',
      'Чистые линии кузова и продуманные пропорции: %model% смотрится уверенно с любого ракурса.',
      'Узнаваемый облик %model% — сдержанный, современный и без лишнего.',
      '[premium] %model% — премиальный характер, заметный с первого взгляда.',
      '[fresh] %model% %year% года — современный облик, который не устареет завтра.',
      '[mature] %model% — облик, который и сегодня смотрится достойно.',
    ],
  },
  interior: {
    kicker: ['Интерьер', 'Салон', 'Внутри'],
    title: [
      'Комфорт\nв каждой {детали}', 'Комфорт\nи {технологии}', 'Салон, в котором\n{хочется ехать}',
      '[family] Место\n{для всей семьи}', '[rich] Богатая\n{комплектация}', '[premium] Салон\n{премиум-класса}',
    ],
    text: [
      'Просторный салон, качественные материалы и опции для комфорта в каждой поездке.',
      'Всё под рукой: продуманная эргономика и оснащение, которое работает на вас каждый день.',
      'Тихо, удобно и просторно — и в городе, и в дальней дороге.',
      '[family] %seats% — просторно и для семьи, и для дальних поездок.',
      '[rich] %options% в комплектации — комфорт продуман до мелочей.',
      '[premium] Материалы и отделка премиум-класса — в каждой детали салона.',
    ],
  },
  details: {
    kicker: ['Детали', 'Подробнее'],
    title: ['Детали, которые\n{впечатляют}', 'Продуманные\n{мелочи}', '[rich] {%options%}\nв комплектации'],
    text: [
      'Из таких мелочей и складывается впечатление от машины.', 'То, что замечаешь не сразу, но ценишь каждый день.',
      '[rich] Опций много — на слайде лишь часть, полный список пришлём по запросу.',
    ],
  },
  engine: {
    kicker: ['Двигатель', 'Динамика', 'Под капотом'],
    title: [
      'Надёжный\n{%engine%}', 'Уверенная\n{динамика}', 'Проверенный\n{агрегат}',
      '[diesel] Тяговитый\n{дизель}', '[hybrid] Экономичный\n{гибрид}', '[electric] Тихий\n{электромотор}', '[low] Пробег —\n{%mileage%}',
    ],
    text: [
      'Проверенный двигатель обеспечивает уверенную динамику и спокойствие в любых условиях.',
      'Мощности хватает и на трассе, и в городе — без лишнего расхода.',
      'Агрегат, который знают и умеют обслуживать — без сюрпризов на годы вперёд.',
      '[diesel] Дизель с запасом тяги — уверенно на трассе и экономно в дальней дороге.',
      '[hybrid] Гибрид: тише в городе и меньше расход на каждом километре.',
      '[electric] Электромобиль: тишина, мгновенный отклик и никакого бензина.',
      '[low] Всего %mileage% на одометре — ресурс почти не тронут.',
      '[gas] Бензиновый мотор — мягкий, тихий и неприхотливый в обслуживании.',
    ],
  },
  safety: {
    kicker: ['Безопасность', 'Защита'],
    title: ['Ваша уверенность\n{на дороге}', 'Безопасность\n{на первом месте}', 'Под надёжной\n{защитой}'],
    text: [
      'Системы помощи водителю делают каждую поездку безопаснее и спокойнее.',
      'Современная электроника бережёт водителя и пассажиров.',
      'Каждая поездка спокойнее: электроника следит за дорогой вместе с вами.',
    ],
  },
  historyClean: {
    kicker: ['История авто', 'Отчёт Encar'],
    title: ['Страховых случаев\n{нет}', 'Чистая\n{история}', '[oneOwner] Без смены\n{владельца}'],
    text: [
      'По данным страховых — ни одного случая. Полный отчёт Encar — до покупки.',
      'Страховые компании не знают об этой машине ничего плохого. Отчёт Encar — до покупки.',
      '[oneOwner] Ни одного страхового случая и ни одной смены владельца. Полный отчёт Encar — до покупки.',
    ],
  },
  historyClaims: {
    kicker: ['История авто', 'Отчёт Encar'],
    title: ['Честная\n{история}', 'Ничего\n{не скрываем}', 'Всё\n{по-честному}'],
    text: [
      'Каждый случай — с суммой выплаты. Полный отчёт Encar — до покупки.',
      'Покажем всё, что было: даты, суммы и что ремонтировали. Отчёт Encar — до покупки.',
    ],
  },
  historyNone: {
    kicker: ['История авто', 'Отчёт Encar'],
    title: ['Отчёт\n{по запросу}', 'Вся история —\n{до покупки}'],
    text: ['Пришлём полный отчёт Encar о страховых случаях до покупки.', 'Отчёт Encar о страховых случаях — по вашему запросу, до сделки.'],
  },
  rear: {
    kicker: ['Внешний вид', 'Вид сзади'],
    title: ['%model%'],
    text: [
      'Впечатляет с любого ракурса', 'Качество, проверенное временем', 'Достойно с любой стороны',
      '[low] Всего %mileage% на одометре', '[fresh] %year% год выпуска',
    ],
  },
  gallery: {kicker: ['Галерея', 'Фото', 'Больше фото']},
  price: {
    kicker: ['Цена', 'Стоимость'],
    // Пять подписей, а не две: в пресетах подпись цены — единственные слова слайда цены, и с двумя
    // вариантами у дилера она повторялась уже с третьей карусели (проба 19.10). Только «в Корее»:
    // цену клиент может вписать свою (с маржой), поэтому «без доставки» и подобное не обещаем
    title: ['Цена\n{в Корее}', 'Стоимость\n{в Корее}', 'Цена машины\n{в Корее}', 'Стоимость авто\n{в Корее}', 'Цена на рынке\n{Кореи}'],
    text: [''],
  },
  why: {
    kicker: ['Почему %brand%?', 'Как мы работаем', 'Наш подход'],
    title: ['С нами просто\n{и безопасно}', 'Работаем\n{честно}', 'Сделка\n{под ключ}'],
    text: [''],
    benefits: [
      [
        {icon: 'shield', text: 'Полная проверка\nавто перед покупкой'}, {icon: 'file', text: 'Оформление\nи экспорт из Кореи'},
        {icon: 'ship', text: 'Надёжная логистика\nдо вашего порта'}, {icon: 'headset', text: 'Поддержка\nна всех этапах сделки'},
      ],
      [
        {icon: 'search', text: 'Осмотр машины\nна месте'}, {icon: 'file', text: 'Все документы\nдля экспорта'},
        {icon: 'ship', text: 'Отправка\nдо вашего порта'}, {icon: 'headset', text: 'На связи\nдо получения'},
      ],
    ],
  },
  cta: {
    kicker: ['Готовы к сотрудничеству?', 'На связи', 'Свяжитесь с нами'],
    title: ['%model%\n{уже доступен}', 'Хотите\n{эту машину?}', 'Узнайте\n{полную цену}', '[low] Малый пробег —\n{пишите первым}'],
    text: [
      'Свяжитесь с нами, чтобы получить консультацию, актуальную цену и условия доставки.',
      'Напишите нам — посчитаем полную стоимость с доставкой до вашей страны.',
      'Пришлём больше фото, отчёт и расчёт доставки — просто напишите.',
    ],
    guarantees: [
      [{icon: 'eye', text: 'Прозрачные\nусловия'}, {icon: 'search', text: 'Проверка\nперед покупкой'}, {icon: 'ship', text: 'Доставка\nдо порта'}],
      [{icon: 'shield', text: 'Быстрая\nпроверка'}, {icon: 'card', text: 'Прозрачные\nусловия'}, {icon: 'handshake', text: 'Надёжный\nпартнёр'}],
      [{icon: 'file', text: 'Честная\nистория'}, {icon: 'ship', text: 'Доставка\nдо порта'}, {icon: 'headset', text: 'Поддержка\nна всех этапах'}],
    ],
    button: {whatsapp: 'Написать в WhatsApp', telegram: 'Написать в Telegram'},
  },
  engineRows: {fuel: 'Топливо', transmission: 'Трансмиссия', mileage: 'Пробег', volume: 'Объём'},
  classic: {
    tagline: [
      'Прямой импорт из Кореи', 'Авто из Южной Кореи', '[low] Малый пробег', '[clean] Без страховых случаев',
      '[oneOwner] Без смены владельца', '[premium] Премиум из Кореи', '[fresh] Свежий год выпуска',
    ],
    swipe: ['Листайте →', 'Смотрите дальше →', 'Все детали — дальше →'],
    interior: ['Салон', 'Интерьер', 'Внутри'],
    technology: ['Технологии и безопасность', 'Безопасность и помощники', 'Электроника'],
    specs: ['Характеристики', 'Коротко о машине', 'В цифрах'],
    price: ['Цена', 'Стоимость'],
    priceLabel: ['Цена в Корее', 'Стоимость в Корее', 'Цена машины в Корее', 'Стоимость авто в Корее', 'Цена на рынке Кореи'],
    historyClean: ['Страховых случаев нет', 'Чистая история', '[oneOwner] Чисто и без смены владельца'],
    historyClaims: ['Ничего не скрываем', 'Честная история', 'Всё по-честному'],
    historyNone: ['Отчёт — по запросу', 'Историю пришлём до покупки'],
    cleanNote: [
      'У страховых компаний записей нет. Полный отчёт Encar — до покупки.',
      'Страховые компании не знают об этой машине ничего плохого. Отчёт Encar — до покупки.',
    ],
    ctaTitle: ['Хотите эту машину?', 'Понравилась машина?', 'Узнайте полную цену', '[low] Такой пробег — редкость'],
    ctaText: [
      'Напишите нам — посчитаем полную стоимость с доставкой до вашей страны',
      'Пришлём больше фото, отчёт и расчёт доставки — просто напишите',
      'Ответим на вопросы и посчитаем доставку до вашего города',
    ],
  },
};

const EN: Copy = {
  cover: {
    tagline: [
      'Cars\nfrom Korea', 'Direct import\nfrom Korea', 'Verified cars\nfrom South Korea', 'Cars to order\nfrom Korea',
      '[premium] Premium\nfrom Korea', '[low] Low mileage\nfrom Korea',
    ],
    strap: [
      'Reliable · Comfortable · Stylish', 'Inspected · Ready to ship', 'Honest history · Direct import',
      '[low] Only %mileage%', '[oneOwner] No owner changes · %year%', '[clean] No insurance claims · %year%',
      '[rich] %options% fitted', '[fresh] %year% · %mileage%',
    ],
    benefits: [
      [{icon: 'shield', text: 'Verified\nquality'}, {icon: 'plane', text: 'Direct import\nfrom Korea'}, {icon: 'handshake', text: 'Fair\nterms'}],
      [{icon: 'file', text: 'Honest\nhistory'}, {icon: 'search', text: 'Pre-purchase\ninspection'}, {icon: 'ship', text: 'Shipping\nto your port'}],
      [{icon: 'shield', text: 'Inspection\nbefore purchase'}, {icon: 'file', text: 'Export\npaperwork'}, {icon: 'handshake', text: 'Deal\nsupport'}],
    ],
  },
  exterior: {
    kicker: ['Exterior', 'Design', 'Body'],
    title: [
      'Modern\nand {stylish}', 'Distinctive\n{character}', 'Unmistakable\n{silhouette}', 'Confident\n{style}',
      '[premium] Premium\n{presence}', '[fresh] A modern\n{look}',
    ],
    text: [
      'A confident silhouette and signature styling — the %model% stands out on the road.',
      'Clean body lines and balanced proportions: the %model% looks right from every angle.',
      'The recognisable %model% look — understated, modern and clean.',
      '[premium] The %model% — premium character you notice at first glance.',
      '[fresh] A %year% %model% — a modern look that won\'t date tomorrow.',
      '[mature] The %model% — a look that still holds its own today.',
    ],
  },
  interior: {
    kicker: ['Interior', 'Cabin', 'Inside'],
    title: [
      'Comfort\nin every {detail}', 'Comfort\nand {technology}', 'A cabin you\n{want to drive in}',
      '[family] Room\n{for the whole family}', '[rich] Generously\n{equipped}', '[premium] A premium\n{cabin}',
    ],
    text: [
      'A spacious cabin, quality materials and features that make every trip comfortable.',
      'Everything within reach: thoughtful ergonomics and equipment that works for you daily.',
      'Quiet, comfortable and roomy — in the city and on long drives.',
      '[family] %seats% — room for the family and for long trips.',
      '[rich] %options% fitted — comfort thought through to the last detail.',
      '[premium] Premium materials and finish in every corner of the cabin.',
    ],
  },
  details: {
    kicker: ['Details', 'Up close'],
    title: ['Details that\n{impress}', 'Thoughtful\n{touches}', '[rich] {%options%}\nfitted'],
    text: [
      'Small things add up to how a car feels.', 'Things you notice later and appreciate every day.',
      '[rich] Plenty of features — here are a few, ask us for the full list.',
    ],
  },
  engine: {
    kicker: ['Engine', 'Performance', 'Under the hood'],
    title: [
      'Reliable\n{%engine%}', 'Confident\n{performance}', 'Proven\n{powertrain}',
      '[diesel] Torquey\n{diesel}', '[hybrid] Efficient\n{hybrid}', '[electric] Silent\n{electric drive}', '[low] Only\n{%mileage%}',
    ],
    text: [
      'A proven engine delivers confident performance and peace of mind in any conditions.',
      'Enough power for the highway and the city — without excess fuel.',
      'A powertrain mechanics know well — no surprises for years to come.',
      '[diesel] A diesel with torque to spare — confident on the highway and frugal on long drives.',
      '[hybrid] A hybrid: quieter in town and less fuel every mile.',
      '[electric] Fully electric: silence, instant response and no petrol.',
      '[low] Only %mileage% on the clock — barely run in.',
      '[gas] A petrol engine — smooth, quiet and easy to maintain.',
    ],
  },
  safety: {
    kicker: ['Safety', 'Protection'],
    title: ['Confidence\n{on the road}', 'Safety\n{comes first}', 'Well\n{protected}'],
    text: [
      'Driver assistance systems make every trip safer and calmer.', 'Modern electronics look after the driver and passengers.',
      'Every trip feels calmer: the electronics watch the road with you.',
    ],
  },
  historyClean: {
    kicker: ['Vehicle history', 'Encar report'],
    title: ['No insurance\n{claims}', 'A clean\n{record}', '[oneOwner] No owner\n{changes}'],
    text: [
      'Nothing on record with the insurers. Full Encar report supplied before purchase.',
      'Insurers have nothing bad on record for this car. Encar report supplied before purchase.',
      '[oneOwner] Not a single insurance claim and no owner changes. Full Encar report supplied before purchase.',
    ],
  },
  historyClaims: {
    kicker: ['Vehicle history', 'Encar report'],
    title: ['An honest\n{history}', 'Nothing\n{hidden}', 'All\n{above board}'],
    text: [
      'Every claim with its payout. Full Encar report supplied before purchase.',
      'We show everything: dates, amounts and what was repaired. Encar report before purchase.',
    ],
  },
  historyNone: {
    kicker: ['Vehicle history', 'Encar report'],
    title: ['Report\n{on request}', 'Full history\n{before purchase}'],
    text: ['We will send the full Encar insurance report before purchase.', 'Encar insurance report on your request, before the deal.'],
  },
  rear: {
    kicker: ['Exterior', 'Rear view'],
    title: ['%model%'],
    text: [
      'Impressive from every angle', 'Quality that stands the test of time', 'Looks right from any side',
      '[low] Only %mileage% on the clock', '[fresh] Built in %year%',
    ],
  },
  gallery: {kicker: ['Gallery', 'Photos', 'More photos']},
  price: {kicker: ['Price', 'Cost'], title: ['Price\n{in Korea}', 'Cost\n{in Korea}', 'Vehicle price\n{in Korea}', 'Car price\n{in Korea}', 'Market price\n{in Korea}'], text: ['']},
  why: {
    kicker: ['Why %brand%?', 'How we work', 'Our approach'],
    title: ['Simple\n{and safe}', 'We work\n{honestly}', 'A turnkey\n{deal}'],
    text: [''],
    benefits: [
      [
        {icon: 'shield', text: 'Full inspection\nbefore purchase'}, {icon: 'file', text: 'Paperwork\nand export from Korea'},
        {icon: 'ship', text: 'Reliable shipping\nto your port'}, {icon: 'headset', text: 'Support\nat every step'},
      ],
      [
        {icon: 'search', text: 'On-site\ninspection'}, {icon: 'file', text: 'All export\npaperwork'},
        {icon: 'ship', text: 'Shipping\nto your port'}, {icon: 'headset', text: 'In touch\nuntil delivery'},
      ],
    ],
  },
  cta: {
    kicker: ['Ready to talk?', 'Get in touch', 'Contact us'],
    title: ['%model%\n{is available}', 'Want\n{this car?}', 'Get the\n{full price}', '[low] Low mileage —\n{be first}'],
    text: [
      'Message us for a consultation, the current price and delivery terms.',
      'Write to us — we will quote the full landed cost to your country.',
      'We will send more photos, the report and a shipping quote — just message us.',
    ],
    guarantees: [
      [{icon: 'eye', text: 'Transparent\nterms'}, {icon: 'search', text: 'Pre-purchase\ninspection'}, {icon: 'ship', text: 'Shipping\nto your port'}],
      [{icon: 'shield', text: 'Fast\ninspection'}, {icon: 'card', text: 'Transparent\nterms'}, {icon: 'handshake', text: 'Reliable\npartner'}],
      [{icon: 'file', text: 'Honest\nhistory'}, {icon: 'ship', text: 'Shipping\nto port'}, {icon: 'headset', text: 'Support\nat every step'}],
    ],
    button: {whatsapp: 'Message on WhatsApp', telegram: 'Message on Telegram'},
  },
  engineRows: {fuel: 'Fuel', transmission: 'Transmission', mileage: 'Mileage', volume: 'Engine'},
  classic: {
    tagline: [
      'Direct import from Korea', 'Cars from South Korea', '[low] Low mileage', '[clean] No insurance claims',
      '[oneOwner] No owner changes', '[premium] Premium from Korea', '[fresh] Recent model year',
    ],
    swipe: ['Swipe →', 'See more →', 'All the details →'],
    interior: ['Interior', 'Cabin', 'Inside'],
    technology: ['Technology & safety', 'Safety & assistance', 'Electronics'],
    specs: ['Specifications', 'At a glance', 'By the numbers'],
    price: ['Price', 'Cost'],
    priceLabel: ['Price in Korea', 'Cost in Korea', 'Vehicle price in Korea', 'Car price in Korea', 'Market price in Korea'],
    historyClean: ['No accident record', 'A clean record', '[oneOwner] Clean, no owner changes'],
    historyClaims: ['Nothing hidden', 'An honest history', 'All above board'],
    historyNone: ['Report available on request', 'History sent before purchase'],
    cleanNote: [
      'Nothing on record with the insurers. Full Encar report supplied before purchase.',
      'Insurers have nothing bad on record for this car. Encar report supplied before purchase.',
    ],
    ctaTitle: ['Want this car?', 'Like this car?', 'Get the full price', '[low] Mileage like this is rare'],
    ctaText: [
      'Message us for the full landed cost to your country',
      'We will send more photos, the report and a shipping quote — just message us',
      'We will answer questions and quote delivery to your city',
    ],
  },
};

export const COPY: Record<CarouselLang, Copy> = {ru: RU, en: EN};

// Страна происхождения машины. Тексты написаны под Корею (Encar — первый источник); для машин
// из Китая (che168, с 11.10) и Японии (Carsensor, с 12.10) те же фразы с другой страной. Заменой,
// а не вторым набором текстов: варианты фраз и зерно остаются одними, и новая фраза сама получит
// нужную страну. Порядок важен: «Южной Кореи» раньше «Кореи», иначе вышло бы «Южной Китая»
const ORIGIN_SWAP: Record<string, Record<CarouselLang, [RegExp, string][]>> = {
  CN: {
    ru: [[/Южной Кореи/g, 'Китая'], [/Южная Корея/g, 'Китай'], [/Кореи/g, 'Китая'], [/Корее/g, 'Китае'], [/Корея/g, 'Китай']],
    en: [[/South Korea/g, 'China'], [/Korea/g, 'China']],
  },
  JP: {
    ru: [[/Южной Кореи/g, 'Японии'], [/Южная Корея/g, 'Япония'], [/Кореи/g, 'Японии'], [/Корее/g, 'Японии'], [/Корея/g, 'Япония']],
    en: [[/South Korea/g, 'Japan'], [/Korea/g, 'Japan']],
  },
};
const swapDeep = <T,>(v: T, swaps: [RegExp, string][]): T => {
  if (typeof v === 'string') return swaps.reduce<string>((s, [re, to]) => s.replace(re, to), v) as T;
  if (Array.isArray(v)) return v.map((x) => swapDeep(x, swaps)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapDeep(x, swaps)])) as T;
  return v;
};
const byOrigin = new Map<string, Copy>();
/** Тексты слайдов на языке и для страны машины: KR (по умолчанию) — как написаны, CN/JP — своя страна */
export const copyFor = (lang: CarouselLang, origin?: string): Copy => {
  const swaps = origin ? ORIGIN_SWAP[origin]?.[lang] : undefined;
  if (!swaps) return COPY[lang];
  const key = `${lang}:${origin}`;
  if (!byOrigin.has(key)) byOrigin.set(key, swapDeep(COPY[lang], swaps));
  return byOrigin.get(key)!;
};
/** Та же замена для любых данных (подписи вёрстки в i18n/index.ts) */
export const forOrigin = <T,>(v: T, lang: CarouselLang, origin?: string): T => {
  const swaps = origin ? ORIGIN_SWAP[origin]?.[lang] : undefined;
  return swaps ? swapDeep(v, swaps) : v;
};

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

// ——— Признаки машины: из них фразы с пометкой [признак] ———

export type CarFact = 'low' | 'fresh' | 'mature' | 'diesel' | 'hybrid' | 'electric' | 'gas'
  | 'premium' | 'rich' | 'oneOwner' | 'clean' | 'family';

// Марки, у которых слова «премиум» на слайде — правда, а не лесть. Сравнение — по началу
// названия строчными: шлюзы пишут то «Mercedes-Benz», то «Benz», то «Porshe» (словарь kmotors)
const PREMIUM = ['mercedes', 'benz', 'bmw', 'audi', 'genesis', 'lexus', 'porsche', 'porshe', 'volvo', 'land rover',
  'range rover', 'jaguar', 'maserati', 'bentley', 'rolls', 'cadillac', 'lincoln', 'infiniti', 'acura', 'tesla', 'mini'];

/**
 * Что про эту машину можно сказать словами, не соврав. Пороги — по живым машинам в каруселях
 * владельца (19.10): средний пробег там ~15 тыс. км в год, поэтому «малый» — меньше 10 тыс.
 * в год или меньше 30 тыс. всего; «богатая» — от 40 опций (у Genesis GV70 их 53, у Tivoli 34).
 * Нет данных — нет признака: «малый пробег» у машины без пробега был бы выдумкой.
 */
export const carFacts = (car: CarouselCar, now = new Date()): Set<CarFact> => {
  const f = new Set<CarFact>();
  const age = car.year ? Math.max(0, now.getFullYear() - car.year) : null;
  const km = car.mileageKm;
  if (km !== null && km !== undefined && (km < 30_000 || (age !== null && km / Math.max(1, age) < 10_000))) f.add('low');
  if (age !== null && age <= 3) f.add('fresh');
  if (age !== null && age >= 8) f.add('mature');
  const fuel = (car.fuel ?? '').toLowerCase();
  if (fuel.includes('hybrid') || fuel.includes('+ electric')) f.add('hybrid');
  else if (fuel === 'electric') f.add('electric');
  else if (fuel === 'diesel') f.add('diesel');
  else if (fuel === 'gasoline') f.add('gas');
  const brand = (car.brand ?? '').toLowerCase();
  if (PREMIUM.some((p) => brand.startsWith(p))) f.add('premium');
  if ((car.options?.total ?? 0) >= 40) f.add('rich');
  if (car.history && car.history.ownerChanges === 0) f.add('oneOwner');
  if (car.history && car.history.accidentsTotal === 0) f.add('clean');
  if ((car.seats ?? 0) >= 7) f.add('family');
  return f;
};

const TAG = /^\[(\w+)\]\s*/;
/** Признак фразы: «[low] Пробег всего …» → low; без пометки — null (фраза для любой машины) */
export const factOf = (s: string): string | null => TAG.exec(s)?.[1] ?? null;

/** Память выбора: ключ фразы → какие варианты дилер получал, последний — в конце */
export type Recent = Record<string, string[]>;

/**
 * Выбор фразы с памятью дилера (решение владельца 19.10: «без повторов у дилера»).
 *
 * Из вариантов остаются подходящие машине: без пометки и с признаком, который у неё есть.
 * Среди них — тот, которого дилер ещё не получал; все были — самый давний. При равенстве
 * фраза от данных машины идёт раньше общей: «Пробег всего 28 000 км» говорит больше, чем
 * «Надёжный · Комфортный». Последняя ничья решается зерном — так «Пересобрать» с тем же
 * зерном и той же памятью даёт те же слайды.
 *
 * id — как запомнить вариант: у строк — сама строка, у наборов значков — номер набора.
 */
export const choose = <T,>(items: T[], seed: number, key: string, facts: Set<string>, recent?: Recent,
  id: (t: T, i: number) => string = (t) => String(t)): {item: T; id: string} => {
  const all = items.map((item, i) => ({item, id: id(item, i), fact: typeof item === 'string' ? factOf(item) : null}));
  const fit = all.filter((x) => !x.fact || facts.has(x.fact));
  const pool = fit.length ? fit : all;
  const used = recent?.[key] ?? [];
  const age = (x: {id: string}) => used.lastIndexOf(x.id);
  const oldest = Math.min(...pool.map(age));
  let best = pool.filter((x) => age(x) === oldest);
  if (best.some((x) => x.fact)) best = best.filter((x) => x.fact);
  const chosen = pick(best, seed, key);
  return {item: chosen.item, id: chosen.id};
};

/** Подставить данные машины: %model%, %brand%, %engine%, %mileage%…; пометка [признак] срезается */
export const fill = (s: string, vars: Record<string, string>) =>
  s.replace(TAG, '').replace(/%(\w+)%/g, (_m, k) => vars[k] ?? '');
