// Образцы для витрины гостя (app/Landing.tsx): ролики и карусели от имени демо-компании
// «Ваша компания» (src/shared/landingDemo.js) и демо-объявление для живого превью.
//
//   node --env-file=.env tools/landing-samples.mjs
//
// Нужно: копия сервера без базы на :3211 (`PORT=3211 DATABASE_URL= npm run app`) — с неё
// рендер берёт фото объявлений, шлюз kmotors на :3000 — данные машин для каруселей, ffmpeg
// в PATH — ужать результат для сайта. Пишет в public/landing/ (это коммитится) и
// public/landing/samples.json — список, который читает витрина.
//
// Почему файлами, а не рендером на лету: витрину открывает каждый гость, а ролик — это
// минута работы сервера. Образцы собираются один раз и лежат статикой.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fetchCar} from '../server/carousel.mjs';
import {DEMO_PROFILE, demoTheme} from '../src/shared/landingDemo.js';
import {withoutMusic} from '../src/shared/nomusic.js';
import {marketFromProfile} from '../src/shared/profile.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/landing');
const LOTS = path.join(ROOT, 'data/workspaces/k-axis/lots');
const ORIGIN = process.env.LANDING_PHOTO_ORIGIN || 'http://127.0.0.1:3211';
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));

// Что показываем: три формата ролика и три формата карусели, каждый в своей палитре —
// гость видит и разные форматы, и что цвета настраиваются. Машины — с локальных лотов
// (фото уже подобраны и размыты); у каруселей — номер объявления Encar
const VIDEOS = [
  {lot: 'lot-20260930160520-uh1f', format: 'price-first', palette: 'copper'},
  {lot: 'lot-20260930153336-wjuf', format: 'gallery-ad', palette: 'gold'},
  {lot: 'lot-20260930151934-5nuz', format: 'price-ad', palette: 'steel'},
];
const CAROUSELS = [
  {id: '41756066', format: 'showcase', palette: 'copper'},
  {id: '42777079', format: 'classic', palette: 'blue'},
  {id: '40745458', format: 'spread', palette: 'gold'},
];
// Демо-объявление для живого превью: фото кладём рядом, витрина играет его в браузере
const DEMO_LOT = 'lot-20260930151400-p55h'; // Hyundai Kona 2023, 9 фото

// Размеры для сайта: ролик в превью занимает ~400 px по высоте, 540×960 с запасом на
// плотные экраны; CRF 27 и без звука (на витрине ролики играют без звука) — ~1 МБ на ролик
const VIDEO_W = 540;
const SLIDE_W = 720;
const PHOTO_H = 1000;

const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

const brand = await readJson(path.join(ROOT, 'config/brand.json'));
const palettes = await readJson(path.join(ROOT, 'config/palettes.json'));
const copy = await readJson(path.join(ROOT, 'config/copy.json'));
const formats = await readJson(path.join(ROOT, 'config/formats.json'));
const carouselFormats = await readJson(path.join(ROOT, 'config/carousel-formats.json'));
const market = marketFromProfile(DEMO_PROFILE, copy);
const themeOf = (id) => demoTheme(brand, palettes.find((p) => p.id === id).colors);

const lotFor = async (id) => {
  const lot = await readJson(path.join(LOTS, id, 'lot.json'));
  // Пометка «Encar N» витрине ни к чему, а фото рендер берёт с копии сервера по полному адресу
  const {note: _n, ...rest} = lot;
  return withoutMusic({...rest, photos: lot.photos.map((p) => ORIGIN + p)});
};

await fs.mkdir(path.join(OUT, 'video'), {recursive: true});
await fs.mkdir(path.join(OUT, 'carousel'), {recursive: true});
await fs.mkdir(path.join(OUT, 'demo'), {recursive: true});
await fs.mkdir(path.join(ROOT, 'out'), {recursive: true});
const tmp = await fs.mkdtemp(path.join(ROOT, 'out/landing-'));

console.log('Сборка композиций…');
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts')});
const browserExecutable = process.env.CHROME_PATH || null;
const manifest = {videos: [], carousels: []};

