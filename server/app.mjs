// API сервера (без Vite и без запуска) — отдельно, чтобы тестировать
import crypto from 'node:crypto';
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
import {addPhoto, applyBlur, ownFile, photoInfo, removePhoto, stemOf} from './photos.mjs';
import {checkPhotoUrls, downloadPhoto, lookupCar} from './encar.mjs';
import {usdKrw} from './rates.mjs';
import {makeZip} from './zip.mjs';
import {cancelJob, deleteJob, enqueue, getJob, listJobs, retryJob} from './renderer.mjs';
import {
  UPLOAD_TMP, ambienceReview, createReview, getReview, ingestSource, listReviews, rebuildLines, reprocessSource,
  transcribeReview, updateReview, voiceRegistry, voiceReview,
} from './reviews.mjs';
import {apiSettings, resolveSpeaker, voiceConfig} from '../src/shared/voices.js';
import {hasKey, hasVoice, synthesize} from './speech.mjs';
import {hasSeparator} from './ambience.mjs';
import {carouselFormats, carouselsDir, buildCarousel, deleteCarousel, listCarousels, slideFileName} from './carousel.mjs';
import {LOGO_RULES, saveLogo, setLogoVariant} from './brand.mjs';
import {balanceOf, billed, creditCosts, ledgerOf, signupCredits} from './billing.mjs';
import {parseCarouselSource} from '../src/shared/kmotorsLot.js';
import {PALETTE_KEYS, isHex} from '../src/shared/contrast.js';
import {withoutMusic} from '../src/shared/nomusic.js';
import {
  dropSession, grantBonus, grantPack, listClients, listPacks, listStaff, login, register, requestReset, resetPassword,
  savePack, sendVerification, setRole, verifyCode, verifyLink,
} from './accounts.mjs';
import {
  authEnabled, clearSessionCookie, guardData, loginLimiter, readSessionMw, registerLimiter, requireAdmin, requireCredits,
  requireStaff, requireUser, sessionToken, setSessionCookie,
} from './session.mjs';

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
 * Бренд от клиента проверяем: файлы бренда и таблица шрифтов открываются браузером рендера
 * на нашем сервере. Адрес, подставленный вручную, заставил бы его ходить куда угодно —
 * в том числе на внутренние адреса машины. Разрешены встроенные файлы (brand/…), файлы своей
 * компании и таблицы стилей Google Fonts — ровно то, что умеет выбрать интерфейс.
 */
const checkBrand = (theme) => {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) throw new HttpError(400, 'Бренд — объект настроек');
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
  const url = theme.fonts?.url ?? '';
  if (url && !/^https:\/\/fonts\.googleapis\.com\//.test(url)) {
    throw new HttpError(400, 'Шрифты — только из Google Fonts');
  }
  return theme;
};

// photoOrigin — адрес этого сервера: браузер рендера берёт по нему фото лотов (/data/...)
/**
 * Сравнение секретов за постоянное время: обычное === на строках подсказывает длину и
 * первые совпавшие символы по времени ответа. Для пароля это ни к чему.
 */
const sameSecret = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Вход по паролю (HTTP Basic Auth), включается переменными окружения.
 *
 * Заданы BASIC_AUTH_USER и BASIC_AUTH_PASS — сервер требует вход на всё, кроме проверки
 * живости. Не заданы — работает без пароля: так удобно на Mac, где инструмент и так слушает
 * только localhost. На сервере их задали, когда у инструмента появился публичный домен, а
 * своего входа ещё не было: без заслонки любой мог бы запускать рендеры — дорогие и рядом
 * с боевым сайтом.
 *
 * Со входом SMMAKER (включается с DATABASE_URL, см. session.mjs) заслонка лишняя: она
 * независима от него и снимается, когда вход выложен на прод. Обе сразу — браузер спросит
 * пароль дважды: сначала своё окно Basic Auth, потом экран входа.
 *
 * Сделано в приложении, а не в прокси: Coolify этой версии не даёт удобно править метки
 * Traefik, а так защита в нашем коде и переживает любой передеплой.
 */
