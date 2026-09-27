// Логотип бренда: приём файла, приведение к виду, который годится на тёмный слайд.
//
// Раньше приёмник требовал готовый PNG с прозрачным фоном 400–2000 точек и не больше 2 МБ —
// и не пропускал ни одного из 25 файлов собственного брендбука AXIS: 21 из них — логотип
// на ровном белом или чёрном фоне, часть — SVG. Человек не должен быть дизайнером, чтобы
// загрузить свой логотип. Поэтому теперь приёмник сам делает то, что раньше требовал:
//   • принимает PNG, JPG, WebP и SVG (SVG сразу переводится в PNG — векторный файл никому
//     не отдаём: в нём бывают скрипты и ссылки наружу);
//   • ровный фон по краям убирает сам — заливкой от краёв внутрь, белые детали внутри
//     логотипа при этом не трогаются;
//   • обрезает пустые поля — иначе логотип в центре квадрата 2000×2000 на кадре выходит
//     крошечным;
//   • большое уменьшает до 2000 точек, а не отказывает.
// Отказ — только когда из файла логотип не получить: пёстрый фон (фото, текстура), мелкая
// картинка, пусто после удаления фона. С объяснением, которое можно показать как есть.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {HttpError, getBrand, saveBrand, workspaceDir, workspaceUrl} from './store.mjs';

// Своя папка у каждой компании: ниже прежние логотипы удаляются всей папкой, и в общей
// папке новый логотип одного клиента стёр бы логотипы всех остальных
export const brandDir = () => path.join(workspaceDir(), 'brand');

/** Условия — одним объектом: интерфейс показывает эти же числа, разойтись они не могут */
export const LOGO_RULES = {
  formats: ['png', 'jpeg', 'webp', 'svg'],
  // Файл после обработки весит сотни килобайт; потолок — только чтобы не принимать гигабайты
  maxBytes: 10 * 1024 * 1024,
  // Логотип рисуется высотой до 260 точек на кадре 1080×1920. Меньше 300 по длинной
  // стороне — на рендере будет мыло; растягивать мы не станем
  minSide: 300,
  // Больше 2000 смысла нет — только вес и время; уменьшаем сами
  maxSide: 2000,
};

// ——— Обработка ———

// Насколько цвет может отличаться от фона и всё ещё считаться фоном. Подобрано на брендбуке
// AXIS: у JPG и сглаженных краёв фон «плывёт» на единицы-десятки, а медь от чёрного
// отстоит на 150+. Расстояние — евклидово по RGB (0…441)
const BG_TOLERANCE = 48;
// Край считается ровным, если столько его точек — цвета фона. У логотипа, прижатого к краю,
// часть края занята им самим, поэтому не 100%
const EDGE_UNIFORM = 0.9;

const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

/**
 * Убрать ровный фон: заливка от всех точек края по «похожим на фон» пикселям. Заливка,
 * а не замена цвета по всей картинке: белая буква внутри логотипа на белом фоне отделена
 * от края контуром и остаётся. Кромку смягчаем: пиксель на границе с фоном получает
 * прозрачность по тому, насколько он близок к цвету фона, — иначе край выходит «лесенкой»
 * с ореолом старого фона.
 * Возвращает null, если края неоднородны (фото, текстура) — такой фон не убрать надёжно.
 */
