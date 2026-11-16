// Коммерческое предложение (КП) дилера: настройки по умолчанию и расчёт.
// Общий модуль: сервер собирает по нему PDF, интерфейс показывает итог до сборки —
// поэтому без React и без файлов.
//
// Где что живёт (SaaS: у каждого дилера своё):
//   profile.company, contacts, pricing.currency, language — уже есть в профиле, не дублируем;
//   profile.offer.dealer   — реквизиты для шапки (юр. название, рег. номера, адрес, подписант);
//   profile.offer.template — шаблон: заголовок, строки расчёта, условия, нумерация, что показывать;
//   запрос на сборку        — кому, суммы этого раза, разовые строки.
// Подробно — docs/offer-pdf.md.

import {currencyCode, krwPerUnit} from './currencies.js';

/** Виды строк расчёта */
export const COST_TYPES = /** @type {const} */ (['car', 'fixed', 'percent', 'manual']);

// Типовой шаблон КП — на языке компании. С него дилер начинает и на нём же видит образец в
// настройках сразу, ещё ничего не заполнив (владелец 16.11: «собери типовой пример, на котором
// пользователи смогут тестировать»). Суммы — только виды строк, без чисел: валюта у всех своя,
// «1 500» в вонах и в евро — разные деньги. Комиссия — процентом, он от валюты не зависит
const DEFAULT_TEXTS = {
  ru: {
    title: '{brand} {model} {year}\nпод ключ',
    intro: 'Предлагаем приобрести {brand} {model} {year} года. Мы проверяем машину перед покупкой, оформляем документы и доставляем её до вас. Цена зафиксирована на срок действия предложения.',
    car: 'Стоимость автомобиля',
    delivery: 'Доставка', deliveryNote: 'до вашего города, со страховкой груза',
    customs: 'Таможенное оформление', customsNote: 'по расчёту брокера',
    fee: 'Услуги компании', feeNote: 'подбор, проверка, сопровождение сделки',
    totalLabel: 'Итого под ключ',
    totalNote: 'с доставкой и растаможкой',
    disclaimer: 'Цена действительна до даты, указанной в предложении. Окончательная сумма таможенных платежей — по декларации.',
    sections: [
      ['Условия', ['Предоплата 30% после подписания договора.', 'Остаток — после прибытия автомобиля.', 'Срок доставки — 30–60 дней.']],
      ['Что входит', ['Проверка кузова, пробега и истории ДТП.', 'Фото- и видеоотчёт перед покупкой.', 'Все документы для регистрации.']],
    ],
  },
  en: {
    title: '{brand} {model} {year}\nturnkey',
    intro: 'We are pleased to offer you a {year} {brand} {model}. We inspect the car before purchase, handle the paperwork and deliver it to you. The price is fixed for the validity period of this offer.',
    car: 'Vehicle price',
    delivery: 'Delivery', deliveryNote: 'to your city, cargo insured',
    customs: 'Customs clearance', customsNote: 'as calculated by the broker',
    fee: 'Service fee', feeNote: 'sourcing, inspection, deal support',
    totalLabel: 'Turnkey total',
    totalNote: 'including delivery and customs',
    disclaimer: 'The price is valid until the date stated in this offer. Final customs duties are as per the declaration.',
    sections: [
      ['Terms', ['30% prepayment after signing the contract.', 'Balance on arrival of the vehicle.', 'Delivery time: 30–60 days.']],
      ['Included', ['Body, mileage and accident history check.', 'Photo and video report before purchase.', 'All documents for registration.']],
    ],
  },
  sq: {
    title: '{brand} {model} {year}\nçelës në dorë',
    intro: 'Ju ofrojmë {brand} {model} të vitit {year}. E kontrollojmë makinën para blerjes, përgatisim dokumentet dhe jua dorëzojmë. Çmimi është i fiksuar për periudhën e vlefshmërisë së ofertës.',
    car: 'Çmimi i automjetit',
    delivery: 'Transporti', deliveryNote: 'deri në qytetin tuaj, me sigurim',
    customs: 'Zhdoganimi', customsNote: 'sipas llogaritjes së agjentit',
    fee: 'Shërbimi i kompanisë', feeNote: 'përzgjedhja, kontrolli, shoqërimi i marrëveshjes',
    totalLabel: 'Totali çelës në dorë',
    totalNote: 'me transport dhe zhdoganim',
    disclaimer: 'Çmimi është i vlefshëm deri në datën e treguar në ofertë. Detyrimet doganore përfundimtare — sipas deklaratës.',
    sections: [
      ['Kushtet', ['Parapagim 30% pas nënshkrimit të kontratës.', 'Pjesa tjetër pas mbërritjes së automjetit.', 'Afati i dorëzimit: 30–60 ditë.']],
      ['Përfshihet', ['Kontrolli i karrocerisë, kilometrazhit dhe aksidenteve.', 'Raport me foto dhe video para blerjes.', 'Të gjitha dokumentet për regjistrim.']],
    ],
  },
};

/** Шаблон, с которого дилер начинает, на его языке */
export const defaultTemplate = (language) => {
  const x = DEFAULT_TEXTS[language] || DEFAULT_TEXTS.en;
  return {
    numbering: {prefix: language === 'ru' ? 'КП' : 'OF', next: 1},
    validityDays: 14,
    title: x.title,
    intro: x.intro,
    costLines: [
      {id: 'car', type: 'car', label: x.car, note: '', hidden: false},
      {id: 'delivery', type: 'manual', label: x.delivery, note: x.deliveryNote, hidden: false},
      {id: 'customs', type: 'manual', label: x.customs, note: x.customsNote, hidden: false},
      {id: 'fee', type: 'percent', label: x.fee, note: x.feeNote, hidden: false, percent: 5},
    ],
    totalLabel: x.totalLabel,
    totalNote: x.totalNote,
    showBreakdown: true,
    showPurchasePrice: false,
    disclaimer: x.disclaimer,
    sections: x.sections.map(([title, items]) => ({title, items})),
    // gallery — крупные фото в конце, по два на лист (владелец 16.11)
    show: {requisites: true, recipient: true, specs: true, photos: 6, gallery: 6, signature: true, stamp: true},
  };
};