const basicAuth = (user, pass) => (req, res, next) => {
  // Проверка живости ходит изнутри контейнера без заголовков — её пропускаем, иначе
  // health-check вечно получал бы 401 и Coolify считал бы контейнер мёртвым
  if (req.path === '/healthz') return next();
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    if (sameSecret(u, user) && sameSecret(p ?? '', pass)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="KOK", charset="UTF-8"').status(401).send('Нужен вход');
};

export const createApp = ({photoOrigin}) => {
  const app = express();

  // Заслонку ставим самой первой: до разбора тела и до любого маршрута, чтобы неавторизованный
  // запрос не дошёл ни до API, ни до статики
  const authUser = process.env.BASIC_AUTH_USER;
  const authPass = process.env.BASIC_AUTH_PASS;
  if (authUser && authPass) app.use(basicAuth(authUser, authPass));

  // Живость: без пароля и без разбора тела, отвечает раньше заслонки по пути выше
  app.get('/healthz', (_req, res) => res.json({ok: true}));

  // За Traefik на сервере: верим его X-Forwarded-Proto (для Secure у cookie) и адресу клиента
  // (для ограничения попыток входа) — но только от прокси из внутренней сети, не от кого угодно
  app.set('trust proxy', 'loopback, uniquelocal');
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
  api.post('/auth/login', loginLimiter, (req, res, next) => login(req.body ?? {})
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  api.post('/auth/register', registerLimiter, (req, res, next) => register(req.body ?? {})
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
  api.post('/auth/reset', loginLimiter, (req, res, next) => resetPassword({token: req.body?.token, password: req.body?.password})
    .then(({token}) => { setSessionCookie(req, res, token); res.json({ok: true}); }).catch(next));
  api.post('/auth/logout', (req, res, next) => Promise.resolve(authEnabled() ? dropSession(sessionToken(req)) : null)
    .then(() => { clearSessionCookie(res); res.json({ok: true}); }).catch(next));

  // ——— Витрина гостя (app/Landing.tsx), открыто без сессии ———
  // Владелец 01.10: «прозрачные и заманчивые условия» — до регистрации видно, сколько дарим,
  // сколько стоит ролик и карусель и сколько стоят тарифы. Контакты продаж — для «написать
  // нам». Из пакетов отдаём только то, что и так показывает кабинет: название, кредиты, цену
  api.get('/public/offer', (_req, res, next) => (async () => {
    const {_note, ...contacts} = await readJson(path.join(CONFIG_DIR, 'platform.json'));
    const whatsapp = process.env.SMMAKER_SALES_WHATSAPP?.trim();
    const packs = authEnabled() ? await listPacks() : [];
    res.json({
      signup: await signupCredits(),
      costs: await creditCosts(),
      contacts: whatsapp ? {...contacts, whatsapp} : contacts,
      packs: packs.map(({id, title, credits, price_krw, valid_days, kind, sort}) => ({id, title, credits, price_krw, valid_days, kind, sort})),
    });
  })().catch(next));

  // Всё ниже — только после входа и от имени своей компании
  api.use(requireUser);
  api.use((req, _res, next) => { try { withWorkspace(wsOf(req), next); } catch (e) { next(e); } });

  // ——— Кабинет компании ———
  api.get('/account/ledger', wrap((req) => (authEnabled() ? ledgerOf(req.ws) : [])));
  // Куда писать за пакетом и что в прайсе — на экран «кредиты закончились» и в кабинет.
  // WhatsApp продаж — из SMMAKER_SALES_WHATSAPP, если задан: номер менеджера меняется без
  // пересборки образа. Не задан — номер из config/platform.json
  api.get('/account/offer', wrap(async () => {
    const {_note, ...contacts} = await readJson(path.join(CONFIG_DIR, 'platform.json'));
    const whatsapp = process.env.SMMAKER_SALES_WHATSAPP?.trim();
    return {
      contacts: whatsapp ? {...contacts, whatsapp} : contacts,
      packs: authEnabled() ? await listPacks() : [],
    };
  }));

  // ——— Админка: лиды и пакеты — сотрудникам, прайс и роли — только владельцу ———
  const admin = express.Router();
  admin.use((req, _res, next) => next(authEnabled() ? undefined : new HttpError(400, 'Админка работает только с базой')));
  admin.use(requireStaff);
  admin.get('/clients', wrap(() => listClients()));
  admin.get('/clients/:id/ledger', wrap((req) => ledgerOf(checkId(req.params.id))));
  admin.get('/packs', wrap(() => listPacks({all: true})));
  admin.post('/clients/:id/packs', wrap((req) => grantPack({
    workspaceId: checkId(req.params.id), packId: String(req.body?.packId ?? ''), note: req.body?.note, createdBy: req.user.id,
  })));
  admin.post('/clients/:id/bonus', requireAdmin, wrap((req) => grantBonus({
    workspaceId: checkId(req.params.id), credits: req.body?.credits, days: req.body?.days, note: req.body?.note, createdBy: req.user.id,
  })));
  admin.put('/packs/:id', requireAdmin, wrap((req) => savePack({...req.body, id: req.params.id})));
  admin.get('/staff', requireAdmin, wrap(() => listStaff()));
  admin.put('/staff', requireAdmin, wrap((req) => setRole({email: req.body?.email, role: req.body?.role, by: req.user.id})));
  api.use('/admin', admin);

  api.get('/config', wrap(async () => ({
    brand: await getBrand(), markets: await listMarkets(), defaultMarket: DEFAULT_MARKET, formats: await listFormats(),
    // Профили клиента идут на смену рынкам (стадия перехода). Пока отдаём и то, и другое:
    // интерфейс переключится на профиль отдельно, пайплайны — отдельно. copy — дефолты
    // текстов платформы, из них профиль берёт готовые подписи.
    profiles: await listProfiles(), defaultProfile: DEFAULT_PROFILE, copy: await getCopy(),
    pipelines: await readJson(path.join(CONFIG_DIR, 'pipelines.json')),
    // Признак боевого запуска. Интерфейс по нему прячет пайплайн обзоров: рендер обзора
    // занял бы полмашины на час рядом с боевым сайтом. Прячет именно клиент, а не сервер:
    // реестр пайплайнов общий для прода и дева, и один флаг честнее двух списков.
    production: PRODUCTION,
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
    carouselFormats: await carouselFormats(),
    // Спикеры озвучки: интерфейс показывает только тех, кто умеет выбранный язык
    voices: await voiceRegistry(),
    // Что доступно: распознавание речи включается ключом ElevenLabs в .env
    // Что доступно: речь и озвучка — по ключу ElevenLabs; выделение звуков машины — по
    // наличию локального окружения с моделью разделения (проба, ставится отдельно)
    features: {speech: hasKey(), voice: hasVoice(), ambience: await hasSeparator()},
    // Цены генераций в кредитах — интерфейс пишет их на кнопках
    credits: await creditCosts(),
  })));
  api.put('/brand', wrap(async (req) => { await saveBrand(checkBrand(req.body)); return getBrand(); }));
  // Логотип: свой приёмник со своим потолком (10 МБ, LOGO_RULES) — большие фото общего приёмника ему ни к чему
  const logoUpload = multer({storage: multer.memoryStorage(), limits: {fileSize: LOGO_RULES.maxBytes, files: 1}});
  api.post('/brand/logo', logoUpload.single('logo'), wrap(async (req) => {
    const saved = await saveLogo(req.file?.buffer);
    return {...saved, brand: await getBrand()};
  }));
  // Вариант логотипа: clean — фон убран, raw — как загружен, none — название компании текстом
  api.put('/brand/logo/variant', wrap(async (req) => {
    const variant = String(req.body?.variant ?? '');
    if (!['clean', 'raw', 'none'].includes(variant)) throw new HttpError(400, 'Вариант — clean, raw или none');
    return {...(await setLogoVariant(variant)), brand: await getBrand()};
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
    const note = (data.note ?? '').replace(/^Encar (\d+)/, 'копия Encar $1') || 'копия';
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
    const added = [];
    // По одному, а не разом: Encar на пачку одновременных запросов с одного адреса
    // отвечает отказами, а выигрыш в секундах тут не важен
    for (const [i, url] of urls.entries()) added.push(await addPhoto(lot.id, await downloadPhoto(url), `encar-${i + 1}.jpg`));
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
    const [market, brand] = await Promise.all([renderMarket(), getBrand()]);
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
    const [market, brand] = await Promise.all([renderMarket(), getBrand()]);
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
      // каруселей, не как услугу клиентам. Без входа (локально) проверять некого
      if (src.source !== 'encar' && req.user && !req.user.isStaff) {
        return next(new HttpError(403, 'Карусели по лотам аукционов пока доступны только сотрудникам'));
      }
      next();
    } catch (e) { next(new HttpError(400, e.message)); }
  }, wrap((req) => billed(
    {...billOf(req, 'carousels'), workspaceId: req.ws,
      jobId: `carousel-${req.ws}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      note: String(req.body?.link ?? '').slice(0, 120)},
    () => buildCarousel(req.body?.link, {format: req.body?.format, seed: req.body?.seed}))));
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
  app.use('/data', guardData, express.static(DATA_DIR, {fallthrough: false}));
  app.use('/api', (err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    // Приёмник файлов отвечает по-английски — человеку нужен ответ, что делать
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Файл слишком большой для загрузки';
    if (status >= 500) console.error(err);
    res.status(status).json({error: err.message || 'Ошибка сервера'});
  });
  return app;
};
