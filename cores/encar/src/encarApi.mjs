// Запасной маршрут ядра Encar — encar-api.com (15.11.2026). Основной — шлюз kmotors (upstream.mjs).
//
// Зачем. 13.11 Encar заблокировал адреса kmotors, шлюз отвечал «машина не найдена» на любую машину,
// и KOK остался без Кореи. encar-api.com — сторонний сервис (не Encar; кто за ним — на сайте не
// сказано), отдаёт машину Encar одним JSON по номеру, с английскими названиями, опциями, историей
// и фото. Бесплатный ключ — 100 запросов в сутки (сброс в полночь UTC) и 30 дней жизни; ходим сюда
// только когда шлюз не справился, поэтому суток хватает с запасом.
//
// Здесь две вещи: запрос (ответы сервиса → коды контракта, кэш 10 минут — столько разрешают сами
// encar-api) и перевод ответа в карточку шлюза (CarouselCar). Карточка обязана совпадать со шлюзовой
// поле в поле: пайплайны не знают, каким маршрутом пришла машина. Сверено на Ford 40303537 со
// снимком шлюза tests/fixtures/encar/40303537.json.
//
// .env: ENCAR_API_KEY — ключ (пусто — запасного маршрута нет), ENCAR_API_BASE — адрес (по умолчанию
// https://api.encar-api.com/api).
import { CoreError } from '../../kit/errors.mjs';
import { COMFORT_CODES, OPTION_EN, RANK, SAFETY_CODES } from './options.mjs';

const config = () => ({
  base: String(process.env.ENCAR_API_BASE || 'https://api.encar-api.com/api').replace(/\/+$/, ''),
  key: String(process.env.ENCAR_API_KEY || '').trim(),
});
export const encarApiEnabled = () => Boolean(config().key);

// Замер 14.11: ответ 1,4–1,7 с. 20 с — с большим запасом, но не минута, как у шлюза: сюда идём,
// когда клиент уже прождал шлюз
const TIMEOUT_MS = 20_000;
// «Можно переиспользовать тот же ответ до 10 минут» — правило encar-api. Карусель и лот по ссылке
// часто просят одну машину дважды подряд (собрать → пересобрать); второй раз лимит не тратим
const CACHE_MS = 10 * 60_000;
const cache = new Map();
export const resetEncarApiCache = () => cache.clear();

/** Сколько запросов осталось на сегодня — из заголовка последнего ответа (для журнала) */
let remaining = null;
export const encarApiRemaining = () => remaining;

async function once(id, signal) {
  const { base, key } = config();
  const path = `/car?id=${id}`;
  let res;
  try {
    res = await fetch(base + path, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new CoreError('UPSTREAM_TIMEOUT', 'Источник «Корея» не ответил вовремя — попробуйте ещё раз', { details: { route: 'encar-api', path }, cause: e });
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Источник «Корея» недоступен — попробуйте чуть позже', { details: { route: 'encar-api', path, reason: e?.cause?.code || e?.message }, cause: e });
  }
  const left = Number(res.headers.get('x-ratelimit-remaining'));
  if (Number.isFinite(left)) remaining = left;

  let body = null;
  try { body = await res.json(); } catch { /* разберём по статусу */ }

  // Продана или снята: проверяют вживую на каждый запрос (их слова), код SOLD_OR_REMOVED
  if (res.status === 404) throw new CoreError('NOT_FOUND', 'Машина не найдена — возможно, объявление снято', { details: { route: 'encar-api', path, said: body?.code } });
  // 401 — ключ неверный или кончился (бесплатный живёт 30 дней): чинить нам, клиенту — «недоступен»
  if (res.status === 401 || res.status === 403) throw new CoreError('UPSTREAM_BLOCKED', 'Источник «Корея» не принял запрос — мы уже разбираемся', { details: { route: 'encar-api', path, status: res.status, hint: 'проверь ENCAR_API_KEY — бесплатный ключ живёт 30 дней' } });
  if (res.status === 429) throw new CoreError('RATE_LIMITED', 'Источник «Корея» просит притормозить — попробуйте позже', { details: { route: 'encar-api', path, hint: 'кончился дневной лимит encar-api (сброс в полночь UTC)' } });
  if (!res.ok) throw new CoreError('UPSTREAM_UNAVAILABLE', 'Источник «Корея» временно не отвечает — попробуйте чуть позже', { details: { route: 'encar-api', path, status: res.status, said: String(body?.error ?? '').slice(0, 200) || undefined } });
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Источник «Корея» ответил не карточкой машины', { details: { route: 'encar-api', path } });
  return body;
}

/**
 * Машина с encar-api.com (сырой ответ). 503 «источник не ответил вовремя» — один повтор: так советуют
 * сами encar-api. Остальное без повторов: каждый запрос — из сотни на сутки.
 */
export async function encarApiCar(id, { signal } = {}) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  let body;
  try {
    body = await once(id, signal);
  } catch (e) {
    if (e?.code !== 'UPSTREAM_UNAVAILABLE' || e.details?.status !== 503) throw e;
    body = await once(id, signal);
  }
  cache.set(id, { at: Date.now(), body });
  if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
  return body;
}

