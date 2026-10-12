// Поддержка клиентов в Telegram (12.10, задумка владельца).
//
// Клиент пишет боту @kok_work_bot в личку. В рабочей группе «KOK — работа» (с темами) на каждого
// клиента заводится своя тема: всё, что он пишет, бот копирует туда, а ответ владельца или Дмитрия в
// теме копирует клиенту. Клиент видит только диалог с ботом — ни группы, ни других клиентов, ни
// личных аккаунтов сотрудников. Решения владельца:
// - ответы без подписи — клиенту отвечает «KOK», а не конкретный человек;
// - сообщение в теме, начатое с точки («.проверь оплату»), — заметка для своих, клиенту не уходит;
// - кабинет привязывается кнопкой в кабинете (ссылка t.me/<бот>?start=<ключ>): в шапке темы сразу
//   компания, контакты, подписка и баланс. Пришёл не из кабинета — тема по имени в Telegram.
//
// Копирование (copyMessage), а не пересылка: у пересланного видно автора, а клиенту нельзя видеть,
// кто из сотрудников ответил, и сотрудникам не нужен «переслано от» в каждой строке темы.
//
// Как приходят сообщения — TELEGRAM_SUPPORT:
//   webhook — Telegram стучится на /api/telegram/webhook (прод). Адрес — SMMAKER_APP_URL, подпись —
//             TELEGRAM_WEBHOOK_SECRET. Вебхук у бота один: превью с тем же ботом увело бы его у прода,
//             поэтому на превью он не ставится без TELEGRAM_SUPPORT_PREVIEW=1 (только с тестовым ботом);
//   poll    — сервер сам спрашивает getUpdates (Mac: до localhost Telegram не достучится). Если у бота
//             стоит вебхук прода, Telegram ответит 409 — опрос остановится, вебхук мы не трогаем;
//   пусто   — поддержка выключена (тесты, превью).
import crypto from 'node:crypto';
import {db, hasDatabase, previewId} from './db/index.mjs';
import {balanceOf} from './billing.mjs';
import {appUrl} from './mailer.mjs';
import {TelegramError, esc, telegramReady, tgCall, workChat} from './telegram.mjs';
import {createLogger} from '../cores/kit/log.mjs';

const log = createLogger('support');
const LINE = '━━━━━━━━━━━━━━';
// Даты — по Сеулу: группа читает их в Корее, а сервер живёт в UTC
const dayKst = (d) => new Date(d).toLocaleDateString('ru-RU', {timeZone: 'Asia/Seoul'});

export const supportMode = () => {
  const m = process.env.TELEGRAM_SUPPORT?.trim();
  return m === 'webhook' || m === 'poll' ? m : null;
};
export const supportEnabled = () => Boolean(supportMode() && hasDatabase() && telegramReady());

// ——— Тексты клиенту ———
const HELLO = 'Здравствуйте! Это поддержка KOK. Напишите вопрос — ответим здесь же.';
const helloLinked = (name, company) =>
  `Здравствуйте${name ? `, ${name}` : ''}! Кабинет «${company}» привязан — пишите вопрос, ответим здесь же.`;
const GOT_IT = 'Сообщение получили — ответим здесь же.';
const LINK_EXPIRED = 'Ссылка из кабинета устарела — откройте «Написать в поддержку» в кабинете ещё раз. Или просто напишите вопрос здесь.';

// ——— Кто это: шапка темы ———

