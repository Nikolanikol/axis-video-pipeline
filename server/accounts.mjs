// Аккаунты SMMAKER: вход, сессии, регистрация по коду активации, продление, тарифы и коды.
//
// Модель продаж (решение владельца, см. CONTEXT.md «База SMMAKER»): оплата вне системы,
// владелец выдаёт код, клиент регистрируется по почте и паролю и вводит код. Код — это
// активация, а не логин: вход по ключу раздали бы коллегам. Доступ принадлежит компании,
// а не человеку. После конца периода — только просмотр.
import crypto from 'node:crypto';
import path from 'node:path';
import {promisify} from 'node:util';
import {db} from './db/index.mjs';
import {CONFIG_DIR, HttpError, readJson} from './store.mjs';

const scrypt = promisify(crypto.scrypt);

// ——— Пароли ———
// scrypt из Node, без сторонних пакетов. Параметры записаны в самом хеше: поднимем их
// позже — старые хеши продолжат проверяться со своими.
const SCRYPT = {N: 16384, r: 8, p: 1, keylen: 64};

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, {N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p});
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
};

export const verifyPassword = async (password, stored) => {
  const [kind, N, r, p, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {N: +N, r: +r, p: +p});
  return crypto.timingSafeEqual(key, expected);
};

// Хеш, который сверяем, когда пользователя нет: вход с чужой почтой отвечает за то же
// время, что и с неверным паролем, — по времени ответа не узнать, зарегистрирован ли адрес
const DUMMY_HASH = hashPassword('нет такого пользователя');

// ——— Проверка ввода ———
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normEmail = (email) => {
  const e = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw new HttpError(400, 'Проверь почту: похоже, в адресе ошибка');
  return e;
};
const checkPassword = (password) => {
  const p = String(password ?? '');
  if (p.length < 8) throw new HttpError(400, 'Пароль — не короче 8 символов');
  if (p.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
  return p;
};

// ——— Коды активации ———
// Без похожих знаков (0/O, 1/I/L): код диктуют по телефону и перепечатывают из WhatsApp.
// 12 знаков из 31 — около 10^18 вариантов: перебором не угадать.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const newCode = () => {
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `SMM-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
};
/** Код, как его ввёл человек: пробелы, строчные, без дефисов — приводим к виду из базы */
export const normCode = (code) => {
  const raw = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SMM/, '');
  if (raw.length !== 12) throw new HttpError(400, 'Код не похож на код активации: SMM-XXXX-XXXX-XXXX');
  return `SMM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
};

// ——— Сессии ———
export const SESSION_COOKIE = 'smmaker_session';
export const SESSION_DAYS = 30;
// В базе — хеш токена, не сам токен: утёкший дамп не даёт войти чужой сессией
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const createSession = async (userId, client = db()) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO smmaker_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 day')`,
    [tokenHash(token), userId, SESSION_DAYS]);
  return token;
};

export const dropSession = (token) => (token
  ? db().query('DELETE FROM smmaker_sessions WHERE token_hash = $1', [tokenHash(token)])
  : null);

/**
 * Кто пришёл по токену: пользователь и его компания. Компания пока одна на человека
 * (участники — позже); берём самое раннее членство, чтобы выбор не прыгал.
 */