// ---------- перевод в карточку шлюза ----------

const PHOTO_HOST = 'https://ci.encar.com';
// Как у шлюза: без параметра Encar отдаёт 640×360, с ним — оригинал 2200×1238
const PHOTO_SIZE = '?impolicy=heightRate&rh=1080';
// Ракурсы по коду снимка — те же списки предпочтений, что у шлюза (vehicleCard.ts, PICK)
const PICK = {
  hero: ['001', '003', '002', '004'],
  rear: ['002', '004', '003', '001'],
  interior: ['007', '010', '009'],
  dashboard: ['008', '009', '007'],
};
// Группы фото. Шлюз берёт их из типа снимка Encar (OUTER/INNER/OPTION), а encar-api типа не отдаёт —
// только путь с кодом. Коды групп выписаны по 12 снимкам шлюза (tests/fixtures/encar): 001–006 и
// 031–033 — снаружи, 007–010 и 034–036 — салон, остальное (015–024, 040–047 …) — детали. Незнакомый
// код уходит в детали: так он хотя бы не попадёт на обложку
const OUTER = new Set(['001', '002', '003', '004', '005', '006', '031', '032', '033']);
const INNER = new Set(['007', '008', '009', '010', '034', '035', '036']);

// Шлюз прибавляет к цене Encar стояночный сбор kmotors 440 000 ₩ (carPricing.ts, решение владельца
// kmotors 27.08) — цена в KOK всегда была с ним. Без сбора через запасной маршрут та же машина
// вышла бы дешевле на 440 тысяч, и цена прыгала бы в зависимости от маршрута
export const STORAGE_FEE_KRW = 440_000;

// Марки, которые Encar пишет склеенными с историческим названием (carLabels.ts шлюза)
const BRAND_ALIASES = { ChevroletGMDaewoo: 'Chevrolet', 'Renault-KoreaSamsung': 'Renault Korea', KG_Mobility_Ssangyong: 'KG Mobility' };
// Кузов шлюз переводит своим словарём и почти всегда оставляет пустым («대형차», «화물차» там нет).
// Берём слово encar-api, только если шлюз знает такое же: иначе на русском слайде вышло бы
// непереведённое «Truck». Написание — шлюзовое (MiniVan, Pickup Truck)
const BODY = { sedan: 'Sedan', hatchback: 'Hatchback', coupe: 'Coupe', convertible: 'Convertible', wagon: 'Wagon', minivan: 'MiniVan', crossover: 'Crossover', 'pickup truck': 'Pickup Truck' };

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const codeOf = (path) => (String(path).match(/_(\d{3})\.jpg/i) || [])[1] || null;
const rankOf = (code) => { const i = RANK.indexOf(code); return i === -1 ? RANK.length : i; };

/**
 * Ответ encar-api → карточка шлюза (CarouselCar). Без марки и модели карточка пустая — проверит
 * parseCard, как и ответ шлюза.
 * @param {object} v — ответ GET /car?id=
 * @param {string} id — номер из ссылки
 */
