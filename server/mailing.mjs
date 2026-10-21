// Рассылки — граница KOK с ядром cores/mailing (21.10). Служебные новости клиентам: менеджер
// пишет черновик, выбирает, кому (фильтр клиентов админки), смотрит предпросмотр, шлёт тест
// себе и отправляет. Рассылки делают и менеджер, и админ — для менеджера их и делали.
//
// Что здесь: черновики (smmaker_mailings), снимок получателей (smmaker_mailing_recipients),
// очередь с паузами и отписка по ссылке. Вёрстка и Resend — в ядре.
//
// Очередь: «Отправить» записывает получателей разом и ставит рассылке sending; дальше тикер
// (startMailingQueue, server/index.mjs) шлёт пачками с паузой. Каждое письмо отмечается — после
// перезапуска сервера очередь продолжает с неотправленных, ушедшие второй раз не уходят.
import {db} from './db/index.mjs';
import {HttpError} from './store.mjs';
import {inTransaction, pickedRecipients, pickedUsers, searchRecipients, segmentCounts, segmentUsers} from './accounts.mjs';
import {appUrl} from './mailer.mjs';
import {serverLog} from './log.mjs';
import {createClient, problemsOf, renderMessage} from '../cores/mailing/src/index.mjs';

const journal = serverLog('mailing');

// Пачка и пауза между пачками. Resend по умолчанию держит 2 запроса в секунду, пачка — один
// запрос до 100 писем. 50 писем раз в 1,5 с — с запасом от лимита и 2000 писем в минуту: наших
// клиентов на порядки меньше. Квоту в день задаёт тариф Resend — упрёмся, придёт 429, очередь подождёт
const CHUNK = 50;
const PAUSE_MS = 1500;
// После временного сбоя Resend (429, 5xx, сеть) — пауза до следующей попытки. Тикер всё равно
// заглядывает раз в TICK_MS, поэтому дольше этого очередь не стоит
const TICK_MS = 60_000;

const DEFAULT_FROM = 'KOK <onboarding@resend.dev>';
// Клиент создаётся на каждый проход очереди: ключ могут поменять в Coolify, процесс подхватит
// его со следующим перезапуском, а тестам так проще подменить отправку
let factory = () => createClient({apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM});
/** Для тестов: своя отправка вместо Resend. Без аргумента — вернуть Resend */
export const setMailingClient = (fn) => { factory = fn ? () => fn : () => createClient({apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM}); };

// Без ключа (Mac, тесты) письма не уходят, а печатаются в журнал — как у писем входа (mailer.mjs)
const clientOrLog = () => {
  const c = factory();
  if (c.ready) return c;
  const show = (m) => console.log(`Рассылка: письмо не отправлено (нет RESEND_API_KEY) → ${m.to}: ${m.subject}\n${m.text}\n`);
  return {ready: false, sendBatch: async (ms) => ms.map((m) => (show(m), 'log')), send: async (m) => (show(m), 'log')};
};

const brand = () => ({name: 'KOK', logoUrl: `${appUrl()}/kok/email-logo.png`});
export const unsubscribeUrl = (key) => `${appUrl()}/api/public/unsubscribe?k=${encodeURIComponent(key)}`;

/** Письмо одному получателю. vars — то, что стоит за {имя} и {компания} */
const messageFor = (m, r) => ({
  to: r.email,
  unsubscribeUrl: unsubscribeUrl(r.news_key),
  ...renderMessage({
    subject: m.subject, body: m.body, button: {label: m.button_label, url: m.button_url},
    // Имя при регистрации обязательно, но у старых кабинетов бывает пустым: «Здравствуйте, !»
    // хуже, чем «Здравствуйте!» — поэтому пустое имя заменяем словом, а не оставляем дыру
    vars: {name: r.person?.trim() || 'коллеги', company: r.company?.trim() || r.person?.trim() || ''},
    brand: brand(), unsubscribeUrl: unsubscribeUrl(r.news_key),
  }),
});

// ——— Черновики ———

// id — bigint, драйвер pg отдал бы его строкой; рассылок не будет больше 2^31 — отдаём числом
const FIELDS = 'id::int AS id, subject, body, button_label, button_url, segment, user_ids, status, created_by, created_at, updated_at, started_at, finished_at';
// Счётчики получателей по состояниям — у списка и у страницы рассылки
const COUNTS = `(SELECT json_build_object(
    'total', count(*), 'queued', count(*) FILTER (WHERE status = 'queued'), 'sent', count(*) FILTER (WHERE status = 'sent'),
    'failed', count(*) FILTER (WHERE status = 'failed'), 'skipped', count(*) FILTER (WHERE status = 'skipped'))
  FROM smmaker_mailing_recipients r WHERE r.mailing_id = m.id) AS counts`;

