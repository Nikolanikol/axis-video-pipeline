// Карусели по авто: ссылка Encar → карточка от шлюза kmotors → семь картинок.
//
// Данные берём не из Encar напрямую: он режет адреса дата-центров, и на сервере это
// однажды перестанет работать. Шлюз kmotors ходит туда сам и умеет обходить блокировку
// через свой прокси — см. KMotors-1/src/app/api/vehicle/[id]/route.ts.
//
// Рендерим не видео, а кадры: композиция carousel — семь кадров по слайду, каждый
// снимается renderStill. Поэтому карусель живёт в общем движке рядом с роликами и
// получает тот же брендбук из настроек приложения.
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {parseCarLink} from '../src/shared/encarLink.js';
import {
  HttpError, PRODUCTION, ROOT, checkId, currentWorkspace, workspaceDir, workspaceUrl, getBrand, readJson, renderMarket, writeJson,
} from './store.mjs';

// Папка карусели названа номером объявления. Поэтому она обязана лежать внутри папки
// компании: у двух клиентов одна и та же машина иначе делила бы одни слайды — в чужих цветах
export const carouselsDir = () => path.join(workspaceDir(), 'carousels');
// Слайд истории убираем на проде, пока страховые случаи не приходят с датацентра
// (Encar режет адрес). Тогда слайдов шесть; на Mac — семь с настоящей историей.
// Число решается здесь, а сам слайд отсекается в вёрстке по includeHistory.
const INCLUDE_HISTORY = !PRODUCTION;
// Сколько слайдов — решает формат (config/carousel-formats.json) вместе с историей:
// число берётся из композиции (selectComposition), а не считается здесь второй раз

/** Форматы карусели. Незнакомый id — отказ: иначе молча вышла бы «Классика» */
export const carouselFormats = () => readJson(path.join(ROOT, 'config', 'carousel-formats.json'));
const checkFormat = async (id) => {
  const list = await carouselFormats();
  const found = list.find((f) => f.id === (id || 'classic'));
  if (!found) throw new HttpError(400, `Нет такого формата карусели: ${id}`);
  return found.id;
};
// Шлюз ходит в Encar и ждёт ответа от него; у самого Encar таймаут 8 с плюс запасной прокси,
// которому на холодную нужны десятки секунд
const GATEWAY_TIMEOUT_MS = Number(process.env.CAROUSEL_TIMEOUT_MS || 60_000);

const gateway = () => {
  const base = process.env.KMOTORS_API_URL;
  const secret = process.env.KMOTORS_API_SECRET;
  if (!base || !secret) {
    throw new HttpError(400, 'Не настроен шлюз: добавь KMOTORS_API_URL и KMOTORS_API_SECRET в .env');
  }
  return {base: base.replace(/\/+$/, ''), secret};
};

