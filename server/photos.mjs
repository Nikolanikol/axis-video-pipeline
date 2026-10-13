// Фото лота: оригинал в photos/src/<stem>.jpg, рабочая копия для ролика — photos/<stem>~<версия>.jpg,
// размытый фон кадра под ней — photos/bg/<то же имя> (backdropFile).
// Размытие хранится в lot.blur[stem] как [x, y, w, h] в долях кадра и накладывается на оригинал заново.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {DATA_DIR, HttpError, lotPhotosDir, photoUrl} from './store.mjs';
import {serverLog} from './log.mjs';

const log = serverLog('photos');

const WIDTH = 1080;          // ширина рабочей копии вертикального фото — ровно ширина кадра
// Горизонтальное фото в ролике — полоса 1150 px с верхом, срезанным на 22% (LANDSCAPE_BAND
// и TOP_CROP в src/shared/ui.tsx): на экране снимок 1474 px в высоту, плюс наезд 5%.
// Копию готовим сразу такой высоты. Иначе увеличивал бы браузер при рендере простым
// сглаживанием, и выходило мыло: у студийного снимка Encar (1344×768 — больше у Encar нет)
// увеличение почти вдвое, у обычных 2200×1238 — в 1,2 раза. Здесь увеличение ланцошем
// с лёгкой резкостью заметно чище (сравнение кадров хука 30.09)
const LANDSCAPE_HEIGHT = 1500;
const SOURCE_MAX = 2560;     // оригинал ужимаем до разумного размера
const srcDir = (lotId) => path.join(lotPhotosDir(lotId), 'src');
const srcFile = (lotId, stem) => path.join(srcDir(lotId), `${stem}.jpg`);
const srcUrl = (lotId, stem) => photoUrl(lotId, `src/${stem}.jpg`);

const exists = (file) => fs.access(file).then(() => true, () => false);

// Сжатие — обычный libjpeg, а не mozjpeg. Замер на сервере 13.10, фото Encar 2200×1238:
// оригинал 336 → 80 мс, рабочая копия 591 → 251 мс. mozjpeg выигрывает только размер файла
// (~10–15%), а на загрузке объявления из 9 фото стоил ~5 с ожидания клиента
const JPEG_SOURCE = {quality: 92};
const JPEG_COPY = {quality: 90};

/**
 * Размытый фон кадра — заранее, а не фильтром blur(50px) в ролике.
 *
 * Замер 13.10 на сервере (6 ядер, без видеокарты): blur(50px) на фоне 1240×2080 браузер
 * пересчитывает на каждом кадре процессором, и рендер шёл 6,2 кадра/с; с готовой размытой
 * картинкой — 12,6–15,8. Число вкладок рендера при размытии почти не помогало (4 вкладки — 7,4).
 * Телефон в превью тоже считал это размытие на каждом кадре — отсюда подтормаживание.
 *
 * Геометрия повторяет прежний фильтр: фон в ролике — 1240×2080 (кадр плюс 80 px с каждой
 * стороны, object-fit: cover). Готовим в четверть размера (310×520) с сигмой 50/4 — после
 * растяжки вчетверо выходит то же размытие в 50 px, а файл весит ~10 КБ. Затемнение
 * (brightness 0.35) остаётся фильтром в ролике: оно дешёвое, и его меняют вместе с вёрсткой.
 * Строится из готовой рабочей копии — значит, с уже размытым номером.
 */
