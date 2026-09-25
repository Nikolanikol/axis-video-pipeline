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
import {DATA_DIR, DEFAULT_MARKET, HttpError, PRODUCTION, ROOT, getBrand, getMarket, readJson, writeJson} from './store.mjs';

export const CAROUSELS_DIR = path.join(DATA_DIR, 'carousels');
// Слайд истории убираем на проде, пока страховые случаи не приходят с датацентра
// (Encar режет адрес). Тогда слайдов шесть; на Mac — семь с настоящей историей.
// Число решается здесь, а сам слайд отсекается в вёрстке по includeHistory.
const INCLUDE_HISTORY = !PRODUCTION;
const SLIDES = INCLUDE_HISTORY ? 7 : 6;
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
const running = new Set();

/**
 * Собрать карусель по ссылке или номеру.
 * @param {string} link — ссылка Encar или голый номер
 * @returns {Promise<{id: string, car: object, slides: string[], updatedAt: string}>}
 */
export const buildCarousel = async (link) => {
  const {id} = parseCarLink(link);
  if (running.has(id)) throw new HttpError(409, 'Эта карусель уже собирается');
  running.add(id);
  try {
    const car = await fetchCar(id);
    const [market, theme] = await Promise.all([getMarket(DEFAULT_MARKET), getBrand()]);
    // Логотип из настроек лежит на нашем сервере, а рендер грузит сборку с адреса Remotion:
    // путь /data/brand/… он искал бы у себя и не нашёл. Встроенные файлы уже в сборке.
    const origin = process.env.SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3210}`;
    const assets = theme.assets
      ? Object.fromEntries(Object.entries(theme.assets)
        .map(([k, v]) => [k, typeof v === 'string' && v.startsWith('/') ? origin + v : v]))
      : theme.assets;
    const inputProps = {car, market, theme: {...theme, assets}, includeHistory: INCLUDE_HISTORY};

    const dir = path.join(CAROUSELS_DIR, id);
    await fs.mkdir(dir, {recursive: true});
    const serveUrl = await getServeUrl();
    const browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_PATH || null});
    try {
      const composition = await selectComposition({serveUrl, id: 'carousel', inputProps, puppeteerInstance: browser});
      for (let frame = 0; frame < SLIDES; frame++) {
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
      slides: Array.from({length: SLIDES}, (_, i) => `/data/carousels/${id}/slide-${i + 1}.png`),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(path.join(dir, 'carousel.json'), meta);
    return meta;
  } finally {
    running.delete(id);
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

/** Ранее собранные карусели, новые сверху */
export const listCarousels = async () => {
  await fs.mkdir(CAROUSELS_DIR, {recursive: true});
  const dirs = (await fs.readdir(CAROUSELS_DIR, {withFileTypes: true})).filter((d) => d.isDirectory());
  const all = await Promise.all(dirs.map((d) =>
    readJson(path.join(CAROUSELS_DIR, d.name, 'carousel.json')).catch(() => null)));
  return all.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};
