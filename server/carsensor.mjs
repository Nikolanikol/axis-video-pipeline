// Источник «Япония»: вызов модуля-ядра carsensor (cores/carsensor, контракт cores/CONTRACT.md) и
// перевод его ответа для KOK: CoreError → HttpError с понятным текстом, данные → CarouselCar.
//
// Ядро — независимый модуль внутри KOK (решение владельца 11.10), как che168: вызывается прямым
// импортом точки входа. Здесь — только граница модуля и курс иены (ядро отдаёт цену в ¥, а
// слайды и ролики умеют доллары — переводим по курсу дня, тем же, что у остальных цен).
import {randomUUID} from 'node:crypto';
import {HttpError} from './store.mjs';
import {rates} from './rates.mjs';
import {carFromCarsensor} from '../src/shared/carsensorCar.js';
import {getCar} from '../cores/carsensor/src/index.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {createLogger, levelFor} from '../cores/kit/log.mjs';

const log = createLogger('carsensor');
const STATUS = {
  BAD_INPUT: 400, NOT_FOUND: 404, RATE_LIMITED: 429, OVERLOADED: 503, UPSTREAM_TIMEOUT: 504,
  UPSTREAM_BLOCKED: 502, UPSTREAM_UNAVAILABLE: 502, UPSTREAM_BAD_RESPONSE: 502, INTERNAL: 502,
};
// Одна страница с повторами — 15 с × 3 в худшем случае
const TIMEOUT_MS = 45_000;

/**
 * Данные машины от ядра (data контракта).
 * @param {string} ref — номер машины на Carsensor («AU7375484964»)
 */
export const fetchCarsensor = async (ref) => {
  const requestId = randomUUID();
  const rlog = log.child({requestId});
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  // Время целиком (с повторами и очередью ограничителя) — в итоговой строке лога
  const t0 = Date.now();
  try {
    const {data, warnings} = await getCar(ref, {langs: ['en', 'ru'], signal: ac.signal, log: rlog});
    for (const w of warnings) rlog.warn('part.missing', w);
    rlog.info('car.ok', {ref: data?.ref, warnings: warnings.length, tookMs: Date.now() - t0});
    return data;
  } catch (e) {
    const err = toCoreError(e);
    rlog[levelFor(err.code)]('request.failed', {ref, code: err.code, tookMs: Date.now() - t0, error: err});
    throw new HttpError(STATUS[err.code] ?? 502, err.code === 'INTERNAL' ? 'Источник «Япония» дал сбой — попробуйте позже' : err.message);
  } finally {
    clearTimeout(timer);
  }
};

/** Курс ¥ за $1 на сегодня; нет курса — null (цена останется в иенах, на слайде будет прочерк) */
const jpyRate = async () => {
  try {
    const r = await rates();
    return {jpyPerUsd: r.usdRates?.JPY ?? null, quotedAt: r.fetchedAt ?? null};
  } catch (e) {
    log.warn('rate.missing', {error: e});
    return {jpyPerUsd: null, quotedAt: null};
  }
};

/**
 * Машина из Японии в форме пайплайна.
 * @param {string} ref — номер на Carsensor
 * @param {string} [language] — язык постов профиля (названия опций)
 */
export const fetchCarsensorCar = async (ref, language) => {
  const [data, rate] = await Promise.all([fetchCarsensor(ref), jpyRate()]);
  let car;
  try { car = carFromCarsensor(data, language, rate); } catch (e) {
    log.error('adapter.failed', {ref, error: e});
    throw new HttpError(502, 'Не удалось разобрать машину из Японии — сообщите нам, мы поправим');
  }
  if (!car.brand && !car.model) {
    log.error('car.empty', {ref});
    throw new HttpError(502, 'Источник «Япония» отдал машину без данных — попробуйте позже или другую ссылку');
  }
  if (car.price?.jpy && !car.price.usd) log.warn('price.no_rate', {ref, jpy: car.price.jpy});
  return car;
};
