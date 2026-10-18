// Настоящие композиции: все сочетания и пропорции, затем три полных рекламных сценария.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import brand from '../../config/brand.json';
import registry from '../../config/designs.json';
import formats from '../../config/formats.json';
import copy from '../../config/copy.json';
import {applyDesignPreset} from '../../src/shared/designs';
import {ROOT, probe} from '../helpers.mjs';

const demo = JSON.parse(await fs.readFile(path.join(ROOT, 'public/preview-demo/lot.json'), 'utf8'));
const lot = {...demo, photos: demo.photos.map((url) => url.replace(/^\//, '')), krwPerUsd: 1334.77, music: {track: null}};
const market = {name: 'DEMO MOTORS', origin: 'Incheon', port: 'Durres', originCountry: 'KR', portCountry: 'AL', freightUsd: 1300,
  whatsapp: '+82 10 0000 0000', site: 'demo.example', currency: 'USD', language: 'ru', pricingMode: 'export',
  krwPerUnitToday: 1334.77, krwPerUsdToday: 1334.77, texts: copy.export.ru};
const car = {id: 'demo', source: '', brand: lot.brand, model: lot.model, grade: '', trim: lot.trim, year: lot.year, firstRegistered: null,
  mileageKm: 67842, displacementCc: 5000, transmission: 'Automatic', fuel: 'Gasoline', body: '', color: 'Red', seats: null, vin: null, plate: null,
  history: null, price: {krw: demo.carPriceKrw, usd: null, krwToUsd: null, quotedAt: null, rateSource: ''},
  options: {comfort: [], safety: [], other: [], total: 0},
  photos: {hero: lot.photos[0], rear: lot.photos[1], interiorShot: lot.photos[3], dashboard: lot.photos[4], exterior: lot.photos.slice(0, 3), interior: lot.photos.slice(3, 6), other: []}};
let serveUrl, browser, dir;
const preserve = Boolean(process.env.AXIS_DESIGN_QA_DIR);
beforeAll(async () => {
  dir = preserve ? path.resolve(process.env.AXIS_DESIGN_QA_DIR) : await fs.mkdtemp(path.join(os.tmpdir(), 'axis-design-render-'));
  await fs.mkdir(dir, {recursive: true});
  serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), rootDir: ROOT, publicDir: path.join(ROOT, 'public')});
  browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_PATH || null});
});
afterAll(async () => { await browser?.close({silent: true}); if (!preserve) await fs.rm(dir, {recursive: true, force: true}); });

const presets = registry.flatMap((d) => d.presets);
describe('новые дизайны карусели', () => {
  it.each(presets)('$id: обложка, характеристики, цена и контакты во всех пропорциях', async (preset) => {
    const theme = applyDesignPreset({...brand, name: market.name, assets: {...brand.assets, logoHorizontal: ''}}, preset.id);
    for (const format of ['showcase', 'spread', 'classic']) {
      const inputProps = {car, market, theme, format, includeHistory: false, seed: 0};
      const composition = await selectComposition({serveUrl, id: 'carousel', inputProps, puppeteerInstance: browser});
      const selected = format === 'showcase' ? [0, 3, 6, 7] : [0, 3, 4, 5];
      for (const frame of selected) {
        const {buffer} = await renderStill({composition, serveUrl, frame, inputProps, puppeteerInstance: browser, imageFormat: 'png', scale: .5});
        const {channels} = await sharp(buffer).stats();
        expect(channels[0].stdev, `${preset.id}/${format}/${frame}`).toBeGreaterThan(8);
        await fs.writeFile(path.join(dir, `${preset.id}-${format}-${frame}.png`), buffer);
      }
      const other = {...inputProps, seed: 1};
      const otherComposition = await selectComposition({serveUrl, id: 'carousel', inputProps: other, puppeteerInstance: browser});
      const one = await renderStill({composition, serveUrl, frame: 0, inputProps, puppeteerInstance: browser, imageFormat: 'png', scale: .25});
      const two = await renderStill({composition: otherComposition, serveUrl, frame: 0, inputProps: other, puppeteerInstance: browser, imageFormat: 'png', scale: .25});
      expect(one.buffer.equals(two.buffer), `${preset.id}/${format}: варианты одинаковые`).toBe(false);
    }
  });
});

describe('новые дизайны ролика', () => {
  it.each([['graphite-copper', 'price-ad'], ['paper-wine', 'gallery-ad'], ['porcelain-cobalt', 'price-first']])('%s / %s: полный ролик', async (preset, id) => {
    const theme = applyDesignPreset({...brand, name: market.name, assets: {...brand.assets, logoHorizontal: ''}}, preset);
    const inputProps = {lot, market, theme};
    const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser});
    const format = formats.find((f) => f.id === id);
    expect(composition.durationInFrames).toBe(format.durationInFrames);
    for (const scene of format.scenes) {
      const {buffer} = await renderStill({composition, serveUrl, frame: scene.preview, inputProps, puppeteerInstance: browser, imageFormat: 'png', scale: .5});
      await fs.writeFile(path.join(dir, `${preset}-${id}-${scene.id}.png`), buffer);
    }
    const file = path.join(dir, `${preset}-${id}.mp4`);
    await renderMedia({composition, serveUrl, inputProps, puppeteerInstance: browser, codec: 'h264', scale: .25,
      outputLocation: file, enforceAudioTrack: true, concurrency: 2});
    const streams = await probe(file);
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(Number(streams.find((s) => s.codec_type === 'video').nb_frames)).toBe(format.durationInFrames);
  });
});
