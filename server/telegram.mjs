// Сообщения в рабочую группу «KOK — работа» в Telegram (12.10): владелец и Дмитрий (общение
// с клиентами) — в одной группе с темами, бот пишет в нужную тему. Сейчас — тема «Оплаты».
//
// Почему Telegram, а не письмо: о недоплате или несошедшейся сверке надо узнать сразу, а не
// когда клиент напишет «я заплатил, где кредиты». Письма читают реже.
//
// Отправка никогда не ломает то, о чём сообщает: оплата начислена — она начислена, даже если
// Telegram не ответил. Ошибка — только строка в журнал сервера.
//
// Тот же бот — и поддержка клиентов (server/support.mjs): тема на клиента, переписка через бота.
//
// .env: TELEGRAM_BOT_TOKEN (бот @kok_work_bot), TELEGRAM_CHAT_ID (группа), TELEGRAM_PAYMENTS_TOPIC
// (номер темы «Оплаты» — второй сегмент её ссылки t.me/c/<группа>/<тема>). Нет токена или
// группы — молчим: на Mac без бота и в тестах.
import {serverLog} from './log.mjs';

// warn, а не error: тревоги о сбоях сами идут через Telegram (server/alarm.mjs) — его отказ не должен
// звать новую тревогу по кругу
const log = serverLog('telegram');
const TIMEOUT_MS = 10_000;

const settings = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN?.trim(),
  chat: process.env.TELEGRAM_CHAT_ID?.trim(),
});

let transport = null;
/** Для тестов: перехватить сообщения вместо отправки. Без аргумента — снова настоящая отправка */
export const setTelegramTransport = (fn = null) => { transport = fn; };

/**
 * Текст пользователя (название компании, имя) — в безопасный вид для разметки HTML Telegram.
 * Без этого «<» или «&» в названии сломали бы разметку, и сообщение не ушло бы вовсе
 */
export const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Разметку снимаем для запасной отправки простым текстом
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const send = async (token, payload) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.json().catch(() => ({ok: false, description: `HTTP ${res.status}`}));
};

/**
 * Написать в тему группы. topic — номер темы; пусто — в общую ленту группы.
 * Текст — в разметке HTML Telegram (<b>, <i>, <code>); всё, что пришло от людей, — через esc().
 * Если Telegram всё же не разобрал разметку, отправляем то же простым текстом: сообщение об
 * оплате важнее красоты
 */
export const notify = async (html, {topic} = {}) => {
  const {token, chat} = settings();
  const thread = Number(topic) || undefined;
  if (transport) return transport({text: plain(html), html, topic: thread});
  if (!token || !chat) return;
  const base = {chat_id: chat, message_thread_id: thread, disable_web_page_preview: true};
  try {
    let data = await send(token, {...base, text: html, parse_mode: 'HTML'});
    if (!data.ok && /parse entities/i.test(data.description ?? '')) data = await send(token, {...base, text: plain(html)});
    if (!data.ok) log.warn('send.rejected', {description: data.description});
  } catch (e) {
    log.warn('send.failed', {error: e});
  }
};

/** Ошибка Bot API: code — HTTP-код Telegram (403 — клиент заблокировал бота), description — его слова */
export class TelegramError extends Error {
  constructor(method, data) {
    super(`Telegram ${method}: ${data?.description ?? 'нет ответа'}`);
    this.code = data?.error_code ?? 0;
    this.description = data?.description ?? '';
  }
}

let api = null;
/** Для тестов: подменить вызовы Bot API (method, payload) → result. Без аргумента — снова настоящие */
export const setTelegramApi = (fn = null) => { api = fn; };

/** Есть ли бот и рабочая группа — без них поддержка и сообщения молчат */
export const telegramReady = () => Boolean(api || (settings().token && settings().chat));
export const workChat = () => settings().chat;

/**
 * Любой метод Bot API (бот поддержки, server/support.mjs). Возвращает result, при отказе — TelegramError.
 * timeoutMs — для долгого опроса getUpdates, который сам держит соединение до 50 с
 */
export const tgCall = async (method, payload = {}, {timeoutMs = TIMEOUT_MS} = {}) => {
  if (api) return api(method, payload);
  const {token} = settings();
  if (!token) throw new TelegramError(method, {description: 'нет TELEGRAM_BOT_TOKEN'});
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({ok: false, error_code: res.status, description: `HTTP ${res.status}`}));
  if (!data.ok) throw new TelegramError(method, data);
  return data.result;
};

/** В тему «Оплаты» */
export const notifyPayments = (text) => notify(text, {topic: process.env.TELEGRAM_PAYMENTS_TOPIC});
