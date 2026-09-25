// API сервера на временных папках данных и настроек. Настоящий рендер здесь не запускается.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const env = await useTempEnv();
const {createApp} = await import('../../server/app.mjs');

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

const call = async (method, url, body) => {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    headers: body && !isForm ? {'Content-Type': 'application/json'} : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  return {status: res.status, body: await res.json().catch(() => null)};
};

const image = (width, height, format = 'png') =>
  sharp({create: {width, height, channels: 3, background: {r: 120, g: 80, b: 40}}})[format]().toBuffer();

const upload = async (lotId, files) => {
  const form = new FormData();
  for (const [name, buf, type] of files) form.append('photos', new Blob([buf], {type}), name);
  return call('POST', `/api/lots/${lotId}/photos`, form);
};

const fileOf = (lotId, url) => path.join(env.data, 'lots', lotId, 'photos', url.split('/photos/')[1]);
const exists = (f) => fs.access(f).then(() => true, () => false);

describe('настройки', () => {
  it('отдаёт бренд, рынки и форматы', async () => {
    const {status, body} = await call('GET', '/api/config');
    expect(status).toBe(200);
    expect(body.markets.map((m) => m.id)).toContain('mk');
    expect(body.formats.map((f) => f.id)).toContain('price-ad');
    expect(body.pipelines.map((p) => p.id)).toEqual(expect.arrayContaining(['ads', 'reviews', 'settings']));
    expect(body.brand.bg).toMatch(/^#/);
  });

  it('сохраняет рынок во временную папку настроек, а не в проект', async () => {
    const {body: cfg} = await call('GET', '/api/config');
    const {id, ...mk} = cfg.markets.find((m) => m.id === 'mk');
    const {status} = await call('PUT', '/api/markets/test', {...mk, name: 'Тестовый рынок'});
    expect(status).toBe(200);
    const saved = JSON.parse(await fs.readFile(path.join(env.config, 'markets', 'test.json'), 'utf8'));
    expect(saved.name).toBe('Тестовый рынок');
  });

  it('отклоняет кривые id', async () => {
    expect((await call('PUT', '/api/markets/..%2Fhack', {})).status).toBe(400);
    expect((await call('GET', '/api/lots/..%2F..%2Fetc')).status).toBe(400);
  });

  it('отдаёт профили клиента и дефолты текстов', async () => {
    const {body} = await call('GET', '/api/config');
    expect(body.profiles.map((p) => p.id)).toContain('default');
    expect(body.defaultProfile).toBe('default');
    // copy — дефолты текстов по режиму: и export, и domestic
    expect(body.copy.export).toBeTruthy();
    expect(body.copy.domestic).toBeTruthy();
  });

  it('сохраняет профиль во временную папку настроек', async () => {
    const {body: cfg} = await call('GET', '/api/config');
    const {id, ...profile} = cfg.profiles.find((p) => p.id === 'default');
    const {status} = await call('PUT', '/api/profiles/test', {...profile, company: 'Тестовая компания'});
    expect(status).toBe(200);
    const saved = JSON.parse(await fs.readFile(path.join(env.config, 'profiles', 'test.json'), 'utf8'));
    expect(saved.company).toBe('Тестовая компания');
  });
});

describe('лоты', () => {
  it('два лота, созданные подряд, не затирают друг друга', async () => {
    const [a, b] = await Promise.all([call('POST', '/api/lots', {}), call('POST', '/api/lots', {})]);
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.market).toBe('mk');
  });

  it('сохраняет поля формы, но фото и размытие меняются только своими запросами', async () => {
    const {body: lot} = await call('POST', '/api/lots', {});
    const {body: saved} = await call('PUT', `/api/lots/${lot.id}`, {
      ...lot, brand: 'Audi', format: 'price-ad', photos: ['/etc/passwd'], blur: {x: [[0, 0, 1, 1]]},
    });
    expect(saved.brand).toBe('Audi');
    expect(saved.format).toBe('price-ad');
    expect(saved.photos).toEqual([]);
    expect(saved.blur).toBeUndefined();
  });
});

