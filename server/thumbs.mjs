// Миниатюры своих картинок для плашек и лент: /thumbs/<путь как в /data>?w=240.
//
// Плашки объявлений брали полное фото (у che168 — до 2000 px и ~500 КБ), плашки каруселей —
// PNG слайда 1080×1920 (1–3 МБ), ради значка шириной 96 px. При 50 объявлениях это десятки
// мегабайт и сотни мегабайт памяти браузера на распакованные картинки (владелец 12.10).
// Миниатюра — ~10–20 КБ. Делается при первом запросе и лежит в кэше на диске; ключ — путь,
// время изменения файла и ширина: пересобранный слайд с тем же именем получит новую.
//
// Доступ — как у /data: тот же guardData перед этим обработчиком (своя компания), путь не
// выходит из папки данных, только картинки, ширина — из короткого списка (иначе любой мог бы
// заставить сервер нарезать тысячи размеров).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {DATA_DIR} from './store.mjs';

const WIDTHS = [160, 240, 480];
const CACHE_DIR = path.join(DATA_DIR, '.thumbs');
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export const thumbsHandler = async (req, res) => {
  try {
    const w = WIDTHS.includes(Number(req.query.w)) ? Number(req.query.w) : 240;
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
    const file = path.resolve(DATA_DIR, `.${rel}`);
    if (!file.startsWith(DATA_DIR + path.sep) || file.startsWith(CACHE_DIR) || !IMAGE_EXT.test(file)) {
      return res.status(404).end();
    }
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) return res.status(404).end();

    const key = crypto.createHash('sha1').update(`${rel}|${stat.mtimeMs}|${w}`).digest('hex');
    const cached = path.join(CACHE_DIR, `${key}.jpg`);
    if (!(await fs.stat(cached).catch(() => null))) {
      await fs.mkdir(CACHE_DIR, {recursive: true});
      // Через временный файл: два одновременных запроса не отдадут недописанную картинку
      const tmp = `${cached}.${process.pid}.${Math.random().toString(36).slice(2)}`;
      await sharp(file).rotate().resize({width: w, withoutEnlargement: true}).jpeg({quality: 78, mozjpeg: true}).toFile(tmp);
      await fs.rename(tmp, cached);
    }
    // Адрес плашки несёт версию картинки (?v= у фото и слайдов) — сутки в кэше браузера безопасны
    res.set('Cache-Control', 'private, max-age=86400');
    // dotfiles: кэш — в скрытой папке .thumbs, а send по умолчанию скрытое не отдаёт (404)
    res.type('jpg').sendFile(cached, {dotfiles: 'allow'});
  } catch (e) {
    console.error(`[thumbs] ${req.originalUrl}: ${e?.message || e}`);
    // Миниатюры нет — пусть плашка возьмёт картинку целиком, а не покажет дыру
    if (!res.headersSent) res.redirect(302, `/data${req.path}`);
  }
};