export const listMailings = async () => (await db().query(
  `SELECT ${FIELDS.split(', ').map((f) => `m.${f}`).join(', ')}, u.name AS author, ${COUNTS}
     FROM smmaker_mailings m LEFT JOIN smmaker_users u ON u.id = m.created_by
    ORDER BY m.created_at DESC LIMIT 100`)).rows;

const getRow = async (id, client = db()) => {
  const {rows: [m]} = await client.query(`SELECT ${FIELDS.split(', ').map((f) => `m.${f}`).join(', ')}, ${COUNTS} FROM smmaker_mailings m WHERE m.id = $1`, [id]);
  if (!m) throw new HttpError(404, 'Нет такой рассылки');
  return m;
};

/** Рассылка с отказами по получателям: «кому не ушло и почему» — первое, что спросят */
export const getMailing = async (id) => {
  const m = await getRow(id);
  const {rows: failed} = await db().query(
    `SELECT email, error FROM smmaker_mailing_recipients WHERE mailing_id = $1 AND status = 'failed' ORDER BY email LIMIT 200`, [id]);
  // Выбранные поимённо — с причиной, если кому-то не уйдёт (отписался, почта не подтверждена)
  return {...m, failed, picked: m.segment === PICK ? await pickedRecipients(m.user_ids) : []};
};

// «Кому» — фильтр клиентов админки или 'pick': выбранные поимённо (владелец 21.10)
const PICK = 'pick';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Поимённо — это несколько человек, а не замена сегменту: больше — значит, нужен фильтр
const PICK_MAX = 200;

const clean = (d) => {
  const segment = String(d.segment ?? 'all').slice(0, 30);
  const ids = segment === PICK ? [...new Set((Array.isArray(d.user_ids) ? d.user_ids : []).map(String).filter((x) => UUID_RE.test(x)))] : [];
  if (ids.length > PICK_MAX) throw new HttpError(400, `Поимённо — не больше ${PICK_MAX} получателей; для большего списка выберите фильтр`);
  return {
    subject: String(d.subject ?? '').slice(0, 300),
    body: String(d.body ?? '').slice(0, 20000),
    button_label: String(d.button_label ?? '').trim().slice(0, 60),
    button_url: String(d.button_url ?? '').trim().slice(0, 500),
    segment, user_ids: ids,
  };
};
/** Кому уйдёт: выбранные поимённо или сегмент — одно место для предпросмотра и отправки */
const recipientsOf = (d) => (d.segment === PICK ? pickedUsers(d.user_ids) : segmentUsers(d.segment));

/** Поиск получателя для «Выбрать вручную» */
export const findRecipients = (q) => searchRecipients(q);

