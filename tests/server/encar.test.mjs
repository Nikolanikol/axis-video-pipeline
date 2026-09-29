// Лот по ссылке Encar: какие адреса фото сервер согласен скачать, и суточный курс ₩/$
import fs from 'node:fs/promises';
import path from 'node:path';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

let env;
let encar;
let rates;
beforeAll(async () => {
  env = await useTempEnv();
  encar = await import('../../server/encar.mjs');
  rates = await import('../../server/rates.mjs');
});
afterAll(() => env.cleanup());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); rates.resetRateCache(); });

describe('фото из объявления', () => {
  it('только с сервера картинок Encar — иначе через кнопку сервер ходил бы куда угодно', () => {
    const ok = 'https://ci.encar.com/carpicture09/pic4099/40990828_001.jpg?impolicy=heightRate&rh=1080';
    expect(encar.checkPhotoUrls([ok, ok])).toEqual([ok]);
    for (const bad of ['http://ci.encar.com/a.jpg', 'https://ci.encar.com.evil.io/a.jpg', 'http://127.0.0.1:3210/api/lots',
      'https://evil.io/?u=https://ci.encar.com/a.jpg', 'file:///etc/passwd']) {
      expect(() => encar.checkPhotoUrls([ok, bad]), bad).toThrow(/только фото из объявления Encar/);
    }
    expect(() => encar.checkPhotoUrls([])).toThrow(/хотя бы одно/);
    expect(() => encar.checkPhotoUrls(Array.from({length: 26}, (_, i) => `${ok}&n=${i}`))).toThrow(/не больше 25/);
  });

  it('негодная ссылка на объявление — понятный отказ 400, а не падение', async () => {
    await expect(encar.lookupCar('https://example.com/car/1')).rejects.toMatchObject({status: 400});
  });
});

describe('курс ₩/$', () => {
  const answer = (krw) => vi.fn(async () => ({ok: true, json: async () => ({rates: {KRW: krw}})}));

  it('берём раз в сутки: второй запрос в те же сутки не ходит к источнику', async () => {
    const fetch = answer(1391.527);
    vi.stubGlobal('fetch', fetch);
    const first = await rates.usdKrw();
    expect(first).toMatchObject({krwPerUsd: 1391.53, stale: false, source: 'open.er-api.com'});
    expect((await rates.usdKrw()).krwPerUsd).toBe(1391.53);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Перезапуск сервера (кэш в памяти пропал) — курс берётся из файла, без похода в сеть
    rates.resetRateCache();
    expect((await rates.usdKrw()).krwPerUsd).toBe(1391.53);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('через сутки — новый; источник молчит — последний известный с пометкой stale', async () => {
    const saved = JSON.parse(await fs.readFile(path.join(env.data, 'rates.json'), 'utf8'));
    vi.useFakeTimers({now: new Date(saved.fetchedAt).getTime() + 25 * 3600 * 1000, toFake: ['Date']});
    vi.stubGlobal('fetch', answer(1400));
    expect((await rates.usdKrw()).krwPerUsd).toBe(1400);

    vi.setSystemTime(Date.now() + 25 * 3600 * 1000);
    rates.resetRateCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('нет сети'); }));
    expect(await rates.usdKrw()).toMatchObject({krwPerUsd: 1400, stale: true});
  });

  it('мусор от источника не становится курсом: цена в ролике вышла бы в тысячи раз больше', async () => {
    await fs.rm(path.join(env.data, 'rates.json'), {force: true});
    vi.stubGlobal('fetch', answer(1));
    await expect(rates.usdKrw()).rejects.toMatchObject({status: 502});
  });
});