export const readSession = async (token) => {
  if (!token) return null;
  const {rows} = await db().query(
    `SELECT u.id, u.email, u.is_platform_admin, m.workspace_id, m.role, w.name AS workspace_name
       FROM smmaker_sessions s
       JOIN smmaker_users u ON u.id = s.user_id
       LEFT JOIN LATERAL (SELECT * FROM smmaker_memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) m ON true
       LEFT JOIN smmaker_workspaces w ON w.id = m.workspace_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)]);
  const r = rows[0];
  if (!r) return null;
  return {
    user: {id: r.id, email: r.email, isAdmin: r.is_platform_admin},
    workspace: r.workspace_id ? {id: r.workspace_id, name: r.workspace_name, role: r.role} : null,
  };
};

// ——— Доступ компании ———

/**
 * Состояние доступа: текущий период (или его отсутствие), до какого числа оплачено с учётом
 * продлений наперёд, остаток кредитов текущего периода. Кредиты прошлых периодов сгорели,
 * будущих — ещё не начались: считаем только текущий.
 */
export const accessOf = async (workspaceId, client = db()) => {
  const {rows} = await client.query(
    `SELECT s.id, s.plan_id, p.title AS plan_title, p.pipelines, s.period_start, s.period_end,
            (SELECT COALESCE(sum(delta), 0) FROM smmaker_credit_ledger l WHERE l.subscription_id = s.id)::int AS credits
       FROM smmaker_subscriptions s JOIN smmaker_plans p ON p.id = s.plan_id
      WHERE s.workspace_id = $1 AND s.period_start <= now() AND s.period_end > now()
      ORDER BY s.period_start DESC LIMIT 1`,
    [workspaceId]);
  const {rows: [last]} = await client.query(
    'SELECT max(period_end) AS paid_until FROM smmaker_subscriptions WHERE workspace_id = $1', [workspaceId]);
  const cur = rows[0];
  return {
    active: Boolean(cur),
    plan: cur ? {id: cur.plan_id, title: cur.plan_title, pipelines: cur.pipelines} : null,
    periodStart: cur?.period_start ?? null,
    periodEnd: cur?.period_end ?? null,
    paidUntil: last?.paid_until ?? null,
    credits: cur?.credits ?? 0,
    subscriptionId: cur?.id ?? null,
  };
};

/**
 * Погасить код за компанию: новый период начинается с конца уже оплаченного (или с сейчас,
 * если доступ закончился) — ранняя оплата не сжигает оплаченные дни. Кредиты начисляются
 * на этот новый период и становятся доступны с его началом.
 * Вызывать внутри транзакции: код блокируется строкой, два одновременных погашения одного
 * кода не пройдут.
 */
const redeemIn = async (client, {workspaceId, userId, code}) => {
  const {rows: [c]} = await client.query(
    'SELECT * FROM smmaker_activation_codes WHERE code = $1 FOR UPDATE', [normCode(code)]);
  if (!c) throw new HttpError(404, 'Такого кода нет — проверь, как он записан');
  if (c.activated_at) throw new HttpError(409, 'Этот код уже использован');
  const {rows: [s]} = await client.query(
    `INSERT INTO smmaker_subscriptions (workspace_id, plan_id, code, period_start, period_end)
     SELECT $1, $2, $3, start, start + $4 * interval '1 day'
       FROM (SELECT GREATEST(now(), (SELECT max(period_end) FROM smmaker_subscriptions WHERE workspace_id = $1)) AS start) t
     RETURNING id, period_start, period_end`,
    [workspaceId, c.plan_id, c.code, c.days]);
  if (c.credits > 0) {
    await client.query(
      `INSERT INTO smmaker_credit_ledger (workspace_id, subscription_id, delta, kind, note, created_by)
       VALUES ($1, $2, $3, 'grant', $4, $5)`,
      [workspaceId, s.id, c.credits, `код ${c.code}`, userId]);
  }
  await client.query(
    'UPDATE smmaker_activation_codes SET activated_workspace_id = $2, activated_by = $3, activated_at = now() WHERE code = $1',
    [c.code, workspaceId, userId]);
  return s;
};

const inTransaction = async (fn) => {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // Гонка за один адрес почты: вторую регистрацию остановит уникальный индекс
    if (e.code === '23505' && String(e.constraint).includes('email')) throw new HttpError(409, 'Эта почта уже зарегистрирована — войди');
    throw e;
  } finally {
    client.release();
  }
};

// Стартовый профиль новой компании. Контакты пустые: подставлять чужие (владельца
// платформы) нельзя, а пустой номер вёрстка просто не рисует
const starterProfile = (company) => ({
  company, language: 'en', contacts: {whatsapp: '', site: ''},
  pricing: {mode: 'domestic', currency: 'USD', export: {origin: '', originCountry: '', port: '', portCountry: '', freight: 0}},
  texts: {},
});

/** Регистрация по коду: пользователь, компания, период и кредиты — одной транзакцией */
export const register = async ({email, password, company, code}) => {
  const mail = normEmail(email);
  const pass = checkPassword(password);
  const name = String(company ?? '').trim().slice(0, 120);
  if (!name) throw new HttpError(400, 'Как называется компания?');
  const hash = await hashPassword(pass);
  // Дизайн по умолчанию — палитра и шрифты платформы; имя на постах — компания клиента
  const brand = {...(await readJson(path.join(CONFIG_DIR, 'brand.json'))), name};
  return inTransaction(async (client) => {
    const {rows: [taken]} = await client.query('SELECT 1 FROM smmaker_users WHERE lower(email) = $1', [mail]);
    if (taken) throw new HttpError(409, 'Эта почта уже зарегистрирована — войди');
    const workspaceId = `ws-${crypto.randomBytes(5).toString('hex')}`;
    const {rows: [user]} = await client.query(
      'INSERT INTO smmaker_users (email, password_hash) VALUES ($1, $2) RETURNING id', [mail, hash]);
    await client.query(
      'INSERT INTO smmaker_workspaces (id, name, brand, profile) VALUES ($1, $2, $3, $4)',
      [workspaceId, name, brand, starterProfile(name)]);
    await client.query(
      `INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [workspaceId, user.id]);
    // Код гасится последним: если он негодный, откатится всё — ни пользователя, ни компании
    await redeemIn(client, {workspaceId, userId: user.id, code});
    return {userId: user.id, token: await createSession(user.id, client)};
  });
};

export const redeem = ({workspaceId, userId, code}) =>
  inTransaction((client) => redeemIn(client, {workspaceId, userId, code}));

