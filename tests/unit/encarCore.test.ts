// Ядро Encar (cores/encar) и граница KOK (server/encar.mjs).
//
// Главная проверка — «ничего не сдвинулось»: снимки ответов шлюза kmotors (tests/fixtures/encar,
// сняты 12.10 ДО переделки Encar в ядро) проходят ядро и переходник и должны выйти ровно тем,
// что пайплайны получали раньше, — самим ответом шлюза. Расхождение в любом поле — артефакт
// переделки. Остальное — коды ошибок по контракту (cores/CONTRACT.md, раздел 3).
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getCar as getCarJs, core} from '../../cores/encar/src/index.mjs';
import {parseCarId, parseCard} from '../../cores/encar/src/parse.mjs';
import {carFromEncar} from '../../src/shared/encarCar.js';
import {fetchEncarCar} from '../../server/encar.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCar = (ref: string, opts?: object): Promise<{data: any; warnings: any[]}> => getCarJs(ref, opts);
const FIXTURES = path.join(__dirname, '../fixtures/encar');
const ids = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
const fixture = (id: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), 'utf8'));
const quiet = {debug() {}, info() {}, warn() {}, error() {}, child() { return quiet; }};

type Reply = {status?: number; body?: string} | Error;
let replies: Reply[] = [];
let calls = 0;
const reply = (status: number, body: unknown) => ({status, body: typeof body === 'string' ? body : JSON.stringify(body)});

