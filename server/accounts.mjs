// Аккаунты SMMAKER: вход, сессии, самостоятельная регистрация с подтверждением почты,
// сброс пароля, роли, лиды и пакеты кредитов.
//
// Модель (решение владельца 28 сентября, см. CONTEXT.md «Кредиты»): человек регистрируется
// сам — имя, почта, телефон, пароль — и, подтвердив почту кодом из письма, получает
// бесплатные кредиты на пробу. Когда они кончаются, он пишет нам, платит вне системы, и менеджер начисляет пакет в админке.
// Прежние коды активации и месячные периоды убраны: выдавать ключ каждому, кто хочет
// попробовать, — лишняя работа для продаж. Доступ принадлежит компании, а не человеку.
import crypto from 'node:crypto';
import path from 'node:path';
import {promisify} from 'node:util';
import {db} from './db/index.mjs';
import {CONFIG_DIR, HttpError, readJson} from './store.mjs';
import {addLot, balanceOf, signupCredits, subscriptionOf} from './billing.mjs';
import {appUrl, resetMail, verifyMail} from './mailer.mjs';

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
/**
 * Ключ почтового ящика: у всех адресов отбрасываем «+метку», у gmail ещё и точки —
 * ivan+1@gmail.com и i.van@gmail.com приходят в один ящик. Уникален ключ, а не адрес:
 * иначе бесплатные кредиты собирались бы вариантами одной почты.
 * Та же формула — в миграции 004; меняешь одну — меняй и другую.
 */
export const emailKey = (mail) => {
  const [local, domain] = mail.split('@');
  const base = local.split('+')[0];
  return domain === 'gmail.com' || domain === 'googlemail.com' ? `${base.replaceAll('.', '')}@gmail.com` : `${base}@${domain}`;
};

// Одноразовые почтовые сервисы — config/disposable-domains.json. Закрыт и поддомен
let disposable = null;
const isDisposable = async (mail) => {
  disposable ??= readJson(path.join(CONFIG_DIR, 'disposable-domains.json')).then((c) => new Set(c.domains));
  const set = await disposable;
  const parts = mail.split('@')[1].split('.');
  return parts.some((_, i) => set.has(parts.slice(i).join('.')));
};

