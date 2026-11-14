// Запасной маршрут ядра Encar — encar-api.com (cores/encar/src/encarApi.mjs, 15.11).
//
// Сеть подменена: адрес шлюза и адрес encar-api отвечают заготовками. Снимок encar-api —
// tests/fixtures/encar-api/40303537.json (Ford F-150, снят 14.11, VIN обезличен), снимок шлюза для
// той же машины — tests/fixtures/encar/40303537.json (12.10).
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getCar as getCarJs} from '../../cores/encar/src/index.mjs';
import {cardFromEncarApi, resetEncarApiCache, STORAGE_FEE_KRW} from '../../cores/encar/src/encarApi.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCar = (ref: string, opts?: object): Promise<{data: any; warnings: any[]}> => getCarJs(ref, opts);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures', p), 'utf8'));
const API_FORD = read('encar-api/40303537.json');
const GATEWAY_FORD = read('encar/40303537.json');

type Reply = {status: number; body: unknown} | Error;
let gateway: Reply;
let api: Reply;
let hits: {gateway: number; api: number};
const errors: object[] = [];
const log = {debug() {}, info() {}, warn() {}, error: (event: string, f: object) => errors.push({event, ...f}), child() { return log; }};
const json = (status: number, body: unknown) => ({status, body});
const respond = (r: Reply) => {
  if (r instanceof Error) throw r;
  return new Response(JSON.stringify(r.body), {status: r.status, headers: {'x-ratelimit-remaining': '42'}});
};

beforeEach(() => {
  hits = {gateway: 0, api: 0};
  errors.length = 0;
  resetEncarApiCache();
  gateway = json(200, GATEWAY_FORD);
  api = json(200, API_FORD);
  vi.stubEnv('KMOTORS_API_URL', 'http://gateway.test');
  vi.stubEnv('KMOTORS_API_SECRET', 'secret');
  vi.stubEnv('ENCAR_API_KEY', 'test-key');
  vi.stubEnv('ENCAR_API_BASE', 'http://encar-api.test/api');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: {headers?: Record<string, string>}) => {
    if (String(url).startsWith('http://encar-api.test')) {
      hits.api++;
      expect(init?.headers?.['x-api-key']).toBe('test-key');
      return respond(api);
    }
    hits.gateway++;
    return respond(gateway);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('карточка encar-api совпадает со шлюзовой', () => {
  it('Ford 40303537: все поля как у шлюза, кроме цены (снизилась 18.10) и номерного знака', () => {
    const card = cardFromEncarApi(API_FORD, '40303537');
    const {price, plate, ...rest} = card;
    const {price: gwPrice, plate: gwPlate, ...gwRest} = GATEWAY_FORD;
    expect(rest).toEqual(gwRest);
    expect(plate).toBeNull();
    expect(gwPlate).toBeTruthy();
    // Та же формула, что у шлюза: 만원 × 10 000 + стояночный сбор kmotors. У шлюза 12.10 цена была 4300
    expect(price).toEqual({krw: API_FORD.Price * 10_000 + STORAGE_FEE_KRW, usd: null, krwToUsd: null, quotedAt: null, rateSource: 'encar-api'});
    expect(gwPrice.krw).toBe(4300 * 10_000 + STORAGE_FEE_KRW);
  });
  it('номер машины — из пути фото, как card.id у шлюза для перевыставленных объявлений', () => {
    const relisted = {...API_FORD, Id: '40399999'};
    expect(cardFromEncarApi(relisted, '40399999').id).toBe('40303537');
  });
  it('незнакомая кузовщина не переводится — как у шлюза', () => {
    expect(cardFromEncarApi(API_FORD, '40303537').body).toBe('');
    expect(cardFromEncarApi({...API_FORD, en: {...API_FORD.en, body: 'Sedan'}}, '40303537').body).toBe('Sedan');
  });
});

describe('маршрутизация', () => {
  it('шлюз в порядке — encar-api не трогаем', async () => {
    const {data} = await getCar('40303537', {log});
    expect(data.route).toBe('gateway');
    expect(hits.api).toBe(0);
    expect(errors).toEqual([]);
  });
  it('шлюз недоступен — машина с encar-api и тревога gateway.failed', async () => {
    gateway = Object.assign(new TypeError('fetch failed'), {cause: {code: 'ECONNREFUSED'}});
    const {data, warnings} = await getCar('40303537', {log});
    expect(data.route).toBe('encar-api');
    expect(data.card.brand).toBe('Ford');
    expect(data.card.options.total).toBe(29);
    expect(warnings).toEqual([]);
    expect(errors).toMatchObject([{event: 'gateway.failed', code: 'UPSTREAM_UNAVAILABLE', left: 42}]);
  });
  it('шлюз «не найдена», а машина жива (блокировка 13.11) — машина с encar-api', async () => {
    gateway = json(404, {error: 'Машина не найдена'});
    const {data} = await getCar('40303537', {log});
    expect(data.route).toBe('encar-api');
    expect(errors).toMatchObject([{event: 'gateway.failed', code: 'NOT_FOUND'}]);
  });
  it('оба «не найдена» — NOT_FOUND без тревоги', async () => {
    gateway = json(404, {error: 'Машина не найдена'});
    api = json(404, {code: 'SOLD_OR_REMOVED'});
    await expect(getCar('42001008', {log})).rejects.toMatchObject({code: 'NOT_FOUND'});
    expect(errors).toEqual([]);
  });
  it('encar-api не выручил (лимит) — клиенту ошибка шлюза', async () => {
    gateway = json(502, {error: 'Encar 503'});
    api = json(429, {error: 'limit'});
    await expect(getCar('40303537', {log})).rejects.toMatchObject({code: 'UPSTREAM_UNAVAILABLE'});
  });
  it('кривая ссылка — ни шлюза, ни encar-api', async () => {
    await expect(getCar('https://example.com/x', {log})).rejects.toMatchObject({code: 'BAD_INPUT'});
    expect(hits).toEqual({gateway: 0, api: 0});
  });
  it('без ENCAR_API_KEY — как раньше: «не найдена» шлюза уходит клиенту', async () => {
    vi.stubEnv('ENCAR_API_KEY', '');
    gateway = json(404, {error: 'Машина не найдена'});
    await expect(getCar('40303537', {log})).rejects.toMatchObject({code: 'NOT_FOUND'});
    expect(hits.api).toBe(0);
  });
  it('повтор той же машины в течение 10 минут — из кэша, лимит не тратим', async () => {
    gateway = json(404, {error: 'Машина не найдена'});
    await getCar('40303537', {log});
    await getCar('40303537', {log});
    expect(hits.api).toBe(1);
  });
});
