// Аккаунты SMMAKER: вход, сессии, самостоятельная регистрация с подтверждением почты,
// сброс пароля, роли, лиды и пакеты кредитов.
//
// Модель (решение владельца 28 сентября, см. CONTEXT.md «Кредиты»): человек регистрируется
// сам — имя, почта, телефон, пароль — и, подтвердив почту кодом из письма, получает
// бесплатные кредиты на пробу. Когда они кончаются, он пишет нам, платит вне системы, и менеджер начисляет пакет в админке.
// Прежние коды активации и месячные периоды убраны: выдавать ключ каждому, кто хочет
// попробовать, — лишняя работа для продаж. Доступ принадлежит компании, а не человеку.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {db} from './db/index.mjs';
import {CONFIG_DIR, HttpError, readJson, workspaceDir} from './store.mjs';
import {addLot, balanceOf, signupCredits, subscriptionOf} from './billing.mjs';
import {appUrl, deletionMail, emailChangeMail, noticeMail, resetMail, verifyMail} from './mailer.mjs';

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

/**
 * Новая сессия. meta — браузер и адрес входа ({userAgent, ip}): по ним человек узнаёт свой
 * вход в списке «где выполнен вход» и замечает чужой. Обрезаем — строку браузера присылает
 * клиент, и длина у неё любая
 */
export const createSession = async (userId, client = db(), meta = {}) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO smmaker_sessions (token_hash, user_id, expires_at, user_agent, ip, seen_at)
     VALUES ($1, $2, now() + $3 * interval '1 day', $4, $5, now())`,
    [tokenHash(token), userId, SESSION_DAYS, String(meta.userAgent ?? '').slice(0, 400), String(meta.ip ?? '').slice(0, 64)]);
  return token;
};

// Номер сессии для списка входов — начало хеша токена. Сам хеш наружу не отдаём: он ключ
// таблицы, а для «закрыть этот вход» шестнадцати знаков хватает с запасом
const SID_LEN = 16;
const sidOf = (hash) => hash.slice(0, SID_LEN);

export const dropSession = (token) => (token
  ? db().query('DELETE FROM smmaker_sessions WHERE token_hash = $1', [tokenHash(token)])
  : null);

/**
 * Отметка «был в KOK» для админки. readSession зовётся на каждый запрос, поэтому пишем не
 * чаще раза в SEEN_EVERY_MIN минут — иначе каждая картинка превью была бы записью в базу.
 * Не ждём и не роняем запрос: отметка — подсказка менеджеру, а не данные клиента.
 */
const SEEN_EVERY_MIN = 5;
const touchSeen = (userId, hash) => {
  db().query(
    `UPDATE smmaker_users SET last_seen_at = now()
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - $2 * interval '1 minute')`,
    [userId, SEEN_EVERY_MIN]).catch((e) => console.warn('last_seen_at:', e.message));
  // То же для самой сессии — «был активен» в списке входов кабинета
  db().query(
    `UPDATE smmaker_sessions SET seen_at = now()
      WHERE token_hash = $1 AND (seen_at IS NULL OR seen_at < now() - $2 * interval '1 minute')`,
    [hash, SEEN_EVERY_MIN]).catch((e) => console.warn('sessions.seen_at:', e.message));
};

/** Роль на платформе → права. admin — всё; manager — лиды и начисление пакетов */
const rights = (role) => ({role: role ?? null, isAdmin: role === 'admin', isStaff: role === 'admin' || role === 'manager'});

/**
 * Кто пришёл по токену: пользователь и его компания. Компания пока одна на человека
 * (участники — позже); берём самое раннее членство, чтобы выбор не прыгал.
 */
export const readSession = async (token) => {
  if (!token) return null;
  const hash = tokenHash(token);
  const {rows} = await db().query(
    `SELECT u.id, u.email, u.name, u.platform_role, u.email_verified_at, m.workspace_id, m.role, w.name AS workspace_name
       FROM smmaker_sessions s
       JOIN smmaker_users u ON u.id = s.user_id
       LEFT JOIN LATERAL (SELECT * FROM smmaker_memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) m ON true
       LEFT JOIN smmaker_workspaces w ON w.id = m.workspace_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.delete_after IS NULL`,
    [hash]);
  const r = rows[0];
  if (!r) return null;
  touchSeen(r.id, hash);
  return {
    sessionId: sidOf(hash),
    user: {id: r.id, email: r.email, name: r.name, emailVerified: Boolean(r.email_verified_at), ...rights(r.platform_role)},
    workspace: r.workspace_id ? {id: r.workspace_id, name: r.workspace_name, role: r.role} : null,
  };
};

export const inTransaction = async (fn) => {
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
export const register = async ({name, email, phone, password, company}, meta = {}) => {
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
    return {userId: user.id, token: await createSession(user.id, client, meta)};
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
const issueToken = async (client, userId, kind, minutes, newEmail = null) => {
  await client.query('UPDATE smmaker_email_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL', [userId, kind]);
  // Код — у подтверждения почты и смены почты (вводят в кабинете); у сброса только ссылка
  const code = kind === 'reset' ? null : String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const link = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO smmaker_email_tokens (user_id, kind, code_hash, link_hash, expires_at, new_email)
     VALUES ($1, $2, $3, $4, now() + $5 * interval '1 minute', $6)`,
    [userId, kind, code && tokenHash(`${userId}:${code}`), tokenHash(link), minutes, newEmail]);
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
  // Удалявшемуся подарка не будет (confirmEmail) — и письмо его не обещает
  const credits = (await wasDeleted(db(), userId)) ? 0 : (await signupCredits()).credits;
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
  if (m && trial.credits > 0 && !(await wasDeleted(client, userId))) {
    const {rowCount: had} = await client.query(
      `SELECT 1 FROM smmaker_credit_lots WHERE workspace_id = $1 AND source = 'signup'`, [m.workspace_id]);
    if (!had) await addLot(client, {workspaceId: m.workspace_id, credits: trial.credits, days: trial.days, source: 'signup', note: 'бесплатные кредиты на пробу'});
  }
  return true;
};

