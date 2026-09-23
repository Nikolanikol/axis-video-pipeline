// Логотип бренда: приём файла с проверками.
//
// Условия намеренно жёсткие и перечислены в интерфейсе рядом с кнопкой. Загрузка, которая
// принимает что угодно, а потом ломает вёрстку на готовом слайде, хуже отказа: человек
// узнаёт о проблеме, когда пост уже собран.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {DATA_DIR, HttpError, getBrand, saveBrand} from './store.mjs';

export const BRAND_DIR = path.join(DATA_DIR, 'brand');

/**
 * Требования к логотипу. Держим их одним объектом: интерфейс показывает эти же числа,
 * и разойтись они не могут.
 */
export const LOGO_RULES = {
  format: 'png',
  maxBytes: 2 * 1024 * 1024,
  // Логотип рисуется высотой до 260 точек на кадре 1080×1920. Меньше 400 по длинной
  // стороне — на рендере будет мыло; больше 2000 смысла нет, только вес и время
  minSide: 400,
  maxSide: 2000,
  // Фон у слайдов тёмный, и логотип без прозрачности ляжет на них белым прямоугольником.
  // Это самая частая ошибка, и последствие видно сразу — поэтому отказываем, а не предупреждаем.
  needsTransparency: true,
};

/**
 * Проверить и сохранить логотип. Возвращает адрес файла.
 * Все отказы — с текстом, который можно показать человеку как есть.
 */
export const saveLogo = async (buffer, originalName = '') => {
  if (!buffer?.length) throw new HttpError(400, 'Файл не пришёл');
  if (buffer.length > LOGO_RULES.maxBytes) {
    throw new HttpError(400, `Файл ${(buffer.length / 1024 / 1024).toFixed(1)} МБ — больше ${LOGO_RULES.maxBytes / 1024 / 1024} МБ`);
  }

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, 'Это не картинка или файл повреждён');
  }
  if (meta.format !== LOGO_RULES.format) {
    throw new HttpError(400, `Нужен PNG, а это ${meta.format?.toUpperCase() || 'неизвестный формат'}`);
  }

  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (long < LOGO_RULES.minSide) {
    throw new HttpError(400, `Слишком мелкий: ${meta.width}×${meta.height}, нужно от ${LOGO_RULES.minSide} точек по длинной стороне`);
  }
  if (long > LOGO_RULES.maxSide) {
    throw new HttpError(400, `Слишком крупный: ${meta.width}×${meta.height}, не больше ${LOGO_RULES.maxSide} точек по длинной стороне`);
  }

  if (LOGO_RULES.needsTransparency) {
    // hasAlpha мало: канал прозрачности бывает и полностью непрозрачным.
    // isOpaque смотрит на сами точки и ловит логотип, залитый белым.
    const {isOpaque} = await sharp(buffer).stats();
    if (!meta.hasAlpha || isOpaque) {
      throw new HttpError(400, 'Нужен прозрачный фон: на тёмном слайде такой логотип ляжет прямоугольником');
    }
  }

  await fs.mkdir(BRAND_DIR, {recursive: true});
  // Имя со временем: браузер и рендер кэшируют картинки по адресу, и при том же имени
  // показывали бы прежний логотип
  const name = `logo-${Date.now().toString(36)}.png`;
  await fs.writeFile(path.join(BRAND_DIR, name), buffer);

  // Прежние логотипы не копим: нужен один
  for (const f of await fs.readdir(BRAND_DIR)) {
    if (f.startsWith('logo-') && f !== name) await fs.rm(path.join(BRAND_DIR, f), {force: true}).catch(() => {});
  }

  const url = `/data/brand/${name}`;
  const brand = await getBrand();
  // Один файл на все места: и крупно на финале, и полосой вверху кадра. Отдельный
  // горизонтальный вариант заведём, если одного окажется мало
  await saveBrand({...brand, assets: {...brand.assets, logoStacked: url, logoHorizontal: url, sign: url}});
  return {url, width: meta.width, height: meta.height, bytes: buffer.length};
};
