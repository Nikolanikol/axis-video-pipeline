// Папка компании SMMAKER: адреса файлов и перенос старой раскладки data/ в неё.
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ROOT, useTempEnv} from '../helpers.mjs';

const run = promisify(execFile);
let env;
let store;

beforeAll(async () => {
  env = await useTempEnv();
  store = await import('../../server/store.mjs');
});
afterAll(() => env.cleanup());

describe('адреса файлов компании', () => {
  it('старые /data/<вид>/ переезжают в папку компании, с адресом сервера и без', () => {
    const {toWorkspaceUrl} = store;
    expect(toWorkspaceUrl('/data/lots/l1/photos/a.jpg')).toBe('/data/workspaces/k-axis/lots/l1/photos/a.jpg');
    expect(toWorkspaceUrl('http://127.0.0.1:3210/data/reviews/r1/proxy-1.mp4'))
      .toBe('http://127.0.0.1:3210/data/workspaces/k-axis/reviews/r1/proxy-1.mp4');
    expect(toWorkspaceUrl({a: ['/data/renders/x.mp4'], b: {c: '/data/brand/logo-1.png'}, n: 5}))
      .toEqual({a: ['/data/workspaces/k-axis/renders/x.mp4'], b: {c: '/data/workspaces/k-axis/brand/logo-1.png'}, n: 5});
  });

  it('встроенные файлы, уже перенесённые пути и чужое не трогаются', () => {
    const {toWorkspaceUrl} = store;
    for (const s of ['brand/logo-stacked.svg', '/data/workspaces/k-axis/lots/l1/a.jpg', '/data/tmp/x',
      'https://ci.encar.com/data/lots/1.jpg', 'текст /data/lots/ внутри']) {
      expect(toWorkspaceUrl(s)).toBe(s);
    }
    // Адрес этого сервера в контейнере — тоже наш
    expect(toWorkspaceUrl('http://0.0.0.0:3210/data/lots/a.jpg')).toBe('http://0.0.0.0:3210/data/workspaces/k-axis/lots/a.jpg');
  });

  it('фото лота получают адрес внутри папки компании', () => {
    expect(store.photoUrl('lot-1', 'a.jpg')).toBe('/data/workspaces/k-axis/lots/lot-1/photos/a.jpg');
    expect(store.LOTS_DIR).toBe(path.join(env.ws, 'lots'));
  });
});

describe('перенос старой раскладки', () => {
  const script = path.join(ROOT, 'tools', 'migrate-workspace.mjs');
  const migrate = (...args) => run(process.execPath, [script, ...args], {env: {...process.env, DATA_DIR: env.data}});

  beforeAll(async () => {
    const lot = path.join(env.data, 'lots', 'lot-1');
    await fs.mkdir(path.join(lot, 'photos'), {recursive: true});
    await fs.writeFile(path.join(lot, 'photos', 'a.jpg'), 'jpg');
    await fs.writeFile(path.join(lot, 'lot.json'), JSON.stringify({photos: ['/data/lots/lot-1/photos/a.jpg']}));
    await fs.mkdir(path.join(env.data, 'renders'), {recursive: true});
    await fs.writeFile(path.join(env.data, 'renders', 'j1.json'), JSON.stringify({
      video: '/data/renders/j1.mp4', inputProps: {lot: {photos: ['http://127.0.0.1:3210/data/lots/lot-1/photos/a.jpg']}},
    }));
    await fs.mkdir(path.join(env.data, 'tmp'), {recursive: true});
  });

  it('просмотр ничего не меняет', async () => {
    const {stdout} = await migrate();
    expect(stdout).toMatch(/data\/lots\/\s+→\s+workspaces\/k-axis\/lots\//);
    expect(stdout).toMatch(/пути внутри JSON: 3 в 2 файлах/);
    await expect(fs.access(path.join(env.data, 'lots', 'lot-1', 'lot.json'))).resolves.toBeUndefined();
    await expect(fs.access(env.ws)).rejects.toBeTruthy();
  });

  it('--apply переносит папки и переписывает пути; tmp остаётся общим', async () => {
    await migrate('--apply');
    const lot = JSON.parse(await fs.readFile(path.join(env.ws, 'lots', 'lot-1', 'lot.json'), 'utf8'));
    expect(lot.photos).toEqual(['/data/workspaces/k-axis/lots/lot-1/photos/a.jpg']);
    expect(await fs.readFile(path.join(env.ws, 'lots', 'lot-1', 'photos', 'a.jpg'), 'utf8')).toBe('jpg');
    const job = JSON.parse(await fs.readFile(path.join(env.ws, 'renders', 'j1.json'), 'utf8'));
    expect(job.video).toBe('/data/workspaces/k-axis/renders/j1.mp4');
    expect(job.inputProps.lot.photos[0]).toBe('http://127.0.0.1:3210/data/workspaces/k-axis/lots/lot-1/photos/a.jpg');
    await expect(fs.access(path.join(env.data, 'lots'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(env.data, 'tmp'))).resolves.toBeUndefined();
    expect(await store.legacyDataDirs()).toEqual([]);
  });

  it('повторный запуск — нечего переносить', async () => {
    expect((await migrate('--apply')).stdout).toMatch(/Переносить нечего/);
  });

  it('не сливает со старой раскладкой, если в папке компании уже есть данные', async () => {
    await fs.mkdir(path.join(env.data, 'lots', 'lot-2'), {recursive: true});
    await expect(migrate('--apply')).rejects.toMatchObject({stderr: expect.stringMatching(/уже не пустая/)});
    expect(await store.legacyDataDirs()).toEqual(['lots']);
  });
});
