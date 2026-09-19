// Размытие фото: меняет только выбранную область (плюс мягкий край), номер становится нечитаемым
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {buildPhoto, ownFile, stemOf} from '../../server/photos.mjs';

const W = 1080, H = 1440;
let dir;
let source;

// Шахматка 8×8 px — максимально «резкая» картинка
const checkerboard = () => {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = ((x >> 3) + (y >> 3)) % 2 ? 230 : 25;
      raw.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
  }
  return sharp(raw, {raw: {width: W, height: H, channels: 3}}).png().toBuffer();
};

// stats() считает по исходнику и игнорирует extract — поэтому сначала вырезаем в буфер
const regionStdev = async (file, left, top, width, height) => {
  const crop = await sharp(file).extract({left, top, width, height}).png().toBuffer();
  const {channels} = await sharp(crop).stats();
  return channels[0].stdev;
};

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axis-photos-'));
  source = path.join(dir, 'src.png');
  await fs.writeFile(source, await checkerboard());
});
afterAll(() => fs.rm(dir, {recursive: true, force: true}));

describe('размытие', () => {
  it('область размыта, остальное фото не тронуто', async () => {
    const out = path.join(dir, 'out.jpg');
    // x 0.1–0.4, y 0.5–0.6 → 108..432 × 720..864
    await buildPhoto(source, [[0.1, 0.5, 0.3, 0.1]], out);
    const inside = await regionStdev(out, 160, 750, 200, 80);
    const outside = await regionStdev(out, 600, 100, 300, 300);
    const original = await regionStdev(source, 600, 100, 300, 300);
    expect(inside).toBeLessThan(original * 0.15);
    expect(outside).toBeGreaterThan(original * 0.9);
  });

  it('мягкий край: у границы размытие частичное, а не резкий обрыв', async () => {
    const out = path.join(dir, 'edge.jpg');
    await buildPhoto(source, [[0.1, 0.5, 0.3, 0.1]], out);
    const inner = await regionStdev(out, 200, 780, 100, 20);
    const edge = await regionStdev(out, 200, 700, 100, 12);   // полоса чуть выше области
    const far = await regionStdev(out, 200, 600, 100, 20);
    expect(edge).toBeGreaterThan(inner);
    expect(edge).toBeLessThan(far);
  });

  it('без областей — просто уменьшенная копия шириной 1080', async () => {
    const big = path.join(dir, 'big.png');
    await sharp({create: {width: 2160, height: 2880, channels: 3, background: '#445566'}}).png().toFile(big);
    const out = path.join(dir, 'plain.jpg');
    await buildPhoto(big, [], out);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1440]);
  });

  it('область у края кадра не ломает сборку', async () => {
    const out = path.join(dir, 'corner.jpg');
    await buildPhoto(source, [[0, 0, 0.05, 0.05], [0.97, 0.97, 0.03, 0.03], [1, 1, 0.1, 0.1]], out);
    expect((await sharp(out).metadata()).width).toBe(1080);
  });
});

describe('имена файлов фото', () => {
  it('свои файлы лота узнаются, чужие — нет', () => {
    expect(ownFile('lot-1', '/data/lots/lot-1/photos/123-ab.jpg')).toBe('123-ab.jpg');
    expect(ownFile('lot-1', '/data/lots/lot-1/photos/123-ab~456.jpg')).toBe('123-ab~456.jpg');
    expect(ownFile('lot-1', '/data/lots/lot-2/photos/123.jpg')).toBeNull();
    expect(ownFile('lot-1', '/data/lots/lot-1/photos/../../x.jpg')).toBeNull();
    expect(ownFile('lot-1', '/data/lots/lot-1/photos/src/123.jpg')).toBeNull();
    expect(ownFile('lot-1', 'lots/audi/front.jpg')).toBeNull();
  });

  it('версия отрезается от «ствола» имени', () => {
    expect(stemOf('front~1789641882312.jpg')).toBe('front');
    expect(stemOf('front.jpg')).toBe('front');
  });
});
