// Хранилище: платформенные реестры (config/), настройки компании (база или config/),
// лоты, обзоры, ролики и карусели компании (DATA_DIR/workspaces/<компания>/).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {marketFromProfile} from '../src/shared/profile.js';
import {db, hasDatabase} from './db/index.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.resolve(ROOT, process.env.CONFIG_DIR || 'config');
export const MARKETS_DIR = path.join(CONFIG_DIR, 'markets');
export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
export const DEFAULT_MARKET = process.env.DEFAULT_MARKET || 'mk';

/**
 * Компания (кабинет SMMAKER), от имени которой работает сервер.
 *
 * Все файлы компании — в своей папке: data/workspaces/<id>/{lots,reviews,renders,carousels,brand}.
 * Пока входа нет, компания одна на инстанс и задаётся переменной; с входом она станет
 * свойством запроса. Раньше файлы лежали прямо в data/ без хозяина, и у этого было два
 * следствия, опасных при втором клиенте: новый логотип стирал все прочие логотипы в общей
 * папке, а карусель одной и той же машины (папка = номер объявления) у двух клиентов
 * перезаписывала слайды друг друга. Перенос старой раскладки — tools/migrate-workspace.mjs.
 */
export const WORKSPACE_ID = process.env.SMMAKER_WORKSPACE || 'k-axis';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(WORKSPACE_ID)) {
  throw new Error(`SMMAKER_WORKSPACE=«${WORKSPACE_ID}»: только латиница, цифры и дефис`);
}
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspaces', WORKSPACE_ID);
// Адрес той же папки в браузере и для рендера: /data отдаётся статикой из DATA_DIR
export const WORKSPACE_URL = `/data/workspaces/${WORKSPACE_ID}`;
export const LOTS_DIR = path.join(WORKSPACE_DIR, 'lots');
export const RENDERS_DIR = path.join(WORKSPACE_DIR, 'renders');

/** Папки компании, которые раньше лежали прямо в data/. Их же переносит миграция. */
export const WORKSPACE_KINDS = ['lots', 'reviews', 'renders', 'carousels', 'brand'];

/**
 * Старый адрес файла → адрес в папке компании. Пути записаны внутри лотов, обзоров,
 * заданий рендера и бренда, иногда с адресом этого сервера впереди (так их видит браузер
 * рендера: 127.0.0.1 на Mac, 0.0.0.0 в контейнере) — поэтому меняется только сам кусок
 * /data/<вид>/. Адреса чужих серверов не трогаем, даже если в них встретится /data/lots/.
 */
const LEGACY_URL_RE = new RegExp(
  `(^|https?://(?:127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0)(?::\\d+)?)/data/(${WORKSPACE_KINDS.join('|')})/`, 'g');
export const toWorkspaceUrl = (value, wsUrl = WORKSPACE_URL) => {
  if (typeof value === 'string') return value.replace(LEGACY_URL_RE, (_m, origin, kind) => `${origin}${wsUrl}/${kind}/`);
  if (Array.isArray(value)) return value.map((v) => toWorkspaceUrl(v, wsUrl));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWorkspaceUrl(v, wsUrl)]));
  }
  return value;
};

// Прод (сервер) против дева (Mac). Один признак на весь сервер, чтобы прод и локальная
// версия расходились в одном месте, а не в десяти. Сейчас от него зависят две вещи:
// на проде из каруселей убран слайд истории (страховые случаи с датацентра не приходят,
// Encar режет адрес — см. server/carousel.mjs), и в интерфейсе скрыт пайплайн обзоров
// (рендер обзора занял бы полмашины на час рядом с боевым сайтом). Код обоих на месте —
// закрыт только вход, вернётся снятием этого флага или починкой доступа к Encar.
export const PRODUCTION = process.env.NODE_ENV === 'production';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const checkId = (id) => {
  if (!ID_RE.test(String(id))) throw new HttpError(400, `Некорректный id «${id}»: только латиница, цифры и дефис`);
  return id;
};

// Запись одного документа — строго по очереди (автосохранение формы и фоновые операции не перетирают друг друга)
const locks = new Map();
export const withLock = (key, fn) => {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn);
  locks.set(key, run.catch(() => {}));
  return run;
};

export const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw new HttpError(404, `Не найдено: ${path.relative(ROOT, file)}`);
    throw e;
  }
};

