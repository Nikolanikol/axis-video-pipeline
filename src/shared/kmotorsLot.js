// Лот аукциона со страницы kmotors.shop: ссылка → площадка и номер, страница → данные машины.
//
// Зачем так. Источник каруселей по аукционным лотам — страница лота на нашем сайте
// (kmotors.shop/<язык>/auction/lot/<площадка>/<лот>), а не carnect и не площадки напрямую
// (решение владельца 06.10: «даём ссылку с kmotors, сервер открывает страницу, разбирает»).
// Отдельного API у kmotors для лотов нет, поэтому разбираем сам ответ страницы.
//
// Как устроен ответ. Сайт на Next.js (App Router): страница приходит с деревом компонентов,
// вшитым в HTML кусками (`self.__next_f.push([1,"…"])`, «flight»). Куски — строки вида
// `<id>:<JSON>`, а компоненты ссылаются друг на друга как "$L<id>". Характеристики машины
// лежат НЕ в одном объекте, а в узлах разметки: <div key="Mileage"> со span-меткой и
// span-значением, причём значение часто в отдельном куске. Поэтому: собрать карту кусков,
// подставить ссылки, найти узлы с ключом-меткой. Фото — проп `photos` галереи; компактная
// запись лота (`lot`: цена, даты, марка) — проп кнопки справа.
//
// ⚠️ Разбор читает ТЕКСТ английской страницы (/en/…): метки «Mileage», «Fuel» — из её
// словаря. Сменят слова или вёрстку — поле станет null, а не упадёт разбор; тесты на
// образцах всех шести площадок (tests/fixtures/kmotors-lots) покажут, что именно уехало.
// ⚠️ Цены на странице для гостя НЕТ (priceKrw: null даже у стартовых лотов) — так решил
// владелец сайта; здесь price всегда null, пока страницу читает невошедший.
// ⚠️ У Lotte на странице нет ни марки, ни модели, ни года, ни пробега (название «Car»):
// площадка этого не отдаёт. Разбор вернёт то, что есть, а решать, годится ли такой лот,
// вызывающему (см. missingForCarousel).

export const LOT_HOUSES = ['glovis', 'kcar', 'lotte', 'sk', 'autohub', 'heydealer'];

const HOST = /(^|\.)(kmotors\.shop|carnect\.biz)$/i;
const PATH = /^\/(?:[a-z]{2}\/)?(?:auction\/)?lot\/([a-z]+)\/([^/?#]+)/i;

/**
 * Площадка и номер лота из ссылки. Принимает адреса kmotors.shop (в том числе служебный
 * office.kmotors.shop) и carnect.biz — путь у них один: …/lot/<площадка>/<лот>.
 * Бросает с текстом, пригодным для интерфейса.
 * @param {string} raw
 * @returns {{house: string, id: string}}
 */
export const parseLotLink = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Вставь ссылку на лот аукциона');
  let url;
  try { url = new URL(text.startsWith('http') ? text : `https://${text}`); } catch { throw new Error('Это не похоже на ссылку'); }
  if (!HOST.test(url.hostname)) throw new Error(`Лоты аукционов беру со страниц kmotors.shop, а это ${url.hostname}`);
  const m = PATH.exec(url.pathname);
  if (!m) throw new Error('В ссылке нет лота аукциона — нужна страница вида kmotors.shop/…/auction/lot/…');
  const house = m[1].toLowerCase();
  if (!LOT_HOUSES.includes(house)) throw new Error(`Не знаю площадку «${house}»`);
  let id;
  try { id = decodeURIComponent(m[2]); } catch { id = m[2]; }
  return {house, id};
};

// ——— Разбор потока страницы ———

/** Склеить куски потока в один текст */
export const flightOf = (html) => {
  let out = '';
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    // Битый кусок не валит страницу: нужное почти наверняка в другом
    try { out += JSON.parse(`"${m[1]}"`); } catch { /* пропускаем */ }
  }
  return out;
};

/** Карта кусков: id → разобранный JSON (строки, массивы, объекты) */
const chunksOf = (flight) => {
  const map = new Map();
  for (const part of flight.split(/\n(?=[0-9a-f]{1,4}:)/)) {
    const m = /^([0-9a-f]{1,4}):([\s\S]*)$/.exec(part);
    if (!m) continue;
    const body = m[2].trim();
    if (body[0] !== '[' && body[0] !== '{' && body[0] !== '"') continue;
    try { map.set(m[1], JSON.parse(body)); } catch { /* не JSON — служебный кусок */ }
  }
  return map;
};

/** Подставить содержимое кусков вместо ссылок "$L<id>"; куски ссылаются друг на друга */
const resolve = (node, map, depth = 0) => {
  if (depth > 12) return node;
  if (typeof node === 'string') {
    const m = /^\$L([0-9a-f]{1,4})$/.exec(node);
    return m && map.has(m[1]) ? resolve(map.get(m[1]), map, depth + 1) : node;
  }
  if (Array.isArray(node)) return node.map((x) => resolve(x, map, depth));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolve(v, map, depth)]));
  return node;
};

/** Текстовые узлы поддерева. Иконки (svg) пропускаем: их атрибуты — не текст */
const textsOf = (n, out = []) => {
  if (typeof n === 'string') { if (!n.startsWith('$')) out.push(n); return out; }
  if (!Array.isArray(n)) return out;
  if (n[0] === '$') { if (n[1] !== 'svg' && n[3]?.children !== undefined) textsOf(n[3].children, out); return out; }
  n.forEach((x) => textsOf(x, out));
  return out;
};