beforeEach(() => {
  calls = 0;
  replies = [];
  vi.stubEnv('KMOTORS_API_URL', 'http://gateway.test');
  vi.stubEnv('KMOTORS_API_SECRET', 'secret');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls++;
    const next = replies.length > 1 ? replies.shift()! : replies[0];
    if (next instanceof Error) throw next;
    // Без заготовки — снимок по номеру из адреса
    if (!next) {
      const id = String(url).match(/vehicle\/(\d+)/)?.[1] ?? '';
      return new Response(JSON.stringify(fixture(id)), {status: 200});
    }
    return new Response(next.body ?? '', {status: next.status ?? 200});
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('ядро Encar: снимки до переделки проходят без изменений', () => {
  it('снимков достаточно', () => expect(ids.length).toBeGreaterThanOrEqual(10));
  it.each(ids)('машина %s — та же карточка, без предупреждений', async (id) => {
    const {data, warnings} = await getCar(id, {log: quiet});
    expect(carFromEncar(data)).toEqual(fixture(id));
    expect(warnings).toEqual([]);
    // Поля контракта (раздел 4)
    expect(data).toMatchObject({source: 'encar', ref: id, mileageKm: fixture(id).mileageKm});
    expect(data.price).toMatchObject({amount: fixture(id).price.krw, currency: 'KRW'});
    expect(data.photos.length).toBeGreaterThan(0);
    expect(data.photos[0]).toMatchObject({category: 'exterior', angle: 'front', ad: true, source: 'listing'});
  });
  it('граница KOK отдаёт ту же карточку', async () => {
    expect(await fetchEncarCar(ids[0])).toEqual(fixture(ids[0]));
  });
  it('ссылка и голый номер — одна машина', async () => {
    const id = ids[0];
    for (const ref of [id, `https://fem.encar.com/cars/detail/${id}?pageid=x`, `https://www.encar.com/dc/dc_cardetailview.do?carid=${id}`]) {
      expect(parseCarId(ref)).toBe(id);
    }
    expect(core.contract).toBe(2);
  });
});

describe('ядро Encar: ошибки по контракту', () => {
  const codeOf = (p: Promise<unknown>) => p.then(() => 'OK', (e) => e.code);

  it('не ссылка Encar — BAD_INPUT, в шлюз не ходим', async () => {
    expect(await codeOf(getCar('https://example.com/car/1', {log: quiet}))).toBe('BAD_INPUT');
    expect(await codeOf(getCar('', {log: quiet}))).toBe('BAD_INPUT');
    expect(calls).toBe(0);
  });
  it('404 шлюза — NOT_FOUND без повторов', async () => {
    replies = [reply(404, {error: 'Машина не найдена'})];
    expect(await codeOf(getCar('99999999', {log: quiet}))).toBe('NOT_FOUND');
    expect(calls).toBe(1);
  });
  it('пустая страница 200 (завис kmotors) — UPSTREAM_BAD_RESPONSE, а не «Unexpected end of JSON input»', async () => {
    replies = [reply(200, '')];
    const e = await getCar('41630924', {log: quiet}).catch((x: unknown) => x);
    expect(e).toMatchObject({code: 'UPSTREAM_BAD_RESPONSE'});
    expect((e as Error).message).not.toMatch(/JSON/);
  });
  it('сеть упала — три попытки, потом UPSTREAM_UNAVAILABLE', async () => {
    replies = [Object.assign(new TypeError('fetch failed'), {cause: {code: 'ECONNREFUSED'}})];
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('UPSTREAM_UNAVAILABLE');
    expect(calls).toBe(3);
  });
  it('обрыв, потом ответ — машина приходит со второй попытки', async () => {
    const id = ids[0];
    replies = [new TypeError('fetch failed'), reply(200, fixture(id))];
    expect(carFromEncar((await getCar(id, {log: quiet})).data)).toEqual(fixture(id));
    expect(calls).toBe(2);
  });
  it('5xx шлюза — UPSTREAM_UNAVAILABLE; 401 — UPSTREAM_BLOCKED; 429 — RATE_LIMITED', async () => {
    replies = [reply(502, {error: 'Encar timeout'})];
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('UPSTREAM_UNAVAILABLE');
    replies = [reply(401, {error: 'bad secret'})];
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('UPSTREAM_BLOCKED');
    replies = [reply(429, {})];
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('RATE_LIMITED');
  });
  it('шлюз не настроен — INTERNAL; граница не показывает клиенту имена переменных', async () => {
    vi.stubEnv('KMOTORS_API_SECRET', '');
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('INTERNAL');
    const e = await fetchEncarCar('41630924').catch((x: unknown) => x);
    expect(e).toMatchObject({status: 502});
    expect((e as Error).message).not.toMatch(/KMOTORS/);
  });
  it('карточка без марки и модели — UPSTREAM_BAD_RESPONSE', async () => {
    replies = [reply(200, {id: '41630924', brand: '', model: ''})];
    expect(await codeOf(getCar('41630924', {log: quiet}))).toBe('UPSTREAM_BAD_RESPONSE');
  });
  it('номер машины отличается от номера объявления — это норма Encar, номер не трогаем', async () => {
    // 42653673 — объявление, 42653400 — машина (фото лежат под ним); карусели всегда получали второй
    const {data} = await getCar('42653673', {log: quiet});
    expect(data.card.id).toBe('42653400');
    expect(data.ref).toBe('42653673');
  });
  it('битые части — карточка с предупреждениями, а не TypeError в вёрстке', () => {
    const raw = {...fixture(ids[0]), options: null, photos: 'нет', history: {claims: 'x'}, price: {krw: '1'}, mileageKm: '12 км'};
    const {card, warnings} = parseCard(raw, ids[0]);
    expect(card.options).toEqual({comfort: [], safety: [], other: [], total: 0});
    expect(card.photos.exterior).toEqual([]);
    expect(card.history).toBeNull();
    expect(card.price).toBeNull();
    expect(card.mileageKm).toBeNull();
    expect(warnings.map((w: {part: string}) => w.part).sort()).toEqual(['card', 'history', 'options', 'photos', 'price']);
  });
  it('исключение внутри ядра — INTERNAL, наружу только CoreError', async () => {
    replies = [reply(200, {get brand() { return 'x'; }})];
    // Геттер не переживёт JSON — подсовываем ответ, на котором разбор споткнётся иначе
    vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, status: 200, text: async () => { throw new RangeError('boom'); }})));
    const e = await getCar('41630924', {log: quiet}).catch((x: unknown) => x);
    expect((e as {name: string}).name).toBe('CoreError');
  });
});
