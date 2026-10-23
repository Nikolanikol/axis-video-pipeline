// API сервера (без Vite и без запуска) — отдельно, чтобы тестировать
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import {
  CONFIG_DIR, DATA_DIR, DEFAULT_MARKET, DEFAULT_PROFILE, DEFAULT_WORKSPACE, withWorkspace, HttpError, PRODUCTION, checkId, createLot, getBrand, getCopy, lotDir, lotPhotosDir,
  getLot, getMarket, getProfile, listLots, listMarkets, listProfiles, readJson, renderMarket, saveBrand, saveLot,
  saveMarket, saveProfile, withLock, currentWorkspace, rendersDir, workspaceUrl,
} from './store.mjs';
import {reviewStoryboard} from '../src/shared/timeline.js';
import {getFormat, listFormats, storyboardFrames} from './formats.mjs';
import {addPhoto, applyBlur, backdropHandler, ownFile, photoInfo, removePhoto, stemOf} from './photos.mjs';
import {checkPhotoUrls, downloadPhoto, lookupCar} from './carLink.mjs';
import {rates, usdKrw} from './rates.mjs';
import {makeZip} from './zip.mjs';
import {previewId} from './db/index.mjs';
import {cancelJob, deleteJob, enqueue, getJob, listJobs, retryJob} from './renderer.mjs';
import {
  UPLOAD_TMP, ambienceReview, createReview, getReview, ingestSource, listReviews, rebuildLines, reprocessSource,
  transcribeReview, updateReview, voiceRegistry, voiceReview,
} from './reviews.mjs';
import {apiSettings, resolveSpeaker, voiceConfig} from '../src/shared/voices.js';
import {hasKey, hasVoice, synthesize} from './speech.mjs';
import {hasSeparator} from './ambience.mjs';
import {clientCarouselFormats, carouselsDir, buildCarousel, deleteCarousel, editCarouselTexts, listCarousels, repriceCarousel, slideFileName} from './carousel.mjs';
import {ICON_RULES, LOGO_RULES, brandForRender, saveIcon, saveLogo, setIconVariant, setLogoVariant, withLogoInk} from './brand.mjs';
import {balanceOf, billed, creditCosts, ledgerOf, ledgerPage, signupCredits} from './billing.mjs';
import {parseCarouselSource} from '../src/shared/kmotorsLot.js';
import {PALETTE_KEYS, isHex} from '../src/shared/contrast.js';
import {plateError} from '../src/shared/logoPlate.js';
import {isDesign} from '../src/shared/design.js';
import {styleError} from '../src/design/style/registry.js';
import {withoutMusic} from '../src/shared/nomusic.js';
import {
  accountOf, cancelEmailChange, requestDeletion, restoreAccount, changePassword, closeOtherSessions, closeSession, confirmEmailChange, dropSession,
  grantBonus, grantPack, setNews, listClients, listPacks, listSessions, listStaff, login, register, requestEmailChange,
  removePack, requestReset, resetPassword, restorePack, savePack, sendVerification, setRole, updateAccount, verifyCode, verifyLink,
} from './accounts.mjs';
import {hideClient, takeCredits, unhideClient, updateClient} from './clients.mjs';
import {
  audience, cancelMailing, copyMailing, deleteDraft, findRecipients, getMailing, listMailings, previewMailing, saveMailing, sendTest, startMailing, unsubscribe,
} from './mailing.mjs';
import {
  authEnabled, clearSessionCookie, guardData, loginLimiter, readSessionMw, registerLimiter, requireAdmin, requireCredits,
  requireStaff, requireUser, sessionToken, setSessionCookie,
} from './session.mjs';
import {thumbsHandler} from './thumbs.mjs';
import {handleUpdate, supportBotHandle, supportEnabled, supportLink, webhookAuthorized} from './support.mjs';
import {
  checkoutLimiter, handleNotification, kassaHealth, notifyLimiter, paymentEvents, paymentMethods, paymentOf, paymentsOf, publicOrigin, startCheckout,
} from './payments.mjs';
import {isCoreError} from '../cores/kit/errors.mjs';
import {requestIdMw, serverLog} from './log.mjs';
import {clientErrorHandler} from './clientErrors.mjs';
import {robotsTxt, sitemapXml} from './seo.mjs';

const log = serverLog('api');
// Сколько фото объявления качать и обрабатывать разом (загрузка по ссылке, см. photos/import)
const IMPORT_PARALLEL = 6;

// Медиа с путями /data/... браузер рендера берёт по полному адресу этого сервера
const absolute = (origin, url) => (url && url.startsWith('/') ? `${origin}${url}` : url);

/**
 * Тема для рендера: пути к файлам бренда — в полные адреса.
 *
 * Рендер идёт в отдельном браузере, который грузит сборку с адреса Remotion, а не с нашего
 * сервера. Путь вида /data/workspaces/<компания>/brand/logo.png он попробует найти у себя и получит 404 —
 * логотип молча пропал бы со слайда. Встроенные файлы (brand/…) трогать не надо: они лежат
 * в сборке.
 */
const themeForRender = (origin, theme) => (theme?.assets
  ? {...theme, assets: Object.fromEntries(
    Object.entries(theme.assets).map(([k, v]) => [k, absolute(origin, v)]))}
  : theme);
const withAbsolutePhotos = (lot, origin) => lot && {...lot, photos: lot.photos.map((p) => absolute(origin, p))};

