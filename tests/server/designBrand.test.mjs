// Граница сохранения: превью и серверный рендер должны получать один и тот же выбор.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const env = await useTempEnv();
const {createApp} = await import('../../server/app.mjs');
let server;
let base;
beforeAll(async () => {
  server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); await env.cleanup(); });
const put = (brand) => fetch(`${base}/api/brand`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(brand)});

describe('сохранение дизайна бренда', () => {
  it('сохраняет дизайн и компоновку и возвращает их при следующем открытии', async () => {
    const {brand} = await fetch(`${base}/api/config`).then((r) => r.json());
    const next = {...brand, design: 'catalog', designVariant: 1};
    expect((await put(next)).status).toBe(200);
    const saved = await fs.readFile(path.join(env.config, 'brand.json'), 'utf8').then(JSON.parse);
    expect(saved.design).toBe('catalog');
    expect(saved.designVariant).toBe(1);
    const config = await fetch(`${base}/api/config`).then((r) => r.json());
    expect(config.brand.design).toBe('catalog');
    expect(config.brand.designVariant).toBe(1);
    expect(saved.assets).toEqual(brand.assets);
  });

  it('отклоняет произвольный дизайн и неправильную компоновку', async () => {
    const {brand} = await fetch(`${base}/api/config`).then((r) => r.json());
    expect((await put({...brand, design: 'other'})).status).toBe(400);
    for (const designVariant of [-1, 2, .5, '1']) expect((await put({...brand, designVariant})).status).toBe(400);
  });

  it('сохраняет движение роликов и отклоняет движение не из списка', async () => {
    const {brand} = await fetch(`${base}/api/config`).then((r) => r.json());
    expect((await put({...brand, textMotion: 'highlight', slideMotion: 'stack'})).status).toBe(200);
    const saved = await fs.readFile(path.join(env.config, 'brand.json'), 'utf8').then(JSON.parse);
    expect([saved.textMotion, saved.slideMotion]).toEqual(['highlight', 'stack']);
    expect((await put({...brand, textMotion: 'bounce'})).status).toBe(400);
    expect((await put({...brand, slideMotion: '<script>'})).status).toBe(400);
    expect((await put({...brand, plates: 'tiles', slideMotion: 'iris'})).status).toBe(200);
    expect((await put({...brand, plates: 'neon'})).status).toBe(400);
  });

  it('принимает прежний бренд без новых полей', async () => {
    const {brand} = await fetch(`${base}/api/config`).then((r) => r.json());
    const {design, designVariant, ...legacy} = brand;
    expect((await put(legacy)).status).toBe(200);
  });
});
