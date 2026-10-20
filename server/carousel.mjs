// Карусели по авто: ссылка Encar / che168 / Carsensor → карточка от модуля-ядра источника
// (server/encar.mjs, che168.mjs, carsensor.mjs) → слайды в выбранном формате
// (config/carousel-formats.json: от 6 до 12 картинок, 1:1, 4:5 или 9:16).
//
// Как источник достаёт машину — его дело (Encar — через шлюз kmotors, cores/encar); карусели
// получают готовую карточку CarouselCar.
//
// Рендерим не видео, а кадры: композиция carousel — кадр на слайд, каждый снимается
// renderStill; размер кадра и число слайдов композиция берёт из формата. Поэтому карусель живёт в общем движке рядом с роликами и
// получает тот же брендбук из настроек приложения.
import {FAMILY_FORMATS, familyById} from '../src/carousel/families/registry.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {LOT_SKIP_SLIDES, carFromLot, lotPageUrl, missingForCarousel, parseCarouselSource} from '../src/shared/kmotorsLot.js';
import {brandForRender} from './brand.mjs';
import {serverLog} from './log.mjs';
import {fetchLot} from './kmotorsLot.mjs';
import {fetchEncarCar} from './encar.mjs';
import {fetchChe168Car} from './che168.mjs';
import {fetchCarsensorCar} from './carsensor.mjs';
import {CHE168_SKIP_SLIDES} from '../src/shared/che168Car.js';
import {CARSENSOR_SKIP_SLIDES} from '../src/shared/carsensorCar.js';
import {skipUnreadable, 
  HttpError, PRODUCTION, ROOT, checkId, currentWorkspace, workspaceDir, workspaceUrl, getBrand, readJson, renderMarket, writeJson,
} from './store.mjs';

// Папка карусели названа номером объявления. Поэтому она обязана лежать внутри папки
// компании: у двух клиентов одна и та же машина иначе делила бы одни слайды — в чужих цветах
export const carouselsDir = () => path.join(workspaceDir(), 'carousels');
// Слайд истории убираем на проде, пока страховые случаи не приходят с датацентра
// (Encar режет адрес). Тогда в любом формате слайдов на один меньше; на Mac история на месте.
// Решается здесь, а сам слайд отсекается в вёрстке по includeHistory.
const INCLUDE_HISTORY = !PRODUCTION;
// Сколько слайдов — решает формат (config/carousel-formats.json) вместе с историей:
// число берётся из композиции (selectComposition), а не считается здесь второй раз

/** Форматы карусели. Незнакомый id — отказ: иначе молча вышла бы «Классика» */
export const carouselFormats = () => readJson(path.join(ROOT, 'config', 'carousel-formats.json'));
/**
 * Форматы для интерфейса — с тем числом слайдов, что реально выйдет. Без истории (на сервере)
 * слайдов на один меньше, а карточка формата обещала полное число: Дмитрий на превью PR 13
 * получил 6 вместо 7, 8 вместо 9, 11 вместо 12 (решение владельца 12.10 — честное число).
 * Поэтому и в note числа нет: его пишет интерфейс по slides.length
 */
/**
 * Семейство карусели (пакет KOK_handoff_v1, src/carousel/families/registry.js): пусто — оформление
 * бренда; иначе только готовое семейство и только в форматах FAMILY_FORMATS (4:5 и 9:16; 1:1 —
 * ещё не адаптирован)
 */
const checkFamily = (id, format) => {
  if (id === undefined || id === null || id === '') return null;
  const family = familyById(id);
  if (!family) throw new HttpError(400, `Нет такого стиля карусели: ${id}`);
  if (!FAMILY_FORMATS.includes(format)) throw new HttpError(400, `Стиль «${family.title}» пока только в форматах «Разворот» 4:5 и «Классика» 9:16`);
  return family.id;
};
export const clientCarouselFormats = async () => (await carouselFormats())
  .map((f) => ({...f, slides: f.slides.filter((s) => INCLUDE_HISTORY || s !== 'history')}));
