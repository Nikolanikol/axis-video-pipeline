// Точка входа модуля-ядра Encar по контракту (cores/CONTRACT.md, раздел 2): core, getCar,
// checkUpstream. KOK (server/encar.mjs) и CLI (bin/fetch.mjs) зовут только это.
// Отсюда выходят только CoreError; частичные данные — warnings, а не ошибка.
//
// Данные — через шлюз kmotors (src/upstream.mjs), а не с Encar напрямую: Encar режет адреса
// дата-центров. Шлюз уже переводит машину на английский и раскладывает фото по ракурсам —
// ядро проверяет ответ и упаковывает его в карточку контракта.
import { CoreError, toCoreError } from '../../kit/errors.mjs';
import { createLogger } from '../../kit/log.mjs';
import { ping, vehicle } from './upstream.mjs';
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
    const raw = await vehicle(id, { signal });
    const { card, warnings } = parseCard(raw, id);
    log.debug('upstream.ok', { id, tookMs: Date.now() - t0 });
    const data = {
      source: core.id,
      ref: id,
      fetchedAt: new Date().toISOString(),
      urls: { listing: `https://fem.encar.com/cars/detail/${id}`, gateway: card.source || null },
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
