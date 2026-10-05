// Страница лота аукциона с kmotors.shop → данные машины (разбор — src/shared/kmotorsLot.js).
//
// Единственное место, откуда карусели по аукционным лотам ходят в сеть. Адрес берётся из
// ссылки, которую дал человек (kmotors.shop или office.kmotors.shop), но страницу всегда
// запрашиваем сами по одному адресу-источнику: так в сеть не уходит произвольный адрес из
// браузера (защита от обращений сервера куда угодно).
//
// Как работает из разных мест (решение владельца 06.10: «даём ссылку, сервер открывает
// страницу и разбирает»):
//   • прод (Германия): https://www.kmotors.shop — страницы открыты без входа;
//   • Корея: kmotors.shop закрыт целиком (403, проверено 06.10 на странице лота, списке
//     аукциона и даже /api/vehicle). Локально — два пути:
//       1) KMOTORS_LOT_FIXTURES=tests/fixtures/kmotors-lots — вместо сети читаются
//          сохранённые страницы (шесть лотов, по одному на площадку);
//       2) KMOTORS_LOT_ORIGIN=https://office.kmotors.shop — служебный сайт доступен из
//          Кореи, но закрыт Cloudflare Access; нужен сервисный токен (см. ниже).
//   • Cloudflare Access: KMOTORS_CF_ACCESS_ID и KMOTORS_CF_ACCESS_SECRET — сервисный токен
//     (Zero Trust → Access → Service Auth), отправляется заголовками CF-Access-Client-Id и
//     CF-Access-Client-Secret. Без них office отвечает перенаправлением на вход — мы это
//     распознаём и говорим человеку, что нужно настроить. Пароли и вход через браузер не нужны.
//
// Бережность: запросы идут по одному с зазором (лот редкий, но не залпом), один постоянный
// User-Agent, готовая страница кешируется на 10 минут, на 403/429 повторов нет.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {parseLotPage} from '../src/shared/kmotorsLot.js';
import {HttpError} from './store.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 20_000;
const GAP_MS = 1000;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 50;

const origin = () => (process.env.KMOTORS_LOT_ORIGIN?.trim() || 'https://www.kmotors.shop').replace(/\/+$/, '');

// Очередь: следующий запрос стартует не раньше, чем через GAP_MS после предыдущего
let tail = Promise.resolve();
let nextAt = 0;
const queued = (task) => {
  const run = tail.then(async () => {
    const wait = nextAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextAt = Date.now() + GAP_MS;
    return task();
  });
  tail = run.catch(() => undefined);
  return run;
};

const cache = new Map();

/** Сохранённая страница вместо сети (локальная разработка из Кореи, тесты) */
const fromFixtures = async (dir, house, id) => {
  try {
    const url = (await fs.readFile(path.join(dir, `${house}.url`), 'utf8')).trim();
    if (decodeURIComponent(url.split('/').pop()) !== id) return null;
    return zlib.gunzipSync(await fs.readFile(path.join(dir, `${house}.html.gz`))).toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Лот по площадке и номеру. Бросает HttpError с текстом, пригодным для интерфейса.
 * @param {{house: string, id: string}} lot — из parseLotLink
 * @param {{fetchImpl?: typeof fetch}} [options] — подмена сети в тестах
 * @returns {Promise<object>} данные машины (см. parseLotPage)
 */
export const fetchLot = async ({house, id}, {fetchImpl = fetch} = {}) => {
  const key = `${house}/${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lot;

  let html = null;
  const fixtures = process.env.KMOTORS_LOT_FIXTURES?.trim();
  if (fixtures) html = await fromFixtures(path.resolve(fixtures), house, id);
  if (html === null) html = await download(house, id, fetchImpl);

  const parsed = parseLotPage(html, {house, id});
  if (!parsed.ok) {
    if (parsed.reason === 'gone') throw new HttpError(404, 'Лот не найден — возможно, торги закончились и он ушёл со страницы');
    // Страница есть, а нужных данных в ней нет: сменилась вёрстка. Это поломка у нас, не у человека
    console.error(`[kmotors-lot] ${key}: страница отдалась, но лот не разобрался — сменилась вёрстка?`);
    throw new HttpError(502, 'Страница лота изменилась, и я не смог её прочитать. Сообщите разработчику');
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, {at: Date.now(), lot: parsed.lot});
  return parsed.lot;
};

const download = (house, id, fetchImpl) => queued(async () => {
  const base = origin();
  const url = `${base}/en/auction/lot/${encodeURIComponent(house)}/${encodeURIComponent(id)}`;
  const headers = {'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en'};
  const cfId = process.env.KMOTORS_CF_ACCESS_ID?.trim();
  const cfSecret = process.env.KMOTORS_CF_ACCESS_SECRET?.trim();
  if (cfId && cfSecret) { headers['CF-Access-Client-Id'] = cfId; headers['CF-Access-Client-Secret'] = cfSecret; }

  let res;
  try {
    // redirect: 'manual' — чтобы заметить перенаправление на вход Cloudflare Access, а не
    // молча получить страницу входа вместо лота
    res = await fetchImpl(url, {headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store'});
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new HttpError(504, 'Сайт лотов не ответил вовремя — попробуйте ещё раз');
    throw new HttpError(502, `Не достучались до сайта лотов: ${e?.message || e}`);
  }

  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get('location') || '';
    if (/cloudflareaccess\.com/i.test(to)) {
      throw new HttpError(400, cfId && cfSecret
        ? 'office.kmotors.shop не принял сервисный токен: проверьте KMOTORS_CF_ACCESS_ID и KMOTORS_CF_ACCESS_SECRET и что токен добавлен в политику приложения (Service Auth)'
        : 'office.kmotors.shop закрыт входом Cloudflare Access. Нужен сервисный токен: KMOTORS_CF_ACCESS_ID и KMOTORS_CF_ACCESS_SECRET');
    }
    throw new HttpError(502, `Сайт лотов перенаправил запрос (${res.status})`);
  }
  if (res.status === 403) {
    throw new HttpError(403, 'Сайт kmotors закрыт для этого адреса (так бывает из Кореи). С сервера в Германии он открывается; локально — KMOTORS_LOT_FIXTURES или KMOTORS_LOT_ORIGIN=https://office.kmotors.shop с сервисным токеном');
  }
  if (res.status === 404 || res.status === 410) throw new HttpError(404, 'Лот не найден — возможно, торги закончились и он ушёл со страницы');
  if (res.status === 429 || res.status === 503) throw new HttpError(503, 'Сайт лотов просит подождать — попробуйте через минуту');
  if (!res.ok) throw new HttpError(502, `Сайт лотов ответил ${res.status}`);
  return res.text();
});

/** Сбросить кеш и очередь — для тестов */
export const _reset = () => { cache.clear(); tail = Promise.resolve(); nextAt = 0; };
