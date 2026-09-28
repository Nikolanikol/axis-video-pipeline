// Собирает ассеты платформы KOK из пакета логотипов в public/kok/.
// node tools/kok-assets.mjs [папка KOK_logo_pack]   (по умолчанию — ../design/KOK_logo_pack)
//
// KOK — бренд самой платформы (вход, шапка, вкладка, письма). Логотипы компаний-клиентов
// живут в public/brand и в их кабинетах, этот скрипт их не трогает.
//
// SVG копируются как есть. PNG нужны там, где SVG не принимают: иконка на экране iPhone
// и Android (берут только растр), письма (Gmail и Outlook SVG не показывают) и превью
// ссылки в мессенджерах (og:image — тоже только растр).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = process.argv[2] ?? path.join(ROOT, '..', 'design', 'KOK_logo_pack');
const OUT = path.join(ROOT, 'public', 'kok');
const BG = '#0B0B0D';

fs.mkdirSync(OUT, {recursive: true});
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// Размерные копии пакета (_250w, _500w…) отличаются только атрибутами width/height —
// берём мастера и масштабируем в CSS
const copies = {
  'wordmark.svg': 'master/kok_wordmark_darkbg.svg', // шапка: без девиза, он там в 3 px
  'full.svg': 'master/kok_full_darkbg.svg', // вход и регистрация: единственное место для девиза
  'mark.svg': 'master/kok_button_mark.svg', // знак «◉» — индикатор загрузки
  // Фавикон на тёмном квадрате: прозрачный знак со светлым кольцом пропадает
  // на светлой панели вкладок Chrome и Safari
  'favicon.svg': 'web/kok_favicon_32.svg',
};
for (const [name, rel] of Object.entries(copies)) fs.writeFileSync(path.join(OUT, name), read(rel));

const png = (svg, size) => sharp(Buffer.from(svg), {density: 300}).resize(size, size).png();
// iOS и Android сами скругляют углы иконки — квадрат должен быть без скругления
await png(read('ios/kok_ios_button_180.svg'), 180).toFile(path.join(OUT, 'apple-touch-icon.png'));
await png(read('android/kok_android_button_512.svg'), 192).toFile(path.join(OUT, 'icon-192.png'));
await png(read('android/kok_android_button_512.svg'), 512).toFile(path.join(OUT, 'icon-512.png'));

// Логотип и плашка под него в одном PNG: в письме светлый логотип на белом фоне
// почтовика не виден, а фон ячейки таблицы часть клиентов вырезает
const onDark = async (svgRel, logoW, w, h) => {
  const logo = await sharp(Buffer.from(read(svgRel)), {density: 300}).resize({width: logoW}).png().toBuffer();
  return sharp({create: {width: w, height: h, channels: 4, background: BG}})
    .composite([{input: logo, gravity: 'center'}]).png();
};
// Показывается 120×38 — рисуем в 2,5 раза крупнее для ретины. Впритык, без полей:
// отступ задаёт письмо, иначе логотип съезжает относительно текста
await (await onDark('master/kok_wordmark_darkbg.svg', 300, 300, 96)).toFile(path.join(OUT, 'email-logo.png'));
// Превью ссылки: 1200×630 — размер, который WhatsApp, Telegram и Facebook не обрезают
await (await onDark('master/kok_full_darkbg.svg', 720, 1200, 630)).toFile(path.join(OUT, 'og.png'));

console.log('Готово:', fs.readdirSync(OUT).join(', '));