/** Карточка авто по номеру объявления. Бросает с текстом, пригодным для интерфейса. */
export const fetchCar = async (id) => {
  const {base, secret} = gateway();
  let res;
  try {
    res = await fetch(`${base}/api/vehicle/${encodeURIComponent(id)}`, {
      headers: {'x-vehicle-secret': secret},
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new HttpError(504, 'Шлюз не ответил вовремя — попробуй ещё раз');
    throw new HttpError(502, `Не достучались до шлюза: ${e?.message || e}`);
  }
  if (res.status === 404) throw new HttpError(404, 'Машина не найдена — возможно, объявление снято');
  if (res.status === 401) throw new HttpError(400, 'Шлюз не принял секрет: проверь KMOTORS_API_SECRET');
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new HttpError(502, body?.error || `Шлюз ответил ${res.status}`);
  }
  return res.json();
};

// Сборка проекта тяжёлая, а карусели делаются одна за другой — держим её между запусками.
// Подпись по времени правок исходников: поменял слайды — пересоберётся само.
let bundled = null;
const newestMtime = async (dir) => {
  let max = 0;
  for (const e of await fs.readdir(dir, {withFileTypes: true, recursive: true})) {
    if (e.isFile()) max = Math.max(max, (await fs.stat(path.join(e.parentPath, e.name))).mtimeMs);
  }
  return max;
};
const getServeUrl = async () => {
  const signature = Math.max(
    await newestMtime(path.join(ROOT, 'src')),
    (await fs.stat(path.join(ROOT, 'config', 'brand.json'))).mtimeMs,
    // Реестр форматов едет в сборку: правка размеров или списка слайдов должна пересобрать её
    (await fs.stat(path.join(ROOT, 'config', 'carousel-formats.json'))).mtimeMs,
  );
  if (bundled?.signature !== signature) {
    bundled = {
      signature,
      serveUrl: await bundle({
        entryPoint: path.join(ROOT, 'src', 'index.ts'),
        rootDir: ROOT,
        publicDir: path.join(ROOT, 'public'),
      }),
    };
  }
  return bundled.serveUrl;
};

// Одна карусель на машину за раз: рендер семи кадров занимает секунды, но повторное
// нажатие запускало бы браузер второй раз поверх первого
// Ключ — компания и номер: одну и ту же машину две компании собирают независимо
const running = new Set();
const runKey = (id) => `${currentWorkspace()}:${id}`;

/**
 * Собрать карусель по ссылке или номеру.
 * @param {string} link — ссылка Encar или голый номер
 * @param {{format?: string, seed?: number}} [opts] — формат из реестра и зерно варианта:
 *   то же зерно — те же компоновка и фразы; нет зерна — случайное («Другой вариант»)
 * @returns {Promise<{id: string, car: object, slides: string[], updatedAt: string, format: string, seed: number}>}
 */
export const buildCarousel = async (link, opts = {}) => {
  const {id} = parseCarLink(link);
  const format = await checkFormat(opts.format);
  const seed = Number.isInteger(opts.seed) && opts.seed > 0 ? opts.seed : 1 + Math.floor(Math.random() * 2 ** 30);
  const key = runKey(id);
  if (running.has(key)) throw new HttpError(409, 'Эта карусель уже собирается');
  running.add(key);
  try {
    const car = await fetchCar(id);
    // Карусель — всегда про корейское объявление (источник Encar), но контакты и компанию
    // берём из профиля клиента: бренд и подпись должны быть его.
    const [profileMarket, brand] = await Promise.all([renderMarket(), getBrand()]);
    const theme = {...brand, name: profileMarket.name};
    const market = profileMarket;
    // Логотип из настроек лежит на нашем сервере, а рендер грузит сборку с адреса Remotion:
    // путь /data/brand/… он искал бы у себя и не нашёл. Встроенные файлы уже в сборке.
    const origin = process.env.SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3210}`;
    const assets = theme.assets
      ? Object.fromEntries(Object.entries(theme.assets)
        .map(([k, v]) => [k, typeof v === 'string' && v.startsWith('/') ? origin + v : v]))
      : theme.assets;
    const inputProps = {car, market, theme: {...theme, assets}, includeHistory: INCLUDE_HISTORY, format, seed};

    const dir = path.join(carouselsDir(), id);
    await fs.mkdir(dir, {recursive: true});
    // Старые кадры убираем перед сборкой: та же машина, пересобранная на проде, даёт шесть
    // слайдов вместо прежних семи, и осиротевший slide-7.png остался бы на диске — со старой
    // историей. Ответ ссылается только на новые шесть, но файл-призрак в томе ни к чему.
    for (const f of await fs.readdir(dir)) {
      if (/^slide-\d+\.png$/.test(f)) await fs.rm(path.join(dir, f), {force: true}).catch(() => {});
    }
    const serveUrl = await getServeUrl();
    const browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_PATH || null});
    let count = 0;
    try {
      const composition = await selectComposition({serveUrl, id: 'carousel', inputProps, puppeteerInstance: browser});
      count = composition.durationInFrames;
      for (let frame = 0; frame < count; frame++) {
        await renderStill({
          composition, serveUrl, frame, inputProps, puppeteerInstance: browser,
          imageFormat: 'png', output: path.join(dir, `slide-${frame + 1}.png`),
        });
      }
    } finally {
      await browser.close({silent: true});
    }

    const meta = {
      id,
      car,
      slides: Array.from({length: count}, (_, i) => `${workspaceUrl()}/carousels/${id}/slide-${i + 1}.png`),
      updatedAt: new Date().toISOString(),
      format, seed,
    };
    await writeJson(path.join(dir, 'carousel.json'), meta);
    return meta;
  } finally {
    running.delete(key);
  }
};

/**
 * Имя файла для скачивания: марка, модель, номер объявления и порядок.
 * В папке загрузок их будет семь подряд, и порядок обязан читаться без открытия.
 */
export const slideFileName = (car, n) => {
  const name = [car?.brand, car?.model].filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'car';
  return `${name}-${car?.id ?? '0'}-${n}.png`;
};

/** Удалить собранную карусель со всеми слайдами. Пересобирать её — тот же buildCarousel по номеру. */
export const deleteCarousel = async (id) => {
  checkId(id);
  if (running.has(runKey(id))) throw new HttpError(409, 'Эта карусель сейчас собирается — дождись');
  await fs.rm(path.join(carouselsDir(), id), {recursive: true, force: true});
  return {id, deleted: true};
};

/** Ранее собранные карусели, новые сверху */
export const listCarousels = async () => {
  await fs.mkdir(carouselsDir(), {recursive: true});
  const dirs = (await fs.readdir(carouselsDir(), {withFileTypes: true})).filter((d) => d.isDirectory());
  const all = await Promise.all(dirs.map((d) =>
    readJson(path.join(carouselsDir(), d.name, 'carousel.json')).catch(() => null)));
  return all.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};