/**
 * Код из письма, введённый в кабинете: подтверждение почты (verify) или смена почты (email).
 * Пять неверных — код сгорает. Верный — ключ погашен, дальше onValid в той же транзакции
 */
const takeCode = async ({userId, code, kind, onValid}) => {
  const c = String(code ?? '').replace(/\D/g, '');
  return inTransaction(async (client) => {
    const {rows: [t]} = await client.query(
      `SELECT id, code_hash, attempts, new_email FROM smmaker_email_tokens
        WHERE user_id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId, kind]);
    if (!t) throw new HttpError(410, 'Код устарел — отправьте новый');
    if (t.attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, 'Слишком много неверных попыток — отправьте новый код');
    if (c.length !== 6 || tokenHash(`${userId}:${c}`) !== t.code_hash) {
      await client.query('UPDATE smmaker_email_tokens SET attempts = attempts + 1 WHERE id = $1', [t.id]);
      // Ошибку отдаём после записи попытки: исключение внутри транзакции откатило бы счётчик
      return {ok: false};
    }
    await client.query('UPDATE smmaker_email_tokens SET used_at = now() WHERE id = $1', [t.id]);
    return {ok: true, ...(await onValid(client, t))};
  }).then((r) => {
    if (!r.ok) throw new HttpError(400, 'Неверный код — проверьте письмо');
    return r;
  });
};

export const verifyCode = ({userId, code}) => takeCode({
  userId, code, kind: 'verify', onValid: async (client) => { await confirmEmail(client, userId); },
});

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
  // Удаляемый аккаунт сбросом не открыть: возвращают его ссылкой «восстановить» из письма
  const {rows: [u]} = await db().query(
    'SELECT id, email FROM smmaker_users WHERE (lower(email) = $1 OR email_key = $2) AND delete_after IS NULL LIMIT 1', [mail, emailKey(mail)]);
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
export const resetPassword = async ({token, password}, meta = {}) => {
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
    return {userId: t.user_id, token: await createSession(t.user_id, client, meta)};
  });
};

export const login = async ({email, password}, meta = {}) => {
  const mail = normEmail(email);
  const {rows: [u]} = await db().query('SELECT id, password_hash, delete_after FROM smmaker_users WHERE lower(email) = $1', [mail]);
  const ok = await verifyPassword(String(password ?? ''), u ? u.password_hash : await DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Неверная почта или пароль');
  // Говорим только после верного пароля: чужому, кто подбирает почты, это ничего не раскрывает
  if (u.delete_after) {
    throw new HttpError(403, `Аккаунт удаляется. До ${new Date(u.delete_after).toLocaleDateString('ru-RU')} его можно восстановить по ссылке из письма`);
  }
  return {userId: u.id, token: await createSession(u.id, db(), meta)};
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

// ——— Профиль и безопасность в кабинете ———
// Решение владельца 12.10: человек сам меняет свои данные и пароль, видит, где открыт вход.
// Всё, что даёт доступ к аккаунту (почта, пароль), требует текущий пароль: оставленный
// открытым ноутбук не должен позволить увести аккаунт за минуту

/** Пароль вошедшего человека верен — иначе 403 (не 401: 401 интерфейс понимает как «вход слетел») */
const checkCurrentPassword = async (userId, password) => {
  const {rows: [u]} = await db().query('SELECT password_hash FROM smmaker_users WHERE id = $1', [userId]);
  if (!u || !(await verifyPassword(String(password ?? ''), u.password_hash))) throw new HttpError(403, 'Неверный текущий пароль');
};

/** Профиль для кабинета: человек и компания. Компанию меняет только владелец кабинета */
export const accountOf = async (userId, workspaceId) => {
  const {rows: [u]} = await db().query(
    `SELECT u.name, u.email, u.phone, u.email_verified_at, u.created_at,
            COALESCE(NULLIF(w.profile->>'company', ''), w.name) AS company, m.role
       FROM smmaker_users u
       LEFT JOIN smmaker_memberships m ON m.user_id = u.id AND m.workspace_id = $2
       LEFT JOIN smmaker_workspaces w ON w.id = m.workspace_id
      WHERE u.id = $1`, [userId, workspaceId]);
  if (!u) throw new HttpError(404, 'Нет такого пользователя');
  // Смена почты в процессе: новый адрес ждёт кода — кабинет показывает поле для кода и после перезагрузки
  const {rows: [pending]} = await db().query(
    `SELECT new_email FROM smmaker_email_tokens
      WHERE user_id = $1 AND kind = 'email' AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`, [userId]);
  return {
    name: u.name, email: u.email, phone: u.phone ?? '', emailVerified: Boolean(u.email_verified_at),
    createdAt: u.created_at, company: u.company ?? '', canEditCompany: u.role === 'owner',
    pendingEmail: pending?.new_email ?? null,
  };
};

/**
 * Имя и компания. Телефон здесь НЕ меняется (владелец 12.10): он уникален и держит бесплатные
 * кредиты — смена номера освобождала бы его под новую регистрацию с новыми подарками.
 * Сменить номер — через менеджера.
 * Компания — одна на всё (владелец 12.10): profile.company, то же поле, что в Настройках →
 * Профиль и на постах; название кабинета (smmaker_workspaces.name) идёт за ним
 */
export const updateAccount = async ({userId, workspaceId, name, company}) => {
  const person = checkName(name);
  const title = company === undefined ? undefined : String(company ?? '').trim().slice(0, 120);
  if (title === '') throw new HttpError(400, 'Название компании не может быть пустым');
  await db().query('UPDATE smmaker_users SET name = $2 WHERE id = $1', [userId, person]);
  if (title !== undefined) {
    const {rowCount} = await db().query(
      `UPDATE smmaker_workspaces w SET name = $3, profile = jsonb_set(w.profile, '{company}', to_jsonb($3::text)), updated_at = now()
        FROM smmaker_memberships m
       WHERE w.id = $2 AND m.workspace_id = w.id AND m.user_id = $1 AND m.role = 'owner'`, [userId, workspaceId, title]);
    if (!rowCount) throw new HttpError(403, 'Название компании меняет владелец кабинета');
  }
  return accountOf(userId, workspaceId);
};

/**
 * Новый пароль из кабинета. Остальные входы закрываются, этот остаётся: пароль чаще всего
 * меняют, заподозрив чужой вход, и тот должен вылететь, а сам человек — нет.
 * На почту — уведомление: если менял не он, он узнает сразу
 */
export const changePassword = async ({userId, sessionId, current, password}) => {
  const pass = checkPassword(password);
  await checkCurrentPassword(userId, current);
  if (pass === String(current)) throw new HttpError(400, 'Новый пароль совпадает с текущим');
  const hash = await hashPassword(pass);
  const {rows: [u]} = await db().query('UPDATE smmaker_users SET password_hash = $2 WHERE id = $1 RETURNING email', [userId, hash]);
  const {rowCount: closed} = await db().query(
    'DELETE FROM smmaker_sessions WHERE user_id = $1 AND left(token_hash, $3) <> $2', [userId, sessionId, SID_LEN]);
  await noticeMail({to: u.email, title: 'Пароль изменён',
    text: 'Пароль от KOK только что изменили в кабинете. Остальные устройства вышли из аккаунта.\n\nЕсли это были не вы — сбросьте пароль через «Забыли пароль?» на странице входа и напишите нам.'})
    .catch((e) => console.error('Уведомление о пароле не ушло:', e.message));
  return {ok: true, closed};
};

const EMAIL_CHANGE_HOURS = 1;

/**
 * Смена почты, шаг 1: проверить пароль и новый адрес, выслать код НА НОВЫЙ адрес. Почта
 * в аккаунте пока прежняя — до ввода кода. Иначе опечатка закрыла бы и вход, и сброс пароля
 */
export const requestEmailChange = async ({userId, password, email}) => {
  await checkCurrentPassword(userId, password);
  const mail = normEmail(email);
  const key = emailKey(mail);
  const {rows: [u]} = await db().query('SELECT name, email, email_key FROM smmaker_users WHERE id = $1', [userId]);
  if (u.email_key === key) throw new HttpError(400, 'Это и есть ваша почта');
  if (await isDisposable(mail)) throw new HttpError(400, 'Одноразовая почта не подойдёт — укажите рабочую');
  const {rows: [taken]} = await db().query(
    'SELECT 1 FROM smmaker_users WHERE (lower(email) = $1 OR email_key = $2) AND id <> $3', [mail, key, userId]);
  if (taken) throw new HttpError(409, 'Эта почта уже занята другим аккаунтом');
  const left = await pauseLeft(userId, 'email');
  if (left > 0) throw new HttpError(429, `Письмо уже отправлено — повторить можно через ${left} с`);
  const {code} = await inTransaction((client) => issueToken(client, userId, 'email', EMAIL_CHANGE_HOURS * 60, mail));
  await emailChangeMail({to: mail, name: u.name, code});
  return {sent: true, pendingEmail: mail};
};

/**
 * Смена почты, шаг 2: код с нового адреса. Адрес меняется, и раз ящик доказан — почта
 * считается подтверждённой (бесплатные кредиты, если их ещё не было, — как при обычном
 * подтверждении). Старому адресу — уведомление: увести аккаунт молча не выйдет
 */
export const confirmEmailChange = async ({userId, code}) => {
  const out = await takeCode({
    userId, code, kind: 'email', onValid: async (client, t) => {
      const {rows: [old]} = await client.query('SELECT email FROM smmaker_users WHERE id = $1', [userId]);
      await client.query('UPDATE smmaker_users SET email = $2, email_key = $3 WHERE id = $1', [userId, t.new_email, emailKey(t.new_email)]);
      await confirmEmail(client, userId);
      return {email: t.new_email, oldEmail: old.email};
    },
  });
  await noticeMail({to: out.oldEmail, title: 'Почта аккаунта изменена',
    text: `Почту для входа в KOK сменили на ${out.email}. Если это были не вы — срочно напишите нам.`})
    .catch((e) => console.error('Уведомление о смене почты не ушло:', e.message));
  return {ok: true, email: out.email};
};

/** Отменить смену почты: погасить код, адрес остаётся прежним */
export const cancelEmailChange = async ({userId}) => {
  await db().query(`UPDATE smmaker_email_tokens SET used_at = now() WHERE user_id = $1 AND kind = 'email' AND used_at IS NULL`, [userId]);
  return {ok: true};
};

/**
 * Устройство по строке браузера — для людей: «Chrome · Mac». Точность не нужна: задача —
 * узнать свой вход и заметить чужой. Порядок проверок важен: Edge, Яндекс и Samsung
 * называют себя ещё и Chrome, Chrome на iPhone — ещё и Safari
 */
export const deviceOf = (ua = '') => {
  const browser = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome'
      : /Safari/.test(ua) ? 'Safari' : '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ') || 'Неизвестное устройство';
};

/** Где выполнен вход: действующие сессии человека, текущая — первой */
export const listSessions = async ({userId, sessionId}) => {
  const {rows} = await db().query(
    `SELECT left(token_hash, $2) AS id, user_agent, ip, created_at, COALESCE(seen_at, created_at) AS seen_at
       FROM smmaker_sessions WHERE user_id = $1 AND expires_at > now()
      ORDER BY left(token_hash, $2) = $3 DESC, COALESCE(seen_at, created_at) DESC`, [userId, SID_LEN, sessionId]);
  return rows.map((r) => ({
    id: r.id, device: deviceOf(r.user_agent), ip: r.ip, createdAt: r.created_at, seenAt: r.seen_at, current: r.id === sessionId,
  }));
};

/** Закрыть один чужой вход. Свой закрывается кнопкой «Выйти» — она ещё и чистит cookie */
export const closeSession = async ({userId, sessionId, id}) => {
  if (String(id) === sessionId) throw new HttpError(409, 'Это текущий вход — для него есть кнопка «Выйти»');
  const {rowCount} = await db().query(
    'DELETE FROM smmaker_sessions WHERE user_id = $1 AND left(token_hash, $3) = $2', [userId, String(id).slice(0, SID_LEN), SID_LEN]);
  if (!rowCount) throw new HttpError(404, 'Такого входа уже нет');
  return listSessions({userId, sessionId});
};

/** Выйти на всех устройствах, кроме этого */
export const closeOtherSessions = async ({userId, sessionId}) => {
  await db().query('DELETE FROM smmaker_sessions WHERE user_id = $1 AND left(token_hash, $3) <> $2', [userId, sessionId, SID_LEN]);
  return listSessions({userId, sessionId});
};

// ——— Удаление аккаунта ———
// Решение владельца 12.10: отложенное на 14 дней, как у GitHub и Google. По запросу аккаунт сразу
// закрывается — входы сброшены, войти нельзя, — и на почту уходит ссылка «восстановить». Через
// 14 дней purgeDeleted стирает файлы и личные данные. Кредиты сгорают без возврата денег.
// Подтверждение — пароль и название компании, набранное руками (как у GitHub): удаление нельзя
// сделать одним случайным нажатием

export const DELETE_DAYS = 14;

// Хеши почтового ящика и телефона удалённых — чтобы не дарить бесплатные кредиты по второму
// кругу. Приставка разводит виды: хеш почты не совпадёт с хешем телефона из тех же цифр
const identityHash = (kind, value) => crypto.createHash('sha256').update(`smmaker:${kind}:${value}`).digest('hex');

/** Удалялся ли раньше человек с этим ящиком или телефоном */
const wasDeleted = async (client, userId) => {
  const {rows: [u]} = await client.query('SELECT email_key, phone FROM smmaker_users WHERE id = $1', [userId]);
  if (!u) return false;
  const {rowCount} = await client.query(
    'SELECT 1 FROM smmaker_deleted_identities WHERE email_hash = $1 OR (phone_hash IS NOT NULL AND phone_hash = $2) LIMIT 1',
    [identityHash('email', u.email_key), u.phone ? identityHash('phone', u.phone) : null]);
  return rowCount > 0;
};

/** Название компании для подтверждения: то, что человек видит в кабинете */
const companyOf = async (workspaceId) => {
  const {rows: [w]} = await db().query(
    `SELECT COALESCE(NULLIF(profile->>'company', ''), name) AS company FROM smmaker_workspaces WHERE id = $1`, [workspaceId]);
  return w?.company ?? '';
};
// Сравнение без регистра и лишних пробелов: смысл проверки — «набрал руками, не промахнулся
// кнопкой», а не экзамен на заглавные буквы
const sameName = (a, b) => String(a ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Запрос на удаление: аккаунт закрыт сразу, окончательно — через DELETE_DAYS дней */
export const requestDeletion = async ({userId, workspaceId, password, confirm}) => {
  await checkCurrentPassword(userId, password);
  const {rows: [u]} = await db().query(
    `SELECT u.email, u.name, u.platform_role, m.role FROM smmaker_users u
       LEFT JOIN smmaker_memberships m ON m.user_id = u.id AND m.workspace_id = $2 WHERE u.id = $1`, [userId, workspaceId]);
  // Сотрудник платформы удалением себя оставил бы платформу без админа или менеджера
  if (u.platform_role) throw new HttpError(409, 'Аккаунт сотрудника платформы так не удалить — сначала снимите роль в админке');
  if (u.role !== 'owner') throw new HttpError(403, 'Удалить кабинет может только его владелец');
  if (!sameName(confirm, await companyOf(workspaceId))) throw new HttpError(400, 'Название компании набрано не так — проверьте');
  const {link, until} = await inTransaction(async (client) => {
    const {rows: [r]} = await client.query(
      `UPDATE smmaker_users SET delete_after = now() + $2 * interval '1 day' WHERE id = $1 RETURNING delete_after`, [userId, DELETE_DAYS]);
    await client.query('DELETE FROM smmaker_sessions WHERE user_id = $1', [userId]);
    const t = await issueToken(client, userId, 'restore', DELETE_DAYS * 24 * 60);
    return {link: t.link, until: r.delete_after};
  });
  await deletionMail({to: u.email, name: u.name, link: `${appUrl()}/#/restore?t=${link}`, until})
    .catch((e) => console.error('Письмо об удалении не ушло:', e.message));
  return {ok: true, until};
};

/** Ссылка «восстановить» из письма: аккаунт снова открыт, и человек сразу входит */
export const restoreAccount = async ({token}, meta = {}) => {
  const out = await inTransaction(async (client) => {
    const {rows: [t]} = await client.query(
      `UPDATE smmaker_email_tokens SET used_at = now()
        WHERE link_hash = $1 AND kind = 'restore' AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [tokenHash(String(token ?? ''))]);
    if (!t) throw new HttpError(410, 'Ссылка устарела или уже использована');
    const {rows: [u]} = await client.query(
      'UPDATE smmaker_users SET delete_after = NULL WHERE id = $1 AND delete_after > now() RETURNING email', [t.user_id]);
    if (!u) throw new HttpError(410, 'Аккаунт уже удалён окончательно — восстановить нельзя');
    return {email: u.email, token: await createSession(t.user_id, client, meta)};
  });
  await noticeMail({to: out.email, title: 'Аккаунт восстановлен', text: 'Удаление аккаунта KOK отменено: всё на месте, можно работать дальше.'})
    .catch((e) => console.error('Письмо о восстановлении не ушло:', e.message));
  return out;
};

/**
 * Окончательное удаление тех, чей срок вышел. Зовётся по таймеру сервера (server/index.mjs).
 * Стираются файлы компании и личные данные; строки компании, партий и журнала остаются
 * обезличенными — это расчёты, их хранят 5 лет. Остаток кредитов сгорает строкой журнала.
 * Каждый — своей транзакцией: сбой на одном не держит остальных
 */
export const purgeDeleted = async ({log = console.log} = {}) => {
  const {rows} = await db().query('SELECT id FROM smmaker_users WHERE delete_after <= now()');
  for (const {id} of rows) {
    try {
      const done = await inTransaction(async (client) => {
        const {rows: [u]} = await client.query(
          'SELECT email, name, email_key, phone FROM smmaker_users WHERE id = $1 AND delete_after <= now() FOR UPDATE', [id]);
        if (!u) return null;
        await client.query('INSERT INTO smmaker_deleted_identities (email_hash, phone_hash) VALUES ($1, $2)',
          [identityHash('email', u.email_key), u.phone ? identityHash('phone', u.phone) : null]);
        // Компании, где он владелец и единственный участник. С командой (позже) компания
        // остаётся остальным — уходит только человек
        const {rows: wss} = await client.query(
          `SELECT m.workspace_id AS id FROM smmaker_memberships m
            WHERE m.user_id = $1 AND m.role = 'owner'
              AND NOT EXISTS (SELECT 1 FROM smmaker_memberships o WHERE o.workspace_id = m.workspace_id AND o.user_id <> $1)`, [id]);
        for (const w of wss) {
          // Остаток сгорает строкой журнала: по истории видно, куда делись кредиты
          const {rows: [b]} = await client.query(
            `SELECT COALESCE(sum(remaining), 0)::int AS n FROM smmaker_credit_lots WHERE workspace_id = $1 AND expires_at > now()`, [w.id]);
          await client.query('UPDATE smmaker_credit_lots SET remaining = 0 WHERE workspace_id = $1 AND remaining > 0', [w.id]);
          if (b.n > 0) {
            await client.query(
              `INSERT INTO smmaker_credit_ledger (workspace_id, delta, kind, note) VALUES ($1, $2, 'adjust', 'аккаунт удалён — кредиты сгорели')`,
              [w.id, -b.n]);
          }
          await client.query(
            `UPDATE smmaker_workspaces SET name = 'Удалённый клиент', brand = '{}'::jsonb, profile = '{}'::jsonb, deleted_at = now(), updated_at = now()
              WHERE id = $1`, [w.id]);
        }
        await client.query('DELETE FROM smmaker_memberships WHERE user_id = $1', [id]);
        await client.query('DELETE FROM smmaker_sessions WHERE user_id = $1', [id]);
        await client.query('DELETE FROM smmaker_email_tokens WHERE user_id = $1', [id]);
        // Строку человека не удаляем: на неё ссылаются «кто начислил» в журнале и партиях.
        // Пароль-заглушка не проходит проверку scrypt — войти нельзя
        const gone = `deleted-${id}@deleted.invalid`;
        await client.query(
          `UPDATE smmaker_users SET email = $2, email_key = $2, name = '', phone = NULL, password_hash = 'deleted',
             email_verified_at = NULL, platform_role = NULL, last_seen_at = NULL, delete_after = NULL WHERE id = $1`, [id, gone]);
        return {email: u.email, workspaces: wss.map((w) => w.id)};
      });
      if (!done) continue;
      // Файлы — после записи в базу: упадёт удаление файлов — данные всё равно обезличены,
      // а папку без хозяина видно в data/ и можно убрать руками
      for (const ws of done.workspaces) {
        await fs.rm(workspaceDir(ws), {recursive: true, force: true}).catch((e) => console.error(`Файлы ${ws} не удалены:`, e.message));
      }
      await noticeMail({to: done.email, title: 'Аккаунт удалён',
        text: 'Аккаунт KOK удалён окончательно: файлы и личные данные стёрты. Спасибо, что были с нами.'})
        .catch((e) => console.error('Письмо об окончательном удалении не ушло:', e.message));
      log(`Удалён аккаунт ${id} (компаний: ${done.workspaces.length})`);
    } catch (e) {
      console.error(`Удаление аккаунта ${id} не прошло:`, e.message);
    }
  }
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
  await inTransaction((client) => grantPackIn(client, {workspaceId, pack, note, createdBy}));
  return balanceOf(workspaceId);
};

/**
 * Начисление пакета внутри чужой транзакции — для оплаты: партия и отметка «оплата
 * начислена» должны лечь вместе (server/payments.mjs). priceKrw — сколько заплачено на самом
 * деле: цену могли поменять между счётом и оплатой. Возвращает партию {id, expires_at}
 */
export const grantPackIn = async (client, {workspaceId, pack, note = '', createdBy = null, priceKrw = pack.price_krw}) => {
  const plan = pack.kind === 'plan';
  await client.query('SELECT id FROM smmaker_workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
  const current = await subscriptionOf(workspaceId, client);
  let expiresAt = null;
  if (plan && current) {
    const {rows: [r]} = await client.query(`SELECT $1::timestamptz + $2 * interval '1 day' AS at`, [current.until, pack.valid_days]);
    expiresAt = r.at;
  } else if (!plan && current) {
    expiresAt = current.until;
  }
  return addLot(client, {
    workspaceId, credits: pack.credits, days: pack.valid_days, expiresAt,
    source: plan ? 'subscription' : 'pack', packId: pack.id, priceKrw,
    note: [plan ? `подписка «${pack.title}»` : `докупка «${pack.title}»`, String(note).trim()].filter(Boolean).join(' · '), createdBy,
  });
};

/**
 * Бонус (компенсация, подарок): партия на заданный срок, по умолчанию год, без цены — в
 * «Оплачено» не попадает. Причина обязательна (владелец 11.10): без неё через месяц в истории
 * клиента не понять, откуда бесплатные кредиты
 */
export const grantBonus = async ({workspaceId, credits, days = 365, note = '', createdBy}) => {
  const c = Number(credits);
  if (!Number.isInteger(c) || c < 1 || c > 100000) throw new HttpError(400, 'Бонус — целое число кредитов от 1');
  if (!String(note ?? '').trim()) throw new HttpError(400, 'Напиши, за что подарок: компенсация, акция…');
  await inTransaction((client) => addLot(client, {
    workspaceId, credits: c, days: Number(days) || 365, source: 'bonus', note: ['бонус', String(note).trim()].filter(Boolean).join(' · '), createdBy,
  }));
  return balanceOf(workspaceId);
};

// ——— Лиды и сотрудники ———

// Столько дней до конца подписки — «пора продлевать». То же число в app/Account.tsx (RENEW_DAYS)
const RENEW_DAYS = 5;
// Без генераций столько дней — «затих»: повод позвонить, пока клиент не ушёл совсем
const IDLE_DAYS = 14;
const CLIENTS_PAGE = 25;

/**
 * Строка клиента со всеми посчитанными полями — общая часть для списка, счётчиков и
 * «пора продлевать». Фильтры и сортировка ниже пишутся по её колонкам (c.…).
 */
const CLIENTS_CTE = `WITH c AS (
  SELECT w.id, w.name, w.created_at,
         u.name AS person, u.email, u.phone, u.platform_role, u.last_seen_at,
         u.email_verified_at IS NOT NULL AS verified,
         COALESCE((SELECT sum(remaining) FROM smmaker_credit_lots t WHERE t.workspace_id = w.id AND t.expires_at > now()), 0)::int AS credits,
         COALESCE((SELECT sum(price_krw) FROM smmaker_credit_lots t WHERE t.workspace_id = w.id AND t.source IN ('pack', 'subscription')), 0)::int AS paid_krw,
         -- Подписка: тариф и конец оплаченного — менеджеру видно, кому пора продлевать
         sub.title AS plan_title, sub.expires_at AS plan_until,
         EXISTS (SELECT 1 FROM smmaker_credit_lots t WHERE t.workspace_id = w.id AND t.source = 'subscription') AS had_plan,
         g.generations, g.generations_30d, g.last_generation,
         u.delete_after
    FROM smmaker_workspaces w
    LEFT JOIN LATERAL (SELECT user_id FROM smmaker_memberships m WHERE m.workspace_id = w.id ORDER BY created_at LIMIT 1) m ON true
    LEFT JOIN smmaker_users u ON u.id = m.user_id
    LEFT JOIN LATERAL (
      SELECT l.expires_at, COALESCE(p.title, l.pack_id) AS title FROM smmaker_credit_lots l
        LEFT JOIN smmaker_packs p ON p.id = l.pack_id
       WHERE l.workspace_id = w.id AND l.source = 'subscription' AND l.expires_at > now()
       ORDER BY l.expires_at DESC LIMIT 1) sub ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS generations,
             (count(*) FILTER (WHERE l.created_at > now() - interval '30 days'))::int AS generations_30d,
             max(l.created_at) AS last_generation
        FROM smmaker_credit_ledger l WHERE l.workspace_id = w.id AND l.kind = 'charge') g ON true
   -- Окончательно удалённые — обезличенные расчёты, не клиенты: в списке им не место
   WHERE w.deleted_at IS NULL
)`;

/**
 * Быстрые фильтры админки: имя → условие над строкой c. Порядок здесь — порядок кнопок.
 * «Без оплат» — лид, который ещё ни разу не платил; «подписка кончилась» — платил и не продлил:
 * это разные разговоры, поэтому разные фильтры.
 */
const CLIENT_FILTERS = {
  all: 'true',
  new: `c.created_at > now() - interval '7 days'`,
  trial: 'c.paid_krw = 0',
  active: 'c.plan_until IS NOT NULL',
  renew: `c.plan_until < now() + interval '${RENEW_DAYS} days'`,
  lapsed: 'c.plan_until IS NULL AND c.had_plan',
  idle: `(c.last_generation IS NULL OR c.last_generation < now() - interval '${IDLE_DAYS} days')`,
  unverified: 'NOT c.verified',
};
// Сортировки. Вторым ключом всегда дата регистрации — иначе строки с равным значением
// (у всех новых кредитов 7) прыгали бы между страницами
const CLIENT_SORTS = {
  new: 'c.created_at DESC',
  seen: 'c.last_seen_at DESC NULLS LAST, c.created_at DESC',
  generated: 'c.last_generation DESC NULLS LAST, c.created_at DESC',
  paid: 'c.paid_krw DESC, c.created_at DESC',
  credits: 'c.credits DESC, c.created_at DESC',
  plan: 'c.plan_until ASC NULLS LAST, c.created_at DESC',
};

/**
 * Поиск по компании, имени, почте и телефону. Телефон в базе — цифры с «+» (normPhone),
 * а менеджер вводит его как попало: «010-5865-4344», «+82 10 5865». Поэтому по телефону
 * ищем одними цифрами, а ведущий 0 (так набирают внутри страны: 010… вместо +8210…)
 * пробуем и без него.
 */
const clientSearch = (query, params) => {
  const q = String(query ?? '').trim().slice(0, 100);
  if (!q) return 'true';
  params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
  const text = `$${params.length}`;
  const parts = [`c.name ILIKE ${text}`, `c.person ILIKE ${text}`, `c.email ILIKE ${text}`];
  const digits = q.replace(/\D/g, '');
  // Меньше трёх цифр — совпадёт почти с каждым номером, это не поиск
  if (digits.length >= 3) {
    for (const d of new Set([digits, digits.replace(/^0+/, '')])) {
      if (d.length < 3) continue;
      params.push(`%${d}%`);
      parts.push(`c.phone LIKE $${params.length}`);
    }
  }
  return `(${parts.join(' OR ')})`;
};

/**
 * Компании с контактами владельца: для продаж это список лидов. Поиск, фильтр и страницы
 * считает база — список растёт, и отдавать его целиком в браузер на каждый ввод не годится.
 * Кроме страницы отдаём: счётчики по фильтрам (с учётом поиска — видно, где нашлось) и
 * «пора продлевать» без фильтров — этот блок должен быть виден всегда.
 */
export const listClients = async ({q, filter, sort, page} = {}) => {
  const where = CLIENT_FILTERS[filter] ?? CLIENT_FILTERS.all;
  const order = CLIENT_SORTS[sort] ?? CLIENT_SORTS.new;
  const params = [];
  const search = clientSearch(q, params);
  const counts = Object.entries(CLIENT_FILTERS)
    .map(([id, cond]) => `count(*) FILTER (WHERE ${cond})::int AS "${id}"`).join(', ');
  const [{rows: [count]}, {rows: renew}] = await Promise.all([
    db().query(`${CLIENTS_CTE} SELECT ${counts} FROM c WHERE ${search}`, params),
    db().query(`${CLIENTS_CTE} SELECT * FROM c WHERE ${CLIENT_FILTERS.renew} ORDER BY c.plan_until`),
  ]);
  const total = count[filter in CLIENT_FILTERS ? filter : 'all'];
  const pages = Math.max(1, Math.ceil(total / CLIENTS_PAGE));
  const at = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const {rows} = await db().query(
    `${CLIENTS_CTE} SELECT * FROM c WHERE ${search} AND ${where} ORDER BY ${order} LIMIT ${CLIENTS_PAGE} OFFSET ${(at - 1) * CLIENTS_PAGE}`,
    params);
  return {rows, total, page: at, pages, pageSize: CLIENTS_PAGE, counts: count, renew};
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
