// Курс вона к доллару: берём раз в сутки и сутки держим (решение владельца 29.09).
//
// Зачем свой, а не из шлюза kmotors: там курс приходит вместе с машиной и только на момент
// её запроса, а лот без ссылки Encar курса не знал бы вовсе. Раньше курс вбивали руками
// «спросить у Николая», и он жил в лоте месяцами.
//
// Источник — open.er-api.com (бесплатный, без ключа, обновляется раз в сутки). Сутки кэша —
// ровно его ритм обновления: чаще спрашивать бессмысленно, реже — курс устаревает.
// Кэш — в памяти и в файле data/rates.json: перезапуск сервера (а на проде это каждая
// выкладка) не должен заново ходить за курсом, если он ещё свежий.
//
// Источник не ответил — отдаём последний известный курс с пометкой stale: цена по
// вчерашнему курсу лучше, чем ролик, который не собирается. Если курса не было никогда —
// честная ошибка.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DATA_DIR, HttpError} from './store.mjs';

// Источник, срок кэша и таймаут — почему именно они, см. шапку файла
const SOURCE = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const cacheFile = () => path.join(DATA_DIR, 'rates.json');

/** @type {{krwPerUsd: number, fetchedAt: string, source: string} | null} */
let cached = null;
// Одновременные запросы после истечения суток ждут один поход к источнику, а не шлют каждый свой
let inflight = null;

const fresh = (r) => r && Date.now() - new Date(r.fetchedAt).getTime() < TTL_MS;

const load = async () => {
  if (cached) return cached;
  try { cached = JSON.parse(await fs.readFile(cacheFile(), 'utf8')); } catch { cached = null; }
  return cached;
};

const fetchRate = async () => {
  const res = await fetch(SOURCE, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  if (!res.ok) throw new Error(`источник курса ответил ${res.status}`);
  const body = await res.json();
  const krw = Number(body?.rates?.KRW);
  // Защита от мусора в ответе: курс вона последние десятилетия — сотни-тысячи за доллар.
  // Ноль или 1 (частый вид поломки API) дали бы цену в миллионы долларов в ролике
  if (!Number.isFinite(krw) || krw < 500 || krw > 5000) throw new Error(`странный курс от источника: ${body?.rates?.KRW}`);
  // Две цифры после запятой — точнее банки и не котируют; в лоте это поле «₩ за $1»
  return {krwPerUsd: Math.round(krw * 100) / 100, fetchedAt: new Date().toISOString(), source: 'open.er-api.com'};
};

/**
 * Курс ₩ за $1: {krwPerUsd, fetchedAt, source, stale}. stale — источник не ответил,
 * а курс старше суток: показываем его, но интерфейс предупреждает.
 */
export const usdKrw = async () => {
  const known = await load();
  if (fresh(known)) return {...known, stale: false};
  inflight ??= fetchRate()
    .then(async (r) => {
      cached = r;
      await fs.mkdir(DATA_DIR, {recursive: true});
      await fs.writeFile(cacheFile(), JSON.stringify(r, null, 2));
      return {...r, stale: false};
    })
    .catch((e) => {
      console.error(`Курс ₩/$ не обновился: ${e.message}`);
      if (known) return {...known, stale: true};
      throw new HttpError(502, 'Курс вона пока недоступен — впишите его вручную');
    })
    .finally(() => { inflight = null; });
  return inflight;
};

/** Для тестов: забыть курс в памяти */
export const resetRateCache = () => { cached = null; inflight = null; };
