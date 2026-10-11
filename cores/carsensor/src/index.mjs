// Точка входа модуля-ядра carsensor по контракту (cores/CONTRACT.md, раздел 2): core, getCar,
// checkUpstream. KOK (server/carsensor.mjs) и CLI (bin/fetch.mjs) зовут только это.
// Отсюда выходят только CoreError; частичные данные — warnings, а не ошибка.
import { CoreError, toCoreError, warning } from '../../kit/errors.mjs';
import { createLogger } from '../../kit/log.mjs';
import { fetchDetail } from './upstream.mjs';
import { parseRef, parsePage } from './parse.mjs';

export const core = Object.freeze({
  id: 'carsensor',
  title: 'Япония · Carsensor (Recruit), объявления дилеров',
  version: '1.0.0',
  contract: 2,
  // Сайт только японский. en — переводит само ядро словарями (dict.mjs), ru — только названия
  // опций (остальное KOK переводит своим словарём слайдов с английского), ja — как на сайте
  languages: { supported: ['en', 'ru', 'ja'], default: ['en', 'ru'] },
  refExamples: [
    'https://www.carsensor.net/usedcar/detail/AU7375484964/index.html',
    'AU7375484964',
  ],
});

const defaultLog = createLogger(core.id);

// Кэш и склейка одинаковых запросов — как у che168: один номер просят несколько раз подряд
// (лот по ссылке, потом карусель). Ошибки не кэшируем.
const CACHE_MS = 30 * 60_000;
const CACHE_MAX = 500;
const cache = new Map();
const inflight = new Map();
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

/** Карточка на языке: en — переведённая ядром, ja — как на сайте; ru — английская + русские опции */
function forLang(lang, page) {
  const { ja, en, options } = page;
  const opts = options.filter(o => o.has).map(o => ({
    group: o.group,
    // Перевода нет — японское как есть: пайплайн сам решит, показывать ли (опций много и без него)
    name: lang === 'ja' ? o.ja : (lang === 'ru' ? o.ru : o.en) ?? null,
    ja: o.ja,
  }));
  if (lang === 'ja') return { car: ja, options: opts };
  return { car: en, options: opts };
}

/**
 * Машина по ссылке или номеру.
 * @returns {Promise<{data: object, warnings: object[]}>}
 * @throws {CoreError}
 */
export async function getCar(ref, { langs = core.languages.default, signal, log = defaultLog, raw = false } = {}) {
  const id = parseRef(ref);
  if (!id) throw new CoreError('BAD_INPUT', 'Не нашёл номер машины — нужна ссылка carsensor.net/usedcar/detail/… или номер вида AU7375484964', { details: { ref: String(ref ?? '').slice(0, 200) } });
  const list = [...new Set(Array.isArray(langs) ? langs : [])];
  if (!list.length) throw new CoreError('BAD_INPUT', 'Не указан язык');
  const bad = list.filter(l => !core.languages.supported.includes(l));
  if (bad.length) throw new CoreError('BAD_INPUT', `Язык не поддерживается: ${bad.join(', ')}. Есть: ${core.languages.supported.join(', ')}`);

  const key = `${id}|${list.join(',')}|${raw ? 1 : 0}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    try {
      // Одна страница на все языки: перевод — наш, не сайта
      const html = await fetchDetail(id, { signal, log });
      const warnings = [];
      // Сломалась одна часть разбора — предупреждение и строка error в лог (чинить ядро), машина
      // отдаётся без неё. Без основы (JSON-LD) машины нет — это уже ошибка
      const onPartError = (part, e) => {
        log.error('parse.failed', { ref: id, part, error: e });
        warnings.push(warning('PART_FAILED', part, `${part}: не удалось разобрать страницу Carsensor`));
      };
      let page;
      try { page = parsePage(html, id, { onPartError }); }
      catch (e) { throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Не удалось разобрать страницу Carsensor — похоже, поменялась вёрстка', { details: { part: 'page' }, cause: e }); }

      const c = page.common;
      if (!c.price.amount) warnings.push(warning('PART_MISSING', 'price', 'price: дилер не указал цену (応談 — «по договорённости»)'));
      // Фото не разобрались — предупреждение уже есть, второе («нет фото») было бы неправдой
      if (warnings.some(w => w.part === 'photos')) { /* PART_FAILED уже записан */ }
      else if (!c.photos.length) warnings.push(warning('PART_MISSING', 'photos', 'photos: у объявления нет фото'));
      else if (!c.photos.some(p => p.ad)) warnings.push(warning('PART_MISSING', 'photos', 'photos: нет ни одного кадра машины с подписью ракурса — только баннеры и неподписанные'));
      if (!page.options.length && !warnings.some(w => w.part === 'options')) warnings.push(warning('PART_MISSING', 'options', 'options: на странице нет списка опций'));
      if (!page.en.brand || !page.en.model) warnings.push(warning('PART_FAILED', 'car', 'car: не нашёл латинское название марки или модели — взято японское'));
      const untranslated = page.options.filter(o => o.has && !o.en).map(o => o.ja);
      if (untranslated.length) {
        warnings.push(warning('PART_MISSING', 'options.translation', `options: нет перевода для ${untranslated.length}: ${untranslated.slice(0, 5).join(', ')}`));
        log.warn('dict.missing', { ref: id, part: 'options', words: untranslated });
      }

      const byLang = Object.fromEntries(list.map(l => [l, forLang(l, page)]));
      const data = {
        source: core.id, ref: id, fetchedAt: new Date().toISOString(),
        ...c, byLang, ...(raw ? { raw: { ja: page.ja, options: page.options } } : {}),
      };
      const result = { data, warnings };
      cacheSet(key, result);
      return result;
    } catch (e) {
      // Ядро не роняет KOK: всё чужое — INTERNAL со стеком в логе
      const err = toCoreError(e);
      if (err.code === 'INTERNAL') log.error('car.internal', { ref: id, error: e });
      throw err;
    }
  })();

  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

/** Жив ли источник: главная страница Carsensor (без машины — проверяем только сам сайт). */
export async function checkUpstream({ signal } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch((process.env.CARSENSOR_BASE || 'https://www.carsensor.net').replace(/\/$/, '') + '/robots.txt', {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
    if (res.status === 403) throw new CoreError('UPSTREAM_BLOCKED', 'Carsensor закрыл доступ (403)');
    if (!res.ok) throw new CoreError('UPSTREAM_UNAVAILABLE', `Carsensor ответил ${res.status}`);
  } catch (e) {
    if (e instanceof CoreError) throw e;
    throw new CoreError(e?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', 'Carsensor недоступен', { cause: e });
  }
  return { ok: true, ms: Date.now() - t0 };
}
