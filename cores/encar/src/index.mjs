// Точка входа модуля-ядра Encar по контракту (cores/CONTRACT.md, раздел 2): core, getCar,
// checkUpstream. KOK (server/encar.mjs) и CLI (bin/fetch.mjs) зовут только это.
// Отсюда выходят только CoreError; частичные данные — warnings, а не ошибка.
//
// Данные — через шлюз kmotors (src/upstream.mjs), а не с Encar напрямую: Encar режет адреса
// дата-центров. Шлюз уже переводит машину на английский и раскладывает фото по ракурсам —
// ядро проверяет ответ и упаковывает его в карточку контракта.
//
// Запасной маршрут (15.11) — encar-api.com (src/encarApi.mjs), если задан ENCAR_API_KEY:
//  - шлюз недоступен, завис, не принял секрет или просит притормозить → машина с encar-api;
//  - шлюз сказал «не найдена» → перепроверка в encar-api. 13.11 Encar заблокировал kmotors, и шлюз
//    отвечал «не найдена» на каждую машину — перепроверка поймала бы это с первого запроса. Проданные
//    ссылки клиенты вставляют редко, сотни запросов в сутки на это хватает;
//  - кривая ссылка (BAD_INPUT) и битая карточка шлюза — без запасного маршрута.
// Шлюз подвёл, а encar-api выручил — строка error `gateway.failed`: тревога в «Сбои», чтобы основной
// маршрут не ломался молча, хотя клиенты машины получают.
import { CoreError, toCoreError } from '../../kit/errors.mjs';
import { createLogger } from '../../kit/log.mjs';
import { ping, vehicle } from './upstream.mjs';
import { cardFromEncarApi, encarApiCar, encarApiEnabled, encarApiRemaining } from './encarApi.mjs';
import { contractPhotos, parseCard, parseCarId } from './parse.mjs';

export const core = Object.freeze({
  id: 'encar',
  title: 'Корея · Encar (через шлюз kmotors)',
  version: '1.0.0',
  contract: 2,
  // Шлюз отдаёт значения по-английски; на русский их переводят словари слайдов KOK
  languages: { supported: ['en'], default: ['en'] },
  refExamples: [
    'https://fem.encar.com/cars/detail/41630924',
    'https://www.encar.com/dc/dc_cardetailview.do?carid=41630924',
    '41630924',
  ],
});

const defaultLog = createLogger(core.id);

/**
 * Машина по ссылке или номеру Encar.
 * @returns {Promise<{data: object, warnings: object[]}>}
 * @throws {CoreError}
 */
export async function getCar(ref, { signal, log = defaultLog } = {}) {
  // Всё внутри — под защитой: любое чужое исключение уходит наружу как INTERNAL (раздел 5)
  try {
    const id = parseCarId(ref);
    if (!id) throw new CoreError('BAD_INPUT', 'Не нашёл номер машины — нужна ссылка encar.com или номер объявления', { details: { ref: String(ref ?? '').slice(0, 200) } });
    const t0 = Date.now();
    const { raw, route } = await fetchRaw(id, { signal, log });
    const { card, warnings } = parseCard(raw, id);
    log.debug('upstream.ok', { id, route, tookMs: Date.now() - t0 });
    const data = {
      source: core.id,
      ref: id,
      fetchedAt: new Date().toISOString(),
      urls: { listing: `https://fem.encar.com/cars/detail/${id}`, gateway: card.source || null },
      // Каким маршрутом пришла машина: 'gateway' (kmotors) или 'encar-api' (запасной)
      route,
      price: card.price ? { amount: card.price.krw, currency: 'KRW', usd: card.price.usd, krwToUsd: card.price.krwToUsd ?? null,
        quotedAt: card.price.quotedAt ?? null, rateSource: card.price.rateSource ?? null } : null,
      mileageKm: card.mileageKm,
      photos: contractPhotos(card.photos),
      byLang: { en: { car: { title: [card.brand, card.model, card.grade].filter(Boolean).join(' '), brand: card.brand, series: card.model, trim: card.grade } } },
      // Карточка в форме карусели — своё у Encar (раздел 4: «остальное — своё у источника»).
      // Переходник KOK (src/shared/encarCar.js) отдаёт её пайплайнам как есть
      card,
    };
    return { data, warnings };
  } catch (e) {
    throw toCoreError(e);
  }
}

// Ошибки шлюза, при которых идём в encar-api. NOT_FOUND — отдельно (перепроверка), BAD_INPUT сюда
// не доходит, UPSTREAM_BAD_RESPONSE — пустая страница зависшего kmotors, INTERNAL — шлюз не настроен
const FALLBACK = new Set(['UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'UPSTREAM_BAD_RESPONSE', 'UPSTREAM_BLOCKED', 'RATE_LIMITED', 'OVERLOADED', 'INTERNAL']);

/** Сырая машина: шлюз, а при его сбое или «не найдена» — encar-api. {raw, route} */
async function fetchRaw(id, { signal, log }) {
  let gatewayErr;
  try {
    return { raw: await vehicle(id, { signal }), route: 'gateway' };
  } catch (e) {
    gatewayErr = toCoreError(e);
  }
  const confirm = gatewayErr.code === 'NOT_FOUND';
  if (!encarApiEnabled() || !(confirm || FALLBACK.has(gatewayErr.code))) throw gatewayErr;
  let v;
  try {
    v = await encarApiCar(id, { signal });
  } catch (e) {
    const apiErr = toCoreError(e);
    // Оба сказали «не найдена» — машина правда продана
    if (confirm && apiErr.code === 'NOT_FOUND') throw gatewayErr;
    // Не выручил — клиенту ошибка шлюза (она точнее), в журнал — обе
    log.warn('fallback.failed', { id, gateway: gatewayErr.code, encarApi: apiErr.code, error: apiErr });
    throw gatewayErr;
  }
  log.error('gateway.failed', {
    id, code: gatewayErr.code, error: gatewayErr, left: encarApiRemaining(),
    note: confirm
      ? 'шлюз kmotors сказал «машина не найдена», а encar-api её отдал — похоже, Encar заблокировал шлюз; клиенты получают машины через encar-api'
      : 'шлюз kmotors не ответил; клиенты получают машины через encar-api (лимит — 100 в сутки)',
  });
  return { raw: cardFromEncarApi(v, id), route: 'encar-api' };
}

/** Жив ли источник: отвечает ли шлюз kmotors */
export async function checkUpstream({ signal } = {}) {
  const t0 = Date.now();
  try {
    await ping({ signal });
  } catch (e) {
    throw toCoreError(e);
  }
  return { ok: true, ms: Date.now() - t0 };
}