const checkPassword = (password) => {
  const p = String(password ?? '');
  if (p.length < 8) throw new HttpError(400, 'Пароль — не короче 8 символов');
  if (p.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
  return p;
};

/**
 * Телефон — чтобы с лидом можно было связаться. Храним одними цифрами с «+»: «+82 10-5865 4344»
 * и «+821058654344» — один номер, и уникальность должна это видеть.
 */
export const normPhone = (phone) => {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new HttpError(400, 'Проверь телефон: нужен номер с кодом страны, например +389 70 123 456');
  return `+${digits}`;
};
const checkName = (name) => {
  const n = String(name ?? '').trim().slice(0, 120);
  if (!n) throw new HttpError(400, 'Как вас зовут?');
  return n;
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

/** Роль на платформе → права. admin — всё; manager — лиды и начисление пакетов */
const rights = (role) => ({role: role ?? null, isAdmin: role === 'admin', isStaff: role === 'admin' || role === 'manager'});

/**
 * Кто пришёл по токену: пользователь и его компания. Компания пока одна на человека
 * (участники — позже); берём самое раннее членство, чтобы выбор не прыгал.
 */
export const readSession = async (token) => {
  if (!token) return null;
  const {rows} = await db().query(
    `SELECT u.id, u.email, u.name, u.platform_role, u.email_verified_at, m.workspace_id, m.role, w.name AS workspace_name
       FROM smmaker_sessions s
       JOIN smmaker_users u ON u.id = s.user_id
       LEFT JOIN LATERAL (SELECT * FROM smmaker_memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) m ON true
       LEFT JOIN smmaker_workspaces w ON w.id = m.workspace_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)]);
  const r = rows[0];
  if (!r) return null;
  return {
    user: {id: r.id, email: r.email, name: r.name, emailVerified: Boolean(r.email_verified_at), ...rights(r.platform_role)},
    workspace: r.workspace_id ? {id: r.workspace_id, name: r.workspace_name, role: r.role} : null,
  };
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
    // Гонка за одну почту или телефон: вторую регистрацию остановит уникальный индекс
    if (e.code === '23505' && String(e.constraint).includes('email')) throw new HttpError(409, 'Эта почта уже зарегистрирована — войдите');
    if (e.code === '23505' && String(e.constraint).includes('phone')) throw new HttpError(409, 'Этот телефон уже зарегистрирован — войдите по своей почте');
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

/**
 * Регистрация: пользователь, компания и членство — одной транзакцией. Бесплатные кредиты —
 * не здесь, а при подтверждении почты (confirmEmail): иначе их собирали бы, придумывая
 * адреса. Письмо с кодом уходит после записи; не ушло — человек запросит ещё раз из кабинета.
 * Компания необязательна: не указана — берём имя человека (его можно поменять в профиле).
 */
export const register = async ({name, email, phone, password, company}) => {
  const person = checkName(name);
  const mail = normEmail(email);
  const key = emailKey(mail);
  const tel = normPhone(phone);
  const pass = checkPassword(password);
  if (await isDisposable(mail)) throw new HttpError(400, 'Одноразовая почта не подойдёт — укажите рабочую: на неё придёт код подтверждения');
  const title = String(company ?? '').trim().slice(0, 120) || person;
  const hash = await hashPassword(pass);
  // Дизайн по умолчанию — палитра и шрифты платформы; имя на постах — компания клиента.
  // Логотипы пустые: вместо них вёрстка пишет название компании (Logo в src/shared/ui.tsx).
  // Иначе стартовый бренд унёс бы на ролики клиента логотип AXIS — до загрузки своего
  const template = await readJson(path.join(CONFIG_DIR, 'brand.json'));
  const brand = {...template, name: title, assets: {...template.assets, logoStacked: '', logoHorizontal: '', sign: ''}};
  const out = await inTransaction(async (client) => {
    const {rows: [taken]} = await client.query('SELECT 1 FROM smmaker_users WHERE lower(email) = $1 OR email_key = $2', [mail, key]);
    if (taken) throw new HttpError(409, 'Эта почта уже зарегистрирована — войдите');
    const {rows: [phoneTaken]} = await client.query('SELECT 1 FROM smmaker_users WHERE phone = $1', [tel]);
    if (phoneTaken) throw new HttpError(409, 'Этот телефон уже зарегистрирован — войдите по своей почте');
    const workspaceId = `ws-${crypto.randomBytes(5).toString('hex')}`;
    const {rows: [user]} = await client.query(
      'INSERT INTO smmaker_users (email, email_key, password_hash, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [mail, key, hash, person, tel]);
    await client.query(
      'INSERT INTO smmaker_workspaces (id, name, brand, profile) VALUES ($1, $2, $3, $4)',
      [workspaceId, title, brand, starterProfile(title)]);
    await client.query(
      `INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [workspaceId, user.id]);
    return {userId: user.id, token: await createSession(user.id, client)};
  });
  await sendVerification(out.userId, {force: true}).catch((e) => console.error('Письмо с кодом не ушло:', e.message));
  return out;
};

// ——— Письма: подтверждение почты и сброс пароля ———

const VERIFY_HOURS = 24;
const RESET_MINUTES = 60;
const MAX_CODE_ATTEMPTS = 5;
// Не чаще раза в минуту: кнопка «отправить ещё раз» не должна превращаться в рассылку
const RESEND_PAUSE_SEC = 60;

/**
 * Новый ключ письма. Прежние неиспользованные того же вида гасим: в ходу всегда один код,
 * и старое письмо, пришедшее с опозданием, не сработает
 */