// Откуда вход: браузер и адрес — для списка «где выполнен вход» в кабинете.
// req.ip — с учётом trust proxy ниже, то есть адрес человека, а не Traefik
// Страница отписки — простая, без интерфейса KOK: её открывают из письма, часто с телефона и без входа
const unsubscribePage = (inner) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Новости KOK</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#f7f2eb;font:16px/1.5 Manrope,Arial,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}p{margin:0 0 16px}.m{color:#9b958e;font-size:14px}
button{background:#8e0d2c;color:#f7f2eb;border:0;border-radius:8px;padding:12px 22px;font:inherit;font-weight:700;cursor:pointer}</style>
</head><body><main><h1>KOK</h1>${inner}</main></body></html>`;

const clientMeta = (req) => ({userAgent: req.get('user-agent') ?? '', ip: req.ip ?? ''});

// Обработчик выполняется от имени компании из сессии. Контекст ставим заново здесь, а не
// полагаемся на общий: приёмник файлов (multer) зовёт следующий шаг из событий потока,
// и контекст запроса туда не доезжает
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => withWorkspace(wsOf(req), () => fn(req, res)))
  .then((data) => res.json(data)).catch(next);
// Компания запроса. С входом — только из сессии; без неё — никакой (withWorkspace откажет),
// а не компания владельца по умолчанию. Без базы вход выключен — компания по умолчанию
const wsOf = (req) => req.ws ?? (authEnabled() ? null : DEFAULT_WORKSPACE);
// С кого и за что списать кредиты. Сотрудники платформы не платят — как и в requireCredits
const billOf = (req, pipeline) => ({pipeline, userId: req.user?.id ?? null, free: Boolean(req.user?.isStaff)});

/**
 * Снимок оформления объявления (lot.look, src/design/style/look.js): пресет, цвета, шрифты, движение,
 * подача данных. Поля стиля — тем же правилом реестра, что у бренда (styleError). Цвета и шрифты
 * идут прямо в стили рендера, поэтому строже бренда: шрифты — только пара из config/fonts.json
 * или текущая пара бренда
 */
const checkLotLook = async (lot) => {
  const look = lot.look;
  if (look === undefined || look === null) return;
  if (typeof look !== 'object' || Array.isArray(look)) throw new HttpError(400, 'Оформление ролика — объект настроек');
  if (look.design !== null && !isDesign(look.design)) throw new HttpError(400, 'Выберите дизайн из списка');
  const lookPlate = plateError(look.logoPlate);
  if (lookPlate) throw new HttpError(400, lookPlate);
  if (look.designVariant !== 0 && look.designVariant !== 1) throw new HttpError(400, 'Компоновка — основная или альтернативная');
  const styleProblem = styleError(look);
  if (styleProblem) throw new HttpError(400, styleProblem);
  for (const k of PALETTE_KEYS) if (!isHex(look[k])) throw new HttpError(400, `Цвет «${k}» — в виде #RRGGBB`);
  // Своя пара бренда (вписанная в brand.json руками) тоже годится: снимок оформления её копирует,
  // и иначе смена одной палитры у ролика упиралась бы в отказ по шрифтам
  const pairs = [...await readJson(path.join(CONFIG_DIR, 'fonts.json')), (await getBrand()).fonts ?? {}];
  const f = look.fonts;
  if (!f || !pairs.some((p) => p.head === f.head && p.body === f.body && (p.url ?? '') === (f.url ?? ''))) {
    throw new HttpError(400, 'Шрифты ролика — одна из пар в списке');
  }
  const st = look.style;
  if (!st || typeof st.gradient !== 'boolean' || typeof st.radius !== 'number' || st.radius < 0 || st.radius > 2) {
    throw new HttpError(400, 'Оформление ролика: акцент и углы — из списка');
  }
};

/**
 * Бренд от клиента проверяем: файлы бренда и таблица шрифтов открываются браузером рендера
 * на нашем сервере. Адрес, подставленный вручную, заставил бы его ходить куда угодно —
 * в том числе на внутренние адреса машины. Разрешены встроенные файлы (brand/…), файлы своей
 * компании и таблицы стилей Google Fonts — ровно то, что умеет выбрать интерфейс.
 */
const checkBrand = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Бренд — объект настроек');
  // Тон логотипов сервер считает сам по файлу (withLogoInk) — присланный не храним
  const {logoInk: _ink, ...theme} = input;
  const plateProblem = plateError(theme.logoPlate);
  if (plateProblem) throw new HttpError(400, plateProblem);
  const own = `${workspaceUrl()}/brand/`;
  for (const [k, v] of Object.entries(theme.assets ?? {})) {
    // Пустая строка у логотипа — «нет логотипа, пишем название компании»
    if (typeof v !== 'string' || !(v === '' || v.startsWith('brand/') || v.startsWith(own))) {
      throw new HttpError(400, `Файл бренда «${k}»: только встроенный или загруженный в настройках`);
    }
  }
  // Цвет попадает прямо в стили вёрстки рендера — только #RRGGBB, никаких строк со стороны
  for (const k of PALETTE_KEYS) {
    if (theme[k] !== undefined && !isHex(theme[k])) throw new HttpError(400, `Цвет «${k}» — в виде #RRGGBB`);
  }
  if (theme.design !== undefined && !isDesign(theme.design)) {
    throw new HttpError(400, 'Выберите дизайн из списка');
  }
  if (theme.designVariant !== undefined && theme.designVariant !== 0 && theme.designVariant !== 1) {
    throw new HttpError(400, 'Компоновка — основная или альтернативная');
  }
  // Движение и подача данных — одним правилом реестра стиля, как у снимка объявления
  const styleProblem = styleError(theme);
  if (styleProblem) throw new HttpError(400, styleProblem);
  const url = theme.fonts?.url ?? '';
  if (url && !/^https:\/\/fonts\.googleapis\.com\//.test(url)) {
    throw new HttpError(400, 'Шрифты — только из Google Fonts');
  }
  return theme;
};

// photoOrigin — адрес этого сервера: браузер рендера берёт по нему фото лотов (/data/...)

// Контакты платформы и продавец (витрина, оферта, кабинет). Основа — config/platform.json, а каналы
// связи перекрываются переменными окружения: номер или ник меняется в Coolify без правки кода и PR
// (владелец 12.10: «чтобы я мог быстро»). Пустая переменная не перекрывает — значит «не задана»
const CONTACT_ENV = {
  whatsapp: 'SMMAKER_SALES_WHATSAPP',
  telegram: 'SMMAKER_CONTACT_TELEGRAM',
  email: 'SMMAKER_CONTACT_EMAIL',
  instagram: 'SMMAKER_CONTACT_INSTAGRAM',
};
const platformInfo = async () => {
  const {_note, legal = {}, ...contacts} = await readJson(path.join(CONFIG_DIR, 'platform.json'));
  for (const [key, name] of Object.entries(CONTACT_ENV)) {
    const v = process.env[name]?.trim();
    if (v) contacts[key] = v;
  }
  // Telegram не задан руками — ведём в бота поддержки (владелец 12.10: «лучше всех вести в Telegram»)
  if (!contacts.telegram) contacts.telegram = (await supportBotHandle()) ?? '';
  return {contacts, legal};
};