export const removeFlatBackground = (data, width, height) => {
  const edge = [];
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);
  // Цвет фона — самый частый цвет края (по грубым корзинам), а не угол: угол бывает занят
  const buckets = new Map();
  for (const p of edge) {
    const i = p * 4;
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const [top] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  const bucket = top.split(',').map(Number);
  // Средний цвет точек самой частой корзины — точнее, чем её середина
  const sum = [0, 0, 0];
  let n = 0;
  for (const p of edge) {
    const i = p * 4;
    if (data[i] >> 4 === bucket[0] && data[i + 1] >> 4 === bucket[1] && data[i + 2] >> 4 === bucket[2]) {
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
    }
  }
  const bg = sum.map((v) => v / n);
  const onEdge = edge.filter((p) => dist(data, p * 4, bg) < BG_TOLERANCE).length;
  if (onEdge / edge.length < EDGE_UNIFORM) return null;

  // Заливка от края
  const removed = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const p of edge) {
    if (!removed[p] && dist(data, p * 4, bg) < BG_TOLERANCE) { removed[p] = 1; queue[tail++] = p; }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
    for (const q of next) {
      if (q >= 0 && !removed[q] && dist(data, q * 4, bg) < BG_TOLERANCE) { removed[q] = 1; queue[tail++] = q; }
    }
  }

  const out = Buffer.from(data);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (removed[p]) { out[i + 3] = 0; continue; }
    // Кромка: сосед уже фон — прозрачность по близости к цвету фона
    const x = p % width;
    const nearBg = (x > 0 && removed[p - 1]) || (x < width - 1 && removed[p + 1])
      || (p >= width && removed[p - width]) || (p + width < width * height && removed[p + width]);
    if (nearBg) {
      const k = Math.min(1, Math.max(0, (dist(data, i, bg) - BG_TOLERANCE) / BG_TOLERANCE));
      out[i + 3] = Math.round(data[i + 3] * k);
    }
  }
  return {data: out, background: bg};
};

/** Рамка по видимым точкам (прозрачность > 16) с полем в 3% — чтобы край не резал сглаживание */
const visibleBox = (data, width, height) => {
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  let visible = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        visible++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return {visible: 0};
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  return {
    visible, left, top,
    width: Math.min(width, x1 + pad + 1) - left,
    height: Math.min(height, y1 + pad + 1) - top,
  };
};

/**
 * Яркость видимых точек: средняя и доля тёмных (0…1). Тёмное на тёмном слайде пропадает —
 * целиком (чёрный логотип) или частью: у брендбука AXIS пять вариантов для светлого фона,
 * где знак медный, а надпись «AXIS» чёрная, и на слайде от логотипа остаётся один знак.
 */
const visibleLuma = (data) => {
  let sum = 0;
  let n = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128) {
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      sum += l; n++;
      if (l < 0.2) dark++;
    }
  }
  return {mean: n ? sum / n : 0, darkShare: n ? dark / n : 0};
};

/**
 * Файл → готовый логотип. Возвращает два PNG: clean (фон убран, поля обрезаны) и raw
 * (только обрезан и уменьшен — на случай, если автоматика ошиблась и человек хочет
 * оставить фон как был), и что было сделано — для подписи в интерфейсе.
 */
export const processLogo = async (buffer) => {
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
  if (!LOGO_RULES.formats.includes(meta.format)) {
    throw new HttpError(400, `Нужен PNG, JPG, WebP или SVG, а это ${meta.format?.toUpperCase() || 'неизвестный формат'}`);
  }

  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  // SVG — вектор: рисуем сразу в нужном размере, мелкого у него не бывает
  const isSvg = meta.format === 'svg';
  if (!isSvg && long < LOGO_RULES.minSide) {
    throw new HttpError(400, `Слишком мелкий: ${meta.width}×${meta.height}, нужно от ${LOGO_RULES.minSide} точек по длинной стороне — растянутый логотип на ролике будет мыльным`);
  }
  const density = isSvg ? Math.min(2400, Math.max(72, 72 * LOGO_RULES.maxSide / Math.max(1, long))) : undefined;
  const {data, info} = await sharp(buffer, {density, limitInputPixels: 50_000_000})
    .rotate()
    .resize(LOGO_RULES.maxSide, LOGO_RULES.maxSide, {fit: 'inside', withoutEnlargement: !isSvg})
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});
  const {width, height} = info;

  // Прозрачный фон уже есть — ничего не убираем
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { transparent = true; break; }
  let clean = data;
  let backgroundRemoved = false;
  if (!transparent) {
    const res = removeFlatBackground(data, width, height);
    if (!res) {
      throw new HttpError(400, 'Фон неоднородный — похоже на фото или текстуру. Нужен логотип на прозрачном или однотонном фоне');
    }
    clean = res.data;
    backgroundRemoved = true;
  }

  const box = visibleBox(clean, width, height);
  // Меньше полпроцента кадра — после удаления фона от логотипа ничего не осталось:
  // обычно это белый логотип на белом фоне
  if (!box.visible || box.visible < width * height * 0.005) {
    throw new HttpError(400, 'После удаления фона ничего не осталось — логотип того же цвета, что и фон. Нужен файл, где логотип отличается от фона');
  }
  const toPng = (raw) => sharp(raw, {raw: {width, height, channels: 4}})
    .extract({left: box.left, top: box.top, width: box.width, height: box.height})
    .png({compressionLevel: 9})
    .toBuffer();
  const cleanPng = await toPng(clean);
  const rawPng = backgroundRemoved ? await toPng(data) : null;

  const notes = [];
  if (isSvg) notes.push('SVG переведён в PNG');
  if (long > LOGO_RULES.maxSide && !isSvg) notes.push(`уменьшен с ${meta.width}×${meta.height}`);
  if (backgroundRemoved) notes.push('фон убран');
  if (box.width < width * 0.9 || box.height < height * 0.9) notes.push('пустые поля обрезаны');
  const warnings = [];
  const luma = visibleLuma(clean);
  if (luma.mean < 0.18) warnings.push('логотип тёмный — на тёмном фоне слайда его будет плохо видно. Нужен вариант для тёмного фона');
  // Порог 12% подобран на брендбуке AXIS: у логотипов для тёмного фона тёмного не больше
  // 8,6% (тени медных иконок, сглаженный край), у вариантов для светлого фона — от 28%
  else if (luma.darkShare > 0.12) warnings.push('часть логотипа тёмная и на тёмном слайде пропадёт — похоже, это вариант для светлого фона');
  return {clean: cleanPng, raw: rawPng, width: box.width, height: box.height, notes, warnings};
};

