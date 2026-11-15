// Коммерческое предложение (КП) дилера в PDF по объявлению.
//
// Как устроено: данные (профиль → реквизиты и шаблон, бренд → логотип и цвет, объявление →
// машина и фото) → HTML на A4 → PDF печатает chrome-headless-shell, тот же, что Remotion
// держит для рендера роликов: своего браузера не ставим. Готовое лежит в
// data/workspaces/<компания>/offers/<id>/ — offer.pdf и offer.json (что собрали и по чему).
//
// Нагрузка (замер на M1, 16.11): сборка 0,3–0,6 с, ~200 МБ памяти на время печати, файл
// 200–400 КБ. Это сотые доли ролика, но браузер — отдельный процесс, поэтому больше двух
// печатей разом не пускаем (OFFER_CONCURRENCY): пачка запросов не съест память рендера.
// Подробно — docs/offer-pdf.md.

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {
  DEFAULT_PROFILE, HttpError, ROOT, checkId, getBrand, getLot, getProfile, readJson, saveProfile,
  withLock, workspaceDir, workspaceUrl, writeJson,
} from './store.mjs';
import {logoFile, withLogoInk} from './brand.mjs';
import {rates} from './rates.mjs';
import {serverLog} from './log.mjs';
import {calcOffer, carPriceIn, docNumber, offerSettings, sampleAmounts} from '../src/shared/offer.js';
import {companyContacts, offerDocument, sampleClient, sampleCompany, sampleDealer} from '../src/shared/offerHtml.js';
import {currencyCode} from '../src/shared/currencies.js';
import {inkContrast} from '../src/shared/logoPlate.js';

const log = serverLog('offers');
const run = promisify(execFile);

export const offersDir = () => path.join(workspaceDir(), 'offers');

// ——— Браузер ———
// Remotion кладёт chrome-headless-shell в node_modules/.remotion/<режим>/<платформа>/…; имя
// платформенной папки и файла у него разное (mac-arm64, linux64, headless_shell на ARM-линуксе),
// поэтому ищем, а не собираем путь. CHROME_PATH — свой браузер, если понадобится
let chromePath;
const findChrome = () => {
  if (chromePath) return chromePath;
  if (process.env.CHROME_PATH) return (chromePath = process.env.CHROME_PATH);
  const base = path.join(ROOT, 'node_modules', '.remotion', 'chrome-headless-shell');
  for (const platform of existsSync(base) ? readdirSync(base, {withFileTypes: true}).filter((d) => d.isDirectory()).map((d) => d.name) : []) {
    const dir = path.join(base, platform);
    for (const sub of readdirSync(dir).filter((d) => d.startsWith('chrome-headless-shell'))) {
      for (const exe of ['chrome-headless-shell', 'headless_shell', 'chrome-headless-shell.exe']) {
        const p = path.join(dir, sub, exe);
        if (existsSync(p)) return (chromePath = p);
      }
    }
  }
  throw new Error('Не найден chrome-headless-shell Remotion (ensureBrowser в Dockerfile)');
};

// Не больше двух печатей разом: остальные ждут в очереди (секунды), а не запускают по браузеру
const LIMIT = Number(process.env.OFFER_CONCURRENCY) || 2;
let active = 0;
const waiting = [];
const slot = async (fn) => {
  if (active >= LIMIT) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
};

