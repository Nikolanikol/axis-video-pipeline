// Здоровье источников машин (14.11): Encar, che168, Carsensor. Тревога в тему «Сбои», когда источник
// перестаёт отдавать машины, хотя каждая отдельная ошибка выглядит «нормальной».
//
// Зачем отдельно от alarm.mjs. Тревога там — на строку журнала уровня error (поломка ядра, шлюза).
// А «машина не найдена», «источник недоступен», «таймаут» — уровень warn: по одной это обычное дело
// (клиент вставил ссылку на проданную машину). 13.11 Encar заблокировал шлюз kmotors, тот отвечал
// «не найдена» на каждую машину, и мы узнали об этом случайно. Поодиночке такие ответы безобидны,
// подряд у разных машин и без единого успеха — это сломанный источник.
//
// Правила (на каждый источник отдельно):
//  1. Серия неудач: STREAK_REFS разных машин подряд без единого успеха (кривые ссылки BAD_INPUT
//     не считаются — это ошибка клиента, а не источника) → «🚨 источник не отдаёт машины».
//     Пока серия идёт — напоминание раз в REMIND_MS с новым счётом.
//  2. Восстановление: первый успех после тревоги → «✅ снова отдаёт машины» с длительностью простоя.
//  3. Пустые карточки: STREAK_REFS разных машин подряд пришли без фото или без цены → тревога один
//     раз на серию. Так видно, что источник поменял вёрстку или формат и ядро тихо теряет часть.
//
// Счёт — в памяти процесса: после перезапуска начинается заново. Это нормально — серия ловит
// поломку за 3 запроса, а перезапуск сам по себе ничего не чинит.
// .env: TELEGRAM_ALERTS_TOPIC — та же тема «Сбои». Пусто — тревог нет, журнал пишется как обычно.
import {createLogger} from '../cores/kit/log.mjs';
import {previewId} from './db/index.mjs';
import {esc, notify} from './telegram.mjs';

const log = createLogger('sources');

// 3 разные машины подряд: две проданные ссылки подряд у клиента бывают, три без единого успеха —
// уже повод посмотреть. Лишняя тревога стоит одного сообщения, пропущенная — дней без машин
export const STREAK_REFS = 3;
const REMIND_MS = 60 * 60_000;
// Ошибка клиента, а не источника — серию не начинает и не прерывает
const IGNORE = new Set(['BAD_INPUT']);
const TITLE = {encar: 'Корея · Encar', che168: 'Китай · che168', carsensor: 'Япония · Carsensor'};
const LINE = '— — — — — — — —';

const state = new Map();
const fresh = () => ({
  fail: {refs: new Set(), count: 0, codes: {}, since: null, alarmedAt: null, lastMessage: null},
  empty: {refs: new Set(), parts: {}, alarmed: false},
  lastOkAt: null,
});
const of = (source) => state.get(source) ?? state.set(source, fresh()).get(source);

export const resetSourceHealth = () => state.clear();