const walk = (n, fn) => {
  if (Array.isArray(n)) { if (n[0] === '$') fn(n); n.forEach((x) => walk(x, fn)); }
  else if (n && typeof n === 'object') Object.values(n).forEach((v) => walk(v, fn));
};

/** Значение JSON-массива/объекта, начинающееся на позиции start потока */
const jsonAt = (flight, start) => {
  let depth = 0; let inStr = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) { try { return JSON.parse(flight.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
};

// ——— Значения ———

const clean = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s !== '—' && s !== '-' ? s : null;
};
/** «15,892 km» → 15892; «1,998 cc» → 1998; нет цифр — null */
const num = (v) => {
  const s = clean(v);
  const m = s && /[\d][\d,.\s]*/.exec(s);
  const n = m ? Number(m[0].replace(/[^\d]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Счётчик: «0», «3 · ₩5,764,220» → 0, 3. Ноль значим («владельцев не менялось»), в отличие от num */
const count = (v) => {
  const m = /\d+/.exec(clean(v) ?? '');
  return m ? Number(m[0]) : null;
};

/**
 * Страница лота → данные машины.
 * @param {string} html — ответ страницы лота (английская версия)
 * @param {{house?: string, id?: string}} [want] — какой лот ждём: на странице есть и «похожие»,
 *   у них такие же компактные записи; нужная — с совпавшим номером
 * @returns {{ok: true, lot: object} | {ok: false, reason: 'gone' | 'layout'}}
 *   gone — страница отрисовала «не найдено» (лот ушёл); layout — страница есть, формы нет
 */
export const parseLotPage = (html, want = {}) => {
  const text = String(html ?? '');
  // ⚠️ Несуществующий лот сайт отдаёт кодом 200 с меткой Next; отличаем только по ней
  if (text.includes('NEXT_HTTP_ERROR_FALLBACK;404')) return {ok: false, reason: 'gone'};
  const flight = flightOf(text);
  const map = chunksOf(flight);
  if (!map.size) return {ok: false, reason: 'layout'};

  // Компактная запись лота этой страницы
  let compact = null;
  for (const m of flight.matchAll(/"lot":\{"key":"/g)) {
    const o = jsonAt(flight, m.index + 6);
    if (o && typeof o === 'object' && (!want.id || o.externalId === want.id) && (!want.house || o.house === want.house)) { compact = o; break; }
  }
  if (!compact) return {ok: false, reason: 'layout'};

  // Фото: проп галереи — первый массив из ссылок
  let photos = [];
  for (const m of flight.matchAll(/"photos":\[/g)) {
    const arr = jsonAt(flight, m.index + 9);
    if (Array.isArray(arr) && arr.length && arr.every((x) => typeof x === 'string' && /^https?:\/\//.test(x))) { photos = arr; break; }
  }

  // Строки «метка → значение»: <div key="Mileage"> с двумя текстами, первый совпадает с ключом
  const rows = new Map();
  for (const chunk of map.values()) {
    walk(resolve(chunk, map), (n) => {
      if (n[1] !== 'div' || typeof n[2] !== 'string' || n[2].length < 2 || n[2].length > 30 || rows.has(n[2])) return;
      const t = textsOf(n[3]?.children ?? []);
      if (t.length === 2 && t[0] === n[2]) rows.set(n[2], t[1]);
      else if (t.length === 1 && t[0] === n[2]) rows.set(n[2], null); // метка без значения («Seats»)
    });
  }
  const row = (k) => clean(rows.get(k));

  const carName = /"carName":"([^"]+)"/.exec(flight)?.[1] ?? compact.title ?? '';
  const year = Number(/^(\d{4})\b/.exec(carName)?.[1] ?? /^(\d{4})/.exec(row('Year') ?? '')?.[1]) || null;
  const owners = count(row('Owner changes'));

  return {
    ok: true,
    lot: {
      house: compact.house, externalId: compact.externalId,
      platform: row('Platform'), venue: row('Auction venue'), lotNo: row('Lot number'),
      // Марка и группа модели — как их нормализовал kmotors; «Model» — строка комплектации
      make: clean(compact.make) ?? row('Make'),
      modelGroup: clean(compact.modelGroup),
      model: row('Model'), trim: row('Trim'),
      year,
      mileageKm: num(row('Mileage')),
      fuel: row('Fuel'), transmission: row('Transmission'), displacementCc: num(row('Engine')),
      color: row('Color'), interior: row('Interior'), body: row('Body'), usage: row('Usage'),
      firstRegistered: row('First registration'),
      vin: row('VIN'), plate: row('Plate'),
      ownerChanges: owners,
      // Цена: на странице для гостя её нет (см. шапку файла) — оставляем как пришла
      priceKrw: Number.isFinite(compact.priceKrw) ? compact.priceKrw : null,
      priceKind: compact.priceKind ?? 'none',
      auctionDate: compact.auctionDate ?? null, endAt: compact.endAt ?? null,
      photos,
    },
  };
};

/**
 * Чего не хватает лоту для карусели — человеческие слова для сообщения. Пусто — годится.
 * Карусели нужны название машины и фото; остальное слайды умеют пропускать.
 * @param {ReturnType<typeof parseLotPage>} parsed
 */
export const missingForCarousel = (parsed) => {
  if (!parsed?.ok) return ['страница лота'];
  const l = parsed.lot;
  const miss = [];
  if (!l.make && !l.modelGroup) miss.push('марка и модель');
  if (!l.year) miss.push('год');
  if (l.photos.length < 3) miss.push('фото (меньше трёх)');
  return miss;
};