/**
 * Суммы «вписать в КП» для образца: доля цены машины. Только образцу — он с «ОБРАЗЕЦ» поперёк,
 * и без чисел в этих строках дилер не увидел бы, как выглядит итог. Доли — порядок величин для
 * машины из Кореи (доставка ~6%, растаможка ~15%), не расчёт
 */
export const SAMPLE_SHARES = [0.06, 0.15, 0.08];
export const sampleAmounts = (template, carPrice) => {
  if (carPrice === null) return {};
  const manual = template.costLines.filter((l) => l.type === 'manual');
  return Object.fromEntries(manual.map((l, i) => [l.id, Math.round(carPrice * SAMPLE_SHARES[i % SAMPLE_SHARES.length])]));
};

export const defaultDealer = () => ({
  legalName: '',
  requisites: [],
  address: '',
  phone: '',
  email: '',
  signer: {name: '', position: ''},
});

/** Настройки КП компании с дефолтами: в старом профиле поля offer нет вовсе */
export const offerSettings = (profile) => {
  const saved = profile?.offer || {};
  const base = defaultTemplate(profile?.language);
  return {
    dealer: {...defaultDealer(), ...saved.dealer, signer: {...defaultDealer().signer, ...saved.dealer?.signer}},
    template: {...base, ...saved.template,
      numbering: {...base.numbering, ...saved.template?.numbering},
      show: {...base.show, ...saved.template?.show}},
  };
};

/** Номер документа: «КП-2026-0007». Счётчик растёт с каждой сборкой */
export const docNumber = (numbering, date) =>
  `${numbering.prefix ? `${numbering.prefix}-` : ''}${date.getFullYear()}-${String(numbering.next).padStart(4, '0')}`;

/**
 * Цена машины на площадке в валюте компании — без фрахта и без «Цены в ролике»: в КП
 * доставка и наценка — свои строки, иначе их посчитали бы дважды. Не округляем до сотен —
 * круглую цену дилер впишет сам (правило цен KOK, 11.10). null — цены нет или нет курса.
 * @param {{carPriceKrw?: number|null, carPriceUsd?: number|null, krwPerUsd?: number|null}} lot
 * @param {string} currency
 * @param {Record<string, number>} usdRates — единиц за $1 на сегодня
 */
export const carPriceIn = (lot, currency, usdRates) => {
  const cur = currencyCode(currency);
  const krwPerUsd = lot.krwPerUsd || usdRates?.KRW || null;
  const krw = lot.carPriceKrw ?? (lot.carPriceUsd && krwPerUsd ? lot.carPriceUsd * krwPerUsd : null);
  if (cur === 'USD') {
    if (lot.carPriceUsd) return Math.round(lot.carPriceUsd);
    return krw && krwPerUsd ? Math.round(krw / krwPerUsd) : null;
  }
  if (krw === null || krw === undefined) return null;
  if (cur === 'KRW') return Math.round(krw);
  const per = krwPerUnit(cur, usdRates);
  return per ? Math.round(krw / per) : null;
};

const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Расчёт: строки шаблона + суммы этого КП → что видит клиент и итог.
 *
 * Скрытая строка (hidden) входит в итог, но в документе растворяется в цене машины —
 * так дилер закладывает маржу, и строки расчёта всё равно сходятся с итогом.
 * Закупочную цену и курс показываем, только если дилер сам включил showPurchasePrice
 * и ничего к машине не подмешано — иначе строка выдала бы наценку.
 *
 * @param {{carPrice: number|null, template: any, amounts?: Record<string, number|string>,
 *   extraLines?: {label: string, note?: string, amount: number|string}[]}} p
 */
export const calcOffer = ({carPrice, template, amounts = {}, extraLines = []}) => {
  const lines = template.costLines.map((l) => {
    let amount = num(amounts[l.id]);
    if (amount === null) {
      if (l.type === 'car') amount = carPrice;
      else if (l.type === 'fixed') amount = num(l.amount);
      else if (l.type === 'percent') amount = carPrice === null ? null : Math.round((carPrice * (num(l.percent) ?? 0)) / 100);
    }
    return {id: l.id, type: l.type, label: l.label, note: l.note || '', hidden: Boolean(l.hidden), amount};
  });
  extraLines.forEach((x, i) => {
    if (String(x.label ?? '').trim()) lines.push({id: `extra${i}`, type: 'extra', label: x.label, note: x.note || '', hidden: false, amount: num(x.amount)});
  });

  const missing = lines.filter((l) => l.amount === null).map((l) => l.label);
  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const hiddenSum = lines.filter((l) => l.hidden).reduce((s, l) => s + (l.amount ?? 0), 0);
  const carOverridden = 'car' in amounts && num(amounts.car) !== null;
  const visible = lines.filter((l) => !l.hidden)
    .map((l) => (l.type === 'car' && l.amount !== null ? {...l, amount: l.amount + hiddenSum} : l));
  const showPurchase = Boolean(template.showPurchasePrice) && hiddenSum === 0 && !carOverridden;
  return {lines: visible, total, missing, showPurchase};
};