export const createApp = ({photoOrigin}) => {
  const app = express();

  // Заслонки Basic Auth больше нет (снята по слову владельца 11.10): её заменил свой вход —
  // API требует сессию, файлы /data видит только своя компания (guardData). Она ещё и отвечала
  // 401 браузеру рендера на его же запросы к /data по 127.0.0.1 — фото и логотип не грузились.
  // BASIC_AUTH_USER/PASS в окружении теперь ни на что не влияют

  // Живость: без разбора тела
  app.get('/healthz', (_req, res) => res.json({ok: true}));
  // Возврат из кассы AnyPay: касса не принимает адрес с «#» — даём путь, а сервер ведёт на экран заказа
  app.get('/pay-return/:id', (req, res) => {
    const id = /^pay-[a-f0-9]{20}$/.test(req.params.id) ? req.params.id : '';
    res.redirect(302, id ? `/#/account/${id}` : '/#/account');
  });

  // За Traefik на сервере: верим его X-Forwarded-Proto (для Secure у cookie) и адресу клиента
  // (для ограничения попыток входа) — но только от прокси из внутренней сети, не от кого угодно
  app.set('trust proxy', 'loopback, uniquelocal');
  // Поисковикам (server/seo.mjs). До статики и до запасного index.html: иначе по этим адресам
  // уходила страница приложения, и робот не находил ни правил, ни карты сайта
  app.get('/robots.txt', (req, res, next) => robotsTxt(req).then((t) => res.type('text/plain').send(t)).catch(next));
  app.get('/sitemap.xml', (_req, res, next) => sitemapXml().then((x) => res.type('application/xml').send(x)).catch(next));
  // Номер запроса — самым первым: он нужен и ошибке разбора тела, и журналу всех шагов ниже
  app.use(requestIdMw);
  app.use(express.json({limit: '2mb'}));
  app.use(readSessionMw);
  const api = express.Router();

  // ——— Вход (открыто без сессии) ———
  // Интерфейс начинает с этого запроса: нужен ли вход, кто вошёл, сколько кредитов
  api.get('/auth/me', (req, res, next) => (async () => {
    if (!authEnabled()) return res.json({authRequired: false});
    // Незнакомцу — сколько дарим за регистрацию с подтверждённой почтой: форма пишет это над кнопкой
    if (!req.user) return res.json({authRequired: true, user: null, signup: await signupCredits()});
    res.json({
      authRequired: true, user: req.user, workspace: req.workspace,
      balance: req.ws ? await balanceOf(req.ws) : null,
    });
  })().catch(next));
  api.post('/auth/login', loginLimiter, (req, res, next) => login(req.body ?? {}, clientMeta(req))
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  api.post('/auth/register', registerLimiter, (req, res, next) => register(req.body ?? {}, clientMeta(req))
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  // Подтверждение почты: код — из кабинета (нужна сессия), ссылка — с любого устройства.
  // Ссылка из письма открывает страницу приложения, а та шлёт POST: GET-ссылку почтовые
  // сканеры (Outlook, антивирусы) открывают сами и сожгли бы её до человека
  api.post('/auth/verify', loginLimiter, (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Нужно войти'));
    verifyCode({userId: req.user.id, code: req.body?.code}).then((r) => res.json(r)).catch(next);
  });
  api.post('/auth/verify/resend', (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Нужно войти'));
    sendVerification(req.user.id).then((r) => res.json(r)).catch(next);
  });
  api.post('/auth/verify/link', loginLimiter, (req, res, next) => verifyLink({token: req.body?.token})
    .then((r) => res.json(r)).catch(next));
  // Сброс пароля: письмо со ссылкой; по ссылке — новый пароль и сразу вход
  api.post('/auth/forgot', loginLimiter, (req, res, next) => requestReset({email: req.body?.email})
    .then((r) => res.json(r)).catch(next));
  api.post('/auth/reset', loginLimiter, (req, res, next) => resetPassword({token: req.body?.token, password: req.body?.password}, clientMeta(req))
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  // Ссылка «восстановить» из письма об удалении: аккаунт снова открыт, и сразу вход
  api.post('/auth/restore', loginLimiter, (req, res, next) => restoreAccount({token: req.body?.token}, clientMeta(req))
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  api.post('/auth/logout', (req, res, next) => Promise.resolve(authEnabled() ? dropSession(sessionToken(req)) : null)
    .then(() => { clearSessionCookie(res); res.json({ok: true}); }).catch(next));

  // ——— Витрина гостя (app/Landing.tsx), открыто без сессии ———
  // Владелец 01.10: «прозрачные и заманчивые условия» — до регистрации видно, сколько дарим,
  // сколько стоит ролик и карусель и сколько стоят тарифы. Контакты продаж — для «написать
  // нам». Из пакетов отдаём только то, что и так показывает кабинет: название, кредиты, цену
  // Отписка от новостей по ссылке из письма (server/mailing.mjs), без входа. GET — только страница
  // с кнопкой: почтовые сканеры открывают ссылки из писем сами, и отписка по GET отписывала бы
  // людей без их ведома. Отписывает POST — кнопка на странице и «Отписаться» в Gmail
  // (List-Unsubscribe-Post шлёт POST на этот же адрес)
  api.get('/public/unsubscribe', (req, res) => {
    const k = String(req.query.k ?? '').replace(/[^0-9a-f-]/gi, '').slice(0, 36);
    res.type('html').send(unsubscribePage(`<p>Не присылать вам новости KOK на почту?</p>
<form method="post" action="/api/public/unsubscribe?k=${k}"><button>Отписаться</button></form>
<p class="m">Письма о входе, оплате и безопасности аккаунта приходят всегда — это не рассылка.</p>`));
  });
  api.post('/public/unsubscribe', express.urlencoded({extended: false}), (req, res, next) => unsubscribe(req.query.k)
    .then(() => res.type('html').send(unsubscribePage(`<p>Готово — новости KOK больше не придут.</p>
<p class="m">Передумаете — включите «Получать новости KOK» в своём кабинете.</p>`)))
    .catch(next));
  api.get('/public/offer', (_req, res, next) => (async () => {
    const {contacts, legal} = await platformInfo();
    const packs = authEnabled() ? await listPacks() : [];
    res.json({
      signup: await signupCredits(),
      costs: await creditCosts(),
      contacts,
      legal,
      packs: packs.map(({id, title, credits, price_usd, valid_days, kind, sort}) => ({id, title, credits, price_usd, valid_days, kind, sort})),
      // Номер PR превью: метка «ТЕСТ» нужна и гостю — витрина открывается до входа, /config ещё закрыт
      preview: previewId(),
    });
  })().catch(next));

  // Уведомление кассы об оплате — без сессии: приходит от NOWPayments, подлинность — по подписи
  // и сверке с самой кассой (server/payments.mjs). Номер операции — в ответ: по нему её видно в логе
  api.post('/payments/nowpayments/notify', notifyLimiter, (req, res, next) => {
    handleNotification({body: req.body, signature: req.get('x-nowpayments-sig'), requestId: req.requestId}).then((r) => res.json(r)).catch(next);
  });
  // Оповещение AnyPay (карта в сумах и гривнах): адрес задаётся в кабинете кассы, тело — форма (POST) или строка
  // запроса (GET — если в кабинете оставили его), подпись — полем sign в теле. Касса ждёт в ответ
  // ровно «OK», иначе повторяет оповещение каждые 10 минут в течение часа (ANYPAY.md)
  api.all('/payments/anypay/notify', notifyLimiter, express.urlencoded({extended: false, limit: '32kb'}), (req, res, next) => {
    const body = req.method === 'GET' ? req.query : req.body;
    handleNotification({provider: 'anypay', body, ip: req.ip, requestId: req.requestId}).then(() => res.type('text/plain').send('OK')).catch(next);
  });

  // Поддержка в Telegram: сообщения клиентов и ответы из рабочей группы (server/support.mjs).
  // Без сессии — подлинность по секрету в заголовке, который знаем только мы и Telegram.
  // Отвечаем сразу: Telegram ждёт ответа и повторяет, а копирование в тему может занять секунды
  api.post('/telegram/webhook', (req, res) => {
    if (!webhookAuthorized(req.get('x-telegram-bot-api-secret-token'))) return res.status(401).end();
    res.json({ok: true});
    void handleUpdate(req.body);
  });

  // Ошибки из браузера (server/clientErrors.mjs) — без сессии: падает и витрина гостя, и экран входа
  api.post('/client-error', clientErrorHandler);

  // Всё ниже — только после входа и от имени своей компании
  api.use(requireUser);
  api.use((req, _res, next) => { try { withWorkspace(wsOf(req), next); } catch (e) { next(e); } });

  // ——— Кабинет компании ———
  api.get('/account/ledger', wrap((req) => (authEnabled() ? ledgerPage(req.ws, req.query.page)
    : {rows: [], total: 0, page: 1, pages: 1, pageSize: 20})));
  // Профиль и безопасность: только с базой — без неё нет ни людей, ни паролей
  const account = express.Router();
  account.use((req, _res, next) => next(authEnabled() ? undefined : new HttpError(400, 'Профиль работает только с базой')));
  const who = (req) => ({userId: req.user.id, workspaceId: req.ws, sessionId: req.sessionId});
  account.get('/profile', wrap((req) => accountOf(req.user.id, req.ws)));
  account.put('/news', wrap((req) => setNews({...who(req), on: req.body?.on})));
  account.put('/profile', wrap((req) => updateAccount({...who(req), name: req.body?.name, company: req.body?.company})));
  // Всё, где проверяется текущий пароль, — под ограничением попыток: иначе вошедший на
  // чужом ноутбуке перебирал бы пароль владельца, чтобы сменить почту
  account.post('/password', loginLimiter, wrap((req) => changePassword({...who(req), current: req.body?.current, password: req.body?.password})));
  account.post('/email', loginLimiter, wrap((req) => requestEmailChange({...who(req), password: req.body?.password, email: req.body?.email})));
  account.post('/email/confirm', loginLimiter, wrap((req) => confirmEmailChange({...who(req), code: req.body?.code})));
  account.delete('/email', wrap((req) => cancelEmailChange(who(req))));
  account.get('/sessions', wrap((req) => listSessions(who(req))));
  account.delete('/sessions/:id', wrap((req) => closeSession({...who(req), id: req.params.id})));
  account.post('/sessions/close-others', wrap((req) => closeOtherSessions(who(req))));
  // Удаление: пароль и название компании руками. Входы сброшены сервером — cookie тоже чистим
  account.post('/delete', loginLimiter, (req, res, next) => requestDeletion({
    ...who(req), password: req.body?.password, confirm: req.body?.confirm,
  }).then((r) => { clearSessionCookie(res); res.json(r); }).catch(next));
  // Куда писать за пакетом и что в прайсе — на экран «кредиты закончились» и в кабинет.
  // WhatsApp продаж — из SMMAKER_SALES_WHATSAPP, если задан: номер менеджера меняется без
  // пересборки образа. Не задан — номер из config/platform.json
  // «Написать в поддержку» из кабинета: ссылка на бота с одноразовым ключом — тема в группе сразу
  // с компанией и контактами. url: null — поддержка не включена (Mac, превью)
  api.post('/account/support-link', wrap((req) => supportLink({userId: req.user.id, workspaceId: req.ws})));
  api.get('/account/offer', wrap(async () => {
    const {contacts} = await platformInfo();
    return {
      contacts,
      packs: authEnabled() ? await listPacks() : [],
      // Какие способы оплаты включены ({usdt, sbp, card}): без ключей кнопок кассы нет, остаётся менеджер
      pay: paymentMethods(),
      // Поддержка в Telegram включена — в кабинете есть «Написать в поддержку»
      support: supportEnabled(),
    };
  }));
  // Оплата тарифа: счёт у кассы → адрес страницы оплаты. Адрес возврата и уведомлений — тот,
  // с которого пришёл клиент (у превью свой, см. startCheckout)
  api.post('/payments/checkout', checkoutLimiter, wrap((req) => startCheckout({
    workspaceId: req.ws, userId: req.user?.id, packId: req.body?.packId, method: String(req.body?.method ?? 'usdt'),
    origin: publicOrigin(req), requestId: req.requestId,
  })));
  account.get('/payments', wrap((req) => paymentsOf(req.ws)));
  account.get('/payments/:id', wrap((req) => paymentOf(req.ws, req.params.id)));
  // После /account/offer: проверка «нужна база» в роутере иначе закрыла бы и прайс
  api.use('/account', account);

  // ——— Админка: лиды и пакеты — сотрудникам, прайс и роли — только владельцу ———
  const admin = express.Router();
  admin.use((req, _res, next) => next(authEnabled() ? undefined : new HttpError(400, 'Админка работает только с базой')));
  admin.use(requireStaff);
  admin.get('/clients', wrap((req) => listClients(req.query)));
  admin.get('/clients/:id/ledger', wrap((req) => ledgerOf(checkId(req.params.id))));
  admin.get('/packs', wrap(() => listPacks({all: true})));
  // Журнал заказа оплаты: все уведомления кассы, сверки, отказы и тревоги — разбор спора и сбоя
  admin.get('/payments/:id/events', wrap((req) => paymentEvents(req.params.id)));
  // Жива ли касса и принимает ли ключ — первое, что смотреть, если оплаты не идут
  admin.get('/payments/health', wrap(() => kassaHealth()));
  admin.post('/clients/:id/packs', wrap((req) => grantPack({
    workspaceId: checkId(req.params.id), packId: String(req.body?.packId ?? ''), note: req.body?.note, createdBy: req.user.id,
  })));
  admin.post('/clients/:id/bonus', requireAdmin, wrap((req) => grantBonus({
    workspaceId: checkId(req.params.id), credits: req.body?.credits, days: req.body?.days, note: req.body?.note, createdBy: req.user.id,
  })));
  admin.put('/packs/:id', requireAdmin, wrap((req) => savePack({...req.body, id: req.params.id})));
  // Удаление: не продавался — строка прочь, продавался — в архив (ответ говорит, что сделано)
  admin.delete('/packs/:id', requireAdmin, wrap((req) => removePack(req.params.id)));
  admin.post('/packs/:id/restore', requireAdmin, wrap((req) => restorePack(req.params.id)));
  // Сам клиент: контакты — сотрудникам, списание и скрытие — админу (server/clients.mjs)
  admin.put('/clients/:id', wrap((req) => updateClient({
    workspaceId: checkId(req.params.id), company: req.body?.company, person: req.body?.person, phone: req.body?.phone, email: req.body?.email,
    by: {id: req.user.id, role: req.user.role},
  })));
  admin.post('/clients/:id/take', requireAdmin, wrap((req) => takeCredits({
    workspaceId: checkId(req.params.id), credits: req.body?.credits, note: req.body?.note, by: {id: req.user.id},
  })));
  admin.post('/clients/:id/hide', requireAdmin, wrap((req) => hideClient({workspaceId: checkId(req.params.id), note: req.body?.note, by: {id: req.user.id}})));
  admin.post('/clients/:id/unhide', requireAdmin, wrap((req) => unhideClient({workspaceId: checkId(req.params.id), by: {id: req.user.id}})));
  // Рассылки — всем сотрудникам: их делает менеджер (владелец 21.10). Только служебные новости
  const mid = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Неверный номер рассылки');
    return n;
  };
  admin.get('/mailings', wrap(() => listMailings()));
  admin.get('/mailings/audience', wrap(() => audience()));
  admin.get('/mailings/people', wrap((req) => findRecipients(req.query.q)));
  admin.post('/mailings/preview', wrap((req) => previewMailing({...req.body, by: req.user.id})));
  admin.post('/mailings', wrap((req) => saveMailing({...req.body, id: undefined, by: req.user.id})));
  admin.get('/mailings/:id', wrap((req) => getMailing(mid(req))));
  admin.put('/mailings/:id', wrap((req) => saveMailing({...req.body, id: mid(req), by: req.user.id})));
  admin.delete('/mailings/:id', wrap((req) => deleteDraft(mid(req))));
  admin.post('/mailings/:id/copy', wrap((req) => copyMailing({id: mid(req), by: req.user.id})));
  admin.post('/mailings/:id/test', wrap((req) => sendTest({id: mid(req), by: req.user.id})));
  admin.post('/mailings/:id/send', wrap((req) => startMailing({id: mid(req)})));
  admin.post('/mailings/:id/cancel', wrap((req) => cancelMailing({id: mid(req)})));
  admin.get('/staff', requireAdmin, wrap(() => listStaff()));
  admin.put('/staff', requireAdmin, wrap((req) => setRole({email: req.body?.email, role: req.body?.role, by: req.user.id})));
  api.use('/admin', admin);

  api.get('/config', wrap(async () => ({
    brand: await getBrand().then(withLogoInk), markets: await listMarkets(), defaultMarket: DEFAULT_MARKET, formats: await listFormats(),
    // Профили клиента идут на смену рынкам (стадия перехода). Пока отдаём и то, и другое:
    // интерфейс переключится на профиль отдельно, пайплайны — отдельно. copy — дефолты
    // текстов платформы, из них профиль берёт готовые подписи.
    profiles: await listProfiles(), defaultProfile: DEFAULT_PROFILE, copy: await getCopy(),
    pipelines: await readJson(path.join(CONFIG_DIR, 'pipelines.json')),
    // Признак боевого запуска. Интерфейс по нему прячет пайплайн обзоров: рендер обзора
    // занял бы полмашины на час рядом с боевым сайтом. Прячет именно клиент, а не сервер:
    // реестр пайплайнов общий для прода и дева, и один флаг честнее двух списков.
    production: PRODUCTION,
    // Номер PR, если это превью в Coolify: шапка показывает «ТЕСТ», чтобы превью не путали с продом
    preview: previewId(),
    // Компания, от имени которой работает сервер, и адрес её файлов: интерфейс по нему
    // отличает свои фото лота от чужих ссылок
    workspace: {id: currentWorkspace(), url: workspaceUrl()},
    // Пары шрифтов для настроек бренда. Все с кириллицей — проверено запросом к Google Fonts,
    // и все отдают настоящие 500/600/700, а не синтезированный жирный
    fonts: await readJson(path.join(CONFIG_DIR, 'fonts.json')),
    // Палитры: восемь цветов темы согласованно, каждая прошла проверку контраста
    // (tests/unit/palettes.test.ts). Клиент выбирает палитру, а не восемь цветов по одному
    palettes: await readJson(path.join(CONFIG_DIR, 'palettes.json')),
    // Форматы карусели: размер кадра и список слайдов
    carouselFormats: await clientCarouselFormats(),
    // Спикеры озвучки: интерфейс показывает только тех, кто умеет выбранный язык
    voices: await voiceRegistry(),
    // Что доступно: распознавание речи включается ключом ElevenLabs в .env
    // Что доступно: речь и озвучка — по ключу ElevenLabs; выделение звуков машины — по
    // наличию локального окружения с моделью разделения (проба, ставится отдельно)
    features: {speech: hasKey(), voice: hasVoice(), ambience: await hasSeparator()},
    // Цены генераций в кредитах — интерфейс пишет их на кнопках
    credits: await creditCosts(),
  })));
  api.put('/brand', wrap(async (req) => { await saveBrand(checkBrand(req.body)); return getBrand().then(withLogoInk); }));
  // Логотип: свой приёмник со своим потолком (10 МБ, LOGO_RULES) — большие фото общего приёмника ему ни к чему
  const logoUpload = multer({storage: multer.memoryStorage(), limits: {fileSize: LOGO_RULES.maxBytes, files: 1}});
  api.post('/brand/logo', logoUpload.single('logo'), wrap(async (req) => {
    const saved = await saveLogo(req.file?.buffer);
    return {...saved, brand: await getBrand().then(withLogoInk)};
  }));
  // Вариант логотипа: clean — фон убран, raw — как загружен, none — название компании текстом
  api.put('/brand/logo/variant', wrap(async (req) => {
    const variant = String(req.body?.variant ?? '');
    if (!['clean', 'raw', 'none'].includes(variant)) throw new HttpError(400, 'Вариант — clean, raw или none');
    return {...(await setLogoVariant(variant)), brand: await getBrand().then(withLogoInk)};
  }));
  // Своя иконка у преимущества в CTA — та же обработка, что у логотипа, свой потолок (ICON_RULES)
  const iconUpload = multer({storage: multer.memoryStorage(), limits: {fileSize: ICON_RULES.maxBytes, files: 1}});
  api.post('/brand/icon', iconUpload.single('icon'), wrap(async (req) => {
    const saved = await saveIcon(req.file?.buffer);
    return {...saved, brand: await getBrand().then(withLogoInk)};
  }));
  // clean — фон убран, raw — как загружена, default — встроенное рукопожатие
  api.put('/brand/icon/variant', wrap(async (req) => {
    const variant = String(req.body?.variant ?? '');
    if (!['clean', 'raw', 'default'].includes(variant)) throw new HttpError(400, 'Вариант — clean, raw или default');
    return {...(await setIconVariant(variant)), brand: await getBrand().then(withLogoInk)};
  }));
  // Рынки — платформенный реестр в config/, общий для всех: править может только владелец
  api.put('/markets/:id', requireAdmin, wrap(async (req) => {
    const {id: _ignored, ...market} = req.body;
    await saveMarket(req.params.id, market);
    return {id: req.params.id, ...(await getMarket(req.params.id))};
  }));
  api.put('/profiles/:id', wrap(async (req) => {
    const {id: _ignored, ...profile} = req.body;
    await saveProfile(req.params.id, profile);
    return {id: req.params.id, ...(await getProfile(req.params.id))};
  }));

  // Запись лота — строго по очереди (автосохранение формы и операции с фото не должны перетирать друг друга)
  const withLot = (id, fn) => withLock(`lot:${id}`, () => fn(getLot(id)));

  // Машина по ссылке Encar для формы лота. Бесплатно: кредиты — за сборку ролика, не за данные
  api.post('/encar/lookup', wrap((req) => lookupCar(req.body?.link)));
  // Курс ₩ за $1 на сегодня (обновляется раз в сутки, см. server/rates.mjs)
  api.get('/rates/usd-krw', wrap(() => usdKrw()));
  // Все курсы (единиц за $1) — шапка и пересчёт цены в валюту компании
  api.get('/rates', wrap(() => rates()));

  api.get('/lots', wrap(() => listLots()));
  // Удалить лот вместе с фото и готовыми роликами — список лотов копится (владелец 30.09:
  // «плашка будет засоряться, их надо удалять»). Идущий рендер этого лота — отказ: иначе
  // удалили бы файл, который прямо сейчас пишется (так же устроено удаление ролика)
  api.delete('/lots/:id', wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading.catch(() => { throw new HttpError(404, 'Нет такого объявления'); });
    const own = await listJobs({lotId: lot.id});
    if (own.some((j) => j.status === 'queued' || j.status === 'running')) {
      throw new HttpError(409, 'Ролик этого объявления сейчас собирается — дождитесь или отмените сборку');
    }
    for (const j of own) await deleteJob(j.id);
    await fs.rm(lotDir(lot.id), {recursive: true, force: true});
    return {id: lot.id, deleted: true, renders: own.length};
  })));
  // Копия лота: попробовать другой формат или тексты, не трогая исходный. Фото копируются
  // файлами (с оригиналами — размытие пересобирается и в копии), адреса переписываются на
  // новую папку. Выбор мест фото и размытие хранятся по имени файла — переносятся как есть.
  // Пометку «Encar <номер>» меняем: по ней вставка той же ссылки находит лот, и копия
  // перехватывала бы оригинал
  api.post('/lots/:id/copy', wrap(async (req) => {
    const src = await getLot(req.params.id).catch(() => { throw new HttpError(404, 'Нет такого объявления'); });
    const {id: _old, updatedAt: _u, ...data} = src;
    const created = await createLot({market: data.market});
    await fs.cp(lotPhotosDir(src.id), lotPhotosDir(created.id), {recursive: true});
    const from = `/lots/${src.id}/photos/`;
    const to = `/lots/${created.id}/photos/`;
    const note = (data.note ?? '').replace(/^(Encar|che168|carsensor) ([A-Za-z]*\d+)/, 'копия $1 $2') || 'копия';
    return saveLot(created.id, {...data, photos: data.photos.map((p) => p.replace(from, to)), note});
  }));
  api.post('/lots', wrap((req) => createLot(req.body?.market ? {market: checkId(req.body.market)} : {})));
  api.get('/lots/:id', wrap((req) => getLot(req.params.id)));
  api.put('/lots/:id', wrap((req) => withLot(req.params.id, async (loading) => {
    const current = await loading;
    // Фото, размытие и источники фото меняются только своими запросами; из формы принимаем лишь новый порядок уже загруженных
    const known = new Set(current.photos);
    const sent = [...new Set(Array.isArray(req.body.photos) ? req.body.photos.filter((p) => known.has(p)) : [])];
    const photos = sent.length === current.photos.length ? sent : current.photos;
    await checkLotLook(req.body);
    return saveLot(current.id, {...req.body, photos, blur: current.blur, sources: current.sources});
  })));

  // Фото: оригинал + рабочая копия 1080 по ширине (поворот по EXIF, JPEG)
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 30 * 1024 * 1024, files: 20}});
  api.post('/lots/:id/photos', upload.array('photos'), wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    const added = [];
    for (const file of req.files ?? []) added.push(await addPhoto(lot.id, file.buffer, file.originalname));
    return saveLot(lot.id, {...lot, photos: [...lot.photos, ...added]});
  })));
  // Фото из объявления Encar: скачиваем к себе и добавляем в конец, в порядке выбора.
  // Скачивание — вне очереди лота: десяток фото это секунды, и держать всё это время
  // автосохранение формы незачем. В очередь встаёт только запись списка фото
  api.post('/lots/:id/photos/import', wrap(async (req) => {
    const urls = checkPhotoUrls(req.body?.urls);
    const lot = await getLot(req.params.id);
    // Несколько фото разом — и скачивание, и обработка. Раньше качали по одному: Encar будто бы
    // отвечал отказами на пачку запросов с одного адреса. Замер 13.10 с сервера на свежих машинах:
    // фото Encar, которое ещё никто не запрашивал, идёт ~0,8 с; девять по одному — 7,6 с, все
    // девять разом — 0,9 с, отказов нет. Плюс обработка ~0,9 с на фото — по одному объявление
    // грузилось 17–25 с. Шесть — с запасом под одно объявление и без пачки в 30 запросов
    const added = new Array(urls.length);
    let next = 0;
    // Одно фото не скачалось — клиент уже получит ошибку, остальные потоки новых не берут
    let failed = false;
    await Promise.all(Array.from({length: Math.min(IMPORT_PARALLEL, urls.length)}, async () => {
      while (!failed && next < urls.length) {
        const i = next++;
        try {
          added[i] = await addPhoto(lot.id, await downloadPhoto(urls[i]), `encar-${i + 1}.jpg`);
        } catch (e) {
          failed = true;
          throw e;
        }
      }
    }));
    // Откуда каждое фото: по этой записи палитра объявления помечает снимки «в лоте» и не
    // даёт загрузить их второй раз. Ключ — имя файла без версии, как у размытия (версия
    // меняется при каждом размытии); адрес — без параметров размера: палитра показывает тот
    // же снимок с другими параметрами
    const sources = Object.fromEntries(added.map((p, i) => [stemOf(ownFile(lot.id, p)), urls[i].split('?')[0]]));
    return withLot(lot.id, async (loading) => {
      const current = await loading;
      return saveLot(current.id, {...current, photos: [...current.photos, ...added], sources: {...current.sources, ...sources}});
    });
  }));
  api.delete('/lots/:id/photos', wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    return saveLot(lot.id, await removePhoto(lot, String(req.query.path || '')));
  })));
  // Размытие: что показать в редакторе и применить области
  api.get('/lots/:id/photo', wrap(async (req) => photoInfo(await getLot(req.params.id), String(req.query.path || ''))));
  api.put('/lots/:id/photo', wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    return saveLot(lot.id, await applyBlur(lot, String(req.body.path || ''), req.body.regions));
  })));

  // Рендер: сохранённый лот + текущие настройки рынка и бренда, формат — из запроса или лота
  api.post('/lots/:id/render', requireCredits, wrap(async (req) => {
    const lot = await getLot(req.params.id);
    const format = await getFormat(req.body?.format || lot.format);
    if (format.requires.includes('photos') && !lot.photos.length) throw new HttpError(400, 'Добавь хотя бы одно фото');
    const [market, brand] = await Promise.all([renderMarket(), getBrand().then(brandForRender)]);
    const theme = {...brand, name: market.name};
    const title = [lot.brand, lot.model, lot.year].filter(Boolean).join(' ') || lot.id;
    // Музыка убрана из продукта: сохранённый в лоте трек в ролик не идёт (src/shared/nomusic.js)
    const inputProps = {lot: withAbsolutePhotos(withoutMusic(lot), photoOrigin), market, theme: themeForRender(photoOrigin, theme)};
    return enqueue({
      owner: {lotId: lot.id}, composition: format.id, compositionTitle: format.title, title,
      frames: storyboardFrames(format), inputProps, bill: billOf(req, 'ads'),
    });
  }));

  // Обзоры
  api.get('/reviews', wrap(() => listReviews()));
  api.post('/reviews', wrap((req) => createReview({lotId: req.body?.lotId ? checkId(req.body.lotId) : null, title: req.body?.title})));
  api.get('/reviews/:id', wrap((req) => getReview(checkId(req.params.id))));
  api.put('/reviews/:id', wrap((req) => updateReview(checkId(req.params.id), req.body ?? {})));
  const videoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => fs.mkdir(UPLOAD_TMP, {recursive: true}).then(() => cb(null, UPLOAD_TMP), cb),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.upload`),
    }),
    limits: {fileSize: 4 * 1024 ** 3, files: 1},
  });
  const validId = (req, res, next) => { try { checkId(req.params.id); next(); } catch (e) { next(e); } };
  api.post('/reviews/:id/source', validId, requireCredits, videoUpload.single('video'), wrap(async (req) => {
    if (!req.file) throw new HttpError(400, 'Нет файла видео');
    return ingestSource(req.params.id, req.file.path, req.file.originalname);
  }));
  api.post('/reviews/:id/reprocess', requireCredits, wrap((req) => reprocessSource(checkId(req.params.id))));
  api.post('/reviews/:id/transcribe', requireCredits, wrap((req) => transcribeReview(checkId(req.params.id))));
  api.post('/reviews/:id/relines', wrap((req) => rebuildLines(checkId(req.params.id))));
  // Прослушать спикера: одна фраза вместо озвучки всего обзора. Отдаёт mp3, а не JSON.
  api.post('/voices/preview', requireCredits, (req, res, next) => (async () => {
    const language = typeof req.body?.language === 'string' ? req.body.language : 'mk';
    const registry = await voiceRegistry();
    const speaker = resolveSpeaker(registry, language, req.body?.speaker);
    const config = voiceConfig(speaker, language);
    if (!config) throw new HttpError(400, 'Нет такого спикера для этого языка');
    const text = String(req.body?.text || '').trim().slice(0, 300);
    if (!text) throw new HttpError(400, 'Нечего читать: пришли текст фразы');
    const audio = await synthesize(text, {language, voice: config.voiceId, model: config.model, settings: apiSettings(config.settings)});
    res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'no-store').send(audio);
  })().catch(next));
  api.post('/reviews/:id/voice', requireCredits, wrap(async (req) => {
    const review = await getReview(checkId(req.params.id));
    const market = await renderMarket();
    return voiceReview(review.id, {language: typeof req.body?.language === 'string' ? req.body.language : undefined, market});
  }));
  api.post('/reviews/:id/ambience', requireCredits, wrap((req) => ambienceReview(checkId(req.params.id))));
  api.post('/reviews/:id/render', requireCredits, wrap(async (req) => {
    const review = await getReview(checkId(req.params.id));
    if (review.source?.status !== 'ready') throw new HttpError(400, 'Видео ещё не готово');
    if (!review.segments.length) throw new HttpError(400, 'Добавь хотя бы один фрагмент');
    const lot = review.lotId ? await getLot(review.lotId).catch(() => null) : null;
    const [market, brand] = await Promise.all([renderMarket(), getBrand().then(brandForRender)]);
    const theme = {...brand, name: market.name};
    const inputProps = {
      review: {
        // Музыка убрана из продукта: сохранённый в обзоре трек в ролик не идёт (src/shared/nomusic.js)
        ...withoutMusic(review),
        source: {...review.source, proxy: absolute(photoOrigin, review.source.proxy)},
        ambience: review.ambience?.file ? {...review.ambience, file: absolute(photoOrigin, review.ambience.file)} : review.ambience,
        voice: review.voice && {
          ...review.voice,
          // Единая начитка — один файл; у прежних обзоров файл был у каждой строки
          track: review.voice.track && {...review.voice.track, file: absolute(photoOrigin, review.voice.track.file)},
          clips: Object.fromEntries(Object.entries(review.voice.clips ?? {})
            .map(([id, c]) => [id, c.file ? {...c, file: absolute(photoOrigin, c.file)} : c])),
        },
      },
      lot: withAbsolutePhotos(lot, photoOrigin), market, theme: themeForRender(photoOrigin, theme),
    };
    return enqueue({
      owner: {reviewId: review.id}, composition: 'review-short', compositionTitle: 'Обзор', title: review.title || review.id,
      frames: reviewStoryboard(review.segments), inputProps, bill: billOf(req, 'reviews'),
    });
  }));

  // Карусели: ссылка Encar → слайды выбранного формата. Сборка синхронная — кадры снимаются
  // за секунды, отдельная очередь как у видео тут была бы лишней сложностью. Поэтому и кредит
  // здесь же: списываем, собираем, при неудаче возвращаем
  api.post('/carousels', requireCredits, (req, _res, next) => {
    // Ссылку проверяем до списания: опечатка в ссылке — не повод гонять кредит туда-обратно
    // и засорять журнал клиента парой «списано / возврат»
    try {
      const src = parseCarouselSource(req.body?.link);
      // Лоты аукциона — источник владельца (решение 06.10): страницы kmotors разбираем для его
      // каруселей, не как услугу клиентам. Без входа (локально) проверять некого.
      // Encar, che168 (Китай) и Carsensor (Япония) — для всех
      if (!['encar', 'che168', 'carsensor'].includes(src.source) && req.user && !req.user.isStaff) {
        return next(new HttpError(403, 'Карусели по лотам аукционов пока доступны только сотрудникам'));
      }
      next();
    } catch (e) { next(new HttpError(400, e.message)); }
  }, wrap((req) => billed(
    {...billOf(req, 'carousels'), workspaceId: req.ws,
      jobId: `carousel-${req.ws}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      note: String(req.body?.link ?? '').slice(0, 120)},
    () => buildCarousel(req.body?.link, {format: req.body?.format, seed: req.body?.seed, family: req.body?.family}))));
  // Пересобрать со своей ценой — бесплатно: та же машина, формат и вариант (repriceCarousel)
  api.post('/carousels/:id/price', wrap((req) => repriceCarousel(checkId(req.params.id), req.body?.price)));
  // Свой текст на слайде — тоже бесплатно: та же машина, формат и вариант, меняются только слова
  api.post('/carousels/:id/texts', wrap((req) => editCarouselTexts(checkId(req.params.id), req.body?.slide, req.body?.fields)));
  api.get('/carousels', wrap(() => listCarousels()));
  api.delete('/carousels/:id', wrap((req) => deleteCarousel(checkId(req.params.id))));
  api.get('/carousels/:id/slide/:n/download', async (req, res, next) => {
    try {
      const id = checkId(req.params.id);
      const n = Number(req.params.n);
      const meta = await readJson(path.join(carouselsDir(), id, 'carousel.json'))
        .catch(() => { throw new HttpError(404, 'Карусель не собрана'); });
      // Слайдов столько, сколько в собранной карусели: у форматов их от 6 до 12
      if (!Number.isInteger(n) || n < 1 || n > meta.slides.length) throw new HttpError(400, 'Нет такого слайда');
      res.download(path.join(carouselsDir(), id, `slide-${n}.png`), slideFileName(meta.car, n));
    } catch (e) { next(e); }
  });

  // Все слайды одним файлом. Раньше «Скачать все» запускало 7 загрузок подряд с паузами —
  // браузер спрашивал разрешение на множество файлов, а часть загрузок терялась. Архив
  // собирается в памяти: у карусели 6–12 PNG по 1–3 МБ
  api.get('/carousels/:id/zip', async (req, res, next) => {
    try {
      const id = checkId(req.params.id);
      const meta = await readJson(path.join(carouselsDir(), id, 'carousel.json'))
        .catch(() => { throw new HttpError(404, 'Карусель не собрана'); });
      const files = [];
      for (let n = 1; n <= meta.slides.length; n++) {
        files.push({name: slideFileName(meta.car, n), data: await fs.readFile(path.join(carouselsDir(), id, `slide-${n}.png`))});
      }
      const name = slideFileName(meta.car, 0).replace(/-0\.png$/, '.zip');
      res.set('Content-Type', 'application/zip');
      res.attachment(name);
      res.send(makeZip(files));
    } catch (e) { next(e); }
  });

  api.get('/renders', wrap((req) => listJobs({
    lotId: req.query.lot ? checkId(req.query.lot) : undefined,
    reviewId: req.query.review ? checkId(req.query.review) : undefined,
  })));
  api.get('/renders/:id', wrap((req) => getJob(checkId(req.params.id))));
  api.post('/renders/:id/cancel', wrap((req) => cancelJob(checkId(req.params.id))));
  api.post('/renders/:id/retry', requireCredits, wrap((req) => retryJob(checkId(req.params.id), billOf(req))));
  api.delete('/renders/:id', wrap((req) => deleteJob(checkId(req.params.id))));
  api.get('/renders/:id/download', async (req, res, next) => {
    try {
      const job = await getJob(checkId(req.params.id));
      const name = `${job.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-${job.format ?? 'price-ad'}-${job.id.slice(-14)}.mp4`;
      res.download(path.join(rendersDir(), `${job.id}.mp4`), name);
    } catch (e) { next(e); }
  });

  app.use('/api', api);
  // Миниатюры для плашек — те же правила доступа, что у /data (server/thumbs.mjs)
  app.use('/thumbs', guardData, thumbsHandler);
  // Размытый фон кадра у старых фото достраивается при первом запросе (server/photos.mjs)
  app.use('/data', guardData, backdropHandler, express.static(DATA_DIR, {fallthrough: false}));
  // Единый ответ об ошибке (стандарт ошибок, 12.10). Наши ошибки (HttpError, ошибки ядер, разбор
  // тела, размер файла) написаны для человека — их текст и показываем. Всё прочее — поломка у нас:
  // наружу только «внутренняя ошибка» и код запроса, подробности — в журнал и тревогой в Telegram.
  // Раньше клиент видел сырой текст исключения — вплоть до ошибки SQL
  app.use('/api', (err, req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') err = Object.assign(new HttpError(413, 'Файл слишком большой для загрузки'), {cause: err});
    // Тело запроса не разобралось — текст парсера английский («Expected property name…»). Наш
    // интерфейс так не шлёт: это оборванный запрос или чужой клиент
    if (err.type === 'entity.parse.failed') err = Object.assign(new HttpError(400, 'Запрос пришёл повреждённым — обновите страницу и попробуйте ещё раз'), {cause: err});
    // expose — признак ошибок самого Express (разбор тела, слишком большой запрос): их текст безопасен
    const ours = err instanceof HttpError || (isCoreError(err) && err.code !== 'INTERNAL') || err.expose === true;
    const status = ours ? (err.status || err.statusCode || 500) : 500;
    const where = {method: req.method, path: req.originalUrl.split('?')[0], status};
    // Ожидаемые 4xx не пишем: это «нет такого объявления», а не событие. Наши 5xx (площадка не
    // ответила) — warn: граница модуля уже записала подробности. Чужое — error со стеком
    if (!ours) log.error('request.failed', {...where, error: err});
    else if (status >= 500) log.warn('request.failed', {...where, message: err.message});
    const requestId = req.requestId;
    res.status(status).json({
      error: ours ? err.message : `Внутренняя ошибка сервера. Код для поддержки: ${requestId}`,
      // Код отдельным полем — для интерфейса и поддержки; в тексте он тоже есть, чтобы его увидел человек
      ...(status >= 500 ? {requestId} : {}),
    });
  });
  return app;
};
