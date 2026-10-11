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

/** @typedef {{source: 'encar' | 'che168', id: string, ref?: string}} ParsedLink */

export const CHE168_PREFIX = 'ch-';
const che168 = (ref) => ({source: 'che168', id: `${CHE168_PREFIX}${ref}`, ref});

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
  return `https://fem.encar.com/cars/detail/${encodeURIComponent(s)}`;
};
/** Тот же адрес под понятным именем: объявление-источник машины по нашему id */
export const sourceAdUrl = encarAdUrl;

/** Пометка лота по машине: «Encar 41630924» или «che168 60154824». По ней лот находится заново */
export const sourceNote = (id) => {
  const s = String(id);
  return s.startsWith(CHE168_PREFIX) ? `che168 ${s.slice(CHE168_PREFIX.length)}` : `Encar ${s}`;
};
/** Наш id машины по пометке лота (и «копия Encar …»); null — лот не из объявления */
export const idFromNote = (note) => {
  const m = String(note ?? '').match(/(Encar|che168) (\d+)/);
  if (!m) return null;
  return m[1] === 'che168' ? `${CHE168_PREFIX}${m[2]}` : m[2];
};
/** Название источника для подписей интерфейса */
export const sourceName = (id) => (String(id).startsWith(CHE168_PREFIX) ? 'che168' : 'Encar');

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

  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    throw new Error('Это не похоже на ссылку');
  }

  for (const p of PATTERNS) {
    if (!p.host.test(url.hostname)) continue;
    const id = p.id(url);
    if (!id || !/^\d{5,12}$/.test(id)) throw new Error('В ссылке нет номера машины — скопируй её целиком из адресной строки');
    return p.source === 'che168' ? che168(id) : {source: p.source, id};
  }
  throw new Error(`Пока умею ссылки encar.com и che168.com, а это ${url.hostname}`);
};
