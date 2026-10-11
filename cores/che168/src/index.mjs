// Точка входа модуля-ядра che168 по контракту (cores/CONTRACT.md, раздел 2): core, getCar,
// checkUpstream. KOK (server/che168.mjs) и CLI (bin/fetch.mjs) зовут только это.
// Отсюда выходят только CoreError; частичные данные — warnings, а не ошибка.
import { CoreError, toCoreError, warning } from '../../kit/errors.mjs';
import { createLogger } from '../../kit/log.mjs';
import { api } from './upstream.mjs';
import { parseInfoId, parseCar, parseCommon, parseSpecs, parseOptions, parseInspection, obj } from './parse.mjs';

export const core = Object.freeze({
  id: 'che168',
  title: 'Китай · che168 (Autohome), международная версия',
  version: '1.0.0',
  contract: 2,
  // Международная версия переведена Autohome сама. Нужны en и ru (язык постов профиля KOK),
  // остальные — в запасе: ar, fr, es, pt, de, it, zh.
  languages: { supported: ['en', 'ru', 'ar', 'fr', 'es', 'pt', 'de', 'it', 'zh'], default: ['en', 'ru'] },
  refExamples: [
    'https://www.che168.com/dealer/513988/60154824.html',
    'https://global.che168.com/en/detail/60152276',
    'https://m.che168.com/cardetail/index?infoid=60154824',
    '60154824',
  ],
});

const defaultLog = createLogger(core.id);

// Кэш готовых карточек и склейка одинаковых запросов: машины меняются редко, а один и тот же
// номер стенд и пайплайн просят по несколько раз подряд. Ошибки не кэшируем.
const CACHE_MS = 30 * 60_000;
const CACHE_MAX = 500;
const cache = new Map();     // key → { at, value }
const inflight = new Map();  // key → Promise

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

// Необязательная часть: не пришла — предупреждение, карточка всё равно отдаётся.
// NOT_FOUND у части — тоже не ошибка (например, у комплектации нет таблицы параметров).
async function optional(part, fn, { warnings, log, signal }) {
  try {
    return await fn();
  } catch (e) {
    const err = toCoreError(e);
    // Общий таймаут запроса — это не «часть не пришла», а конец всего запроса.
    if (signal?.aborted) throw err;
    warnings.push(warning(err.code === 'NOT_FOUND' ? 'PART_MISSING' : 'PART_FAILED', part, `${part}: ${err.message}`));
    if (err.code === 'INTERNAL' || err.code === 'UPSTREAM_BAD_RESPONSE') log.error('part.failed', { part, error: err });
    return null;
  }
}

// Разбор части: упал — значит, источник поменял формат или в ядре баг. Для части — предупреждение.
function safeParse(part, fn, warnings, log) {
  try {
    return fn();
  } catch (e) {
    log.error('parse.failed', { part, error: e });
    warnings.push(warning('PART_FAILED', part, `${part}: не удалось разобрать ответ che168`));
    return null;
  }
}

async function fetchLang(ref, lang, { signal, log, warnings }) {
  const carinfo = await api(`carinfo/${ref}`, { language: lang }, { signal });
  // На несуществующий или снятый номер API отвечает успехом с result: null.
  if (carinfo == null) throw new CoreError('NOT_FOUND', `Машины ${ref} нет на che168 — снята с продажи или неверный номер`);
  if (typeof carinfo !== 'object') throw new CoreError('UPSTREAM_BAD_RESPONSE', 'che168 поменял формат карточки машины', { details: { part: 'carinfo', lang } });
  const specid = obj(carinfo).specid;

  const w = [];
  const ctx = { warnings: w, log, signal };
  if (!specid) w.push(warning('PART_MISSING', 'specs', 'specs, options: у машины нет specid — параметров и опций не будет'));
  const [specparam, specconfig, report] = await Promise.all([
    specid ? optional('specs', () => api('specparam', { specid, language: lang }, { signal }), ctx) : null,
    specid ? optional('options', () => api('specconfig', { specid, language: lang }, { signal }), ctx) : null,
    // Параметр именно infoId (с большой I): с infoid/carid API отвечает «无效的车源ID».
    optional('inspection', () => api('getcarreport', { infoId: ref, language: lang }, { signal }), ctx),
  ]);
  // Предупреждения одинаковы на всех языках — пишем только с первого, без повторов.
  for (const x of w) if (!warnings.some(y => y.part === x.part)) warnings.push(x);
  return { carinfo, specparam, specconfig, report };
}