const fmtMin = (ms) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
};
const fmtTime = (t) => t ? new Date(t).toLocaleString('ru-RU', {timeZone: 'Asia/Seoul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) + ' (Сеул)' : 'с запуска сервера не было';
const head = (icon, text) => {
  const pr = previewId();
  return `${icon} <b>${text}</b>${pr ? ` · ТЕСТ · PR ${esc(pr)}` : ''}`;
};
const codesText = (codes) => Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<code>${esc(c)}</code> ×${n}`).join(', ');

// Отправка не должна ломать запрос клиента, о котором сообщает
const send = (html) => {
  const topic = process.env.TELEGRAM_ALERTS_TOPIC?.trim();
  if (!topic) return;
  void Promise.resolve().then(() => notify(html, {topic})).catch(() => {});
};

/** Тексты тревог — отдельно, чтобы тест видел ровно то, что уйдёт в Telegram */
export const texts = {
  down: (source, f, lastOkAt) => [
    head('🚨', `Источник ${esc(TITLE[source] ?? source)} не отдаёт машины`),
    LINE,
    `❌ ${f.count} запрос(ов) подряд без машины, разных машин: ${f.refs.size}`,
    `📋 ${codesText(f.codes)}`,
    f.lastMessage ? `<i>${esc(String(f.lastMessage).slice(0, 300))}</i>` : null,
    `🕐 последняя удачная машина: ${esc(fmtTime(lastOkAt))}`,
    `⏱ серия идёт ${esc(fmtMin(Date.now() - f.since))}`,
    LINE,
    'Клиенты сейчас видят ошибку. «Не найдена» подряд у разных машин — обычно блокировка или поломка шлюза, а не проданные машины.',
  ].filter(Boolean).join('\n'),
  up: (source, f) => [
    head('✅', `Источник ${esc(TITLE[source] ?? source)} снова отдаёт машины`),
    `Простой ~${esc(fmtMin(Date.now() - f.since))}, неудачных запросов: ${f.count}`,
  ].join('\n'),
  empty: (source, e) => [
    head('⚠️', `Источник ${esc(TITLE[source] ?? source)} отдаёт неполные машины`),
    LINE,
    `${e.refs.size} машин(ы) подряд пришли без: ${Object.keys(e.parts).map((p) => PART_RU[p] ?? p).join(', ')}`,
    'Похоже, источник поменял формат и ядро теряет часть данных. Карусели и ролики выходят без этого.',
  ].join('\n'),
};
const PART_RU = {photos: 'фото', price: 'цены'};

/** Чего не хватает в готовой машине пайплайна (CarouselCar) для рекламы */
export const missingParts = (car) => {
  const out = [];
  const p = car?.photos;
  const photoCount = p ? [p.hero, p.rear, p.interiorShot, p.dashboard].filter(Boolean).length
    + (p.exterior?.length ?? 0) + (p.interior?.length ?? 0) + (p.other?.length ?? 0) : 0;
  if (!photoCount) out.push('photos');
  const pr = car?.price;
  if (!pr || !(pr.usd || pr.krw || pr.jpy)) out.push('price');
  return out;
};

/** Источник не отдал машину. code — код ядра (CoreError), message — текст ошибки */
export const sourceFailed = (source, {ref, code, message} = {}) => {
  if (IGNORE.has(code)) return;
  const s = of(source);
  const f = s.fail;
  const now = Date.now();
  f.since ??= now;
  f.count++;
  f.codes[code ?? 'UNKNOWN'] = (f.codes[code ?? 'UNKNOWN'] ?? 0) + 1;
  if (ref) f.refs.add(String(ref).slice(0, 200));
  f.lastMessage = message ?? f.lastMessage;
  if (f.refs.size < STREAK_REFS) return;
  if (f.alarmedAt && now - f.alarmedAt < REMIND_MS) return;
  f.alarmedAt = now;
  // warn, а не error: error сам ушёл бы в «Сбои» через alarm.mjs, и тревога пришла бы дважды
  log.warn('source.down', {source, count: f.count, refs: f.refs.size, codes: f.codes});
  send(texts.down(source, f, s.lastOkAt));
};

/** Источник отдал машину. car — машина пайплайна (для проверки на пустые части) */
export const sourceOk = (source, {ref, car} = {}) => {
  const s = of(source);
  const f = s.fail;
  if (f.alarmedAt) {
    log.info('source.up', {source, count: f.count, downMs: Date.now() - f.since});
    send(texts.up(source, f));
  }
  s.fail = fresh().fail;
  s.lastOkAt = Date.now();
  if (!car) return;
  const missing = missingParts(car);
  const e = s.empty;
  if (!missing.length) { s.empty = fresh().empty; return; }
  if (ref) e.refs.add(String(ref));
  for (const p of missing) e.parts[p] = (e.parts[p] ?? 0) + 1;
  if (e.refs.size < STREAK_REFS || e.alarmed) return;
  e.alarmed = true;
  log.warn('source.degraded', {source, refs: e.refs.size, parts: e.parts});
  send(texts.empty(source, e));
};