const issueToken = async (client, userId, kind, minutes) => {
  await client.query('UPDATE smmaker_email_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL', [userId, kind]);
  const code = kind === 'verify' ? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') : null;
  const link = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO smmaker_email_tokens (user_id, kind, code_hash, link_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + $5 * interval '1 minute')`,
    [userId, kind, code && tokenHash(`${userId}:${code}`), tokenHash(link), minutes]);
  return {code, link};
};

/** Пауза перед повторным письмом: сколько секунд ещё ждать (0 — можно) */
const pauseLeft = async (userId, kind) => {
  const {rows: [t]} = await db().query(
    `SELECT GREATEST(0, $3 - extract(epoch FROM now() - max(created_at)))::int AS left
       FROM smmaker_email_tokens WHERE user_id = $1 AND kind = $2`, [userId, kind, RESEND_PAUSE_SEC]);
  return t?.left ?? 0;
};

/** Отправить код подтверждения. force — без паузы (сразу после регистрации) */
export const sendVerification = async (userId, {force = false} = {}) => {
  const {rows: [u]} = await db().query('SELECT email, name, email_verified_at FROM smmaker_users WHERE id = $1', [userId]);
  if (!u) throw new HttpError(404, 'Нет такого пользователя');
  if (u.email_verified_at) return {sent: false, verified: true};
  const left = force ? 0 : await pauseLeft(userId, 'verify');
  if (left > 0) throw new HttpError(429, `Письмо уже отправлено — повторить можно через ${left} с`);
  const {code, link} = await inTransaction((client) => issueToken(client, userId, 'verify', VERIFY_HOURS * 60));
  const {credits} = await signupCredits();
  await verifyMail({to: u.email, name: u.name, code, link: `${appUrl()}/#/verify?t=${link}`, credits});
  return {sent: true};
};

/**
 * Почта подтверждена: отметка и бесплатные кредиты компании, где человек владелец.
 * Кредиты — один раз на компанию: повторное подтверждение (после сброса пароля, например)
 * второй партии не даёт
 */
const confirmEmail = async (client, userId) => {
  const {rowCount} = await client.query(
    'UPDATE smmaker_users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL', [userId]);
  if (!rowCount) return false;
  const {rows: [m]} = await client.query(
    `SELECT workspace_id FROM smmaker_memberships WHERE user_id = $1 AND role = 'owner' ORDER BY created_at LIMIT 1`, [userId]);
  const trial = await signupCredits();
  if (m && trial.credits > 0) {
    const {rowCount: had} = await client.query(
      `SELECT 1 FROM smmaker_credit_lots WHERE workspace_id = $1 AND source = 'signup'`, [m.workspace_id]);
    if (!had) await addLot(client, {workspaceId: m.workspace_id, credits: trial.credits, days: trial.days, source: 'signup', note: 'бесплатные кредиты на пробу'});
  }
  return true;
};