export const login = async ({email, password}) => {
  const mail = normEmail(email);
  const {rows: [u]} = await db().query('SELECT id, password_hash FROM smmaker_users WHERE lower(email) = $1', [mail]);
  const ok = await verifyPassword(String(password ?? ''), u ? u.password_hash : await DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Неверная почта или пароль');
  return {userId: u.id, token: await createSession(u.id)};
};

/**
 * Владелец платформы: создать или обновить пароль и сделать админом компании по умолчанию.
 * Вызывается из tools/create-admin.mjs — пароль вводится в терминале, а не в чате.
 */
export const upsertAdmin = async ({email, password, workspaceId}) => {
  const mail = normEmail(email);
  const hash = await hashPassword(checkPassword(password));
  return inTransaction(async (client) => {
    const {rows: [u]} = await client.query(
      `INSERT INTO smmaker_users (email, password_hash, is_platform_admin) VALUES ($1, $2, true)
       ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_platform_admin = true
       RETURNING id`,
      [mail, hash]);
    await client.query(
      `INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [workspaceId, u.id]);
    return u.id;
  });
};

// ——— Админка владельца ———

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PIPELINES = ['ads', 'reviews', 'carousels'];

export const listPlans = async () => (await db().query(
  'SELECT id, title, credits, days, pipelines, active, created_at FROM smmaker_plans ORDER BY created_at')).rows;

export const savePlan = async ({id, title, credits, days, pipelines, active = true}) => {
  if (!PLAN_ID_RE.test(String(id))) throw new HttpError(400, 'id тарифа — латиница, цифры и дефис (например, start)');
  if (!String(title ?? '').trim()) throw new HttpError(400, 'Нужно название тарифа');
  const c = Number(credits);
  const d = Number(days);
  if (!Number.isInteger(c) || c < 0) throw new HttpError(400, 'Кредиты — целое число от 0');
  if (!Number.isInteger(d) || d < 1 || d > 3660) throw new HttpError(400, 'Срок — целое число дней от 1');
  const pl = (Array.isArray(pipelines) ? pipelines : []).filter((p) => PIPELINES.includes(p));
  const {rows: [plan]} = await db().query(
    `INSERT INTO smmaker_plans (id, title, credits, days, pipelines, active) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET title = $2, credits = $3, days = $4, pipelines = $5, active = $6
     RETURNING id, title, credits, days, pipelines, active, created_at`,
    [id, String(title).trim(), c, d, pl, Boolean(active)]);
  return plan;
};

/**
 * Выдать коды. Срок и кредиты копируются из тарифа в момент выдачи: правка тарифа
 * потом не меняет уже проданное.
 */
export const createCodes = async ({planId, count = 1, note = '', createdBy}) => {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new HttpError(400, 'Кодов за раз — от 1 до 50');
  const {rows: [plan]} = await db().query('SELECT * FROM smmaker_plans WHERE id = $1 AND active', [planId]);
  if (!plan) throw new HttpError(404, 'Нет такого действующего тарифа');
  const out = [];
  for (let i = 0; i < n; i++) {
    const {rows: [c]} = await db().query(
      `INSERT INTO smmaker_activation_codes (code, plan_id, days, credits, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING code, plan_id, days, credits, note, created_at`,
      [newCode(), plan.id, plan.days, plan.credits, String(note).slice(0, 200), createdBy]);
    out.push(c);
  }
  return out;
};

export const listCodes = async () => (await db().query(
  `SELECT c.code, c.plan_id, p.title AS plan_title, c.days, c.credits, c.note, c.created_at, c.activated_at,
          c.activated_workspace_id, w.name AS workspace_name
     FROM smmaker_activation_codes c
     JOIN smmaker_plans p ON p.id = c.plan_id
     LEFT JOIN smmaker_workspaces w ON w.id = c.activated_workspace_id
    ORDER BY c.created_at DESC LIMIT 500`)).rows;

export const listWorkspaces = async () => {
  const {rows} = await db().query(
    `SELECT w.id, w.name, w.created_at,
            (SELECT string_agg(u.email, ', ') FROM smmaker_memberships m JOIN smmaker_users u ON u.id = m.user_id
              WHERE m.workspace_id = w.id) AS emails
       FROM smmaker_workspaces w ORDER BY w.created_at DESC`);
  return Promise.all(rows.map(async (w) => ({...w, access: await accessOf(w.id)})));
};

/** Ручная правка кредитов (компенсация, бонус) — строкой журнала на текущий период */
export const adjustCredits = async ({workspaceId, delta, note, createdBy}) => {
  const d = Number(delta);
  if (!Number.isInteger(d) || d === 0) throw new HttpError(400, 'Правка — целое число, не ноль');
  const access = await accessOf(workspaceId);
  if (!access.active) throw new HttpError(409, 'У компании нет действующего периода — сначала продлите доступ');
  await db().query(
    `INSERT INTO smmaker_credit_ledger (workspace_id, subscription_id, delta, kind, note, created_by)
     VALUES ($1, $2, $3, 'adjust', $4, $5)`,
    [workspaceId, access.subscriptionId, d, String(note ?? '').slice(0, 200), createdBy]);
  return accessOf(workspaceId);
};
