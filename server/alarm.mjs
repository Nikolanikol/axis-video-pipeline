// Тревога о сбоях в Telegram (стандарт ошибок, 12.10): каждая строка журнала уровня error — сообщение
// в тему «Сбои» рабочей группы. Так о поломке рендера, ядра или базы узнаём сразу, а не когда
// клиент напишет «у меня не работает».
//
// Одинаковые сбои склеиваются: первый — сразу, повторы в течение 10 минут только считаются и
// приходят числом со следующим сообщением. Упавшая база иначе дала бы сообщение на каждый запрос.
// Оплаты сюда не идут: у них свои тревоги в теме «Оплаты» (server/payments.mjs).
//
// .env: TELEGRAM_ALERTS_TOPIC — номер темы «Сбои». Пусто — тревог нет (Mac, тесты), журнал пишется
// как обычно. Отправка не ломает то, о чём сообщает, и сама в тревогу не попадает.
import {fileURLToPath} from 'node:url';
import {configureLog} from '../cores/kit/log.mjs';
import {previewId} from './db/index.mjs';
import {esc, notify} from './telegram.mjs';

const WINDOW_MS = 10 * 60_000;
const SKIP = new Set(['payments']);
const seen = new Map();
const LINE = '— — — — — — — —';

// Пути в стеке — от корня проекта: в Telegram на телефоне полный путь занимает весь экран
const ROOT_URL = new URL('..', import.meta.url).href;
const ROOT_PATH = fileURLToPath(ROOT_URL);
const shortStack = (stack) => stack.split('\n').slice(1, 4)
  .map((s) => s.trim().replace(ROOT_URL, '').replace(ROOT_PATH, '')).join('\n');

const keyOf = (line) => `${line.core}:${line.module ?? ''}:${line.event}:${line.error?.message ?? ''}`;

/** Текст тревоги по строке журнала. repeats — сколько таких же было за прошлое окно */
export const alarmText = (line, repeats = 0) => {
  const pr = previewId();
  const where = [line.core, line.module].filter(Boolean).join(' · ');
  const err = line.error;
  return [
    `🔥 <b>Сбой</b>${pr ? ` · ТЕСТ · PR ${esc(pr)}` : ''}`,
    LINE,
    `📍 ${esc(where)} → <code>${esc(line.event)}</code>`,
    line.note ? `📝 ${esc(line.note)}` : null,
    line.path ? `🌐 ${esc(line.method ?? '')} ${esc(line.path)}` : null,
    err?.message ? `<i>${esc(String(err.message).slice(0, 400))}</i>` : null,
    err?.stack ? `<pre>${esc(shortStack(err.stack))}</pre>` : null,
    LINE,
    line.ws ? `🏢 ${esc(line.ws)}` : null,
    line.requestId ? `🔎 <code>${esc(line.requestId)}</code>` : null,
    repeats ? `🔁 ещё ${repeats} раз(а) за 10 минут до этого` : null,
  ].filter(Boolean).join('\n');
};

/** Решить, отправлять ли: склейка одинаковых в окне. Возвращает число склеенных повторов или null */
export const admit = (line, now = Date.now()) => {
  const key = keyOf(line);
  const prev = seen.get(key);
  if (prev && now - prev.at < WINDOW_MS) { prev.repeats++; return null; }
  seen.set(key, {at: now, repeats: 0});
  if (seen.size > 500) for (const [k, v] of seen) if (now - v.at >= WINDOW_MS) seen.delete(k);
  return prev?.repeats ?? 0;
};

export const resetAlarms = () => seen.clear();

/** Подключить тревоги к журналу — один раз при старте сервера (server/index.mjs) */
export const installAlarms = () => {
  configureLog({
    sink: (line) => {
      const topic = process.env.TELEGRAM_ALERTS_TOPIC?.trim();
      if (!topic || SKIP.has(line.core)) return;
      const repeats = admit(line);
      if (repeats === null) return;
      void notify(alarmText(line, repeats), {topic}).catch(() => {});
    },
  });
};