/** Код из письма, введённый в кабинете. Пять неверных — код сгорает */
export const verifyCode = async ({userId, code}) => {
  const c = String(code ?? '').replace(/\D/g, '');
  return inTransaction(async (client) => {
    const {rows: [t]} = await client.query(
      `SELECT id, code_hash, attempts FROM smmaker_email_tokens
        WHERE user_id = $1 AND kind = 'verify' AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId]);
    if (!t) throw new HttpError(410, 'Код устарел — отправьте новый');
    if (t.attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, 'Слишком много неверных попыток — отправьте новый код');
    if (c.length !== 6 || tokenHash(`${userId}:${c}`) !== t.code_hash) {
      await client.query('UPDATE smmaker_email_tokens SET attempts = attempts + 1 WHERE id = $1', [t.id]);
      // Ошибку отдаём после записи попытки: исключение внутри транзакции откатило бы счётчик
      return {ok: false};
    }
    await client.query('UPDATE smmaker_email_tokens SET used_at = now() WHERE id = $1', [t.id]);
    await confirmEmail(client, userId);
    return {ok: true};
  }).then((r) => {
    if (!r.ok) throw new HttpError(400, 'Неверный код — проверьте письмо');
    return r;
  });
};

/** Ссылка из письма. Сессия не нужна: письмо могли открыть на другом устройстве */
export const verifyLink = async ({token}) => inTransaction(async (client) => {
  const {rows: [t]} = await client.query(
    `UPDATE smmaker_email_tokens SET used_at = now()
      WHERE link_hash = $1 AND kind = 'verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    [tokenHash(String(token ?? ''))]);
  if (!t) throw new HttpError(410, 'Ссылка устарела или уже использована — войдите и запросите новый код');
  await confirmEmail(client, t.user_id);
  return {ok: true};
});

/**
 * «Забыли пароль»: письмо со ссылкой, если такая почта есть. Ответ одинаковый в обоих
 * случаях — по нему нельзя узнать, кто зарегистрирован
 */
export const requestReset = async ({email}) => {
  let mail;
  try { mail = normEmail(email); } catch { return {ok: true}; }
  const {rows: [u]} = await db().query('SELECT id, email FROM smmaker_users WHERE lower(email) = $1 OR email_key = $2 LIMIT 1', [mail, emailKey(mail)]);
  if (!u || await pauseLeft(u.id, 'reset') > 0) return {ok: true};
  const {link} = await inTransaction((client) => issueToken(client, u.id, 'reset', RESET_MINUTES));
  await resetMail({to: u.email, link: `${appUrl()}/#/reset?t=${link}`}).catch((e) => console.error('Письмо сброса не ушло:', e.message));
  return {ok: true};
};

/**
 * Новый пароль по ссылке. Все прежние сессии закрываются — если пароль меняют из-за утечки,
 * тот, кто вошёл чужим паролем, должен вылететь. Ссылка пришла на почту — значит, почта
 * заодно подтверждена
 */
export const resetPassword = async ({token, password}) => {
  const hash = await hashPassword(checkPassword(password));
  return inTransaction(async (client) => {
    const {rows: [t]} = await client.query(
      `UPDATE smmaker_email_tokens SET used_at = now()
        WHERE link_hash = $1 AND kind = 'reset' AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [tokenHash(String(token ?? ''))]);
    if (!t) throw new HttpError(410, 'Ссылка устарела или уже использована — запросите сброс ещё раз');
    await client.query('UPDATE smmaker_users SET password_hash = $2 WHERE id = $1', [t.user_id, hash]);
    await client.query('DELETE FROM smmaker_sessions WHERE user_id = $1', [t.user_id]);
    await confirmEmail(client, t.user_id);
    return {userId: t.user_id, token: await createSession(t.user_id, client)};
  });
};

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
      `INSERT INTO smmaker_users (email, email_key, password_hash, platform_role, name, email_verified_at)
       VALUES ($1, $2, $3, 'admin', 'Владелец', now())
       ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash, platform_role = 'admin',
         email_verified_at = COALESCE(smmaker_users.email_verified_at, now())
       RETURNING id`,
      [mail, emailKey(mail), hash]);
    await client.query(
      `INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [workspaceId, u.id]);
    return u.id;
  });
};

// ——— Пакеты ———

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Пакеты: all — вместе со снятыми с продажи (для админки), иначе только действующие (прайс
 * клиенту). kind: plan — подписка на месяц, topup — докупка сверх подписки. Подписки первыми
 */
export const listPacks = async ({all = false} = {}) => (await db().query(
  `SELECT id, title, credits, price_krw, valid_days, active, sort, kind FROM smmaker_packs
    ${all ? '' : 'WHERE active'} ORDER BY kind = 'topup', sort, credits`)).rows;

// Вид пакета: plan — подписка на месяц, topup — докупка (миграция 006)
const PACK_KINDS = new Set(['plan', 'topup']);

/** Сохранить пакет прайса (только админ). Цена меняет будущие начисления, проданное — нет */
export const savePack = async ({id, title, credits, price_krw: price, valid_days: days = 30, active = true, sort = 0, kind}) => {
  if (!PACK_ID_RE.test(String(id))) throw new HttpError(400, 'id пакета — латиница, цифры и дефис (например, base)');
  if (!String(title ?? '').trim()) throw new HttpError(400, 'Нужно название пакета');
  const c = Number(credits);
  const p = Number(price);
  const d = Number(days);
  if (!Number.isInteger(c) || c < 1) throw new HttpError(400, 'Кредиты — целое число от 1');
  if (!Number.isInteger(p) || p < 0) throw new HttpError(400, 'Цена — целое число вон');
  if (!Number.isInteger(d) || d < 1 || d > 3660) throw new HttpError(400, 'Срок — целое число дней от 1');
  // Вид не указан — у нового пакета докупка, у существующего прежний: правка цены без вида
  // не должна молча превращать подписку в докупку
  if (kind !== undefined && !PACK_KINDS.has(kind)) throw new HttpError(400, 'Вид пакета — подписка (plan) или докупка (topup)');
  const {rows: [pack]} = await db().query(
    `INSERT INTO smmaker_packs (id, title, credits, price_krw, valid_days, active, sort, kind) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'topup'))
     ON CONFLICT (id) DO UPDATE SET title = $2, credits = $3, price_krw = $4, valid_days = $5, active = $6, sort = $7,
       kind = COALESCE($8, smmaker_packs.kind)
     RETURNING id, title, credits, price_krw, valid_days, active, sort, kind`,
    [id, String(title).trim(), c, p, d, Boolean(active), Number(sort) || 0, kind ?? null]);
  return pack;
};

/**
 * Начислить пакет компании: партия с кредитами, цена записана в партию — по журналу видно,
 * кто сколько заплатил. Цена берётся из пакета в момент начисления: правка прайса потом
 * не меняет уже проданное.
 *
 * Срок зависит от вида пакета:
 *   • подписка — месяц (valid_days) от конца действующей подписки, а если её нет — от сейчас.
 *     Продлили за три дня до конца — эти три дня не теряются, новый месяц начнётся после них.
 *     Кредиты новой партии доступны сразу, но списание берёт сначала из той, что сгорает
 *     раньше, — то есть из текущего месяца;
 *   • докупка — сгорает вместе с действующей подпиской (решение владельца). Подписки нет —
 *     живёт valid_days от сейчас.
 * Подписку ищем внутри той же транзакции, под блокировкой компании: два одновременных
 * продления иначе оба взяли бы один и тот же конец и наложились бы.
 */
export const grantPack = async ({workspaceId, packId, note = '', createdBy}) => {
  const {rows: [pack]} = await db().query('SELECT * FROM smmaker_packs WHERE id = $1 AND active', [packId]);
  if (!pack) throw new HttpError(404, 'Нет такого действующего пакета');
  const {rowCount} = await db().query('SELECT 1 FROM smmaker_workspaces WHERE id = $1', [workspaceId]);
  if (!rowCount) throw new HttpError(404, 'Нет такой компании');
  const plan = pack.kind === 'plan';
  await inTransaction(async (client) => {
    await client.query('SELECT id FROM smmaker_workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    const current = await subscriptionOf(workspaceId, client);
    let expiresAt = null;
    if (plan && current) {
      const {rows: [r]} = await client.query(`SELECT $1::timestamptz + $2 * interval '1 day' AS at`, [current.until, pack.valid_days]);
      expiresAt = r.at;
    } else if (!plan && current) {
      expiresAt = current.until;
    }
    await addLot(client, {
      workspaceId, credits: pack.credits, days: pack.valid_days, expiresAt,
      source: plan ? 'subscription' : 'pack', packId: pack.id, priceKrw: pack.price_krw,
      note: [plan ? `подписка «${pack.title}»` : `докупка «${pack.title}»`, String(note).trim()].filter(Boolean).join(' · '), createdBy,
    });
  });
  return balanceOf(workspaceId);
};

/** Бонус (компенсация, подарок): партия на заданный срок, по умолчанию год */
export const grantBonus = async ({workspaceId, credits, days = 365, note = '', createdBy}) => {
  const c = Number(credits);
  if (!Number.isInteger(c) || c < 1 || c > 100000) throw new HttpError(400, 'Бонус — целое число кредитов от 1');
  await inTransaction((client) => addLot(client, {
    workspaceId, credits: c, days: Number(days) || 365, source: 'bonus', note: ['бонус', String(note).trim()].filter(Boolean).join(' · '), createdBy,
  }));
  return balanceOf(workspaceId);
};

// ——— Лиды и сотрудники ———

/**
 * Компании с контактами владельца: для продаж это список лидов. Новые сверху; видно остаток,
 * сколько куплено и когда последний раз генерировали — «потестировал и выдохся» ищется глазами.
 */
export const listClients = async () => {
  const {rows} = await db().query(
    `SELECT w.id, w.name, w.created_at,
            u.name AS person, u.email, u.phone, u.platform_role,
            COALESCE((SELECT sum(remaining) FROM smmaker_credit_lots t WHERE t.workspace_id = w.id AND t.expires_at > now()), 0)::int AS credits,
            COALESCE((SELECT sum(price_krw) FROM smmaker_credit_lots t WHERE t.workspace_id = w.id AND t.source IN ('pack', 'subscription')), 0)::int AS paid_krw,
            -- Подписка: тариф и конец оплаченного — менеджеру видно, кому пора продлевать
            sub.title AS plan_title, sub.expires_at AS plan_until,
            (SELECT count(*) FROM smmaker_credit_ledger l WHERE l.workspace_id = w.id AND l.kind = 'charge')::int AS generations,
            (SELECT max(created_at) FROM smmaker_credit_ledger l WHERE l.workspace_id = w.id AND l.kind = 'charge') AS last_generation
       FROM smmaker_workspaces w
       LEFT JOIN LATERAL (SELECT user_id FROM smmaker_memberships m WHERE m.workspace_id = w.id ORDER BY created_at LIMIT 1) m ON true
       LEFT JOIN smmaker_users u ON u.id = m.user_id
       LEFT JOIN LATERAL (
         SELECT l.expires_at, COALESCE(p.title, l.pack_id) AS title FROM smmaker_credit_lots l
           LEFT JOIN smmaker_packs p ON p.id = l.pack_id
          WHERE l.workspace_id = w.id AND l.source = 'subscription' AND l.expires_at > now()
          ORDER BY l.expires_at DESC LIMIT 1) sub ON true
      ORDER BY w.created_at DESC`);
  return rows;
};

/** Сотрудники платформы: у кого есть роль */
export const listStaff = async () => (await db().query(
  `SELECT id, email, name, platform_role FROM smmaker_users WHERE platform_role IS NOT NULL ORDER BY platform_role, email`)).rows;

/**
 * Дать или снять роль по почте. Человек сначала регистрируется сам, потом получает роль —
 * так у менеджера есть свой пароль, который владелец не знает. Снять роль с себя нельзя:
 * платформа осталась бы без админа.
 */
export const setRole = async ({email, role, by}) => {
  const mail = normEmail(email);
  const value = role === 'admin' || role === 'manager' ? role : null;
  const {rows: [u]} = await db().query('SELECT id FROM smmaker_users WHERE lower(email) = $1', [mail]);
  if (!u) throw new HttpError(404, 'Нет пользователя с такой почтой — пусть сначала зарегистрируется');
  if (u.id === by && value !== 'admin') throw new HttpError(409, 'Снять роль администратора с себя нельзя');
  await db().query('UPDATE smmaker_users SET platform_role = $2 WHERE id = $1', [u.id, value]);
  return listStaff();
};
