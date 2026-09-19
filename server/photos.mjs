// Фото лота: оригинал в photos/src/<stem>.jpg, рабочая копия для ролика — photos/<stem>~<версия>.jpg.
// Размытие хранится в lot.blur[stem] как [x, y, w, h] в долях кадра и накладывается на оригинал заново.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {HttpError, lotPhotosDir, photoUrl} from './store.mjs';

const WIDTH = 1080;          // ширина рабочей копии
const SOURCE_MAX = 2560;     // оригинал ужимаем до разумного размера
const srcDir = (lotId) => path.join(lotPhotosDir(lotId), 'src');
const srcFile = (lotId, stem) => path.join(srcDir(lotId), `${stem}.jpg`);
const srcUrl = (lotId, stem) => photoUrl(lotId, `src/${stem}.jpg`);

const exists = (file) => fs.access(file).then(() => true, () => false);

// Фото, которые лежат в папке лота (не public/ и не внешние ссылки)
export const ownFile = (lotId, url) => {
  const prefix = photoUrl(lotId, '');
  const name = url.startsWith(prefix) ? url.slice(prefix.length) : '';
  return /^[\w-]+(~\d+)?\.jpg$/.test(name) ? name : null;
};
export const stemOf = (name) => name.replace(/\.jpg$/, '').replace(/~\d+$/, '');

const findOwn = (lot, url) => {
  if (!lot.photos.includes(url)) throw new HttpError(404, 'Фото нет в лоте');
  const name = ownFile(lot.id, url);
  if (!name) throw new HttpError(400, 'Это фото лежит вне папки лота — редактировать его здесь нельзя');
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

// Рабочая копия: оригинал → 1080 по ширине → размытые области
export const buildPhoto = async (source, regions, out) => {
  const {data, info} = await sharp(source).resize({width: WIDTH, withoutEnlargement: true}).toBuffer({resolveWithObject: true});
  const patches = [];
  for (const region of regions) {
    const patch = await blurPatch(data, info.width, info.height, region);
    if (patch) patches.push(patch);
  }
  await sharp(data).composite(patches).jpeg({quality: 90, mozjpeg: true}).toFile(out);
};

export const addPhoto = async (lotId, buffer, originalName) => {
  const stem = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await fs.mkdir(srcDir(lotId), {recursive: true});
  try {
    await sharp(buffer).rotate().resize({width: SOURCE_MAX, height: SOURCE_MAX, fit: 'inside', withoutEnlargement: true})
      .jpeg({quality: 92, mozjpeg: true}).toFile(srcFile(lotId, stem));
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
  if (next !== name) await fs.rm(path.join(dir, name), {force: true});
  const blur = {...lot.blur};
  if (regions.length) blur[stem] = regions; else delete blur[stem];
  return {
    ...lot,
    photos: lot.photos.map((p) => (p === url ? photoUrl(lot.id, next) : p)),
    blur,
  };
};

export const removePhoto = async (lot, url) => {
  if (!lot.photos.includes(url)) throw new HttpError(404, 'Фото нет в лоте');
  const name = ownFile(lot.id, url);
  const blur = {...lot.blur};
  if (name) {
    const stem = stemOf(name);
    await fs.rm(path.join(lotPhotosDir(lot.id), name), {force: true});
    await fs.rm(srcFile(lot.id, stem), {force: true});
    delete blur[stem];
  }
  return {...lot, photos: lot.photos.filter((p) => p !== url), blur};
};
