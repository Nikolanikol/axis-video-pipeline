// Валюты цены в роликах: фиксированный список со значками (владелец 11.10). Раньше валюта
// была свободным полем, туда вписывали «РУБЛЬ», и ролик печатал «9 889 898 РУБЛЬ» —
// слово не склоняется и выглядит чужим. Значок одинаков при любом числе.
// Конвертации нет: цену в этой валюте дилер вписывает сам («Цена в ролике»); считать из
// вон по курсу умеем только KRW, остальное — прежние доллары (см. totalInCurrency).
// Общий модуль: интерфейс, ролик, сервер.

/** @type {{code: string, sign: string, name: string}[]} */
export const CURRENCIES = [
  {code: 'USD', sign: '$', name: 'доллар США'},
  {code: 'EUR', sign: '€', name: 'евро'},
  {code: 'KRW', sign: '₩', name: 'корейская вона'},
  {code: 'RUB', sign: '₽', name: 'российский рубль'},
  {code: 'KZT', sign: '₸', name: 'казахстанский тенге'},
  {code: 'KGS', sign: 'сом', name: 'киргизский сом'},
  {code: 'UZS', sign: 'сум', name: 'узбекский сум'},
  {code: 'BYN', sign: 'Br', name: 'белорусский рубль'},
  {code: 'UAH', sign: '₴', name: 'украинская гривна'},
  {code: 'GEL', sign: '₾', name: 'грузинский лари'},
  {code: 'AMD', sign: '֏', name: 'армянский драм'},
  {code: 'AZN', sign: '₼', name: 'азербайджанский манат'},
  {code: 'MKD', sign: 'ден', name: 'македонский денар'},
  {code: 'ALL', sign: 'L', name: 'албанский лек'},
  {code: 'AED', sign: 'AED', name: 'дирхам ОАЭ'},
  {code: 'GBP', sign: '£', name: 'фунт стерлингов'},
];

// Что люди вписывали в свободное поле до списка — узнаём и приводим к коду
const ALIASES = {
  'РУБЛЬ': 'RUB', 'РУБЛЕЙ': 'RUB', 'РУБ': 'RUB', 'РУБ.': 'RUB', 'RUR': 'RUB', '₽': 'RUB',
  'ДОЛЛАР': 'USD', 'ДОЛЛАРЫ': 'USD', 'ДОЛЛАРОВ': 'USD', '$': 'USD',
  'ЕВРО': 'EUR', '€': 'EUR', 'ВОНА': 'KRW', 'ВОН': 'KRW', '₩': 'KRW',
  'ТЕНГЕ': 'KZT', '₸': 'KZT', 'СОМ': 'KGS', 'СУМ': 'UZS', 'ГРИВНА': 'UAH', 'ЛАРИ': 'GEL',
};

/**
 * Код валюты из того, что лежит в профиле. Незнакомое возвращаем как есть: молча подменить
 * чужую валюту долларом хуже, чем показать её код, — форма настроек попросит выбрать из списка
 * @param {string | undefined | null} raw
 */
export const currencyCode = (raw) => {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return 'USD';
  if (CURRENCIES.some((c) => c.code === v)) return v;
  return ALIASES[v] ?? v;
};

/** Значок валюты для цены в ролике; незнакомый код — сам код */
export const currencySign = (raw) => {
  const code = currencyCode(raw);
  return CURRENCIES.find((c) => c.code === code)?.sign ?? code;
};

/** Есть ли валюта в списке — для формы: незнакомую просим заменить */
export const isKnownCurrency = (raw) => CURRENCIES.some((c) => c.code === currencyCode(raw));

/**
 * Сколько вон за единицу валюты по таблице «единиц за $1» (кросс через доллар — так котирует
 * источник). Нет курса — null: цену тогда не считаем, а не подставляем доллары под чужим значком
 * @param {string} code @param {Record<string, number> | undefined} usdRates
 */
export const krwPerUnit = (code, usdRates) => {
  const krw = usdRates?.KRW;
  const x = usdRates?.[currencyCode(code)];
  if (!krw || !x) return null;
  return Math.round((krw / x) * 10000) / 10000;
};

/** Валюты, которые считаем из вон не через «курс валюты», а напрямую: вона и доллар */
export const isDirect = (code) => {
  const c = currencyCode(code);
  return c === 'KRW' || c === 'USD';
};
