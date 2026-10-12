// Разбор ответа шлюза kmotors — чистые функции, без сети.
//
// Шлюз уже отдаёт машину в форме карусели (CarouselCar, src/shared/types.ts): марка, цена в вонах
// и долларах, история страховых, опции, фото по ракурсам. Ядро ей не доверяет: любое поле может
// пропасть или сменить тип, и раньше такое падало `TypeError` уже в вёрстке слайда — далеко от
// причины. Здесь каждое поле проверяется; плохое заменяется пустым с предупреждением, а без
// марки и модели машины нет вовсе — это UPSTREAM_BAD_RESPONSE.
//
// Главное правило: **правильный ответ проходит без единого изменения**. Карусели и ролики
// получали ответ шлюза как есть; переделка в ядро не должна сдвинуть ни поля (проверка —
// tests/unit/encarCore.test.mjs на снимках tests/fixtures/encar, снятых до переделки).
import { CoreError, warning } from '../../kit/errors.mjs';

/**
 * Номер машины из ссылки Encar или голого номера. null — не похоже на Encar.
 * Свой разбор, а не модуль ссылок KOK: ядро не импортирует чужие модули (CONTRACT.md, раздел 1)
 */
export function parseCarId(ref) {
  const text = String(ref ?? '').trim();
  if (/^\d{6,12}$/.test(text)) return text;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (!/(^|\.)encar\.com$/i.test(url.hostname)) return null;
  const id = url.searchParams.get('carid') || (url.pathname.match(/\/detail\/(\d+)/) || [])[1] || '';
  return /^\d{6,12}$/.test(id) ? id : null;
}

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);
const isStrOrNull = (v) => v === null || isStr(v);
const isStrList = (v) => Array.isArray(v) && v.every(isStr);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Поля карточки: проверка и чем заменить негодное. Строки — пустой строкой (так шлюз пишет
// «нет данных»), числа — null
const STRING_FIELDS = ['grade', 'trim', 'transmission', 'fuel', 'body', 'color'];
const NUMBER_FIELDS = ['year', 'mileageKm', 'displacementCc', 'seats'];
const NULLABLE_STRINGS = ['firstRegistered', 'vin', 'plate'];

const priceOk = (p) => p === null || (isObj(p) && isNumOrNull(p.krw) && isNumOrNull(p.usd)
  && isNumOrNull(p.krwToUsd ?? null) && isStrOrNull(p.quotedAt ?? null));

const historyOk = (h) => h === null || (isObj(h)
  && ['accidentsOwn', 'accidentsOther', 'accidentsTotal', 'ownerChanges', 'theft', 'flood', 'totalLoss'].every((k) => isNum(h[k]))
  && Array.isArray(h.accidentYears) && Array.isArray(h.claims) && isNumOrNull(h.maxPayoutKrw ?? null));

const optionsOk = (o) => isObj(o) && isStrList(o.comfort) && isStrList(o.safety) && isStrList(o.other) && isNum(o.total);

const PHOTO_ONE = ['hero', 'rear', 'interiorShot', 'dashboard'];
const PHOTO_MANY = ['exterior', 'interior', 'other'];
const photosOk = (p) => isObj(p) && PHOTO_ONE.every((k) => isStrOrNull(p[k] ?? null)) && PHOTO_MANY.every((k) => isStrList(p[k]));

const EMPTY_OPTIONS = { comfort: [], safety: [], other: [], total: 0 };
const EMPTY_PHOTOS = { hero: null, rear: null, interiorShot: null, dashboard: null, exterior: [], interior: [], other: [] };

/**
 * Проверить карточку шлюза. Возвращает {card, warnings}: card — та же карточка (правильная —
 * тем же объектом по содержимому), негодные части заменены пустыми.
 * @param {unknown} raw — ответ шлюза
 * @param {string} id — номер, который спрашивали
 */
export function parseCard(raw, id) {
  if (!isObj(raw)) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Источник «Корея» ответил не карточкой машины', { details: { part: 'card', type: Array.isArray(raw) ? 'array' : typeof raw } });
  const brand = isStr(raw.brand) ? raw.brand : '';
  const model = isStr(raw.model) ? raw.model : '';
  // Без марки и модели это не машина, а дыра в ответе: пустое объявление молча не создаём
  if (!brand.trim() && !model.trim()) {
    throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Источник «Корея» отдал машину без марки и модели — попробуйте позже', { details: { part: 'card', id } });
  }
  const warnings = [];
  const bad = [];
  const card = { ...raw };

  // Номер. У объявления Encar их два: номер в ссылке (carid) и номер машины (vehicleId, по нему
  // лежат фото) — у перевыставленных объявлений они разные (42653673 → 42653400, снимки 12.10).
  // Шлюз отдаёт номер машины, и пайплайны всегда получали его — не трогаем. Пусто — берём тот, что спрашивали
  if (card.id == null || card.id === '') card.id = id;
  else if (!isStr(card.id)) { card.id = String(card.id); bad.push('id'); }
  if (!isStr(card.source)) { card.source = ''; bad.push('source'); }
  if (!isStr(raw.brand)) { card.brand = brand; bad.push('brand'); }
  if (!isStr(raw.model)) { card.model = model; bad.push('model'); }
  for (const k of STRING_FIELDS) if (!isStr(card[k])) { if (k in card) bad.push(k); card[k] = ''; }
  for (const k of NUMBER_FIELDS) if (!isNumOrNull(card[k] ?? null) || !(k in card)) { if (k in card) bad.push(k); card[k] = isNum(card[k]) ? card[k] : null; }
  for (const k of NULLABLE_STRINGS) if (!isStrOrNull(card[k] ?? null) || !(k in card)) { if (k in card) bad.push(k); card[k] = isStr(card[k]) ? card[k] : null; }
  if (bad.length) warnings.push(warning('PART_FAILED', 'card', `card: не тех типов поля ${bad.join(', ')} — заменены пустыми`));

  if (!('price' in raw) || !priceOk(raw.price)) {
    card.price = null;
    warnings.push(warning('PART_MISSING', 'price', 'price: шлюз не отдал цену — на слайде будет прочерк'));
  }
  if (!('history' in raw) || !historyOk(raw.history)) {
    card.history = null;
    warnings.push(warning('PART_MISSING', 'history', 'history: истории нет или она в неизвестном виде'));
  }
  if (!optionsOk(raw.options)) {
    card.options = { ...EMPTY_OPTIONS };
    warnings.push(warning('PART_MISSING', 'options', 'options: опций нет или они в неизвестном виде'));
  }
  if (!photosOk(raw.photos)) {
    card.photos = { ...EMPTY_PHOTOS };
    warnings.push(warning('PART_MISSING', 'photos', 'photos: фото нет или они в неизвестном виде'));
  } else if (!raw.photos.hero) {
    warnings.push(warning('PART_MISSING', 'photos', 'photos: у объявления нет главного фото'));
  }
  return { card, warnings };
}

// Ракурсы шлюза → категории контракта. Роли фото шлюз ставит по кодам Encar (001 — перед,
// 002 — зад, …): это подпись самого объявления, отсюда source: 'listing'
const ROLE = {
  hero: ['exterior', 'front'], rear: ['exterior', 'rear'],
  interiorShot: ['interior', 'cabin'], dashboard: ['interior', 'dashboard'],
};
const GROUP = { exterior: 'exterior', interior: 'interior', other: 'detail' };

/** Фото по контракту (раздел 4): плоский список без повторов, роли — от шлюза */
export function contractPhotos(p) {
  const out = [];
  const seen = new Set();
  const add = (url, category, angle) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, category, ...(angle ? { angle } : {}), ad: true, source: 'listing' });
  };
  for (const [k, [category, angle]] of Object.entries(ROLE)) add(p[k], category, angle);
  for (const [k, category] of Object.entries(GROUP)) for (const url of p[k]) add(url, category);
  return out;
}