const checkFormat = async (id) => {
  const list = await carouselFormats();
  const found = list.find((f) => f.id === (id || 'classic'));
  if (!found) throw new HttpError(400, `Нет такого формата карусели: ${id}`);
  return found.id;
};
// Фото лотов лежат на CDN площадок. Качаем только с известных хостов (адреса приходят со
// страницы чужого сайта, и сервер не должен ходить по ним куда попало), только по одному
// кадру за раз ограниченной пачкой, и кладём к себе: рендер берёт их с нашего адреса, а
// не со ссылок, которые площадка вправе закрыть или сменить.
const PHOTO_HOSTS = new Set([
  'heydealer-api.s3.amazonaws.com', 'img-auction.autobell.co.kr', 'www.kcarauction.com',
  'imgmk.lotteautoauction.net', 'aucmark.skcarrental.com', 'file.ahsellcar.co.kr',
]);
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 20_000;

const downloadLotPhoto = async (url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!PHOTO_HOSTS.has(u.hostname)) return null;
  const res = await fetch(url, {signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS)});
  // Перенаправление уводит на другой хост — на него разрешения не было
  if (!res.ok || !PHOTO_HOSTS.has(new URL(res.url).hostname)) return null;
  if (!(res.headers.get('content-type') || '').startsWith('image/')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length <= PHOTO_MAX_BYTES ? buf : null;
};

/**
 * Перенести фото машины к нам и подменить адреса. Кадры, что не скачались, выпадают из списков
 * (без обложки карусель не соберётся: слайд без картинки — пустой кадр). Возвращает карточку.
 */
const localizePhotos = async (car, dir, id, origin) => {
  await fs.mkdir(path.join(dir, 'photos'), {recursive: true});
  const all = [...new Set([car.photos.hero, car.photos.rear, car.photos.interiorShot, car.photos.dashboard,
    ...car.photos.exterior, ...car.photos.interior, ...car.photos.other].filter(Boolean))];
  const mapped = new Map();
  let next = 0;
  const worker = async () => {
    while (next < all.length) {
      const i = next++;
      try {
        const buf = await downloadLotPhoto(all[i]);
        if (!buf) continue;
        await fs.writeFile(path.join(dir, 'photos', `${i}.jpg`), buf);
        mapped.set(all[i], `${origin}${workspaceUrl()}/carousels/${id}/photos/${i}.jpg`);
      } catch { /* кадр пропускаем: хватит остальных */ }
    }
  };
  await Promise.all(Array.from({length: 4}, worker));
  const to = (u) => mapped.get(u) ?? null;
  const p = car.photos;
  if (!to(p.hero)) throw new HttpError(502, 'Не удалось скачать фото машины — площадка не отдаёт их с сервера. Попробуйте позже');
  return {
    ...car,
    photos: {
      hero: to(p.hero), rear: to(p.rear), interiorShot: to(p.interiorShot), dashboard: to(p.dashboard),
      exterior: p.exterior.map(to).filter(Boolean), interior: p.interior.map(to).filter(Boolean), other: p.other.map(to).filter(Boolean),
    },
  };
};