// ——— Сохранение ———

const setLogo = async (url) => {
  const brand = await getBrand();
  // Один файл на все места: и крупно на финале, и полосой вверху кадра, и водяным знаком
  await saveBrand({...brand, assets: {...brand.assets, logoStacked: url, logoHorizontal: url, sign: url}});
};

/**
 * Проверить, обработать и поставить логотип. Сохраняем оба варианта — с убранным фоном
 * и исходный: переключение между ними не требует загружать файл заново.
 */
export const saveLogo = async (buffer) => {
  const logo = await processLogo(buffer);
  const dir = brandDir();
  await fs.mkdir(dir, {recursive: true});
  // Имя со временем: браузер и рендер кэшируют картинки по адресу, и при том же имени
  // показывали бы прежний логотип
  const stamp = Date.now().toString(36);
  const name = `logo-${stamp}.png`;
  await fs.writeFile(path.join(dir, name), logo.clean);
  if (logo.raw) await fs.writeFile(path.join(dir, `logo-${stamp}-raw.png`), logo.raw);

  // Прежние логотипы не копим: нужен текущий (и его вариант без удаления фона)
  for (const f of await fs.readdir(dir)) {
    if (f.startsWith('logo-') && !f.startsWith(`logo-${stamp}`)) await fs.rm(path.join(dir, f), {force: true}).catch(() => {});
  }
  const url = `${workspaceUrl()}/brand/${name}`;
  await setLogo(url);
  return {
    url, width: logo.width, height: logo.height, bytes: logo.clean.length,
    notes: logo.notes, warnings: logo.warnings, hasRaw: Boolean(logo.raw),
  };
};

/**
 * Переключить вариант текущего логотипа: 'clean' — фон убран, 'raw' — как был загружен
 * (только обрезан), 'none' — без логотипа, вместо него название компании текстом.
 */
export const setLogoVariant = async (variant) => {
  if (variant === 'none') {
    await setLogo('');
    return {url: ''};
  }
  const brand = await getBrand();
  const current = brand.assets?.logoStacked ?? '';
  const own = `${workspaceUrl()}/brand/`;
  const m = current.startsWith(own) && /^logo-([a-z0-9]+)(-raw)?\.png$/.exec(current.slice(own.length));
  if (!m) throw new HttpError(409, 'Сначала загрузите логотип');
  const name = variant === 'raw' ? `logo-${m[1]}-raw.png` : `logo-${m[1]}.png`;
  const exists = await fs.access(path.join(brandDir(), name)).then(() => true, () => false);
  if (!exists) throw new HttpError(409, variant === 'raw' ? 'У этого логотипа фон не убирался — возвращать нечего' : 'Файл логотипа пропал — загрузите заново');
  const url = `${own}${name}`;
  await setLogo(url);
  return {url};
};
