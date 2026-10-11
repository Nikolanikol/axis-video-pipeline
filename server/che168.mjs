// Источник «Китай»: клиент ядра che168 (cores/che168 — отдельный процесс по контракту
// cores/CONTRACT.md). Ядро само ходит в Autohome; здесь — только запрос к нему и перевод его
// ответа: конверт с кодом ошибки → HttpError с понятным текстом, данные → CarouselCar.
//
// Ядро изолировано: упало или не запущено — падает только «Китай», Encar и всё остальное
// работают; человек видит «источник недоступен», а не стек.
import {HttpError} from './store.mjs';
import {carFromChe168} from '../src/shared/che168Car.js';

// Где ядро: на Mac — порт 3320, на сервере — адрес контейнера ядра
const coreUrl = () => (process.env.CHE168_CORE_URL || 'http://127.0.0.1:3320').replace(/\/+$/, '');
// Ядро само укладывается в 45 с (таймаут контракта); ждём чуть дольше, чтобы получить его ответ
const TIMEOUT_MS = 50_000;

// Код ядра → статус ответа нашего API. Текст ядра — уже по-русски и для человека
const STATUS = {
  BAD_INPUT: 400, NOT_FOUND: 404, RATE_LIMITED: 429, OVERLOADED: 503,
  UPSTREAM_BLOCKED: 502, UPSTREAM_TIMEOUT: 504, UPSTREAM_UNAVAILABLE: 502, UPSTREAM_BAD_RESPONSE: 502, INTERNAL: 502,
};

/**
 * Сырые данные машины от ядра (data конверта).
 * @param {string} ref — номер машины на che168
 */
export const fetchChe168 = async (ref) => {
  let res;
  try {
    res = await fetch(`${coreUrl()}/v1/car?ref=${encodeURIComponent(ref)}&lang=en,ru`, {signal: AbortSignal.timeout(TIMEOUT_MS)});
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new HttpError(504, 'Источник «Китай» не ответил вовремя — попробуйте ещё раз');
    // Ядро не запущено или упало — это не ошибка человека и не повод ронять запрос целиком
    console.error(`[che168] ядро недоступно (${coreUrl()}): ${e?.cause?.code || e?.message || e}`);
    throw new HttpError(502, 'Источник «Китай» сейчас недоступен — попробуйте позже');
  }
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!body || typeof body.ok !== 'boolean') {
    throw new HttpError(502, `Источник «Китай» ответил непонятно (HTTP ${res.status})`);
  }
  if (!body.ok) {
    const code = body.error?.code;
    // Поломка ядра или формата Autohome — в лог с requestId: по нему ищем в логах ядра
    if (code === 'INTERNAL' || code === 'UPSTREAM_BAD_RESPONSE' || code === 'UPSTREAM_BLOCKED') {
      console.error(`[che168] ${code} ${body.error?.message} · requestId ${body.requestId}`);
    }
    throw new HttpError(STATUS[code] ?? 502, body.error?.message || 'Источник «Китай» вернул ошибку');
  }
  return body.data;
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
    console.error(`[che168] переходник не разобрал машину ${ref}: ${e?.stack || e}`);
    throw new HttpError(502, 'Не удалось разобрать машину из Китая — сообщите нам, мы поправим');
  }
  // Ядро ответило «успех», но без марки и модели — это не машина, а дыра в данных Autohome
  // или в ядре. Пустое объявление молча не создаём
  if (!car.brand && !car.model) {
    console.error(`[che168] машина ${ref} пришла без марки и модели`);
    throw new HttpError(502, 'Источник «Китай» отдал машину без данных — попробуйте позже или другую ссылку');
  }
  return car;
};
