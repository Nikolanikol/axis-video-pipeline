// Клиент открытого JSON-API международной версии che168 (globalapi.che168.com).
// Здесь — всё, что может пойти не так на стороне источника, и перевод этого в коды контракта
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
import { CoreError } from '../../kit/errors.mjs';
import { createLimiter } from '../../kit/limiter.mjs';

// Адрес можно подменить — так проверяем, как ядро переживает недоступный источник.
const API = (process.env.CHE168_API_BASE || 'https://globalapi.che168.com/api/v1').replace(/\/$/, '');
const APP_ID = 'global.pc';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const TIMEOUT_MS = Number(process.env.CHE168_TIMEOUT_MS) || 15_000;
const TRIES = 3;

// 4 запроса разом на всё ядро: машина = 4 запроса × 2 языка, так одна машина идёт двумя волнами
// (~1 с), а десяток машин подряд не выглядит для источника как налёт.
const limiter = createLimiter({ concurrency: 4, maxQueue: 200 });
export const upstreamStats = () => limiter.stats();

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

// Один HTTP-запрос → result или CoreError с правильным кодом.
async function once(url, path, signal) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new CoreError('UPSTREAM_TIMEOUT', `che168 не ответил за ${TIMEOUT_MS / 1000} с`, { details: { path }, cause: e });
    if (e?.name === 'AbortError') throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к che168 прерван по общему таймауту', { details: { path }, cause: e });
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'che168 недоступен (сеть или DNS)', { details: { path, reason: e?.cause?.code || e?.message }, cause: e });
  }

  if (res.status === 429) throw new CoreError('RATE_LIMITED', 'che168 просит снизить частоту запросов', { details: { path } });
  if (res.status === 403) throw new CoreError('UPSTREAM_BLOCKED', 'che168 закрыл доступ (403) — возможно, API закрыли проверкой на бота', { details: { path } });
  if (res.status >= 500) throw new CoreError('UPSTREAM_UNAVAILABLE', `che168 ответил ошибкой ${res.status}`, { details: { path, status: res.status } });

  let text;
  try { text = await res.text(); }
  catch (e) { throw new CoreError('UPSTREAM_UNAVAILABLE', 'Ответ che168 оборвался', { details: { path }, cause: e }); }

  let body;
  try { body = JSON.parse(text); }
  catch {
    // Признак закрытия API проверкой на бота — та же страница, что у сайта.
    if (/Security Verification|EO_Bot_Ssid|__tst_status/.test(text)) {
      throw new CoreError('UPSTREAM_BLOCKED', 'API che168 закрыли проверкой на бота', { details: { path, status: res.status } });
    }
    // HTML «Not Found» на верный адрес изредка бывает на миг — пусть повторится.
    const e = new CoreError('UPSTREAM_BAD_RESPONSE', `che168 ответил не JSON (HTTP ${res.status})`, { details: { path, status: res.status, sample: text.slice(0, 120) } });
    e.retryOnce = res.status === 404;
    throw e;
  }
  if (!body || typeof body !== 'object' || !('returncode' in body)) {
    throw new CoreError('UPSTREAM_BAD_RESPONSE', 'che168 поменял формат ответа: нет returncode', { details: { path } });
  }
  if (body.returncode !== 0) {
    // «无效的车源ID» — «неверный номер машины»
    if (/无效|车源ID|not exist/i.test(String(body.message))) throw new CoreError('NOT_FOUND', 'Машины с таким номером нет на che168', { details: { path } });
    throw new CoreError('UPSTREAM_BAD_RESPONSE', `che168 вернул ошибку: ${body.message} (код ${body.returncode})`, { details: { path, returncode: body.returncode } });
  }
  return body.result;
}

/**
 * GET к API с повторами: только для retryable (и один раз — для мимолётного HTML 404),
 * пауза 0,5 / 1 с. Через общий ограничитель параллельности.
 */
export function api(path, params = {}, { signal } = {}) {
  const url = new URL(`${API}/${path}`);
  url.search = new URLSearchParams({ _appid: APP_ID, ...params }).toString();
  return limiter.run(async () => {
    let last;
    for (let i = 0; i < TRIES; i++) {
      if (signal?.aborted) throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к che168 прерван по общему таймауту', { details: { path } });
      try {
        return await once(url, path, signal);
      } catch (e) {
        last = e;
        const again = e.retryable || (e.retryOnce && i === 0);
        if (!again || i === TRIES - 1) break;
        await sleep(500 * (i + 1), signal).catch(() => {});
      }
    }
    if (last && TRIES > 1 && last.retryable) last.details = { ...last.details, tries: TRIES };
    throw last;
  });
}
