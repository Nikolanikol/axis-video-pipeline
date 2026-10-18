// Картинка превью ссылки (og:image, public/kok/og.png, 1200×630) — node tools/og-image.mjs
//
// Зачем (19.10): раньше превью было одним логотипом KOK, и получатель ссылки в Telegram или
// WhatsApp не понимал, что это за сервис. Теперь слева — что это (те же слова, что в H1 витрины,
// config/seo.json), справа — сам продукт: кадр рекламного ролика и слайд карусели с витрины
// (public/landing, демо-компания «Ваша компания» — работ клиентов на публичном не светим).
//
// Рисует HTML, снимок делает Chrome из Remotion (тот же, что рендерит ролики): sharp не умеет
// Manrope из @fontsource и тени, а вёрстка в браузере — как у витрины. 1200×630 — размер, который
// WhatsApp, Telegram и Facebook не обрезают; текст держим в середине — Telegram и VK кадрируют края.
// Поменялись образцы витрины (tools/landing-samples.mjs) — пересобери и эту картинку.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureBrowser} from '@remotion/renderer';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = (rel) => path.join(ROOT, 'public', rel);
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const font = (w, sub) => dataUrl(path.join(ROOT, 'node_modules/@fontsource/manrope/files', `manrope-${sub}-${w}-normal.woff2`), 'font/woff2');

// Образцы: ролик «Цена сразу» (GV80) спереди, слайд «Классики» (GV70) за ним
const VIDEO = pub('landing/video/price-first-copper.jpg');
const SLIDE = pub('landing/carousel/classic-1.jpg');

const faces = [700, 800].flatMap((w) => ['cyrillic', 'latin'].map((sub) =>
  `@font-face{font-family:Manrope;font-weight:${w};src:url(${font(w, sub)}) format('woff2');}`)).join('');

// Цвета — бренд KOK (app/styles.css): фон, тёплый белый, тёплый серый, винный и его светлая ступень
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#0b0b0d;font-family:Manrope,sans-serif;color:#f7f2eb;position:relative}
.glow{position:absolute;right:-120px;top:-160px;width:760px;height:760px;border-radius:50%;
  background:radial-gradient(circle,#8e0d2c66 0%,#8e0d2c22 45%,transparent 70%)}
.text{position:absolute;left:72px;top:0;bottom:0;width:600px;display:flex;flex-direction:column;justify-content:center}
.logo{height:46px;margin-bottom:40px;align-self:flex-start}
h1{font-weight:800;font-size:62px;line-height:1.04;letter-spacing:-1.5px}
h1 span{color:#e08a9a}
p{margin-top:22px;font-weight:700;font-size:28px;line-height:1.3;color:#a39d95}
.src{margin-top:34px;display:flex;gap:10px}
.src b{font-weight:700;font-size:20px;padding:9px 16px;border:2px solid #2a2a2e;border-radius:999px;color:#f7f2eb}
.card{position:absolute;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px #000c,0 0 0 2px #ffffff14}
.card img{display:block;width:100%;height:100%;object-fit:cover}
.slide{width:246px;height:437px;right:262px;top:118px;transform:rotate(-7deg);opacity:.92}
.video{width:270px;height:480px;right:56px;top:75px;transform:rotate(4deg)}
</style></head><body>
<div class="glow"></div>
<div class="text">
  <img class="logo" src="${dataUrl(pub('kok/wordmark.svg'), 'image/svg+xml')}">
  <h1>Реклама для автосалона — <span>одной кнопкой</span></h1>
  <p>Ролик и карусель по ссылке на&nbsp;объявление</p>
  <div class="src"><b>Encar</b><b>che168</b><b>Carsensor</b></div>
</div>
<div class="card slide"><img src="${dataUrl(SLIDE, 'image/jpeg')}"></div>
<div class="card video"><img src="${dataUrl(VIDEO, 'image/jpeg')}"></div>
</body></html>`;

// Браузер Remotion — тот, что уже лежит в node_modules/.remotion (ensureBrowser скачает, если нет)
await ensureBrowser();
const find = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? find(p) : /^chrome-headless-shell(\.exe)?$/.test(e.name) ? [p] : [];
});
const [chrome] = find(path.join(ROOT, 'node_modules', '.remotion'));
if (!chrome) throw new Error('Нет chrome-headless-shell в node_modules/.remotion');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kok-og-'));
const page = path.join(tmp, 'og.html');
const shot = path.join(tmp, 'og.png');
fs.writeFileSync(page, html);
// Снимок вдвое крупнее и уменьшение sharp'ом — текст и края карточек без лесенки
execFileSync(chrome, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1200,630',
  '--virtual-time-budget=3000', `--screenshot=${shot}`, `file://${page}`], {stdio: 'ignore'});
// Палитра на 256 цветов: полноцветный PNG выходил ~400 КБ, а WhatsApp надёжно показывает превью
// только до ~300 КБ. Фото в карточках мелкие — потеря цвета на глаз не видна
await sharp(shot).resize(1200, 630).png({palette: true, quality: 90, effort: 10, compressionLevel: 9}).toFile(pub('kok/og.png'));
fs.rmSync(tmp, {recursive: true, force: true});
console.log('Готово: public/kok/og.png, 1200×630');
