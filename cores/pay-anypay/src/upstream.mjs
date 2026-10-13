// HTTP-клиент API AnyPay и перевод всего, что может пойти не так, в коды контракта
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
//
// Особенность AnyPay: об ошибке касса сообщает телом {"error": {"code": "102", "message": …}} —
// обычно с HTTP 200, поэтому смотрим на тело, а не только на статус ответа.
//
// Повторы — только у запросов на чтение и только для временных сбоев: повтор создания платежа при
// оборванном ответе дал бы второй платёж, о котором клиент не знает (да и pay_id уже занят — 202).
import { CoreError } from '../../kit/errors.mjs';
import { createLimiter } from '../../kit/limiter.mjs';
import { apiSign } from './signature.mjs';

export const BASE = 'https://anypay.io/api';
const TIMEOUT_MS = 20_000;
const TRIES = 3;

// Оплаты у нас — единицы в минуту; очередь не даст пачке переспросов (фоновая сверка) упереться в
// ограничение частоты кассы (код 105)
const limiter = createLimiter({ concurrency: 4, maxQueue: 100 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Коды ошибок API (anypay.io/doc/api/errors) → смысл. Текст — для лога и details, клиенту KOK
// пишет свой (server/payKassa.mjs) по kassaCode
export const API_ERRORS = Object.freeze({
  100: 'неверный формат запроса', 101: 'ошибка авторизации', 102: 'неверная подпись запроса',
  103: 'API отключён для аккаунта', 104: 'ограничение по IP адресу', 105: 'слишком много запросов',
  200: 'неверный ID проекта', 201: 'проект неактивен', 202: 'некорректный или повторный номер платежа',
  203: 'некорректная сумма', 204: 'сумма меньше допустимой', 205: 'сумма больше допустимой',
  206: 'некорректная валюта', 207: 'некорректный способ оплаты', 208: 'способ оплаты недоступен',
  209: 'некорректная валюта способа оплаты', 210: 'не указано описание платежа', 211: 'некорректная почта',
  212: 'некорректный телефон', 213: 'некорректный success url', 214: 'некорректный fail url',
  215: 'не удалось сгенерировать ссылку на оплату', 216: 'мобильная коммерция недоступна для номера',
  217: 'некорректная сеть способа оплаты', 309: 'внутренняя техническая ошибка кассы',
  310: 'операция запрещена для пользователя', 311: 'платёжное направление недоступно',
});
// Ключи, проект, доступ — сам не пройдёт, нужен человек
const BLOCKED = new Set([101, 102, 103, 104, 200, 201, 310]);
// Сбой у самой кассы — можно повторить позже
const TEMPORARY = new Set([215, 309]);

const apiFail = (error, method) => {
  const kassaCode = Number(error?.code);
  const said = typeof error?.message === 'string' ? error.message.slice(0, 300) : undefined;
  const what = API_ERRORS[kassaCode] ?? said ?? 'неизвестная ошибка';
  const details = { method, kassaCode: Number.isFinite(kassaCode) ? kassaCode : undefined, said };
  if (BLOCKED.has(kassaCode)) return new CoreError('UPSTREAM_BLOCKED', `Касса не настроена: ${what} — проверьте ANYPAY_* и кабинет AnyPay`, { details });
  if (kassaCode === 105) return new CoreError('RATE_LIMITED', 'Касса просит реже обращаться к ней', { details });
  if (TEMPORARY.has(kassaCode)) return new CoreError('UPSTREAM_UNAVAILABLE', `Касса дала сбой: ${what}`, { details });
  return new CoreError('BAD_INPUT', `Касса отказала: ${what}`, { details });
};

const httpFail = (status, method) => {
  const details = { method, status };
  if (status === 401 || status === 403) return new CoreError('UPSTREAM_BLOCKED', 'Касса не пустила запрос — проверьте ANYPAY_API_ID и ANYPAY_API_KEY', { details });
  if (status === 429) return new CoreError('RATE_LIMITED', 'Касса просит реже обращаться к ней', { details });
  if (status >= 500) return new CoreError('UPSTREAM_UNAVAILABLE', `Касса ответила ошибкой ${status}`, { details });
  return new CoreError('UPSTREAM_BAD_RESPONSE', `Касса ответила HTTP ${status}`, { details });
};

async function once({ apiId, apiKey }, method, params, signParts) {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  form.append('sign', apiSign(method, apiId, signParts, apiKey));
  let res;
  try {
    // multipart/form-data — как в документации; границу заголовка fetch ставит сам по FormData
    res = await fetch(`${BASE}/${method}/${encodeURIComponent(apiId)}`, {
      method: 'POST', headers: { accept: 'application/json' }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new CoreError('UPSTREAM_TIMEOUT', `Касса не ответила за ${TIMEOUT_MS / 1000} с`, { details: { method }, cause: e });
    }
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Касса недоступна (сеть или DNS)', { details: { method, reason: e?.cause?.code || e?.message }, cause: e });
  }
  let text;
  try { text = await res.text(); }
  catch (e) { throw new CoreError('UPSTREAM_UNAVAILABLE', 'Ответ кассы оборвался', { details: { method }, cause: e }); }
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* не JSON — ниже */ }
  if (data?.error) throw apiFail(data.error, method);
  if (!res.ok) throw httpFail(res.status, method);
  if (!data || typeof data !== 'object' || !data.result || typeof data.result !== 'object') {
    throw new CoreError('UPSTREAM_BAD_RESPONSE', `Касса ответила не тем (HTTP ${res.status})`, { details: { method, sample: text.slice(0, 120) } });
  }
  return data.result;
}

/**
 * Запрос к API кассы → result. cfg — {apiId, apiKey}; params — поля формы; signParts — значения
 * для подписи в порядке документации. read: true — повторять до 3 раз при временных сбоях
 */
export const request = (cfg, method, params, signParts, { read = false } = {}) => limiter.run(async () => {
  const tries = read ? TRIES : 1;
  for (let i = 1; ; i++) {
    try {
      return await once(cfg, method, params, signParts);
    } catch (e) {
      if (i >= tries || !e.retryable) throw e;
      await sleep(500 * 3 ** (i - 1));
    }
  }
});

export const upstreamStats = () => limiter.stats();