const tgNameOf = (from) => [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || from.username || `id ${from.id}`;

/** Название темы: компания и имя, если кабинет привязан; иначе имя и @ник. Telegram режет на 128 */
const topicTitle = (t, ws) => (ws?.company ? `${ws.company} · ${t.tg_name}` : `${t.tg_name}${t.tg_username ? ` @${t.tg_username}` : ''}`).slice(0, 128);

/** Компания и человек из кабинета — для шапки темы */
const accountOf = async (workspaceId, userId) => {
  if (!workspaceId) return null;
  const {rows: [r]} = await db().query(
    `SELECT w.name AS company, u.name, u.email, u.phone FROM smmaker_workspaces w
       LEFT JOIN smmaker_users u ON u.id = $2
      WHERE w.id = $1`, [workspaceId, userId ?? null]);
  if (!r) return null;
  const balance = await balanceOf(workspaceId).catch(() => null);
  return {...r, balance};
};

/** Шапка темы: Telegram и, если привязан, кабинет. Её закрепляем — видно, с кем говорим, в любой момент */
const card = (t, ws, title) => [
  title,
  LINE,
  `💬 ${esc(t.tg_name)}${t.tg_username ? ` · @${esc(t.tg_username)}` : ''} · <code>${t.tg_user_id}</code>`,
  ...(ws ? [
    LINE,
    `🏢 <b>${esc(ws.company)}</b>`,
    ws.name && `👤 ${esc(ws.name)}`,
    `📞 ${ws.phone ? esc(ws.phone) : '<i>телефон не указан</i>'}`,
    `✉️ ${ws.email ? esc(ws.email) : '<i>почта не указана</i>'}`,
    ws.balance?.subscription
      ? `💳 Подписка «${esc(ws.balance.subscription.title)}» до ${dayKst(ws.balance.subscription.until)}`
      : '💳 <i>без подписки</i>',
    ws.balance && `🪙 ${ws.balance.credits} кр.`,
  ] : ['<i>Кабинет не привязан — пришёл не из кабинета KOK</i>']),
  LINE,
  '<i>Ответ в этой теме уйдёт клиенту. Начните с точки — останется между нами.</i>',
].filter(Boolean).join('\n');

const postCard = async (t, ws, title) => {
  const msg = await tgCall('sendMessage', {
    chat_id: workChat(), message_thread_id: t.topic_id, text: card(t, ws, title), parse_mode: 'HTML', disable_web_page_preview: true,
  });
  // Закрепить шапку — если у бота нет права, просто остаётся сообщением
  await tgCall('pinChatMessage', {chat_id: workChat(), message_id: msg.message_id, disable_notification: true}).catch(() => {});
};

// ——— Темы ———

const threadOf = async (tgUserId) =>
  (await db().query('SELECT * FROM smmaker_support_threads WHERE tg_user_id = $1', [tgUserId])).rows[0] ?? null;

const newTopic = async (t, ws) => (await tgCall('createForumTopic', {chat_id: workChat(), name: topicTitle(t, ws)})).message_thread_id;

/**
 * Тема клиента: есть — та же (имя и ник освежаем), нет — новая с шапкой. created — заведена сейчас:
 * клиенту тогда коротко отвечаем «получили», чтобы не писал в пустоту
 */
const ensureThread = async (from) => {
  const name = tgNameOf(from);
  const existing = await threadOf(from.id);
  if (existing) {
    if (existing.tg_name !== name || existing.tg_username !== (from.username ?? null) || existing.blocked) {
      await db().query('UPDATE smmaker_support_threads SET tg_name = $2, tg_username = $3, blocked = false WHERE tg_user_id = $1',
        [from.id, name, from.username ?? null]);
    }
    return {thread: {...existing, tg_name: name, tg_username: from.username ?? null, blocked: false}, created: false};
  }
  const draft = {tg_user_id: from.id, tg_name: name, tg_username: from.username ?? null};
  const topicId = await newTopic(draft, null);
  await db().query(
    `INSERT INTO smmaker_support_threads (tg_user_id, topic_id, tg_name, tg_username) VALUES ($1, $2, $3, $4)`,
    [from.id, topicId, name, from.username ?? null]);
  const thread = {...draft, topic_id: topicId, workspace_id: null, user_id: null};
  await postCard(thread, null, '🆕 <b>Новое обращение</b>');
  log.info('thread.created', {tgUser: from.id, topic: topicId});
  return {thread, created: true};
};

// Тему удалили или закрыли руками — Telegram отвечает так. Удалённую заводим заново, закрытую открываем
const topicGone = (e) => e instanceof TelegramError && /thread not found|TOPIC_DELETED|TOPIC_ID_INVALID/i.test(e.description);
const topicClosed = (e) => e instanceof TelegramError && /TOPIC_CLOSED/i.test(e.description);

/** Скопировать сообщение клиента в его тему; удалённую тему заводим заново, закрытую — открываем */
const copyToTopic = async (thread, msg) => {
  const copy = () => tgCall('copyMessage', {chat_id: workChat(), message_thread_id: thread.topic_id, from_chat_id: msg.chat.id, message_id: msg.message_id});
  try {
    return await copy();
  } catch (e) {
    if (topicClosed(e)) {
      await tgCall('reopenForumTopic', {chat_id: workChat(), message_thread_id: thread.topic_id});
      return copy();
    }
    if (!topicGone(e)) throw e;
    const ws = await accountOf(thread.workspace_id, thread.user_id);
    thread.topic_id = await newTopic(thread, ws);
    await db().query('UPDATE smmaker_support_threads SET topic_id = $2 WHERE tg_user_id = $1', [thread.tg_user_id, thread.topic_id]);
    await postCard(thread, ws, '♻️ <b>Тема заведена заново</b> — прежнюю удалили');
    log.warn('thread.recreated', {tgUser: thread.tg_user_id, topic: thread.topic_id});
    return copy();
  }
};

// ——— Привязка кабинета ———

/** Ссылка «Написать в поддержку» из кабинета: одноразовый ключ на сутки */
export const supportLink = async ({userId, workspaceId}) => {
  if (!supportEnabled()) return {url: null};
  const token = crypto.randomBytes(18).toString('base64url');
  await db().query('INSERT INTO smmaker_support_links (token, user_id, workspace_id) VALUES ($1, $2, $3)', [token, userId, workspaceId]);
  // Заодно выметаем просроченные: ключи создаются по нажатию, копиться им незачем
  await db().query('DELETE FROM smmaker_support_links WHERE expires_at < now()');
  return {url: `https://t.me/${await botUsername()}?start=${token}`};
};

let username = null;
const botUsername = async () => (username ??= (await tgCall('getMe')).username);

// Ник бота для сайта (подвал, оферта): Telegram недоступен — не держим витрину 10 секунд на каждом
// заходе, а пять минут живём без кнопки
let missUntil = 0;
/** @ник бота поддержки или null, если поддержка выключена или Telegram не ответил */
export const supportBotHandle = async () => {
  if (!supportEnabled() || Date.now() < missUntil) return null;
  try {
    return `@${await botUsername()}`;
  } catch (e) {
    missUntil = Date.now() + 5 * 60_000;
    log.warn('getme.failed', {error: e});
    return null;
  }
};

/** /start <ключ>: привязать кабинет к теме, переименовать тему, новая шапка */
const bindAccount = async (from, token) => {
  const {rows: [link]} = await db().query(
    'DELETE FROM smmaker_support_links WHERE token = $1 AND expires_at > now() RETURNING user_id, workspace_id', [token]);
  if (!link) return {ok: false};
  const {thread} = await ensureThread(from);
  await db().query('UPDATE smmaker_support_threads SET workspace_id = $2, user_id = $3 WHERE tg_user_id = $1',
    [from.id, link.workspace_id, link.user_id]);
  const ws = await accountOf(link.workspace_id, link.user_id);
  await tgCall('editForumTopic', {chat_id: workChat(), message_thread_id: thread.topic_id, name: topicTitle(thread, ws)}).catch(() => {});
  await postCard(thread, ws, '🔗 <b>Кабинет привязан</b>');
  log.info('thread.linked', {tgUser: from.id, workspace: link.workspace_id});
  return {ok: true, ws};
};

// ——— Обработка сообщений ———

const say = (chatId, text) => tgCall('sendMessage', {chat_id: chatId, text});

/** Клиент → тема */
const fromClient = async (msg) => {
  const from = msg.from;
  const text = msg.text ?? '';
  const start = /^\/start(?:\s+(\S+))?/.exec(text);
  if (start) {
    if (start[1]) {
      const r = await bindAccount(from, start[1]);
      return say(msg.chat.id, r.ok ? helloLinked(r.ws?.name, r.ws?.company) : LINK_EXPIRED);
    }
    await ensureThread(from);
    return say(msg.chat.id, HELLO);
  }
  const {thread, created} = await ensureThread(from);
  await copyToTopic(thread, msg);
  await db().query('UPDATE smmaker_support_threads SET last_client_at = now() WHERE tg_user_id = $1', [from.id]);
  if (created) await say(msg.chat.id, GOT_IT);
};

// Служебные сообщения темы (заведена, переименована, закреп) копировать нельзя и не нужно
const CONTENT = ['text', 'photo', 'document', 'video', 'voice', 'audio', 'sticker', 'animation', 'video_note', 'location', 'contact'];
const isContent = (msg) => CONTENT.some((k) => msg[k] !== undefined);

/** Тема → клиент. Заметки (с точки), чужие темы («Оплаты») и сообщения ботов — мимо */
const fromStaff = async (msg) => {
  if (!msg.is_topic_message || !msg.message_thread_id || msg.from?.is_bot || !isContent(msg)) return;
  if ((msg.text ?? msg.caption ?? '').trimStart().startsWith('.')) return;
  const {rows: [thread]} = await db().query('SELECT * FROM smmaker_support_threads WHERE topic_id = $1', [msg.message_thread_id]);
  if (!thread) return;
  try {
    await tgCall('copyMessage', {chat_id: thread.tg_user_id, from_chat_id: msg.chat.id, message_id: msg.message_id});
    // Доставлено — отметка на сообщении в теме; не вышло поставить — не беда
    await tgCall('setMessageReaction', {chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{type: 'emoji', emoji: '👌'}]}).catch(() => {});
  } catch (e) {
    const blocked = e instanceof TelegramError && e.code === 403;
    if (blocked) await db().query('UPDATE smmaker_support_threads SET blocked = true WHERE tg_user_id = $1', [thread.tg_user_id]);
    await tgCall('sendMessage', {
      chat_id: msg.chat.id, message_thread_id: msg.message_thread_id, reply_to_message_id: msg.message_id,
      text: blocked ? '⚠️ Не доставлено: клиент заблокировал бота или удалил чат.' : `⚠️ Не доставлено: ${e.message}`,
    }).catch(() => {});
    log.warn('reply.failed', {tgUser: thread.tg_user_id, blocked, error: e});
  }
};

