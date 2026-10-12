// Источник «Корея»: вызов модуля-ядра Encar (cores/encar, контракт cores/CONTRACT.md) и перевод
// его ответа для KOK: CoreError → HttpError с понятным текстом, данные → CarouselCar.
//
// Единственное место, откуда KOK ходит за машиной с Encar: карусели, лот по ссылке и образцы
// витрины импортируют отсюда. Раньше запрос жил внутри модуля каруселей, и лот по ссылке
// импортировал его оттуда — модули знали друг о друге (переделка 12.10).
import {randomUUID} from 'node:crypto';
import {HttpError} from './store.mjs';
import {carFromEncar} from '../src/shared/encarCar.js';
import {getCar} from '../cores/encar/src/index.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {createLogger, levelFor} from '../cores/kit/log.mjs';

const log = createLogger('encar');
// Код ядра → статус ответа KOK (как у che168)
const STATUS = {
  BAD_INPUT: 400, NOT_FOUND: 404, RATE_LIMITED: 429, OVERLOADED: 503, UPSTREAM_TIMEOUT: 504,
  UPSTREAM_BLOCKED: 502, UPSTREAM_UNAVAILABLE: 502, UPSTREAM_BAD_RESPONSE: 502, INTERNAL: 502,
};
// Попытка к шлюзу — до минуты (холодный прокси), плюс быстрые повторы при обрыве
const TIMEOUT_MS = 75_000;

/**
 * Машина с Encar в форме пайплайна.
 * @param {string} ref — номер объявления или ссылка Encar
 */
export const fetchEncarCar = async (ref) => {
  const requestId = randomUUID();
  const rlog = log.child({requestId});
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  let data;
  try {
    const res = await getCar(ref, {signal: ac.signal, log: rlog});
    data = res.data;
    for (const w of res.warnings) rlog.warn('part.missing', w);
    rlog.info('car.ok', {ref: data.ref, warnings: res.warnings.length, tookMs: Date.now() - t0});
  } catch (e) {
    const err = toCoreError(e);
    // Ожидаемое (нет машины, кривая ссылка) — warn; поломки шлюза и ядра — error со стеком
    rlog[levelFor(err.code)]('request.failed', {ref: String(ref ?? '').slice(0, 200), code: err.code, tookMs: Date.now() - t0, error: err});
    // Текст ядра — по-русски и для человека; у INTERNAL — без подробностей, они в логе
    throw new HttpError(STATUS[err.code] ?? 502, err.code === 'INTERNAL' ? 'Источник «Корея» дал сбой — попробуйте позже' : err.message);
  } finally {
    clearTimeout(timer);
  }
  try {
    return carFromEncar(data);
  } catch (e) {
    rlog.error('adapter.failed', {ref: data?.ref, error: e});
    throw new HttpError(502, 'Не удалось разобрать машину из Кореи — сообщите нам, мы поправим');
  }
};
