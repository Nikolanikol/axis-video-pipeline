// Логотип: приём любого разумного файла и приведение к виду для тёмного слайда.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const env = await useTempEnv();
const {processLogo} = await import('../../server/brand.mjs');
const {createApp} = await import('../../server/app.mjs');

// Логотип на фоне: медный квадрат с белым «окном» внутри, по центру большого поля
const logoOn = (bg, {size = 800, format = 'jpeg'} = {}) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="${size * 0.3}" y="${size * 0.35}" width="${size * 0.4}" height="${size * 0.3}" fill="#b8734a"/>
    <rect x="${size * 0.42}" y="${size * 0.44}" width="${size * 0.16}" height="${size * 0.12}" fill="${bg}"/>
  </svg>`;
  return sharp(Buffer.from(svg))[format]().toBuffer();
};
const pixel = async (png, x, y) => {
  const {data, info} = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const i = (Math.round(y * (info.height - 1)) * info.width + Math.round(x * (info.width - 1))) * 4;
  return [...data.slice(i, i + 4)];
};

describe('обработка логотипа', () => {
  it('JPG на белом: фон убран, поля обрезаны, «окно» внутри не тронуто', async () => {
    const r = await processLogo(await logoOn('#ffffff'));
    expect(r.notes).toEqual(expect.arrayContaining(['фон убран', 'пустые поля обрезаны']));
    // Обрезан до логотипа с полем 3%: было 800, логотип 320
    expect(r.width).toBeLessThan(360);
    expect((await pixel(r.clean, 0, 0))[3]).toBe(0);
    expect((await pixel(r.clean, 0.5, 0.2))[3]).toBe(255);   // медь
    // Белое окно внутри отделено медью от края — заливка до него не дошла
    const inner = await pixel(r.clean, 0.5, 0.5);
    expect(inner[3]).toBe(255);
    expect(inner[0]).toBeGreaterThan(240);
    expect(r.raw).toBeTruthy();   // вариант «как было» сохранён
  });

  it('SVG с чёрным фоном — в PNG, фон убран', async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
      <rect width="100%" height="100%" fill="#000"/><circle cx="150" cy="150" r="80" fill="#e19a6b"/></svg>`);
    const r = await processLogo(svg);
    expect(r.notes).toContain('SVG переведён в PNG');
    expect((await sharp(r.clean).metadata()).format).toBe('png');
    // Вектор рисуем крупно, а не в исходные 300 точек
    expect(r.width).toBeGreaterThan(1000);
    expect((await pixel(r.clean, 0.02, 0.02))[3]).toBe(0);
  });

  it('прозрачный PNG оставляем как есть: фон не трогаем, варианта «как было» нет', async () => {
    const png = await sharp({create: {width: 600, height: 400, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
      .composite([{input: await sharp({create: {width: 300, height: 200, channels: 4, background: '#e19a6b'}}).png().toBuffer(), left: 150, top: 100}])
      .png().toBuffer();
    const r = await processLogo(png);
    expect(r.notes).not.toContain('фон убран');
    expect(r.raw).toBeNull();
  });

  it('большой уменьшается, а не отклоняется', async () => {
    const r = await processLogo(await logoOn('#ffffff', {size: 3200}));
    expect(r.notes.some((n) => n.startsWith('уменьшен с 3200×3200'))).toBe(true);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(2000);
  });

  it('фото или текстура — отказ с объяснением', async () => {
    const noise = Buffer.alloc(600 * 600 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 256;
    const jpg = await sharp(noise, {raw: {width: 600, height: 600, channels: 3}}).jpeg().toBuffer();
    await expect(processLogo(jpg)).rejects.toMatchObject({status: 400, message: expect.stringMatching(/неоднородный/)});
  });

  it('белое на белом — отказ: после удаления фона пусто', async () => {
    const white = await sharp({create: {width: 600, height: 600, channels: 3, background: '#fff'}}).png().toBuffer();
    await expect(processLogo(white)).rejects.toMatchObject({message: expect.stringMatching(/ничего не осталось/)});
  });

  it('мелкий — отказ: растянутый будет мыльным', async () => {
    await expect(processLogo(await logoOn('#ffffff', {size: 200}))).rejects.toMatchObject({message: expect.stringMatching(/мелкий/)});
  });

  it('тёмная часть на тёмном слайде — предупреждение, а не отказ', async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
      <rect width="100%" height="100%" fill="#fff"/><rect x="100" y="100" width="250" height="200" fill="#b8734a"/>
      <rect x="450" y="100" width="250" height="200" fill="#111"/></svg>`);
    const r = await processLogo(svg);
    expect(r.warnings.join()).toMatch(/часть логотипа тёмная/);
  });

  it('не картинка — отказ', async () => {
    await expect(processLogo(Buffer.from('%PDF-1.4 не логотип'))).rejects.toMatchObject({status: 400});
  });
});

describe('логотип через API', () => {
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
  const upload = async (buf, name = 'logo.jpg', type = 'image/jpeg') => {
    const form = new FormData();
    form.append('logo', new Blob([buf], {type}), name);
    const res = await fetch(`${base}/api/brand/logo`, {method: 'POST', body: form});
    return {status: res.status, body: await res.json()};
  };
  const variant = async (v) => (await fetch(`${base}/api/brand/logo/variant`, {
    method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({variant: v}),
  })).json();
  const brandFiles = () => fs.readdir(path.join(env.ws, 'brand'));

  it('загрузка ставит логотип во все места и хранит оба варианта', async () => {
    const {status, body} = await upload(await logoOn('#ffffff'));
    expect(status).toBe(200);
    expect(body.hasRaw).toBe(true);
    expect(body.brand.assets.logoStacked).toBe(body.url);
    expect(body.brand.assets.logoHorizontal).toBe(body.url);
    expect(body.brand.assets.sign).toBe(body.url);
    expect(await brandFiles()).toHaveLength(2);
  });

  it('переключение: как было → фон убран → без логотипа', async () => {
    const raw = await variant('raw');
    expect(raw.url).toMatch(/-raw\.png$/);
    expect(raw.brand.assets.logoStacked).toBe(raw.url);
    const clean = await variant('clean');
    expect(clean.url).toMatch(/logo-[a-z0-9]+\.png$/);
    const none = await variant('none');
    expect(none.brand.assets.logoStacked).toBe('');
    // Без логотипа переключать фон не у чего
    expect((await variant('raw')).error).toMatch(/Сначала загрузите/);
  });

  it('новая загрузка убирает прежние файлы', async () => {
    await upload(await logoOn('#000000', {format: 'png'}), 'logo.png', 'image/png');
    const files = await brandFiles();
    expect(files).toHaveLength(2);
    expect(new Set(files.map((f) => f.match(/^logo-([a-z0-9]+)/)[1])).size).toBe(1);
  });

  it('отказ — понятным текстом', async () => {
    const {status, body} = await upload(Buffer.from('не картинка'), 'x.png', 'image/png');
    expect(status).toBe(400);
    expect(body.error).toMatch(/не картинка/);
  });
});
