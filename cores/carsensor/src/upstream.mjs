// Страница машины на carsensor.net (Recruit, Япония) — сеть и перевод сбоев в коды контракта
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
//
// API у Carsensor нет: официальный Recruit WEB Service для Carsensor закрыт (12.10 отвечает
// страницей ошибки), внутреннего JSON у страницы нет — всё в HTML. Страница отдаётся обычным
// запросом без кук и проверки на бота, с Mac и с axis-vps одинаково (проверено 12.10).
import { CoreError } from '../../kit/errors.mjs';
import { createLimiter } from '../../kit/limiter.mjs';

// Адрес можно подменить — так проверяем, как ядро переживает недоступный источник.
const BASE = (process.env.CARSENSOR_BASE || 'https://www.carsensor.net').replace(/\/$/, '');
// Обычный браузер: страница одинакова и без него, но запрос «как у Node» (undici) — первое, что
// режут защиты от ботов, если их однажды включат
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const TIMEOUT_MS = Number(process.env.CARSENSOR_TIMEOUT_MS) || 15_000;
const TRIES = 3;   // контракт: не больше 3 попыток и только для retryable
// Машина = один запрос (~470 КБ HTML, 0,6–1,5 с). Два разом: сайт чужой и без API — десяток
// машин подряд не должен выглядеть как налёт
const limiter = createLimiter({ concurrency: 2, maxQueue: 200 });
export const upstreamStats = () => limiter.stats();

export const detailUrl = ref => `${BASE}/usedcar/detail/${encodeURIComponent(ref)}/index.html`;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function once(url, ref, signal) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'ja,en;q=0.8' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new CoreError('UPSTREAM_TIMEOUT', `Carsensor не ответил за ${TIMEOUT_MS / 1000} с`, { details: { ref }, cause: e });
    if (e?.name === 'AbortError') throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к Carsensor прерван по общему таймауту', { details: { ref }, cause: e });
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Carsensor недоступен (сеть или DNS)', { details: { ref, reason: e?.cause?.code || e?.message }, cause: e });
  }

  // Снятая машина — 404 со страницей «掲載終了» («показ окончен»); неверный номер — так же
  if (res.status === 404) throw new CoreError('NOT_FOUND', `Машины ${ref} нет на Carsensor — объявление снято или номер неверный`, { details: { ref } });
  if (res.status === 429) throw new CoreError('RATE_LIMITED', 'Carsensor просит снизить частоту запросов', { details: { ref } });
  if (res.status === 403) throw new CoreError('UPSTREAM_BLOCKED', 'Carsensor закрыл доступ (403) — возможно, включили защиту от ботов', { details: { ref } });
  if (res.status >= 500) throw new CoreError('UPSTREAM_UNAVAILABLE', `Carsensor ответил ошибкой ${res.status}`, { details: { ref, status: res.status } });
  if (!res.ok) throw new CoreError('UPSTREAM_BAD_RESPONSE', `Carsensor ответил HTTP ${res.status}`, { details: { ref, status: res.status } });

  let html;
  try { html = await res.text(); }
  catch (e) { throw new CoreError('UPSTREAM_UNAVAILABLE', 'Ответ Carsensor оборвался', { details: { ref }, cause: e }); }
  // На случай, если 404 однажды сменят на 200 с той же страницей
  if (/掲載終了/.test(html.slice(0, 3000))) throw new CoreError('NOT_FOUND', `Машины ${ref} нет на Carsensor — объявление снято`, { details: { ref } });
  // Своя карточка машины всегда несёт JSON-LD Product. Нет его — это не страница машины
  // (проверка на бота, заглушка, переделка сайта): разбирать нечего
  if (!/"@type"\s*:\s*"Product"/.test(html)) {
    if (/captcha|robot|アクセスが集中/i.test(html)) throw new CoreError('UPSTREAM_BLOCKED', 'Carsensor показал проверку вместо страницы машины', { details: { ref } });
    throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Carsensor отдал страницу без карточки машины — похоже, поменялась вёрстка', { details: { ref, sample: html.slice(0, 120) } });
  }
  return html;
}

/**
 * HTML страницы машины с повторами (только retryable, пауза 0,5 / 1 с) через общий ограничитель.
 * В лог: каждый повтор — warn «upstream.retry» (контракт, раздел 6), удача — debug «upstream.ok»
 * со временем и размером: по ним видно, тормозит ли Carsensor и не сменилась ли страница.
 */
export function fetchDetail(ref, { signal, log } = {}) {
  const url = detailUrl(ref);
  return limiter.run(async () => {
    let last;
    for (let i = 0; i < TRIES; i++) {
      if (signal?.aborted) throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к Carsensor прерван по общему таймауту', { details: { ref } });
      const t0 = Date.now();
      try {
        const html = await once(url, ref, signal);
        log?.debug('upstream.ok', { ref, attempt: i + 1, ms: Date.now() - t0, kb: Math.round(html.length / 1024) });
        return html;
      } catch (e) {
        last = e;
        if (!e.retryable || i === TRIES - 1) break;
        const waitMs = 500 * (i + 1);
        log?.warn('upstream.retry', { ref, attempt: i + 1, code: e.code, ms: Date.now() - t0, waitMs });
        await sleep(waitMs, signal).catch(() => {});
      }
    }
    if (last && last.retryable) last.details = { ...last.details, tries: TRIES };
    throw last;
  });
}