const printPdf = (htmlFile, pdfFile) => slot(() => run(findChrome(), [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
  // Шрифт встроен в HTML, но декодируется не мгновенно: без бюджета времени Chromium
  // печатал раньше и выходил PDF без единой буквы (прототип, 16.11)
  '--run-all-compositor-stages-before-draw', '--virtual-time-budget=5000',
  `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href,
], {timeout: 60_000}));

// ——— Шрифт: Manrope встраиваем в файл — у сервера нет сети к Google Fonts, а PDF должен
// выглядеть одинаково везде ———
let fontCss;
const fonts = async () => {
  if (fontCss) return fontCss;
  const dir = path.join(ROOT, 'node_modules', '@fontsource', 'manrope', 'files');
  const faces = [];
  for (const w of [400, 500, 600, 700, 800]) {
    for (const s of ['cyrillic', 'latin', 'latin-ext']) {
      const b64 = (await fs.readFile(path.join(dir, `manrope-${s}-${w}-normal.woff2`))).toString('base64');
      faces.push(`@font-face{font-family:Manrope;font-weight:${w};src:url(data:font/woff2;base64,${b64}) format("woff2");}`);
    }
  }
  return (fontCss = faces.join('\n'));
};

// ——— Картинки: ужимаем под печать (A4 ≈ 150 dpi) — PDF уходит в мессенджеры ———
// Демо-объявление настроек (public/preview-demo) — для образца у клиента без своих объявлений
const DEMO_LOT = path.join(ROOT, 'public', 'preview-demo', 'lot.json');
const own = (url) => {
  if (typeof url === 'string' && url.startsWith('/preview-demo/')) {
    const file = path.resolve(ROOT, 'public', url.slice(1));
    return file.startsWith(path.join(ROOT, 'public', 'preview-demo') + path.sep) ? file : null;
  }
  const prefix = `${workspaceUrl()}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const root = workspaceDir();
  const file = path.resolve(root, url.slice(prefix.length));
  return file.startsWith(root + path.sep) ? file : null;
};
const jpeg = async (file, w, h) => {
  if (!file) return null;
  try {
    const buf = await sharp(file).rotate().resize(w, h, {fit: 'cover'}).jpeg({quality: 78, mozjpeg: true}).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    log.warn('photo.unreadable', {note: 'фото не прочиталось — КП без него', file, error: e});
    return null;
  }
};
const png = async (file, w, h) => {
  if (!file) return null;
  try {
    const buf = await sharp(file, {density: 300}).resize(w, h, {fit: 'inside', withoutEnlargement: true}).png().toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
};

// Логотип сделан под тёмные слайды и бывает белым: на бумаге он пропал бы. Плохо видный
// на белом знак ставим на плашку цвета фона бренда — то же правило, что у подложки в роликах
const logoOf = async (brand) => {
  const url = brand?.assets?.logoHorizontal || brand?.assets?.logoStacked || '';
  const file = logoFile(url);
  if (!file) return null;
  const src = await png(file, 600, 200);
  if (!src) return null;
  const ink = (await withLogoInk(brand)).logoInk?.[url];
  return {src, plate: ink && inkContrast(ink, '#ffffff') < 3 ? brand.bg || '#111111' : null};
};

// ——— Запрос на сборку: всё, что пришло от клиента, — в границах ———
const MAX_TEXT = 200;
const clean = (v, max = MAX_TEXT) => String(v ?? '').trim().slice(0, max);
const amountOf = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new HttpError(400, 'Сумма в КП — число');
  return n;
};
export const parseOfferRequest = (body = {}) => {
  const amounts = {};
  for (const [k, v] of Object.entries(body.amounts || {}).slice(0, 30)) {
    const n = amountOf(v);
    if (n !== undefined) amounts[clean(k, 40)] = n;
  }
  const extraLines = (Array.isArray(body.extraLines) ? body.extraLines : []).slice(0, 10)
    .map((x) => ({label: clean(x?.label), note: clean(x?.note), amount: amountOf(x?.amount) ?? null}))
    .filter((x) => x.label);
  return {client: clean(body.client), amounts, extraLines};
};

/**
 * Собрать КП. sample — образец из настроек: всегда на демо-машине и типовой компании («Ваша
 * компания», без логотипа — владелец 16.11), с «ОБРАЗЕЦ» поперёк и без номера по счётчику:
 * он бесплатный, и годного к отправке документа из него не получить. settingsOverride —
 * несохранённые настройки формы, только для образца. Совпадает с живым превью в настройках:
 * вёрстка одна (src/shared/offerHtml.js).
 */
export const buildOffer = async (lotId, request, {sample = false, settingsOverride = null} = {}) => {
  const lot = sample ? {...(await readJson(DEMO_LOT)), id: 'demo'}
    : await getLot(checkId(lotId)).catch(() => { throw new HttpError(404, 'Нет такого объявления'); });
  const [profile, brand, {usdRates}, fontCss] = await Promise.all([getProfile(DEFAULT_PROFILE), getBrand(), rates(), fonts()]);
  const saved = settingsOverride ? offerSettings({...profile, offer: settingsOverride}) : offerSettings(profile);
  const language = profile.language;
  const settings = sample ? {...saved, dealer: sampleDealer(saved.dealer, language)} : saved;
  const carPrice = carPriceIn(lot, profile.pricing?.currency, usdRates);
  const {extraLines} = request;
  const amounts = sample ? {...sampleAmounts(settings.template, carPrice), ...request.amounts} : request.amounts;
  const client = sample && !request.client ? sampleClient(language) : request.client;
  const calc = calcOffer({carPrice, template: settings.template, amounts, extraLines});
  if (!sample && calc.missing.length) throw new HttpError(400, `Впишите сумму: ${calc.missing.join(', ')}`);
  const company = sample ? sampleCompany(settings.dealer, language)
    : {name: profile.company || brand?.name || '', contacts: companyContacts(settings.dealer, profile.contacts), logo: await logoOf(brand)};

  const photos = (lot.photos || []).map(own).filter(Boolean);
  const count = Math.min(9, Math.max(0, Number(settings.template.show?.photos) || 0));
  const images = {
    hero: await jpeg(photos[0], 1240, 700),
    grid: (await Promise.all(photos.slice(1, 1 + count).map((f) => jpeg(f, 600, 400)))).filter(Boolean),
    // Крупные фото в конце — те же, что в сетке, но во всю ширину листа (178×108 мм ≈ 1240 px при 180 dpi)
    gallery: (await Promise.all(photos.slice(1, 1 + Math.min(8, Math.max(0, Number(settings.template.show?.gallery) || 0)))
      .map((f) => jpeg(f, 1240, 750)))).filter(Boolean),
  };

  const date = new Date();
  // Номер — по счётчику профиля, под замком: две сборки подряд не получат один номер
  const number = sample ? docNumber(settings.template.numbering, date)
    : await withLock('offer-number', async () => {
      const fresh = await getProfile(DEFAULT_PROFILE);
      const s = offerSettings(fresh);
      const n = docNumber(s.template.numbering, date);
      await saveProfile(DEFAULT_PROFILE, {...fresh, offer: {...fresh.offer, dealer: s.dealer,
        template: {...s.template, numbering: {...s.template.numbering, next: s.template.numbering.next + 1}}}});
      return n;
    });

  const id = `of-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = sample ? path.join(workspaceDir(), 'offer-samples', id) : path.join(offersDir(), id);
  await fs.mkdir(dir, {recursive: true});
  const htmlFile = path.join(dir, 'offer.html');
  await fs.writeFile(htmlFile, offerDocument({language, currency: profile.pricing?.currency, company, settings, lot, calc,
    number, date, client, images, sample, accent: sample ? '#8E0D2C' : brand?.copper}, fontCss));
  const started = Date.now();
  try {
    await printPdf(htmlFile, path.join(dir, 'offer.pdf'));
  } catch (e) {
    log.error('print.failed', {note: 'Chromium не напечатал КП', lotId: lot.id, error: e});
    throw new HttpError(500, 'Не удалось собрать PDF — попробуйте ещё раз');
  } finally {
    await fs.rm(htmlFile, {force: true});
  }
  const meta = {id, lotId: lot.id, number, createdAt: date.toISOString(), client, currency: currencyCode(profile.pricing?.currency),
    total: calc.total, car: `${lot.brand} ${lot.model} ${lot.year}`, amounts, extraLines, sample};
  await writeJson(path.join(dir, 'offer.json'), meta);
  log.info('built', {id, lotId: lot.id, sample, ms: Date.now() - started});
  return meta;
};

/** Файл готового КП (или образца) и имя для скачивания */
export const offerFile = async (id, {sample = false} = {}) => {
  const dir = path.join(sample ? path.join(workspaceDir(), 'offer-samples') : offersDir(), checkId(id));
  const meta = await readJson(path.join(dir, 'offer.json')).catch(() => { throw new HttpError(404, 'КП не найдено'); });
  const safe = `${meta.number} ${meta.car}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {file: path.join(dir, 'offer.pdf'), name: `${safe}.pdf`};
};

/** КП объявления, свежие сверху */
export const listOffers = async (lotId) => {
  const dirs = await fs.readdir(offersDir()).catch(() => []);
  const all = await Promise.all(dirs.map((d) => readJson(path.join(offersDir(), d, 'offer.json')).catch(() => null)));
  return all.filter((m) => m && (!lotId || m.lotId === lotId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const deleteOffer = async (id) => {
  await fs.rm(path.join(offersDir(), checkId(id)), {recursive: true, force: true});
  return {ok: true};
};

// Образцы — одноразовые: старше часа убираем при каждой новой сборке образца
export const sweepSamples = async () => {
  const dir = path.join(workspaceDir(), 'offer-samples');
  for (const d of await fs.readdir(dir).catch(() => [])) {
    const st = await fs.stat(path.join(dir, d)).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 3600e3) await fs.rm(path.join(dir, d), {recursive: true, force: true});
  }
};