// Windows держит файл открытым дольше, чем ждёшь: антивирус или индексатор успевают
// вцепиться в только что записанный .tmp, и rename падает с EPERM. Блокировка снимается
// за миллисекунды, поэтому пара попыток закрывает вопрос. На macOS и Linux не срабатывает.
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES']);
const renameWithRetry = async (from, to, tries = 5) => {
  for (let i = 1; ; i++) {
    try {
      return await fs.rename(from, to);
    } catch (e) {
      if (!LOCKED.has(e.code) || i >= tries) throw e;
      await new Promise((r) => setTimeout(r, i * 20));
    }
  }
};

export const writeJson = async (file, data) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await renameWithRetry(tmp, file);
};

// Настройки компании: бренд (дизайн) и профиль (кто она и как продаёт).
//
// С базой они живут в smmaker_workspaces и переживают выкладку. Без базы — файлы в config/,
// как было до SMMAKER: так работают тесты и так работает прод, пока DATABASE_URL не задан.
// Файлы в config/ едут в образе, и правка через интерфейс на проде там смывается
// передеплоем — это и было главной причиной переезда в базу.
const BRAND_FILE = path.join(CONFIG_DIR, 'brand.json');

const workspaceRow = async () => {
  const {rows} = await db().query('SELECT brand, profile FROM smmaker_workspaces WHERE id = $1', [WORKSPACE_ID]);
  if (!rows.length) throw new HttpError(500, `Компания «${WORKSPACE_ID}» не заведена в базе: перезапусти сервер`);
  return rows[0];
};
const updateWorkspace = (field, value) => db().query(
  `UPDATE smmaker_workspaces SET ${field} = $2, updated_at = now() WHERE id = $1`, [WORKSPACE_ID, value]);

export const getBrand = async () => (hasDatabase() ? (await workspaceRow()).brand : readJson(BRAND_FILE));
export const saveBrand = (theme) => (hasDatabase() ? updateWorkspace('brand', theme) : writeJson(BRAND_FILE, theme));

// Рынки
export const getMarket = (id) => readJson(path.join(MARKETS_DIR, `${checkId(id)}.json`));
export const saveMarket = (id, market) => writeJson(path.join(MARKETS_DIR, `${checkId(id)}.json`), market);
export const listMarkets = async () => {
  const files = (await fs.readdir(MARKETS_DIR)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f) => ({id: f.slice(0, -5), ...(await readJson(path.join(MARKETS_DIR, f)))})));
};

// Профили клиента (идут на смену рынкам — см. src/shared/profile.js). Тексты постов клиент
// не держит у себя: они приходят из дефолтов платформы (config/copy.json) при слиянии.
export const COPY_FILE = path.join(CONFIG_DIR, 'copy.json');
export const getCopy = () => readJson(COPY_FILE);

export const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');
export const DEFAULT_PROFILE = process.env.DEFAULT_PROFILE || 'default';

// В базе у компании ровно один профиль. Интерфейс и API по-прежнему знают его под id
// DEFAULT_PROFILE — так форма настроек работает без переделки; чужой id — «не найдено».
const ownProfile = (id) => {
  if (checkId(id) !== DEFAULT_PROFILE) throw new HttpError(404, `Не найдено: профиль ${id}`);
};
export const getProfile = async (id) => {
  if (!hasDatabase()) return readJson(path.join(PROFILES_DIR, `${checkId(id)}.json`));
  ownProfile(id);
  return (await workspaceRow()).profile;
};
export const saveProfile = async (id, profile) => {
  if (!hasDatabase()) return writeJson(path.join(PROFILES_DIR, `${checkId(id)}.json`), profile);
  ownProfile(id);
  await updateWorkspace('profile', profile);
};
export const listProfiles = async () => {
  if (hasDatabase()) return [{id: DEFAULT_PROFILE, ...(await getProfile(DEFAULT_PROFILE))}];
  const files = (await fs.readdir(PROFILES_DIR)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f) => ({id: f.slice(0, -5), ...(await readJson(path.join(PROFILES_DIR, f)))})));
};

/**
 * Завести компанию в базе, если её там ещё нет. Первые настройки берутся из config/ —
 * то, чем инструмент работал до SMMAKER, — так переезд в базу не теряет ни бренд, ни
 * профиль. Дальше config/ для этой компании не читается: правда живёт в базе.
 * Пути к файлам бренда (/data/brand/…) сразу переводятся в папку компании.
 */
