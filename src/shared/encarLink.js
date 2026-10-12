// Ссылка на объявление → номер машины.
//
// Правила взяты из рабочего телеграм-бота (caranalizer-tg): он эти формы уже разгрёб,
// и переписывать заново значит наступить на те же грабли. Encar отдаёт ссылки в двух
// видах — с номером в параметре и с номером в пути, — а поделиться можно любой из них.
//
// С 11.10 второй источник — che168 (Китай, Autohome): данные отдаёт отдельное ядро
// cores/che168 (см. server/che168.mjs). Номер машины у него тоже 8-значный и мог бы совпасть
// с номером Encar, поэтому наш id машины из Китая — с приставкой: «ch-60154824». Он же имя
// папки карусели и пометка лота «che168 60154824».
//
// С 12.10 третий — Carsensor (Япония, объявления дилеров): ядро cores/carsensor. Номер там с
// буквами — «AU7375484964»; наш id — «cs-au7375484964» строчными (id папок — только [a-z0-9-]),
// пометка лота — «carsensor AU7375484964», номер для ядра — заглавными, как на сайте.

/** @typedef {{source: 'encar' | 'che168' | 'carsensor', id: string, ref?: string}} ParsedLink */

export const CHE168_PREFIX = 'ch-';
export const CARSENSOR_PREFIX = 'cs-';
const che168 = (ref) => ({source: 'che168', id: `${CHE168_PREFIX}${ref}`, ref});
const carsensor = (ref) => ({source: 'carsensor', id: `${CARSENSOR_PREFIX}${ref.toLowerCase()}`, ref: ref.toUpperCase()});
const CARSENSOR_REF = /^[A-Z]{2}\d{8,12}$/i;

const PATTERNS = [
  {
    source: 'encar',
    // www.encar.com/dc/dc_cardetailview.do?carid=41630924
    // fem.encar.com/cars/detail/41630924?listAdvType=share
    host: /encar\.com$/i,
    id: (u) => u.searchParams.get('carid') || (u.pathname.match(/\/detail\/(\d+)/) || [])[1] || null,
  },
  {
    source: 'che168',
    // www.che168.com/dealer/513988/60154824.html, global.che168.com/en/detail/60152276,
    // m.che168.com/cardetail/index?infoid=60154824 — номер общий у всех версий сайта
    host: /(^|\.)che168\.com$/i,
    id: (u) => u.searchParams.get('infoid') || (u.pathname.match(/\/detail\/(\d+)/) || [])[1]
      || (u.pathname.match(/\/(\d{5,12})\.html$/) || [])[1] || null,
  },
  {
    source: 'carsensor',
    // www.carsensor.net/usedcar/detail/AU7375484964/index.html?dspn=… — номер в пути; бывает и
    // ссылка магазина с ?BKKN=AU7375484964
    host: /(^|\.)carsensor\.net$/i,
    id: (u) => (u.pathname.match(/\/detail\/([A-Z]{2}\d{8,12})(\/|$)/i) || [])[1] || u.searchParams.get('BKKN') || null,
  },
];

/**
 * Адрес объявления на Encar по номеру машины. Единственное место, где он собирается: и
 * «На Encar» у лота, и у карусели ведут на оригинал объявления, а не на каталог kmotors —
 * KOK самостоятельный продукт и с kmotors не связан (владелец 01.10).
 * @param {string} id
 */
export const encarAdUrl = (id) => {
  const s = String(id);
  // Машина из Китая — на международную версию che168: она открывается без проверки на бота
  if (s.startsWith(CHE168_PREFIX)) return `https://global.che168.com/en/detail/${encodeURIComponent(s.slice(CHE168_PREFIX.length))}`;
  if (s.startsWith(CARSENSOR_PREFIX)) return `https://www.carsensor.net/usedcar/detail/${encodeURIComponent(s.slice(CARSENSOR_PREFIX.length).toUpperCase())}/index.html`;
  return `https://fem.encar.com/cars/detail/${encodeURIComponent(s)}`;
};
/** Тот же адрес под понятным именем: объявление-источник машины по нашему id */
export const sourceAdUrl = encarAdUrl;

/** Пометка лота по машине: «Encar 41630924», «che168 60154824» или «carsensor AU7375484964».
 *  По ней лот находится заново */
export const sourceNote = (id) => {
  const s = String(id);
  if (s.startsWith(CHE168_PREFIX)) return `che168 ${s.slice(CHE168_PREFIX.length)}`;
  if (s.startsWith(CARSENSOR_PREFIX)) return `carsensor ${s.slice(CARSENSOR_PREFIX.length).toUpperCase()}`;
  return `Encar ${s}`;
};
/** Наш id машины по пометке лота (и «копия Encar …»); null — лот не из объявления */
export const idFromNote = (note) => {
  const n = String(note ?? '');
  const cs = n.match(/carsensor ([A-Z]{2}\d{8,12})\b/i);
  if (cs) return `${CARSENSOR_PREFIX}${cs[1].toLowerCase()}`;
  const m = n.match(/(Encar|che168) (\d+)/);
  if (!m) return null;
  return m[1] === 'che168' ? `${CHE168_PREFIX}${m[2]}` : m[2];
};
/** Название источника для подписей интерфейса */
export const sourceName = (id) => {
  const s = String(id);
  return s.startsWith(CHE168_PREFIX) ? 'che168' : s.startsWith(CARSENSOR_PREFIX) ? 'Carsensor' : 'Encar';
};

/**
 * Разобрать ссылку. Бросает с человеческим текстом — он уходит прямо в интерфейс.
 * @param {string} raw
 * @returns {ParsedLink}
 */
export const parseCarLink = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Вставь ссылку на объявление');

  // Голый номер тоже принимаем: его удобно скопировать из адреса или из переписки.
  // Голый номер — Encar (так было всегда); машина из Китая — ссылкой или нашим «ch-…»
  if (/^\d{6,12}$/.test(text)) return {source: 'encar', id: text};
  const own = text.match(/^ch-(\d{5,12})$/);
  if (own) return che168(own[1]);
  // Carsensor: наш id «cs-au…» (так зовёт «Пересобрать») или голый номер с буквами «AU7375484964»
  const ownJp = text.match(/^cs-([a-z]{2}\d{8,12})$/i);
  if (ownJp) return carsensor(ownJp[1]);
  if (CARSENSOR_REF.test(text)) return carsensor(text);

  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    throw new Error('Это не похоже на ссылку');
  }

  for (const p of PATTERNS) {
    if (!p.host.test(url.hostname)) continue;
    const id = p.id(url);
    const ok = p.source === 'carsensor' ? CARSENSOR_REF.test(id ?? '') : /^\d{5,12}$/.test(id ?? '');
    if (!ok) throw new Error('В ссылке нет номера машины — скопируй её целиком из адресной строки');
    if (p.source === 'carsensor') return carsensor(id);
    return p.source === 'che168' ? che168(id) : {source: p.source, id};
  }
  throw new Error(`Пока умею ссылки encar.com, che168.com и carsensor.net, а это ${url.hostname}`);
};