export function cardFromEncarApi(v, id) {
  const en = v.en && typeof v.en === 'object' ? v.en : {};
  const d = v.details && typeof v.details === 'object' ? v.details : {};

  // Номер машины (под ним лежат фото) — как card.id у шлюза: у перевыставленных объявлений он
  // отличается от номера в ссылке. encar-api отдаёт номер объявления, а номер машины виден в пути фото
  const photoId = (String(v.Photo ?? '').match(/(\d+)_$/) || [])[1];

  const photos = (Array.isArray(v.Photos) ? v.Photos : [])
    .map((p) => ({ path: str(p?.location), code: codeOf(p?.location) }))
    .filter((p) => p.path && p.code);
  const url = (p) => `${PHOTO_HOST}${p.path}${PHOTO_SIZE}`;
  const byCode = new Map(photos.map((p) => [p.code, url(p)]));
  const pick = (codes) => codes.map((c) => byCode.get(c)).find(Boolean) ?? null;
  const group = (test) => photos.filter((p) => test(p.code)).sort((a, b) => a.code.localeCompare(b.code)).map(url);

  const named = (Array.isArray(v.options) ? v.options : [])
    .map((o) => ({ code: String(o?.code ?? ''), name: OPTION_EN[String(o?.code ?? '')] }))
    .filter((o) => o.name)
    .sort((a, b) => rankOf(a.code) - rankOf(b.code));

  const manwon = num(v.Price);
  const h = v.history && typeof v.history === 'object' ? v.history : null;
  const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const brand = str(en.manufacturer);

  return {
    id: photoId || String(v.Id ?? id),
    source: `https://www.kmotors.shop/en/catalog/${id}`,
    brand: BRAND_ALIASES[brand] ?? brand,
    model: str(en.modelGroup) || str(en.model),
    grade: str(en.badge),
    trim: str(en.badgeDetail),
    year: num(v.FormYear),
    firstRegistered: str(d.firstRegistration) || str(h?.firstRegistration) || null,
    mileageKm: num(v.Mileage),
    displacementCc: num(d.displacement),
    transmission: str(en.transmission),
    fuel: str(en.fuelType),
    body: BODY[str(en.body).toLowerCase()] ?? '',
    color: str(en.color),
    seats: num(d.seats),
    vin: str(d.vin) || null,
    // Номерного знака encar-api не отдаёт; у шлюза он есть, но на слайды не идёт
    plate: null,
    // Курса здесь нет (ядро не знает про курсы KOK) — доллары по курсу дня считает слайд из вон
    // (src/carousel/price.ts берёт krw первым), поэтому usd пустой
    price: manwon ? { krw: manwon * 10_000 + STORAGE_FEE_KRW, usd: null, krwToUsd: null, quotedAt: null, rateSource: 'encar-api' } : null,
    // Счётчики есть, а списка страховых случаев по датам у encar-api нет: годы, выплаты и случаи пустые.
    // В рекламу история не идёт (решение 11.10), поэтому это не потеря
    history: h ? {
      accidentsOwn: n0(h.ownAccidents),
      accidentsOther: n0(h.otherAccidents),
      accidentsTotal: n0(h.ownAccidents) + n0(h.otherAccidents),
      accidentYears: [],
      maxPayoutKrw: null,
      claims: [],
      ownerChanges: n0(h.ownerChanges),
      theft: n0(h.theft),
      flood: n0(h.floodTotalLoss) + n0(h.floodPartialLoss),
      totalLoss: n0(h.totalLoss),
    } : null,
    options: {
      comfort: named.filter((o) => COMFORT_CODES.has(o.code)).map((o) => o.name),
      safety: named.filter((o) => SAFETY_CODES.has(o.code)).map((o) => o.name),
      other: named.filter((o) => !COMFORT_CODES.has(o.code) && !SAFETY_CODES.has(o.code)).map((o) => o.name),
      total: named.length,
    },
    photos: {
      hero: pick(PICK.hero),
      rear: pick(PICK.rear),
      interiorShot: pick(PICK.interior),
      dashboard: pick(PICK.dashboard),
      exterior: group((c) => OUTER.has(c)),
      interior: group((c) => INNER.has(c)),
      other: group((c) => !OUTER.has(c) && !INNER.has(c)),
    },
  };
}
