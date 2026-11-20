// Проверяем отказ настоящего браузера до оплаты, включая повтор на прогретых шрифтах.
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition} from '@remotion/renderer';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {preflightTextFrames} from '../../server/textFit.mjs';
import {applyDesignPreset} from '../../src/shared/designs';
import brand from '../../config/brand.json';
import copy from '../../config/copy.json';
import {ROOT} from '../helpers.mjs';

const lot = JSON.parse(await fs.readFile(path.join(ROOT, 'public/preview-demo/lot.json'), 'utf8'));
const car = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/fixtures/encar/40303537.json'), 'utf8'));
const market = {name: 'DEMO MOTORS', origin: 'Incheon', port: 'Durres', freightUsd: 1300, currency: 'USD',
  language: 'ru', pricingMode: 'export', krwPerUsdToday: 1334.77, krwPerUnitToday: 1334.77,
  whatsapp: '+82 10 0000 0000', site: 'demo.example', texts: copy.export.ru};
const theme = {...brand, name: market.name, assets: {...brand.assets, logoHorizontal: ''}};
let serveUrl, browser;
beforeAll(async () => {
  serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), rootDir: ROOT, publicDir: path.join(ROOT, 'public')});
  browser = await openBrowser('chrome', {browserExecutable: process.env.CHROME_PATH || null});
});
afterAll(async () => { await browser?.close({silent: true}); });
const preflight = async (id, inputProps, frames) => {
  const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser});
  return preflightTextFrames({serveUrl, composition, inputProps, browser, frames});
};

describe('защищённые композиции видео', () => {
  it.each(['graphite-copper', 'paper-wine', 'porcelain-cobalt'])('%s: обычный текст проходит, полное длинное описание отклоняется', async (preset) => {
    const selected = applyDesignPreset(theme, preset);
    // Системный шрифт изолирует геометрию видео от доступности внешней таблицы шрифта.
    const input = {lot, market, theme: {...selected, fonts: {head: 'Arial, sans-serif', body: 'Arial, sans-serif', url: ''}}, textFitVersion: 1};
    await expect(preflight('price-ad', input, [75, 190, 335, 440])).resolves.toBeUndefined();
    const text = 'Ш'.repeat(1200);
    await expect(preflight('price-ad', {...input, lot: {...lot, texts: {...lot.texts, hookTagline: text}}}, [75]))
      .rejects.toMatchObject({status: 422});
  });

  it('ошибка внешнего шрифта возвращает 503, а не подмену метрик', async () => {
    const input = {lot, market, textFitVersion: 1, theme: {...applyDesignPreset(theme, 'porcelain-cobalt'),
      fonts: {head: 'KOK Missing Fixture Font', body: 'KOK Missing Fixture Font', url: `${serveUrl}/missing-fit-font.css`}}};
    await expect(preflight('price-ad', input, [75])).rejects.toMatchObject({status: 503});
  });
});

describe('защита шести семейств каруселей', () => {
  it.each(['type_drive', 'cobalt_shift', 'pulse_grid', 'wide_form', 'urban_olive', 'contour_plum'])('%s: каждый слайд проверяется, повтор длинной рубрики не проходит через кэш', async (family) => {
    const input = {car, market, theme, family, format: 'spread', seed: 10, includeHistory: false, textFitVersion: 1};
    await expect(preflight('carousel', input, [0, 1, 2, 3, 4, 5])).resolves.toBeUndefined();
    const long = {...input, textOverrides: {interior: {section: 'Ш'.repeat(300)}}};
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(preflight('carousel', long, [0, 2])).rejects.toMatchObject({status: 422});
    }
  });
});