for (const v of VIDEOS) {
  const lot = await lotFor(v.lot);
  const fmt = formats.find((f) => f.id === v.format);
  const inputProps = {lot, market, theme: themeOf(v.palette)};
  const composition = await selectComposition({serveUrl, id: v.format, inputProps, browserExecutable});
  const raw = path.join(tmp, `${v.lot}.mp4`);
  process.stdout.write(`Ролик ${lot.brand} ${lot.model} · ${fmt.title}: `);
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: raw, inputProps, browserExecutable,
    crf: 18, colorSpace: 'bt709', onProgress: ({progress}) => process.stdout.write(`\r${lot.brand} ${lot.model}: ${Math.round(progress * 100)}%`),
  });
  const name = `${v.format}-${v.palette}`;
  ff('-i', raw, '-vf', `scale=${VIDEO_W}:-2`, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', path.join(OUT, 'video', `${name}.mp4`));
  // Обложка — кадр из середины первой сцены, а не нулевой: на нулевом всё ещё проявляется
  ff('-ss', '1.2', '-i', raw, '-frames:v', '1', '-vf', `scale=${VIDEO_W}:-2`, '-q:v', '4', path.join(OUT, 'video', `${name}.jpg`));
  manifest.videos.push({
    title: [lot.brand, lot.model].filter(Boolean).join(' '), year: lot.year, format: fmt.title,
    palette: palettes.find((p) => p.id === v.palette).title,
    video: `/landing/video/${name}.mp4`, poster: `/landing/video/${name}.jpg`,
  });
  console.log(' — готово');
}

const browser = await openBrowser('chrome', {browserExecutable});
try {
  for (const c of CAROUSELS) {
    const car = await fetchCar(c.id);
    const fmt = carouselFormats.find((f) => f.id === c.format);
    const inputProps = {car, market, theme: themeOf(c.palette), includeHistory: true, format: c.format, seed: 7};
    const composition = await selectComposition({serveUrl, id: 'carousel', inputProps, puppeteerInstance: browser});
    const slides = [];
    for (let frame = 0; frame < composition.durationInFrames; frame++) {
      const raw = path.join(tmp, `${c.id}-${frame + 1}.png`);
      await renderStill({composition, serveUrl, frame, inputProps, output: raw, puppeteerInstance: browser});
      const file = `${c.format}-${frame + 1}.jpg`;
      ff('-i', raw, '-vf', `scale=${SLIDE_W}:-2`, '-q:v', '3', path.join(OUT, 'carousel', file));
      slides.push(`/landing/carousel/${file}`);
    }
    manifest.carousels.push({
      title: [car.brand, car.model].filter(Boolean).join(' '), year: car.year, format: fmt.title,
      ratio: `${fmt.width} / ${fmt.height}`, palette: palettes.find((p) => p.id === c.palette).title, slides,
    });
    console.log(`Карусель ${car.brand} ${car.model} · ${fmt.title}: ${slides.length} слайдов`);
  }
} finally {
  await browser.close({silent: true});
}

// Демо-объявление для живого превью: фото ужаты до 1000 px по высоте — в превью кадр
// ~600 px, а 9 фото по 1500 px грузили бы витрину лишними мегабайтами
{
  const lot = await readJson(path.join(LOTS, DEMO_LOT, 'lot.json'));
  const photos = [];
  for (const [i, p] of lot.photos.entries()) {
    const file = `photo-${i + 1}.jpg`;
    ff('-i', path.join(ROOT, p), '-vf', `scale=-2:${PHOTO_H}`, '-q:v', '4', path.join(OUT, 'demo', file));
    photos.push(`/landing/demo/${file}`);
  }
  const keep = ['brand', 'model', 'trim', 'year', 'specs', 'carPriceKrw', 'krwPerUsd', 'carPriceUsd', 'texts'];
  const demo = Object.fromEntries(keep.filter((k) => k in lot).map((k) => [k, lot[k]]));
  // Места фото (lot.slots) — по ключам-именам файлов, а имена здесь новые; без них «Галерея»
  // раскладывает по порядку, этого витрине достаточно
  await fs.writeFile(path.join(OUT, 'demo/lot.json'), JSON.stringify({...demo, photos, specs: lot.specs, market: 'demo'}, null, 2) + '\n');
  console.log(`Демо-объявление: ${lot.brand} ${lot.model}, ${photos.length} фото`);
}

await fs.writeFile(path.join(OUT, 'samples.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.rm(tmp, {recursive: true, force: true});
console.log('Готово: public/landing/');