// Сообщения одного клиента — строго по очереди: два первых сообщения подряд иначе завели бы две темы
const queues = new Map();
const serial = (key, fn) => {
  const next = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = next.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return next;
};

/** Одно обновление Telegram (из вебхука или опроса). Ошибки — в журнал: Telegram повторять не нужно */
export const handleUpdate = async (update) => {
  const msg = update?.message;
  if (!msg?.chat) return;
  try {
    if (msg.chat.type === 'private' && msg.from && !msg.from.is_bot) {
      await serial(msg.from.id, () => fromClient(msg));
    } else if (String(msg.chat.id) === String(workChat())) {
      await fromStaff(msg);
    }
  } catch (e) {
    log.error('update.failed', {update: update.update_id, chat: msg.chat.id, error: e});
    // Клиент не должен думать, что его услышали, если сообщение не дошло до группы
    if (msg.chat.type === 'private') await say(msg.chat.id, 'Не получилось передать сообщение — попробуйте ещё раз через минуту.').catch(() => {});
  }
};

/** Подпись вебхука: Telegram присылает наш секрет в заголовке. Сравнение — за постоянное время */
export const webhookAuthorized = (header) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(String(header)); const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ——— Запуск ———

const poll = async () => {
  let offset = 0;
  log.info('poll.started', {});
  for (;;) {
    try {
      const updates = await tgCall('getUpdates', {offset, timeout: 50, allowed_updates: ['message']}, {timeoutMs: 60_000});
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u);
      }
    } catch (e) {
      if (e instanceof TelegramError && e.code === 409) {
        log.error('poll.conflict', {note: 'у бота стоит вебхук (прод) — опрос на этой машине остановлен; вебхук не трогаем'});
        return;
      }
      log.warn('poll.failed', {error: e});
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

/** При старте сервера: включить приём сообщений по TELEGRAM_SUPPORT. Ничего не ломает, если не вышло */
export const startSupport = async () => {
  const mode = supportMode();
  if (!mode) return;
  if (!supportEnabled()) { log.warn('disabled', {note: 'нужны база, TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID'}); return; }
  if (mode === 'poll') { void poll(); return; }
  if (previewId() && process.env.TELEGRAM_SUPPORT_PREVIEW !== '1') {
    log.warn('webhook.skipped', {note: 'превью: вебхук увёл бы бота у прода. Тестовый бот — TELEGRAM_SUPPORT_PREVIEW=1'});
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) { log.error('webhook.no_secret', {note: 'задайте TELEGRAM_WEBHOOK_SECRET'}); return; }
  const url = `${appUrl()}/api/telegram/webhook`;
  try {
    await tgCall('setWebhook', {url, secret_token: secret, allowed_updates: ['message']});
    log.info('webhook.set', {url});
  } catch (e) {
    log.error('webhook.failed', {url, error: e});
  }
};
