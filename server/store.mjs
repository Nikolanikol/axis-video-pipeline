// Хранилище: настройки бренда и рынков (config/), лоты и ролики (DATA_DIR).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.resolve(ROOT, process.env.CONFIG_DIR || 'config');
export const MARKETS_DIR = path.join(CONFIG_DIR, 'markets');
export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
export const LOTS_DIR = path.join(DATA_DIR, 'lots');
export const RENDERS_DIR = path.join(DATA_DIR, 'renders');
export const DEFAULT_MARKET = process.env.DEFAULT_MARKET || 'mk';

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

// Бренд
const BRAND_FILE = path.join(CONFIG_DIR, 'brand.json');
export const getBrand = () => readJson(BRAND_FILE);
export const saveBrand = (theme) => writeJson(BRAND_FILE, theme);

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
export const getProfile = (id) => readJson(path.join(PROFILES_DIR, `${checkId(id)}.json`));
export const saveProfile = (id, profile) => writeJson(path.join(PROFILES_DIR, `${checkId(id)}.json`), profile);
export const listProfiles = async () => {
  const files = (await fs.readdir(PROFILES_DIR)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f) => ({id: f.slice(0, -5), ...(await readJson(path.join(PROFILES_DIR, f)))})));
};

// Лоты: DATA_DIR/lots/<id>/lot.json + photos/
export const lotDir = (id) => path.join(LOTS_DIR, checkId(id));
export const lotPhotosDir = (id) => path.join(lotDir(id), 'photos');
// Фото лота в браузере и для рендера доступны по /data/lots/<id>/photos/<файл>
export const photoUrl = (id, file) => `/data/lots/${id}/photos/${file}`;

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

// Вход для ролика из файла лота (CLI): лот + его рынок + тема бренда
export const loadInput = async (lotPath) => {
  const lot = await readJson(path.resolve(lotPath));
  if (!Array.isArray(lot.photos)) throw new Error(`${lotPath}: в лоте нет photos[]`);
  const [market, theme] = await Promise.all([getMarket(lot.market || DEFAULT_MARKET), getBrand()]);
  return {lot, market, theme};
};
