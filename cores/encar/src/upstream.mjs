// Шлюз kmotors (`/api/vehicle/<номер>`) — единственный способ, которым ядро Encar получает машину.
// Encar режет адреса дата-центров, шлюз ходит туда сам и умеет обходить блокировку своим прокси
// (~/Desktop/recup/KMotors-1/src/app/api/vehicle/[id]/route.ts).
// Здесь — всё, что может пойти не так на стороне шлюза, и перевод в коды контракта
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
import { CoreError } from '../../kit/errors.mjs';
import { createLimiter } from '../../kit/limiter.mjs';

// Адрес и секрет — из окружения, как у других ядер (CHE168_API_BASE). Читаем при каждом вызове:
// тесты и CLI подменяют их на ходу, а стоит это ничего
const config = () => ({
  base: String(process.env.KMOTORS_API_URL || '').replace(/\/+$/, ''),
  secret: process.env.KMOTORS_API_SECRET || '',
});
// Шлюз сам ждёт Encar (8 с) и запасной прокси, которому на холодную нужны десятки секунд —
// поэтому минута, а не 15 с, как у che168 (замер 29.09)
const TIMEOUT_MS = () => Number(process.env.CAROUSEL_TIMEOUT_MS) || 60_000;
const TRIES = 3;

// Шлюз — один процесс Next.js на соседнем сервере, и за ним Encar с прокси. Три машины разом
// он тянет спокойно; очередь больше 30 — признак, что что-то зациклилось, а не наплыв клиентов
const limiter = createLimiter({ concurrency: 3, maxQueue: 30 });
export const upstreamStats = () => limiter.stats();

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

// Один запрос → карточка шлюза (объект) или CoreError с правильным кодом
async function once(id, signal) {
  const { base, secret } = config();
  // Шлюз не настроен — это не сбой Encar, а настройка сервера: повторять бессмысленно, текст
  // клиенту даст граница, подробности — в лог
  if (!base || !secret) throw new CoreError('INTERNAL', 'Не настроен шлюз: нужны KMOTORS_API_URL и KMOTORS_API_SECRET', { details: { setting: !base ? 'KMOTORS_API_URL' : 'KMOTORS_API_SECRET' } });
  const path = `/api/vehicle/${id}`;
  const ms = TIMEOUT_MS();
  let res;
  try {
    res = await fetch(base + path, {
      headers: { 'x-vehicle-secret': secret, accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new CoreError('UPSTREAM_TIMEOUT', 'Источник «Корея» не ответил вовремя — попробуйте ещё раз', { details: { path, ms }, cause: e });
    if (e?.name === 'AbortError') throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к источнику «Корея» прерван по общему таймауту', { details: { path }, cause: e });
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Источник «Корея» недоступен — попробуйте чуть позже', { details: { path, reason: e?.cause?.code || e?.message }, cause: e });
  }

  if (res.status === 404) throw new CoreError('NOT_FOUND', 'Машина не найдена — возможно, объявление снято', { details: { path } });
  if (res.status === 401 || res.status === 403) {
    // Шлюз не принял секрет. Клиенту — «недоступен», в лог — что именно чинить
    throw new CoreError('UPSTREAM_BLOCKED', 'Источник «Корея» не принял запрос — мы уже разбираемся', { details: { path, status: res.status, hint: 'проверь KMOTORS_API_SECRET' } });
  }
  if (res.status === 429) throw new CoreError('RATE_LIMITED', 'Источник «Корея» просит притормозить — попробуйте через минуту', { details: { path } });

  let text;
  try { text = await res.text(); }
  catch (e) { throw new CoreError('UPSTREAM_UNAVAILABLE', 'Ответ источника «Корея» оборвался', { details: { path }, cause: e }); }

  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* разберём ниже по статусу */ }

  if (!res.ok) {
    // Шлюз сам объясняет сбой Encar строкой error — её в подробности, клиенту — общий текст
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Источник «Корея» временно не отвечает — попробуйте чуть позже', { details: { path, status: res.status, said: String(body?.error ?? '').slice(0, 200) || undefined } });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    // Зависший шлюз отдаёт пустую страницу со статусом 200 на любой запрос — раньше клиент видел
    // «Unexpected end of JSON input». Лечится перезапуском kmotors (CLAUDE.md)
    throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Источник «Корея» ответил пустой страницей — попробуйте чуть позже', {
      details: { path, status: res.status, empty: !text, sample: text.slice(0, 120), hint: text ? undefined : 'похоже, kmotors завис — перезапустить' },
    });
  }
  return body;
}

/**
 * Карточка шлюза по номеру Encar. Повторы — только для retryable и не для таймаута: попытка
 * и так длится до минуты, повтор после неё вышел бы за общий таймаут вызывающего.
 * Через общий ограничитель параллельности.
 */
export function vehicle(id, { signal } = {}) {
  return limiter.run(async () => {
    let last;
    for (let i = 0; i < TRIES; i++) {
      if (signal?.aborted) throw new CoreError('UPSTREAM_TIMEOUT', 'Запрос к источнику «Корея» прерван по общему таймауту', { details: { id } });
      try {
        return await once(id, signal);
      } catch (e) {
        last = e;
        if (!e.retryable || e.code === 'UPSTREAM_TIMEOUT' || i === TRIES - 1) break;
        await sleep(700 * (i + 1), signal).catch(() => {});
      }
    }
    if (last?.retryable && last.code !== 'UPSTREAM_TIMEOUT') last.details = { ...last.details, tries: TRIES };
    throw last;
  });
}

/** Жив ли шлюз: любой ответ на корень — жив (Next отдаёт редирект на язык) */
export async function ping({ signal } = {}) {
  const { base } = config();
  if (!base) throw new CoreError('INTERNAL', 'Не настроен шлюз: нужен KMOTORS_API_URL');
  try {
    await fetch(base + '/', { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new CoreError(e?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', 'Шлюз kmotors не отвечает', { cause: e });
  }
}
