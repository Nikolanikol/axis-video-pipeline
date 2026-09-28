// Вход в SMMAKER на уровне HTTP: кто пришёл, от какой компании, что ему можно.
//
// Вход включается вместе с базой (DATABASE_URL). Без базы — как было до кабинетов: один
// владелец, компания по умолчанию, никаких проверок; так работают тесты и прод до переезда.
import {hasDatabase} from './db/index.mjs';
import {SESSION_COOKIE, SESSION_DAYS, readSession} from './accounts.mjs';
import {balanceOf} from './billing.mjs';
import {DEFAULT_WORKSPACE, HttpError} from './store.mjs';

export const authEnabled = () => hasDatabase();

const parseCookies = (header = '') => Object.fromEntries(header.split(';')
  .map((part) => part.trim().split('='))
  .filter(([k, v]) => k && v !== undefined)
  .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

export const sessionToken = (req) => parseCookies(req.headers.cookie)[SESSION_COOKIE];

/** Разобрать сессию: req.user и req.ws (компания). Сам по себе ничего не запрещает. */
export const readSessionMw = async (req, _res, next) => {
  if (!authEnabled()) {
    req.user = null;
    req.ws = DEFAULT_WORKSPACE;
    return next();
  }
  try {
    const s = await readSession(sessionToken(req));
    req.user = s?.user ?? null;
    req.ws = s?.workspace?.id ?? null;
    req.workspace = s?.workspace ?? null;
    next();
  } catch (e) { next(e); }
};

// Secure — только когда запрос пришёл по HTTPS (за прокси — по X-Forwarded-Proto).
// Временный домен на Coolify пока HTTP, и cookie с Secure браузер там просто не сохранил бы
export const setSessionCookie = (req, res, token) => res.cookie(SESSION_COOKIE, token, {
  httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: SESSION_DAYS * 24 * 3600 * 1000,
});
export const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, {path: '/'});

export const requireUser = (req, _res, next) => {
  if (!authEnabled()) return next();
  if (!req.user) return next(new HttpError(401, 'Нужно войти'));
  if (!req.ws) return next(new HttpError(403, 'У аккаунта нет компании — напишите владельцу платформы'));
  next();
};

export const requireAdmin = (req, _res, next) => {
  if (!authEnabled()) return next();
  if (!req.user?.isAdmin) return next(new HttpError(403, 'Только для владельца платформы'));
  next();
};

/** Сотрудники платформы — админ и менеджер: лиды и начисление пакетов */
export const requireStaff = (req, _res, next) => {
  if (!authEnabled()) return next();
  if (!req.user?.isStaff) return next(new HttpError(403, 'Только для сотрудников платформы'));
  next();
};

/**
 * Генерация — только пока есть кредиты. Просмотр и скачивание готового открыты и с нулём.
 * Точную цену проверяет само списание (charge) — здесь отсекаем пустой баланс заранее,
 * чтобы шаги обзора, которые тратят внешние сервисы, но не списывают (распознавание,
 * озвучка), не шли бесплатно у того, кто уже всё потратил.
 * Сотрудники платформы не платят: это их инструмент.
 */
export const requireCredits = async (req, _res, next) => {
  if (!authEnabled() || req.user?.isStaff) return next();
  try {
    const {credits} = await balanceOf(req.ws);
    if (credits <= 0) return next(new HttpError(402, 'Кредиты закончились: смотреть и скачивать можно, создавать новое — после пополнения. Напишите нам — подберём пакет'));
    next();
  } catch (e) { next(e); }
};

/**
 * Защита файлов /data. Отдаём только папку своей компании: /data/workspaces/<своя>/…
 *
 * Исключение — браузер рендера. Он живёт в том же контейнере (или на том же Mac), ходит
 * на 127.0.0.1 без cookie и без заголовков прокси. Запрос снаружи на сервере всегда идёт
 * через Traefik и несёт X-Forwarded-For, поэтому «пришёл с loopback без X-Forwarded-For»
 * — это только свой процесс. На Mac под это попадает и сам владелец в браузере: сервер там
 * слушает только 127.0.0.1, чужих нет.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const isLocalProcess = (req) => LOOPBACK.has(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];

export const guardData = (req, res, next) => {
  if (!authEnabled() || isLocalProcess(req)) return next();
  const m = /^\/workspaces\/([^/]+)\//.exec(req.path);
  if (m && req.ws && m[1] === req.ws) return next();
  // 404, а не 403: чужой файл не должен даже подтверждать, что он существует
  res.status(404).end();
};

/**
 * Ограничение попыток входа: не больше 10 за 15 минут с одного адреса на одну почту.
 * В памяти процесса — перезапуск сбрасывает, для перебора паролей этого достаточно.
 */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
export const loginLimiter = (req, _res, next) => {
  const key = `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`;
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= MAX_ATTEMPTS) {
    return next(new HttpError(429, 'Слишком много попыток — подождите 15 минут'));
  }
  attempts.set(key, a && a.until > now ? {...a, count: a.count + 1} : {count: 1, until: now + WINDOW_MS});
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
  }
  next();
};

/**
 * Регистрации: не больше 5 успешных в час с одного адреса. Каждая дарит бесплатные кредиты —
 * без ограничения их можно было бы копить, заводя почту за почтой. Считаем только удачные:
 * опечатка в телефоне или занятая почта не должны сжигать попытку.
 */
const signups = new Map();
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_SIGNUPS = 5;
export const registerLimiter = (req, res, next) => {
  const now = Date.now();
  const a = signups.get(req.ip);
  if (a && a.until > now && a.count >= MAX_SIGNUPS) {
    return next(new HttpError(429, 'Слишком много регистраций с этого адреса — попробуйте через час'));
  }
  res.on('finish', () => {
    if (res.statusCode !== 200) return;
    const cur = signups.get(req.ip);
    signups.set(req.ip, cur && cur.until > Date.now() ? {...cur, count: cur.count + 1} : {count: 1, until: Date.now() + SIGNUP_WINDOW_MS});
  });
  if (signups.size > 10_000) {
    for (const [k, v] of signups) if (v.until <= now) signups.delete(k);
  }
  next();
};
