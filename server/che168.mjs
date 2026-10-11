// Источник «Китай»: вызов модуля-ядра che168 (cores/che168, контракт cores/CONTRACT.md) и перевод
// его ответа для KOK: CoreError → HttpError с понятным текстом, данные → CarouselCar.
//
// Ядро — независимый модуль внутри KOK (решение владельца 11.10): логикой не пересекается с Encar,
// каруселями и роликами, вызывается прямым импортом точки входа. Всё, что может сломаться у
// Autohome, ядро уже перевело в коды контракта; здесь — только граница модуля.
import {randomUUID} from 'node:crypto';
import {HttpError} from './store.mjs';
import {carFromChe168} from '../src/shared/che168Car.js';
import {getCar} from '../cores/che168/src/index.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {createLogger, levelFor} from '../cores/kit/log.mjs';

const log = createLogger('che168');
// Код ядра → статус ответа KOK
const STATUS = {
  BAD_INPUT: 400, NOT_FOUND: 404, RATE_LIMITED: 429, OVERLOADED: 503, UPSTREAM_TIMEOUT: 504,
  UPSTREAM_BLOCKED: 502, UPSTREAM_UNAVAILABLE: 502, UPSTREAM_BAD_RESPONSE: 502, INTERNAL: 502,
};
// Весь запрос к ядру: два языка по 4 запроса к Autohome с повторами укладываются
const TIMEOUT_MS = 45_000;

/**
 * Данные машины от ядра (data контракта).
 * @param {string} ref — номер машины на che168
 */
export const fetchChe168 = async (ref) => {
  const requestId = randomUUID();
  const rlog = log.child({requestId});
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const {data, warnings} = await getCar(ref, {langs: ['en', 'ru'], signal: ac.signal, log: rlog});
    for (const w of warnings) rlog.warn('part.missing', w);
    rlog.info('car.ok', {ref: data?.ref, warnings: warnings.length});
    return data;
  } catch (e) {
    const err = toCoreError(e);
    // Ожидаемое (нет машины, кривая ссылка) — warn; поломки Autohome и ядра — error со стеком
    rlog[levelFor(err.code)]('request.failed', {ref, code: err.code, error: err});
    // Текст ядра — уже по-русски и для человека; у INTERNAL — без подробностей, они в логе
    throw new HttpError(STATUS[err.code] ?? 502, err.code === 'INTERNAL' ? 'Источник «Китай» дал сбой — попробуйте позже' : err.message);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Машина из Китая в форме пайплайна.
 * @param {string} ref — номер на che168
 * @param {string} [language] — язык постов профиля (названия опций)
 */
export const fetchChe168Car = async (ref, language) => {
  const data = await fetchChe168(ref);
  let car;
  try { car = carFromChe168(data, language); } catch (e) {
    log.error('adapter.failed', {ref, error: e});
    throw new HttpError(502, 'Не удалось разобрать машину из Китая — сообщите нам, мы поправим');
  }
  // Ядро ответило успехом, но без марки и модели — это не машина, а дыра в данных Autohome.
  // Пустое объявление молча не создаём
  if (!car.brand && !car.model) {
    log.error('car.empty', {ref});
    throw new HttpError(502, 'Источник «Китай» отдал машину без данных — попробуйте позже или другую ссылку');
  }
  return car;
};
