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

// ICO — заголовок, каталог по 16 байт и PNG подряд (так ICO умеет с Windows Vista; sharp ICO не пишет)
const ico = (images) => {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, data], i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size % 256, at); head.writeUInt8(size % 256, at + 1);
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(([, data]) => data)]);
};

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
// Превью ссылки (og.png) с 19.10 собирает tools/og-image.mjs: карточка с продуктом, а не один логотип —
// по логотипу получатель ссылки не понимал, что это за сервис

// favicon.ico в корне сайта (19.10): Яндекс берёт значок для выдачи именно с /favicon.ico, его же
// по старинке запрашивают мессенджеры и старые браузеры. Раньше там отвечала страница приложения.
// Внутри — PNG 16, 32 и 48 из своих SVG пакета: у мелких размеров своя прорисовка, не уменьшенная.
// 48 отдельно ещё и PNG: Google просит значок кратный 48 px
const favs = await Promise.all([16, 32, 48].map((n) => png(read(`web/kok_favicon_${n}.svg`), n).toBuffer()));
await sharp(favs[2]).toFile(path.join(OUT, 'favicon-48.png'));
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), ico([[16, favs[0]], [32, favs[1]], [48, favs[2]]]));

console.log('Готово:', fs.readdirSync(OUT).join(', '));
