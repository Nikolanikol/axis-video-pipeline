// Картинка образца КП для витрины: первая страница документа на трёх языках.
//
// Запускается руками, когда меняется вёрстка КП (src/shared/offerHtml.js): `npm run offer-sample`.
// Собирает ровно то, что видит дилер в «Настройки → Коммерческое предложение» на образце:
// демо-объявление (public/preview-demo), типовая «Ваша компания» с пометкой «ОБРАЗЕЦ», шаблон по
// умолчанию на языке. Печатает тем же Chromium, что и приложение (server/offers.mjs), только
// снимком первой страницы, а не PDF. Готовые картинки лежат в site/public/offer/ и коммитятся:
// при обычной сборке сайта Chromium не нужен.
//
// Курс для перевода цены машины в доллары — постоянный: на образце важна вёрстка, а не сегодняшняя
// цена, и картинка не должна меняться от каждого запуска.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {calcOffer, carPriceIn, docNumber, offerSettings, sampleAmounts} from '../../src/shared/offer.js';
import {offerDocument, sampleClient, sampleCompany, sampleDealer} from '../../src/shared/offerHtml.js';

const run = promisify(execFile);
const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(site);
const out = path.join(site, 'public', 'offer');
const tmp = await fs.mkdtemp(path.join(site, '.offer-'));

// Chromium из Remotion основной копии приложения: в рабочих копиях node_modules может не быть
const chrome = process.env.CHROME ?? (await (async () => {
  for (const base of [repo, path.join(repo, '..', 'axis-video')]) {
    const f = path.join(base, 'node_modules', '.remotion', 'chrome-headless-shell', 'mac-arm64',
      'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
    if (await fs.access(f).then(() => true, () => false)) return f;
  }
  throw new Error('нет chrome-headless-shell — укажите путь в CHROME');
})());

const fontDir = path.join(site, 'node_modules', '@fontsource', 'manrope', 'files');
const faces = [];
for (const w of [400, 500, 600, 700, 800]) {
  for (const s of ['cyrillic', 'latin', 'latin-ext']) {
    const file = path.join(fontDir, `manrope-${s}-${w}-normal.woff2`);
    if (!(await fs.access(file).then(() => true, () => false))) continue;
    faces.push(`@font-face{font-family:Manrope;font-weight:${w};src:url(data:font/woff2;base64,${(await fs.readFile(file)).toString('base64')}) format("woff2");}`);
  }
}
const fontCss = faces.join('\n');

const lot = {...JSON.parse(await fs.readFile(path.join(repo, 'public', 'preview-demo', 'lot.json'), 'utf8')), id: 'demo'};
const photo = async (url) => `data:image/jpeg;base64,${(await fs.readFile(path.join(repo, 'public', url.slice(1)))).toString('base64')}`;
const usdRates = {KRW: 1400};

await fs.mkdir(out, {recursive: true});
for (const language of ['ru', 'en', 'sq']) {
  const saved = offerSettings({language});
  const settings = {...saved, dealer: sampleDealer(saved.dealer, language)};
  const carPrice = carPriceIn(lot, 'USD', usdRates);
  const calc = calcOffer({carPrice, template: settings.template, amounts: sampleAmounts(settings.template, carPrice)});
  const count = Math.min(9, Number(settings.template.show?.photos) || 0);
  const images = {hero: await photo(lot.photos[0]), grid: await Promise.all(lot.photos.slice(1, 1 + count).map(photo)), gallery: []};
  const date = new Date('2026-11-17T12:00:00Z');
  const html = offerDocument({language, currency: 'USD', company: sampleCompany(settings.dealer, language), settings, lot, calc,
    number: docNumber(settings.template.numbering, date), date, client: sampleClient(language), images, sample: true, accent: '#8E0D2C'}, fontCss);
  const htmlFile = path.join(tmp, `${language}.html`);
  await fs.writeFile(htmlFile, html);
  const png = path.join(tmp, `${language}.png`);
  // A4 при 96 dpi — 794×1123; снимок вдвое плотнее, потом ужимаем в JPEG под экран витрины
  await run(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=5000', '--window-size=794,1123',
    `--screenshot=${png}`, pathToFileURL(htmlFile).href], {timeout: 60_000});
  const jpg = path.join(out, `sample-${language}.jpg`);
  await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '--resampleWidth', '900', png, '--out', jpg]);
  console.log('образец КП:', path.relative(site, jpg));
}
await fs.rm(tmp, {recursive: true, force: true});
