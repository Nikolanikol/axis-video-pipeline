// Ссылка на объявление → номер машины.
//
// Правила взяты из рабочего телеграм-бота (caranalizer-tg): он эти формы уже разгрёб,
// и переписывать заново значит наступить на те же грабли. Encar отдаёт ссылки в двух
// видах — с номером в параметре и с номером в пути, — а поделиться можно любой из них.
//
// Остальные площадки пока не поддержаны: карточку по ним мы всё равно получить не можем,
// шлюз kmotors ходит только в Encar. Но форма ссылки известна — добавить будет просто.

/** @typedef {{source: 'encar', id: string}} ParsedLink */

const PATTERNS = [
  {
    source: 'encar',
    // www.encar.com/dc/dc_cardetailview.do?carid=41630924
    // fem.encar.com/cars/detail/41630924?listAdvType=share
    host: /encar\.com$/i,
    id: (u) => u.searchParams.get('carid') || (u.pathname.match(/\/detail\/(\d+)/) || [])[1] || null,
  },
];

/**
 * Разобрать ссылку. Бросает с человеческим текстом — он уходит прямо в интерфейс.
 * @param {string} raw
 * @returns {ParsedLink}
 */
export const parseCarLink = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Вставь ссылку на объявление');

  // Голый номер тоже принимаем: его удобно скопировать из адреса или из переписки
  if (/^\d{6,12}$/.test(text)) return {source: 'encar', id: text};

  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    throw new Error('Это не похоже на ссылку');
  }

  for (const p of PATTERNS) {
    if (!p.host.test(url.hostname)) continue;
    const id = p.id(url);
    if (!id) throw new Error('В ссылке нет номера машины — скопируй её целиком из адресной строки');
    return {source: p.source, id};
  }
  throw new Error(`Пока умею только ссылки с encar.com, а это ${url.hostname}`);
};
