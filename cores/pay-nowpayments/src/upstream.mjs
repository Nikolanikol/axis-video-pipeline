// HTTP-клиент API NOWPayments и перевод всего, что может пойти не так, в коды контракта
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
//
// Повторы — только у запросов на чтение (GET) и только для временных сбоев: повтор выставления
// счёта (POST) при оборванном ответе создал бы второй счёт, о котором клиент не знает.
import { CoreError } from '../../kit/errors.mjs';
import { createLimiter } from '../../kit/limiter.mjs';

export const BASE = Object.freeze({
  live: 'https://api.nowpayments.io/v1',
  sandbox: 'https://api-sandbox.nowpayments.io/v1',
});
const TIMEOUT_MS = 20_000;
const TRIES = 3;

// Касса ограничивает частоту запросов; оплаты у нас — единицы в минуту, так что 4 разом с
// запасом, а очередь не даст пачке переспросов (фоновая сверка) упереться в лимит кассы
const limiter = createLimiter({ concurrency: 4, maxQueue: 100 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ответ кассы с ошибкой → код контракта. Текст кассы оставляем в details: по нему чинят
const fail = (status, data, path) => {
  const said = typeof data?.message === 'string' ? data.message.slice(0, 300) : undefined;
  const details = { path, status, said, kassaCode: data?.code };
  if (status === 401 || status === 403) {
    // Ключ не принят: опечатка в переменной, ключ отозван или песочница против боевого адреса
    return new CoreError('UPSTREAM_BLOCKED', 'Касса не приняла ключ API — проверьте NOWPAYMENTS_*_API_KEY', { details });
  }
  if (status === 404) return new CoreError('NOT_FOUND', 'Касса не знает такого платежа или счёта', { details });
  if (status === 429) return new CoreError('RATE_LIMITED', 'Касса просит реже обращаться к ней', { details });
  if (status >= 500) return new CoreError('UPSTREAM_UNAVAILABLE', `Касса ответила ошибкой ${status}`, { details });
  // 400 и прочие 4xx — касса отказала по сути: сумма меньше минимальной, монета выключена…
  return new CoreError('BAD_INPUT', said ? `Касса отказала: ${said}` : `Касса отказала (${status})`, { details });
};

async function once({ apiKey, base }, method, path, body) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { 'x-api-key': apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new CoreError('UPSTREAM_TIMEOUT', `Касса не ответила за ${TIMEOUT_MS / 1000} с`, { details: { path }, cause: e });
    }
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Касса недоступна (сеть или DNS)', { details: { path, reason: e?.cause?.code || e?.message }, cause: e });
  }
  let text;
  try { text = await res.text(); }
  catch (e) { throw new CoreError('UPSTREAM_UNAVAILABLE', 'Ответ кассы оборвался', { details: { path }, cause: e }); }
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* не JSON — ниже */ }
  if (!res.ok) throw fail(res.status, data, path);
  if (!data || typeof data !== 'object') {
    throw new CoreError('UPSTREAM_BAD_RESPONSE', `Касса ответила не JSON (HTTP ${res.status})`, { details: { path, sample: text.slice(0, 120) } });
  }
  return data;
}

/**
 * Запрос к API кассы. cfg — {apiKey, base}. GET повторяется до 3 раз при временных сбоях
 * (таймаут, сеть, 5xx, «реже») с растущей паузой; остальное — сразу наружу
 */
export const request = (cfg, method, path, body) => limiter.run(async () => {
  const tries = method === 'GET' ? TRIES : 1;
  for (let i = 1; ; i++) {
    try {
      return await once(cfg, method, path, body);
    } catch (e) {
      if (i >= tries || !e.retryable) throw e;
      await sleep(500 * 3 ** (i - 1));
    }
  }
});

export const upstreamStats = () => limiter.stats();