/** Карточка машины по лоту аукциона: страница kmotors → разбор → форма слайдов */
const carFromLink = async ({house, lotId}) => {
  const lot = await fetchLot({house, id: lotId});
  const miss = missingForCarousel({ok: true, lot});
  if (miss.length) {
    throw new HttpError(422, `У этого лота нет: ${miss.join(', ')}. Площадка не отдаёт эти данные — карусель по нему не собрать`);
  }
  return carFromLot(lot);
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

// ——— Память дилера: какие фразы он уже получал ———
// Владелец 19.10: «у каруселей все тексты одинаковые». Варианты фраз выбирает вёрстка
// (src/carousel/i18n/copy.ts, choose): сначала те, которых у компании ещё не было, потом самые
// давние. Сама память — здесь, файлом в папке каруселей компании: ключ фразы → варианты, последний
// в конце. Десять на ключ — больше самого длинного списка вариантов (восемь), иначе по кругу
// вернулась бы фраза раньше, чем прошли все.
const log = serverLog('carousel');
const RECENT_KEEP = 10;
const recentFile = () => path.join(carouselsDir(), '.recent.json');
const readRecent = async () => {
  const file = recentFile();
  return (await readJson(file).catch(skipUnreadable('память фраз карусели', file)))?.recent ?? {};
};
// Записи памяти по очереди: две сборки разом прочитали бы один файл, и одна затёрла бы другую
let recentChain = Promise.resolve();
const rememberPicks = (picked) => {
  const task = recentChain.then(async () => {
    const recent = await readRecent();
    for (const [key, id] of Object.entries(picked ?? {})) {
      recent[key] = [...(recent[key] ?? []).filter((x) => x !== id), id].slice(-RECENT_KEEP);
    }
    await writeJson(recentFile(), {recent});
  });
  recentChain = task.catch(() => {});
  return task;
};
// Свой текст клиента на слайде: как TEXT_MAX в src/carousel/texts.ts — длиннее не влезает в вёрстку
const TEXT_MAX = 300;
// Снимок памяти (recent) нужен только для пересборки — интерфейсу его не отдаём
const publicMeta = (meta) => {
  if (!meta) return meta;
  const {recent: _recent, ...rest} = meta;
  return rest;
};

// Одна карусель на машину за раз: рендер кадров занимает секунды, но повторное
// нажатие запускало бы браузер второй раз поверх первого
// Ключ — компания и номер: одну и ту же машину две компании собирают независимо
const running = new Set();
const runKey = (id) => `${currentWorkspace()}:${id}`;

/**
 * Собрать карусель по ссылке или номеру.
 * @param {string} link — ссылка Encar / che168 / Carsensor, голый номер Encar или наш id («ch-60154824», «cs-au…», «km-…»)
 * @param {{format?: string, seed?: number, priceOverride?: number | null, textOverrides?: object}} [opts] — формат из
 *   реестра и зерно варианта: то же зерно — те же компоновка и фразы; нет зерна — случайное
 *   («Другой вариант»). priceOverride — своя цена клиента на слайде цены; не передана —
 *   остаётся прежняя из carousel.json: «Другой вариант» не должен сбрасывать цену клиента.
 *   textOverrides — свои тексты клиента (слайд → поле → текст); не переданы — остаются прежние,
 *   пока это тот же вариант: у нового варианта другие фразы, и правки к прежним к нему не относятся
 * @returns {Promise<{id: string, car: object, slides: string[], updatedAt: string, format: string, seed: number}>}
 */
export const buildCarousel = async (link, opts = {}) => {
  const src = parseCarouselSource(link);
  const {id} = src;
  const format = await checkFormat(opts.format);
  const family = checkFamily(opts.family, format);
  const seed = Number.isInteger(opts.seed) && opts.seed > 0 ? opts.seed : 1 + Math.floor(Math.random() * 2 ** 30);
  const key = runKey(id);
  if (running.has(key)) throw new HttpError(409, 'Эта карусель уже собирается');
  running.add(key);
  try {
    // Лот аукциона: исходный номер берём из ссылки или, при «Пересобрать», из сохранённой карусели
    let lot = null;
    if (src.source === 'lot') lot = {house: src.house, id: src.lotId};
    if (src.source === 'lot-saved') {
      const savedFile = path.join(carouselsDir(), id, 'carousel.json');
      const saved = await readJson(savedFile).catch(skipUnreadable('карусель по лоту', savedFile));
      if (!saved?.lot) throw new HttpError(404, 'Карусель по лоту не найдена — вставь ссылку на лот заново');
      lot = {house: saved.lot.house, id: saved.lot.id};
    }
    // Битый файл прежней карусели не держит сборку, но цена клиента из него потеряется — пишем
    const prevFile = path.join(carouselsDir(), id, 'carousel.json');
    const prev = await readJson(prevFile).catch(skipUnreadable('прежняя карусель', prevFile));
    const priceOverride = opts.priceOverride !== undefined ? opts.priceOverride : prev?.priceOverride ?? null;
    // Тот же вариант («Пересобрать», своя цена, правка текста) — те же фразы: память дилера
    // берём ту, с которой карусель собрали тогда, а не нынешнюю — в нынешней уже лежат фразы
    // этой самой карусели, и она обошла бы их. Новый вариант — по нынешней памяти
    const sameVariant = Boolean(prev && Number.isInteger(opts.seed) && prev.seed === seed && (prev.format ?? 'classic') === format
      && (prev.family ?? null) === family);
    const recent = sameVariant ? prev.recent : await readRecent();
    const textOverrides = opts.textOverrides !== undefined ? opts.textOverrides : sameVariant ? prev.textOverrides : undefined;
    // Контакты и компанию берём из профиля клиента: бренд и подпись должны быть его. Профиль —
    // до машины: по его языку ядро che168 отдаёт названия опций
    const [profileMarket, brand] = await Promise.all([renderMarket(), getBrand().then(brandForRender)]);
    // Машина из Китая — через модуль-ядро che168 (cores/che168, граница — server/che168.mjs)
    // Машина из Японии — через ядро carsensor (cores/carsensor, граница — server/carsensor.mjs)
    const china = src.source === 'che168';
    const japan = src.source === 'carsensor';
    let car = lot ? await carFromLink({house: lot.house, lotId: lot.id})
      : china ? await fetchChe168Car(src.ref, profileMarket.language)
        : japan ? await fetchCarsensorCar(src.ref, profileMarket.language) : await fetchEncarCar(id);
    // Нет фото вовсе — так и говорим, а не «площадка не отдаёт» (это про сбой скачивания); до
    // создания папки — пустая папка карусели не нужна
    if ((china || japan) && !car.photos.hero) throw new HttpError(422, 'У этого объявления нет фото — карусель по нему не собрать');
    const theme = {...brand, name: profileMarket.name};
    const market = profileMarket;
    // Логотип из настроек лежит на нашем сервере, а рендер грузит сборку с адреса Remotion:
    // путь /data/workspaces/<компания>/brand/… он искал бы у себя и не нашёл. Встроенные
    // файлы уже в сборке.
    const origin = process.env.SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3210}`;
    const assets = theme.assets
      ? Object.fromEntries(Object.entries(theme.assets)
        .map(([k, v]) => [k, typeof v === 'string' && v.startsWith('/') ? origin + v : v]))
      : theme.assets;
    const dir = path.join(carouselsDir(), id);
    await fs.mkdir(dir, {recursive: true});
    // Фото лотов — к себе: рендер берёт их с нашего адреса, а не с CDN площадки. Машины из Китая —
    // как Encar, прямо с CDN Autohome (открыт, исходники «0x0_» без входа): со своего адреса браузер
    // рендера в превью получал 401 от заслонки Basic Auth (11.10), а ослаблять её — не наше решение
    if (lot) car = await localizePhotos(car, dir, id, origin);
    // У лота нет цены, истории и опций: эти слайды не рисуем, а не заполняем прочерками.
    // У машины из Китая нет истории: лист осмотра в рекламу не идёт (решение владельца 11.10)
    const inputProps = {car, market, theme: {...theme, assets}, includeHistory: INCLUDE_HISTORY, format, seed, family,
      skip: lot ? LOT_SKIP_SLIDES : china ? CHE168_SKIP_SLIDES : japan ? CARSENSOR_SKIP_SLIDES : [], priceOverride,
      recent, textOverrides};
    // Старые кадры убираем перед сборкой: та же машина, пересобранная на проде, даёт шесть
    // слайдов вместо прежних семи, и осиротевший slide-7.png остался бы на диске — со старой
    // историей. Ответ ссылается только на новые шесть, но файл-призрак в томе ни к чему.
    for (const f of await fs.readdir(dir)) {
      if (/^slide-\d+\.png$/.test(f)) await fs.rm(path.join(dir, f), {force: true}).catch(() => {});
    }
    const serveUrl = await getServeUrl();
    const browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_PATH || null});
    let count = 0;
    let texts = null;
    try {
      const composition = await selectComposition({serveUrl, id: 'carousel', inputProps, puppeteerInstance: browser});
      count = composition.durationInFrames;
      // Тексты по слайдам кладёт calculateMetadata (src/Root.tsx) — по ним окно правки под слайдом
      texts = composition.props?.resolvedTexts ?? null;
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
      ...(family ? {family} : {}),
      ...(priceOverride ? {priceOverride} : {}),
      // Тексты слайдов — для окна правки; свои правки клиента; снимок памяти — для пересборки тем же вариантом
      ...(texts ? {texts: texts.slides} : {}),
      ...(textOverrides && Object.keys(textOverrides).length ? {textOverrides} : {}),
      ...(recent ? {recent} : {}),
      // Откуда лот: «Пересобрать» идёт по нему, кнопка «Открыть лот» — по адресу
      ...(lot ? {lot: {...lot, url: lotPageUrl(lot.house, lot.id)}} : {}),
    };
    await writeJson(path.join(dir, 'carousel.json'), meta);
    // Новый вариант — в память дилера: следующая карусель обойдёт эти фразы. Сбой памяти не
    // должен ронять готовую карусель — за неё уже заплачено; худшее — повтор фразы
    if (!sameVariant && texts?.picked) {
      await rememberPicks(texts.picked).catch((e) => log.warn('recent.save', {error: e.message}));
    }
    return publicMeta(meta);
  } finally {
    running.delete(key);
  }
};

/**
 * Имя файла для скачивания: марка, модель, номер объявления и порядок.
 * В папке загрузок их будет до двенадцати подряд, и порядок обязан читаться без открытия.
 */
export const slideFileName = (car, n) => {
  const name = [car?.brand, car?.model].filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'car';
  return `${name}-${car?.id ?? '0'}-${n}.png`;
};

/** Удалить собранную карусель со всеми слайдами. Пересобирать её — тот же buildCarousel по номеру. */
/**
 * Пересобрать уже собранную карусель со своей ценой — бесплатно (владелец 11.10): машина,
 * формат и вариант те же, что были, меняется только цена на слайде. Поэтому формат и зерно
 * берём из сохранённой карусели, а не из запроса: иначе через бесплатную кнопку собирали бы
 * новые варианты и форматы, за которые берётся кредит
 */
export const repriceCarousel = async (id, price) => {
  const file = path.join(carouselsDir(), checkId(id), 'carousel.json');
  const saved = await readJson(file).catch(skipUnreadable('карусель', file));
  if (!saved) throw new HttpError(404, 'Карусель не найдена — соберите её по ссылке');
  const v = price === null || price === '' || price === undefined ? null : Number(price);
  if (v !== null && (!Number.isFinite(v) || v <= 0 || v > 1e12)) throw new HttpError(400, 'Цена — положительное число');
  // Папка лота (km-…) сама разбирается как «сохранённый лот», номер Encar — как объявление
  return buildCarousel(id, {format: saved.format, seed: saved.seed, family: saved.family ?? null, priceOverride: v ? Math.round(v) : null});
};

/**
 * Свой текст на слайде — бесплатно, как своя цена: машина, формат и вариант те же, меняются только
 * поля этого слайда. fields — {поле: текст}; пустой текст — вернуть фразу варианта.
 * Поля — только те, что у слайда есть (texts в carousel.json): что угодно в файл не пишем
 */
export const editCarouselTexts = async (id, slide, fields) => {
  const file = path.join(carouselsDir(), checkId(id), 'carousel.json');
  const saved = await readJson(file).catch(skipUnreadable('карусель', file));
  if (!saved) throw new HttpError(404, 'Карусель не найдена — соберите её по ссылке');
  if (!Array.isArray(saved.texts)) throw new HttpError(409, 'Эту карусель собрали до правки текста — нажмите «Пересобрать», и текст можно будет менять');
  const own = saved.texts.find((s) => s.slide === slide);
  if (!own) throw new HttpError(400, 'В этой карусели нет такого слайда');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new HttpError(400, 'Нет текстов для слайда');
  const next = {...(saved.textOverrides?.[slide] ?? {})};
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in own.fields)) throw new HttpError(400, `У этого слайда нет поля «${key}»`);
    if (typeof value !== 'string') throw new HttpError(400, 'Текст — строкой');
    const v = value.replace(/\r\n/g, '\n').trim();
    if (v.length > TEXT_MAX) throw new HttpError(400, `Слишком длинный текст: до ${TEXT_MAX} знаков, иначе он не поместится на слайд`);
    if (v) next[key] = v; else delete next[key];
  }
  const textOverrides = {...(saved.textOverrides ?? {})};
  if (Object.keys(next).length) textOverrides[slide] = next; else delete textOverrides[slide];
  return buildCarousel(id, {format: saved.format, seed: saved.seed, family: saved.family ?? null, textOverrides});
};

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
  const all = await Promise.all(dirs.map((d) => {
    const file = path.join(carouselsDir(), d.name, 'carousel.json');
    return readJson(file).catch(skipUnreadable('карусель', file));
  }));
  return all.filter(Boolean).map(publicMeta).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};