describe('фото', () => {
  let lot;
  beforeAll(async () => {
    ({body: lot} = await call('POST', '/api/lots', {}));
  });

  it('загрузка: рабочая копия 1080 по ширине + оригинал', async () => {
    const {status, body} = await upload(lot.id, [
      ['portrait.jpg', await image(1536, 2048, 'jpeg'), 'image/jpeg'],
      ['landscape.png', await image(1600, 1200), 'image/png'],
    ]);
    expect(status).toBe(200);
    expect(body.photos).toHaveLength(2);
    for (const url of body.photos) {
      const meta = await sharp(fileOf(lot.id, url)).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.format).toBe('jpeg');
    }
    const [p] = body.photos;
    const stem = p.split('/').pop().replace('.jpg', '');
    expect(await exists(path.join(env.data, 'lots', lot.id, 'photos', 'src', `${stem}.jpg`))).toBe(true);
    lot = body;
  });

  it('битый файл — понятная ошибка', async () => {
    const {status, body} = await upload(lot.id, [['broken.jpg', Buffer.from('не картинка'), 'image/jpeg']]);
    expect(status).toBe(400);
    expect(body.error).toContain('broken.jpg');
  });

  it('перестановка принимается, только если это те же фото', async () => {
    const reversed = [...lot.photos].reverse();
    const {body: moved} = await call('PUT', `/api/lots/${lot.id}`, {...lot, photos: reversed});
    expect(moved.photos).toEqual(reversed);
    const {body: kept} = await call('PUT', `/api/lots/${lot.id}`, {...moved, photos: [reversed[0]]});
    expect(kept.photos).toEqual(reversed);
    lot = kept;
  });

  it('размытие: новая версия файла, старая удаляется, области сохраняются и чистятся', async () => {
    const url = lot.photos[0];
    const info = await call('GET', `/api/lots/${lot.id}/photo?path=${encodeURIComponent(url)}`);
    expect(info.body.source).toContain('/photos/src/');
    expect(info.body.regions).toEqual([]);

    const {status, body} = await call('PUT', `/api/lots/${lot.id}/photo`, {
      path: url,
      regions: [[0.1, 0.2, 0.3, 0.1], [-1, 0.5, 5, 0.1], [0, 0, 0, 0.5], ['x', 0, 1, 1], [0.1, 0.1]],
    });
    expect(status).toBe(200);
    const next = body.photos[0];
    expect(next).not.toBe(url);
    expect(next).toMatch(/~\d+\.jpg$/);
    expect(await exists(fileOf(lot.id, next))).toBe(true);
    expect(await exists(fileOf(lot.id, url))).toBe(false);
    const stem = next.split('/').pop().replace(/~\d+\.jpg$/, '');
    expect(body.blur[stem]).toEqual([[0.1, 0.2, 0.3, 0.1], [0, 0.5, 1, 0.1]]);
    lot = body;
  });

  it('автосохранение формы не затирает размытие', async () => {
    const {body} = await call('PUT', `/api/lots/${lot.id}`, {...lot, blur: {}, model: 'A6'});
    expect(body.model).toBe('A6');
    expect(body.blur).toEqual(lot.blur);
  });

  it('чужие пути в запросах фото отклоняются', async () => {
    expect((await call('PUT', `/api/lots/${lot.id}/photo`, {path: '/data/lots/other/photos/x.jpg', regions: []})).status).toBe(404);
    expect((await call('DELETE', `/api/lots/${lot.id}/photos?path=${encodeURIComponent('../../package.json')}`)).status).toBe(404);
  });

  it('удаление убирает файл, оригинал и области', async () => {
    const url = lot.photos[0];
    const stem = url.split('/').pop().replace(/~\d+\.jpg$/, '');
    const {body} = await call('DELETE', `/api/lots/${lot.id}/photos?path=${encodeURIComponent(url)}`);
    expect(body.photos).not.toContain(url);
    expect(body.blur?.[stem]).toBeUndefined();
    expect(await exists(fileOf(lot.id, url))).toBe(false);
    expect(await exists(path.join(env.data, 'lots', lot.id, 'photos', 'src', `${stem}.jpg`))).toBe(false);
  });
});

describe('рендер (только проверки перед запуском)', () => {
  it('неизвестный формат — 400', async () => {
    const {body: lot} = await call('POST', '/api/lots', {});
    const {status, body} = await call('POST', `/api/lots/${lot.id}/render`, {format: 'no-such-format'});
    expect(status).toBe(400);
    expect(body.error).toContain('no-such-format');
  });

  it('без фото — 400', async () => {
    const {body: lot} = await call('POST', '/api/lots', {});
    const {status, body} = await call('POST', `/api/lots/${lot.id}/render`, {format: 'price-ad'});
    expect(status).toBe(400);
    expect(body.error).toContain('фото');
  });

  it('история пустого лота — пустой список', async () => {
    const {body: lot} = await call('POST', '/api/lots', {});
    expect((await call('GET', `/api/renders?lot=${lot.id}`)).body).toEqual([]);
  });
});