export const ensureWorkspace = async ({log = console.log} = {}) => {
  if (!hasDatabase()) return false;
  const {rowCount} = await db().query('SELECT 1 FROM smmaker_workspaces WHERE id = $1', [WORKSPACE_ID]);
  if (rowCount) return false;
  const brand = toWorkspaceUrl(await readJson(BRAND_FILE));
  const profile = await readJson(path.join(PROFILES_DIR, `${DEFAULT_PROFILE}.json`));
  await db().query(
    'INSERT INTO smmaker_workspaces (id, name, brand, profile) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
    [WORKSPACE_ID, profile.company || brand.name || WORKSPACE_ID, brand, profile]);
  log(`Компания ${WORKSPACE_ID} заведена в базе: бренд и профиль взяты из config/`);
  return true;
};

/**
 * Есть ли в data/ файлы старой раскладки — без папки компании. Сервер с ними работает,
 * но их не видит: история и лоты выглядели бы пропавшими. Поэтому при старте об этом
 * громко пишем, а переносит их tools/migrate-workspace.mjs — по команде, не сам.
 */
export const legacyDataDirs = async () => {
  const found = [];
  for (const kind of WORKSPACE_KINDS) {
    const entries = await fs.readdir(path.join(DATA_DIR, kind)).catch(() => []);
    if (entries.some((e) => !e.startsWith('.'))) found.push(kind);
  }
  return found;
};

/**
 * Данные для рендера из профиля в форме, которую ждут пайплайны (прежний Market).
 * Единая точка входа: раньше каждый пайплайн звал getMarket по id из лота, теперь берёт
 * один профиль клиента (MVP — он один). Тексты подставлены, режим цены и валюта уже внутри.
 */
export const renderMarket = async (id = DEFAULT_PROFILE) =>
  marketFromProfile(await getProfile(id), await getCopy());

// Лоты: <папка компании>/lots/<id>/lot.json + photos/
export const lotDir = (id) => path.join(LOTS_DIR, checkId(id));
export const lotPhotosDir = (id) => path.join(lotDir(id), 'photos');
// Фото лота в браузере и для рендера доступны по <адрес компании>/lots/<id>/photos/<файл>
export const photoUrl = (id, file) => `${WORKSPACE_URL}/lots/${id}/photos/${file}`;

export const getLot = async (id) => ({...(await readJson(path.join(lotDir(id), 'lot.json'))), id});

export const saveLot = async (id, lot) => {
  const {id: _ignored, ...data} = lot;
  if (!Array.isArray(data.specs) || !Array.isArray(data.photos)) throw new HttpError(400, 'В лоте нужны specs[] и photos[]');
  await writeJson(path.join(lotDir(id), 'lot.json'), {...data, updatedAt: new Date().toISOString()});
  return getLot(id);
};

export const createLot = async (data = {}) => {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const id = `lot-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  const lot = {
    market: DEFAULT_MARKET, brand: '', model: '', trim: '', year: new Date().getFullYear(),
    specs: ['', '', '', ''], carPriceUsd: null, carPriceKrw: null, krwPerUsd: null, photos: [],
    ...data,
  };
  await fs.mkdir(lotPhotosDir(id), {recursive: true});
  return saveLot(id, lot);
};

export const listLots = async () => {
  await fs.mkdir(LOTS_DIR, {recursive: true});
  const dirs = (await fs.readdir(LOTS_DIR, {withFileTypes: true})).filter((d) => d.isDirectory());
  const lots = await Promise.all(dirs.map((d) => getLot(d.name).catch(() => null)));
  return lots.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

// Вход для ролика из файла лота (CLI): лот + данные профиля + тема бренда.
// Имя компании на постах берём из профиля (market.name), а не из brand.json: компания
// переехала в профиль, бренд отвечает только за дизайн.
export const loadInput = async (lotPath) => {
  const lot = await readJson(path.resolve(lotPath));
  if (!Array.isArray(lot.photos)) throw new Error(`${lotPath}: в лоте нет photos[]`);
  const [market, brand] = await Promise.all([renderMarket(), getBrand()]);
  return {lot, market, theme: {...brand, name: market.name}};
};
