// Своя иконка преимущества в CTA: та же обработка, что у логотипа, свой файл бренда.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const env = await useTempEnv();
const {DEFAULT_ICON} = await import('../../server/brand.mjs');
const {createApp} = await import('../../server/app.mjs');

// Медная «иконка» на ровном фоне — как присылают из Canva или брендбука
const iconOn = (bg, size = 300) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${bg}"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.3}" fill="#b8734a"/></svg>`)).png().toBuffer();

describe('своя иконка через API', () => {
  let server;
  let base;
  beforeAll(async () => {
    server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await env.cleanup();
  });
  const upload = async (buf) => {
    const form = new FormData();
    form.append('icon', new Blob([buf], {type: 'image/png'}), 'icon.png');
    const res = await fetch(`${base}/api/brand/icon`, {method: 'POST', body: form});
    return {status: res.status, body: await res.json()};
  };
  const variant = async (v) => (await fetch(`${base}/api/brand/icon/variant`, {
    method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({variant: v}),
  })).json();
  const iconFiles = async () => (await fs.readdir(path.join(env.ws, 'brand')).catch(() => [])).filter((f) => f.startsWith('icon-'));

  it('загрузка: фон убран, иконка встала в бренд, логотип не тронут', async () => {
    const before = (await (await fetch(`${base}/api/config`)).json()).brand.assets.logoStacked;
    const {status, body} = await upload(await iconOn('#ffffff'));
    expect(status).toBe(200);
    expect(body.notes).toContain('фон убран');
    expect(body.hasRaw).toBe(true);
    expect(body.brand.assets.iconHandshake).toBe(body.url);
    expect(body.brand.assets.logoStacked).toBe(before);
    expect(await iconFiles()).toHaveLength(2);
  });

  it('варианты: как была → фон убран → стандартная; свой файл при этом удаляется', async () => {
    expect((await variant('raw')).url).toMatch(/icon-[a-z0-9]+-raw\.png$/);
    expect((await variant('clean')).url).toMatch(/icon-[a-z0-9]+\.png$/);
    const def = await variant('default');
    expect(def.brand.assets.iconHandshake).toBe(DEFAULT_ICON);
    expect(await iconFiles()).toHaveLength(0);
    expect((await variant('raw')).error).toMatch(/Сначала загрузите иконку/);
  });

  it('мелкая — отказ про иконку, а не про логотип', async () => {
    const {status, body} = await upload(await iconOn('#ffffff', 40));
    expect(status).toBe(400);
    expect(body.error).toMatch(/иконка/);
  });
});