/** Новый черновик или правка черновика. Отправленную рассылку не правим — она уже ушла людям */
export const saveMailing = async ({id, by, ...data}) => {
  const d = clean(data);
  if (!id) {
    const {rows: [m]} = await db().query(
      `INSERT INTO smmaker_mailings (subject, body, button_label, button_url, segment, user_ids, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [d.subject, d.body, d.button_label, d.button_url, d.segment, d.user_ids, by]);
    return getMailing(m.id);
  }
  const {rowCount} = await db().query(
    `UPDATE smmaker_mailings SET subject = $2, body = $3, button_label = $4, button_url = $5, segment = $6, user_ids = $7, updated_at = now()
      WHERE id = $1 AND status = 'draft'`, [id, d.subject, d.body, d.button_label, d.button_url, d.segment, d.user_ids]);
  if (!rowCount) throw new HttpError(409, 'Рассылка уже отправлена — её не изменить. Сделайте копию');
  return getMailing(id);
};

export const deleteDraft = async (id) => {
  const {rowCount} = await db().query(`DELETE FROM smmaker_mailings WHERE id = $1 AND status = 'draft'`, [id]);
  if (!rowCount) throw new HttpError(409, 'Удалить можно только черновик — отправленная рассылка остаётся в истории');
  return {ok: true};
};

/** Копия любой рассылки черновиком: повторить новость другому сегменту или поправить ушедшую */
export const copyMailing = async ({id, by}) => {
  const m = await getRow(id);
  return saveMailing({by, subject: m.subject, body: m.body, button_label: m.button_label, button_url: m.button_url, segment: m.segment, user_ids: m.user_ids});
};

/** Сколько человек получит письмо в каждом сегменте — счётчики у выбора «кому» */
export const audience = () => segmentCounts();

/**
 * Предпросмотр: письмо, как его увидит первый получатель сегмента (или сам сотрудник, если
 * сегмент пуст). Собирается ядром — тем же кодом, что при отправке
 */
export const previewMailing = async ({by, ...data}) => {
  const d = clean(data);
  const [first] = await recipientsOf(d);
  const me = await staffRow(by);
  const r = first ? {...first, company: first.name, news_key: 'preview'} : {...me, news_key: 'preview'};
  const msg = messageFor(d, r);
  return {to: r.email, subject: msg.subject, html: msg.html, problems: problemsOf({subject: d.subject, body: d.body, button: {label: d.button_label, url: d.button_url}})};
};

const staffRow = async (userId) => {
  const {rows: [u]} = await db().query(
    `SELECT u.id AS user_id, u.email, u.name AS person, w.name AS company, u.news_key FROM smmaker_users u
       LEFT JOIN LATERAL (SELECT workspace_id FROM smmaker_memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) m ON true
       LEFT JOIN smmaker_workspaces w ON w.id = m.workspace_id WHERE u.id = $1`, [userId]);
  return u;
};

/** Тестовое письмо себе — сотруднику, который нажал. Тема с пометкой, чтобы не спутать с настоящей */
export const sendTest = async ({id, by}) => {
  const m = await getRow(id);
  const problems = problemsOf({subject: m.subject, body: m.body, button: {label: m.button_label, url: m.button_url}});
  if (problems.length) throw new HttpError(400, problems[0]);
  const me = await staffRow(by);
  const msg = messageFor(m, me);
  try {
    await clientOrLog().send({...msg, subject: `[Тест] ${msg.subject}`});
    journal.info('test.sent', {mailing: Number(id), to: me.email});
  } catch (e) {
    journal.warn('test.failed', {mailing: Number(id), error: e});
    throw new HttpError(502, `Тестовое письмо не ушло: ${e.message}`);
  }
  return {ok: true, to: me.email};
};

// ——— Отправка ———

/**
 * «Отправить»: проверка, снимок получателей и статус sending — одной транзакцией. Дальше шлёт
 * очередь. Пустой сегмент не отправляем: рассылка «в никуда» в истории только путает
 */
export const startMailing = async ({id}) => {
  await inTransaction(async (client) => {
    const {rows: [m]} = await client.query('SELECT * FROM smmaker_mailings WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw new HttpError(404, 'Нет такой рассылки');
    if (m.status !== 'draft') throw new HttpError(409, 'Эта рассылка уже отправлена');
    const problems = problemsOf({subject: m.subject, body: m.body, button: {label: m.button_label, url: m.button_url}});
    if (problems.length) throw new HttpError(400, problems[0]);
    const people = await recipientsOf(m);
    if (!people.length) {
      throw new HttpError(400, m.segment === PICK ? 'Из выбранных некому слать: отписались или почта не подтверждена'
        : 'В этом сегменте некому слать: нет подтверждённых почт без отписки');
    }
    await client.query(
      `INSERT INTO smmaker_mailing_recipients (mailing_id, user_id, email)
       SELECT $1, u.user_id, u.email FROM json_to_recordset($2::json) AS u(user_id uuid, email text)`,
      [id, JSON.stringify(people.map((p) => ({user_id: p.user_id, email: p.email})))]);
    await client.query(`UPDATE smmaker_mailings SET status = 'sending', started_at = now(), updated_at = now() WHERE id = $1`, [id]);
  });
  journal.info('mailing.started', {mailing: Number(id)});
  kick();
  return getMailing(id);
};

/** Остановить: кому ещё не ушло — не уйдёт (skipped). Ушедшие письма не вернуть */
export const cancelMailing = async ({id}) => {
  await inTransaction(async (client) => {
    const {rowCount} = await client.query(
      `UPDATE smmaker_mailings SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = $1 AND status = 'sending'`, [id]);
    if (!rowCount) throw new HttpError(409, 'Рассылка не идёт — останавливать нечего');
    await client.query(
      `UPDATE smmaker_mailing_recipients SET status = 'skipped', error = 'рассылку остановили' WHERE mailing_id = $1 AND status = 'queued'`, [id]);
  });
  journal.info('mailing.cancelled', {mailing: Number(id)});
  return getMailing(id);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;
let waitUntil = 0;

/** Запустить проход очереди, если он не идёт. Ошибки прохода — в журнал, не наружу */
const kick = () => { if (!running) runQueue().catch((e) => journal.error('queue.crashed', {note: 'очередь рассылок упала', error: e})); };

/**
 * Проход очереди: пока есть рассылки sending с неотправленными — пачками. Перед пачкой ещё раз
 * сверяем каждого: за минуты очереди человек мог отписаться или кабинет могли скрыть.
 * Временный сбой Resend — выходим и ждём тикера; закрытый доступ (ключ, домен) — тревога человеку
 */
const runQueue = async () => {
  if (running || Date.now() < waitUntil) return;
  running = true;
  try {
    for (;;) {
      const {rows: [m]} = await db().query(
        `SELECT m.* FROM smmaker_mailings m WHERE m.status = 'sending' ORDER BY m.started_at LIMIT 1`);
      if (!m) return;
      const {rows: batch} = await db().query(
        `SELECT r.user_id, r.email, u.name AS person, u.news_key, w.name AS company,
                (u.news_off_at IS NOT NULL OR u.delete_after IS NOT NULL OR w.hidden_at IS NOT NULL OR w.deleted_at IS NOT NULL) AS gone
           FROM smmaker_mailing_recipients r
           JOIN smmaker_users u ON u.id = r.user_id
           LEFT JOIN LATERAL (SELECT workspace_id FROM smmaker_memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) mm ON true
           LEFT JOIN smmaker_workspaces w ON w.id = mm.workspace_id
          WHERE r.mailing_id = $1 AND r.status = 'queued' ORDER BY r.email LIMIT ${CHUNK}`, [m.id]);
      if (!batch.length) {
        await db().query(`UPDATE smmaker_mailings SET status = 'done', finished_at = now(), updated_at = now() WHERE id = $1 AND status = 'sending'`, [m.id]);
        journal.info('mailing.done', {mailing: Number(m.id)});
        continue;
      }
      const gone = batch.filter((r) => r.gone);
      if (gone.length) {
        await db().query(
          `UPDATE smmaker_mailing_recipients SET status = 'skipped', error = 'отписался или кабинет закрыт' WHERE mailing_id = $1 AND user_id = ANY($2::uuid[])`,
          [m.id, gone.map((r) => r.user_id)]);
      }
      const live = batch.filter((r) => !r.gone);
      if (live.length && !(await sendChunk(m, live))) return;
      await sleep(PAUSE_MS);
    }
  } finally {
    running = false;
  }
};

const mark = (mailingId, r, status, {id = null, error = null} = {}) => db().query(
  `UPDATE smmaker_mailing_recipients SET status = $3, provider_id = $4, error = $5, sent_at = CASE WHEN $3 = 'sent' THEN now() END
    -- «Ушло» пишем и поверх «остановлено»: письмо из пачки, начатой до остановки, всё равно доставлено
    WHERE mailing_id = $1 AND user_id = $2 AND (status = 'queued' OR $3 = 'sent')`, [mailingId, r.user_id, status, id, error ? String(error).slice(0, 300) : null]);

/**
 * Одна пачка. true — можно продолжать, false — стоп до следующего тикера. Resend проверяет
 * пачку целиком: один неверный адрес — отказ всем (BAD_INPUT); тогда шлём по одному, чтобы
 * отметить виноватого «отказ», а остальным письмо всё-таки ушло
 */
const sendChunk = async (m, people) => {
  const client = clientOrLog();
  const msgs = people.map((r) => messageFor(m, r));
  try {
    const ids = await client.sendBatch(msgs);
    for (const [i, r] of people.entries()) await mark(m.id, r, 'sent', {id: ids[i]});
    return true;
  } catch (e) {
    if (e.code !== 'BAD_INPUT') return stop(m, e);
  }
  for (const [i, r] of people.entries()) {
    try {
      await mark(m.id, r, 'sent', {id: await client.send(msgs[i])});
    } catch (e) {
      if (e.code !== 'BAD_INPUT') return stop(m, e);
      await mark(m.id, r, 'failed', {error: e.message});
    }
  }
  return true;
};

/** Сбой посреди очереди: временный — ждём; закрытый доступ — тревога, очередь стоит до починки */
const stop = (m, e) => {
  waitUntil = Date.now() + TICK_MS;
  if (e.retryable) journal.warn('queue.paused', {mailing: Number(m.id), code: e.code, note: 'Resend временно не принимает — очередь продолжит сама', error: e});
  else journal.error('queue.blocked', {mailing: Number(m.id), code: e.code, note: 'рассылка стоит: Resend отказал — проверьте ключ и домен отправителя', error: e});
  return false;
};

/** Тикер очереди (server/index.mjs): продолжает рассылки после перезапуска и после пауз */
export const startMailingQueue = () => {
  const t = setInterval(kick, TICK_MS);
  t.unref?.();
  kick();
  return () => clearInterval(t);
};

// ——— Отписка ———

/**
 * Отписка по ключу из письма. Ключ неизвестен — отвечаем так же, как на успех: страница не должна
 * подсказывать, чьи ключи живые
 */
export const unsubscribe = async (key) => {
  const k = String(key ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(k)) return {ok: true};
  const {rows: [u]} = await db().query(
    `UPDATE smmaker_users SET news_off_at = COALESCE(news_off_at, now()) WHERE news_key = $1 RETURNING id`, [k]);
  if (u) journal.info('unsubscribed', {userId: u.id});
  return {ok: true};
};