const BACKDROP = {width: 310, height: 520, sigma: 12.5};
export const backdropFile = (photoFile) => path.join(path.dirname(photoFile), 'bg', path.basename(photoFile));
export const buildBackdrop = async (input, out) => {
  await fs.mkdir(path.dirname(out), {recursive: true});
  // Через временный файл: при рендере фон запрашивают сразу несколько вкладок, и недописанный
  // файл ушёл бы им битой картинкой
  const tmp = `${out}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  await sharp(input).resize(BACKDROP.width, BACKDROP.height, {fit: 'cover'}).blur(BACKDROP.sigma)
    .jpeg({quality: 80}).toFile(tmp);
  await fs.rename(tmp, out);
};

/**
 * Фон для фото, собранных до 13.10 (у них нет photos/bg): строится при первом запросе.
 * Стоит перед раздачей /data, после guardData — права те же, что у самого фото. Нет рабочей
 * копии — ничего не делаем, раздача ответит 404, как и раньше. Пачку одновременных запросов
 * одного фона (вкладки рендера) обслуживает одна сборка.
 */
const BACKDROP_PATH = /^\/workspaces\/[\w-]+\/lots\/[\w-]+\/photos\/bg\/([\w-]+(?:~\d+)?\.jpg)$/;
const building = new Map();
export const backdropHandler = async (req, res, next) => {
  const match = BACKDROP_PATH.exec(req.path);
  if (!match) return next();
  const out = path.join(DATA_DIR, req.path);
  const photo = path.join(path.dirname(path.dirname(out)), match[1]);
  try {
    if (!(await exists(out)) && (await exists(photo))) {
      if (!building.has(out)) building.set(out, buildBackdrop(photo, out).finally(() => building.delete(out)));
      await building.get(out);
    }
  } catch (e) {
    // Не собрался фон — ролик без фона хуже, чем с ним, но ошибкой его не роняем: дальше 404
    log.warn('backdrop.failed', {url: req.originalUrl, error: e});
  }
  next();
};

// Фото, которые лежат в папке лота (не public/ и не внешние ссылки)
export const ownFile = (lotId, url) => {
  const prefix = photoUrl(lotId, '');
  const name = url.startsWith(prefix) ? url.slice(prefix.length) : '';
  return /^[\w-]+(~\d+)?\.jpg$/.test(name) ? name : null;
};
export const stemOf = (name) => name.replace(/\.jpg$/, '').replace(/~\d+$/, '');

const findOwn = (lot, url) => {
  if (!lot.photos.includes(url)) throw new HttpError(404, 'Этого фото нет в объявлении');
  const name = ownFile(lot.id, url);
  if (!name) throw new HttpError(400, 'Это фото лежит вне папки объявления — редактировать его здесь нельзя');
  return name;
};

// Размытый кусок с мягким краем: область полностью размыта, за её границей плавно переходит в фото
const blurPatch = async (image, W, H, [x, y, w, h]) => {
  const rx = Math.round(x * W), ry = Math.round(y * H);
  const rw = Math.max(1, Math.round(w * W)), rh = Math.max(1, Math.round(h * H));
  const feather = Math.max(4, Math.round(Math.min(rw, rh) * 0.25));
  const left = Math.max(0, rx - feather), top = Math.max(0, ry - feather);
  const width = Math.min(W, rx + rw + feather) - left, height = Math.min(H, ry + rh + feather) - top;
  if (width < 1 || height < 1) return null;
  const sigma = Math.max(8, 0.35 * Math.min(rw, rh));
  const blurred = await sharp(image).extract({left, top, width, height}).blur(sigma).removeAlpha().toBuffer();
  // Маска: белый прямоугольник области, размытый наружу на ширину пера
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="#000"/>`
    + `<rect x="${rx - left - feather / 2}" y="${ry - top - feather / 2}" width="${rw + feather}" height="${rh + feather}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(feather / 2).extractChannel(0).toBuffer();
  const input = await sharp(blurred).joinChannel(mask).png().toBuffer();
  return {input, left, top};
};

// Рабочая копия: оригинал → 1080 по ширине (горизонтальное — 1500 по высоте) → размытые области.
// Области размытия — в долях кадра, поэтому ширина копии на них не влияет
export const buildPhoto = async (source, regions, out) => {
  const meta = await sharp(source).metadata();
  const landscape = (meta.width ?? 0) > (meta.height ?? 0);
  // Вертикальное — только уменьшаем до ширины кадра. Горизонтальное — к высоте на экране,
  // в обе стороны; при увеличении резкость, иначе ланцош тоже даёт мягкую картинку
  const enlarge = landscape && (meta.height ?? 0) < LANDSCAPE_HEIGHT;
  let image = sharp(source).resize(landscape
    ? {height: LANDSCAPE_HEIGHT, kernel: 'lanczos3'}
    : {width: WIDTH, withoutEnlargement: true});
  if (enlarge) image = image.sharpen({sigma: 0.8, m1: 0.5, m2: 1.5});
  const {data, info} = await image.toBuffer({resolveWithObject: true});
  const patches = [];
  for (const region of regions) {
    const patch = await blurPatch(data, info.width, info.height, region);
    if (patch) patches.push(patch);
  }
  const final = await sharp(data).composite(patches).jpeg(JPEG_COPY).toBuffer();
  await fs.writeFile(out, final);
  await buildBackdrop(final, backdropFile(out));
};

export const addPhoto = async (lotId, buffer, originalName) => {
  const stem = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await fs.mkdir(srcDir(lotId), {recursive: true});
  try {
    await sharp(buffer).rotate().resize({width: SOURCE_MAX, height: SOURCE_MAX, fit: 'inside', withoutEnlargement: true})
      .jpeg(JPEG_SOURCE).toFile(srcFile(lotId, stem));
  } catch {
    throw new HttpError(400, `Не удалось прочитать изображение «${originalName}»`);
  }
  const name = `${stem}.jpg`;
  await buildPhoto(srcFile(lotId, stem), [], path.join(lotPhotosDir(lotId), name));
  return photoUrl(lotId, name);
};

// Для окна размытия: что показывать (оригинал, если есть) и текущие области
export const photoInfo = async (lot, url) => {
  const stem = stemOf(findOwn(lot, url));
  const source = (await exists(srcFile(lot.id, stem))) ? srcUrl(lot.id, stem) : url;
  return {path: url, source, regions: lot.blur?.[stem] ?? []};
};

// Применить размытие: новая версия файла (чтобы превью не взяло старую из кэша), старая удаляется
export const applyBlur = async (lot, url, rawRegions) => {
  const name = findOwn(lot, url);
  const stem = stemOf(name);
  const regions = (Array.isArray(rawRegions) ? rawRegions : [])
    .filter((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v)))
    .map((r) => r.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000))
    .filter(([, , w, h]) => w > 0 && h > 0)
    .slice(0, 20);
  const dir = lotPhotosDir(lot.id);
  // Старые фото без оригинала: оригиналом становится текущая копия
  if (!(await exists(srcFile(lot.id, stem)))) {
    await fs.mkdir(srcDir(lot.id), {recursive: true});
    await fs.copyFile(path.join(dir, name), srcFile(lot.id, stem));
  }
  const next = `${stem}~${Date.now()}.jpg`;
  await buildPhoto(srcFile(lot.id, stem), regions, path.join(dir, next));
  if (next !== name) {
    await fs.rm(path.join(dir, name), {force: true});
    await fs.rm(backdropFile(path.join(dir, name)), {force: true});
  }
  const blur = {...lot.blur};
  if (regions.length) blur[stem] = regions; else delete blur[stem];
  return {
    ...lot,
    photos: lot.photos.map((p) => (p === url ? photoUrl(lot.id, next) : p)),
    blur,
  };
};

export const removePhoto = async (lot, url) => {
  if (!lot.photos.includes(url)) throw new HttpError(404, 'Этого фото нет в объявлении');
  const name = ownFile(lot.id, url);
  const blur = {...lot.blur};
  // Запись об источнике уходит вместе с фото: в палитре объявления снимок снова свободен
  const sources = lot.sources && {...lot.sources};
  if (name) {
    const stem = stemOf(name);
    await fs.rm(path.join(lotPhotosDir(lot.id), name), {force: true});
    await fs.rm(backdropFile(path.join(lotPhotosDir(lot.id), name)), {force: true});
    await fs.rm(srcFile(lot.id, stem), {force: true});
    delete blur[stem];
    if (sources) delete sources[stem];
  }
  return {...lot, photos: lot.photos.filter((p) => p !== url), blur, sources};
};