/**
 * Машина по ссылке или номеру.
 * @returns {Promise<{data: object, warnings: object[]}>}
 * @throws {CoreError}
 */
export async function getCar(ref, { langs = core.languages.default, signal, log = defaultLog, raw = false } = {}) {
  const infoid = parseInfoId(ref);
  if (!infoid) throw new CoreError('BAD_INPUT', 'Не нашёл номер машины — нужна ссылка che168.com / global.che168.com или номер', { details: { ref: String(ref ?? '').slice(0, 200) } });
  const list = [...new Set(Array.isArray(langs) ? langs : [])];
  if (!list.length) throw new CoreError('BAD_INPUT', 'Не указан язык');
  const bad = list.filter(l => !core.languages.supported.includes(l));
  if (bad.length) throw new CoreError('BAD_INPUT', `Язык не поддерживается: ${bad.join(', ')}. Есть: ${core.languages.supported.join(', ')}`);

  const key = `${infoid}|${list.join(',')}|${raw ? 1 : 0}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const warnings = [];
    const raws = {};
    // Языки параллельно: каждый — 4 запроса, общий ограничитель не даст их больше 4 разом.
    await Promise.all(list.map(async l => { raws[l] = await fetchLang(infoid, l, { signal, log, warnings }); }));

    const first = raws[list[0]];
    let common;
    try { common = parseCommon(first.carinfo, infoid); }
    catch (e) { throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Не удалось разобрать карточку che168 — похоже, поменялся формат', { details: { part: 'carinfo' }, cause: e }); }

    const byLang = {};
    for (const l of list) {
      const r = raws[l];
      let car;
      try { car = parseCar(r.carinfo); }
      catch (e) { throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Не удалось разобрать карточку che168 — похоже, поменялся формат', { details: { part: 'carinfo', lang: l }, cause: e }); }
      const sp = r.specparam ? safeParse('specs', () => parseSpecs(r.specparam), warnings, log) : null;
      byLang[l] = {
        car,
        newPriceCny: sp?.newPriceCny ?? null,
        specs: sp?.specs ?? [],
        options: (r.specconfig && safeParse('options', () => parseOptions(r.specconfig), warnings, log)) || [],
        // Отчёт только у сертифицированных: у остальных 95 точек — шаблон, не результат.
        inspection: common.certified && r.report ? safeParse('inspection', () => parseInspection(r.report, { reportUrl: common.reportUrl }), warnings, log) : null,
      };
    }
    if (!common.photos.length) warnings.push(warning('PART_MISSING', 'photos', 'photos: у объявления нет фото'));

    const { certified, reportUrl, ...rest } = common;
    const data = { source: core.id, ref: infoid, fetchedAt: new Date().toISOString(), ...rest, certified, byLang, ...(raw ? { raw: raws } : {}) };
    const result = { data, warnings: dedupe(warnings) };
    cacheSet(key, result);
    return result;
  })();

  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

const dedupe = ws => ws.filter((w, i) => ws.findIndex(x => x.part === w.part && x.code === w.code) === i);

/** Жив ли источник: самый лёгкий запрос API (список языков). */
export async function checkUpstream({ signal } = {}) {
  const t0 = Date.now();
  const res = await api('lang', { language: 'en' }, { signal });
  if (!Array.isArray(res)) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'che168: /lang ответил не списком');
  return { ok: true, ms: Date.now() - t0 };
}
