// Загрузка страницы лота: исходы сети, заголовки Cloudflare Access, кеш, образцы вместо сети
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {_reset, fetchLot} from '../../server/kmotorsLot.mjs';

const FIX = path.resolve(__dirname, '../fixtures/kmotors-lots');
const html = (house: string) => zlib.gunzipSync(fs.readFileSync(path.join(FIX, `${house}.html.gz`))).toString('utf8');
const lot = {house: 'heydealer', id: 'lG27P8RQ'};
const ok = (body: string) => new Response(body, {status: 200});
const fakeFetch = (res: Response | (() => Response)) => vi.fn(async () => (typeof res === 'function' ? res() : res)) as unknown as typeof fetch;

const ENV = ['KMOTORS_LOT_ORIGIN', 'KMOTORS_LOT_FIXTURES', 'KMOTORS_CF_ACCESS_ID', 'KMOTORS_CF_ACCESS_SECRET'];
beforeEach(() => { _reset(); for (const k of ENV) delete process.env[k]; });
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe('загрузка страницы лота', () => {
  it('открывает страницу по адресу площадки и лота и разбирает её', async () => {
    const f = fakeFetch(ok(html('heydealer')));
    const l = await fetchLot(lot, {fetchImpl: f});
    expect(l).toMatchObject({make: 'BMW', year: 2025, mileageKm: 15892});
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe('https://www.kmotors.shop/en/auction/lot/heydealer/lG27P8RQ');
    expect(init.headers['User-Agent']).toMatch(/Chrome/);
    expect(init.headers['CF-Access-Client-Id']).toBeUndefined(); // без токена заголовков Access нет
    expect(init.redirect).toBe('manual');
  });

  it('номер лота с «~» и «+» кодируется в адресе', async () => {
    const f = fakeFetch(ok(html('lotte')));
    await fetchLot({house: 'lotte', id: 'AS~AS202609070008~4'}, {fetchImpl: f});
    expect((f as any).mock.calls[0][0]).toBe('https://www.kmotors.shop/en/auction/lot/lotte/AS~AS202609070008~4');
    const g = fakeFetch(ok('x'));
    await fetchLot({house: 'glovis', id: 'a+b/c=='}, {fetchImpl: g}).catch(() => null);
    expect((g as any).mock.calls[0][0]).toContain('a%2Bb%2Fc%3D%3D');
  });

  it('служебный сайт: адрес из KMOTORS_LOT_ORIGIN, сервисный токен — заголовками', async () => {
    process.env.KMOTORS_LOT_ORIGIN = 'https://office.kmotors.shop/';
    process.env.KMOTORS_CF_ACCESS_ID = 'id.access';
    process.env.KMOTORS_CF_ACCESS_SECRET = 'sekret';
    const f = fakeFetch(ok(html('heydealer')));
    await fetchLot(lot, {fetchImpl: f});
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe('https://office.kmotors.shop/en/auction/lot/heydealer/lG27P8RQ');
    expect(init.headers['CF-Access-Client-Id']).toBe('id.access');
    expect(init.headers['CF-Access-Client-Secret']).toBe('sekret');
  });

  it('вход Cloudflare Access: говорит, что нужен токен, а не «ошибка сети»', async () => {
    process.env.KMOTORS_LOT_ORIGIN = 'https://office.kmotors.shop';
    const redirect = () => new Response('', {status: 302, headers: {location: 'https://x.cloudflareaccess.com/cdn-cgi/access/login/office.kmotors.shop'}});
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(redirect)})).rejects.toThrow(/сервисный токен/);
    _reset();
    process.env.KMOTORS_CF_ACCESS_ID = 'a'; process.env.KMOTORS_CF_ACCESS_SECRET = 'b';
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(redirect)})).rejects.toThrow(/не принял сервисный токен/);
  });

  it('403 (адрес из Кореи): объясняет, что делать, и не повторяет запрос', async () => {
    const f = fakeFetch(new Response('', {status: 403}));
    await expect(fetchLot(lot, {fetchImpl: f})).rejects.toThrow(/закрыт для этого адреса/);
    expect((f as any).mock.calls).toHaveLength(1);
  });

  it('404 и «не найдено» (200 с меткой Next) — лот ушёл, а не поломка', async () => {
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(new Response('', {status: 404}))})).rejects.toMatchObject({status: 404});
    _reset();
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(ok('...NEXT_HTTP_ERROR_FALLBACK;404...'))})).rejects.toMatchObject({status: 404});
  });

  it('страница есть, а лота в ней нет — это сменившаяся вёрстка (502), не «ушёл с торгов»', async () => {
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(ok('<html>что-то другое</html>'))})).rejects.toMatchObject({status: 502});
  });

  it('429/503 и обрыв сети — понятные коды', async () => {
    await expect(fetchLot(lot, {fetchImpl: fakeFetch(new Response('', {status: 429}))})).rejects.toMatchObject({status: 503});
    _reset();
    const down = vi.fn(async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    await expect(fetchLot(lot, {fetchImpl: down})).rejects.toMatchObject({status: 502});
  });

  it('готовая страница кешируется: второй запрос в сеть не идёт', async () => {
    const f = fakeFetch(() => ok(html('heydealer')));
    await fetchLot(lot, {fetchImpl: f});
    await fetchLot(lot, {fetchImpl: f});
    expect((f as any).mock.calls).toHaveLength(1);
  });

  it('образцы вместо сети (локальная работа из Кореи): сеть не трогаем', async () => {
    process.env.KMOTORS_LOT_FIXTURES = FIX;
    const f = fakeFetch(new Response('', {status: 403}));
    const id = decodeURIComponent(fs.readFileSync(path.join(FIX, 'kcar.url'), 'utf8').trim().split('/').pop()!);
    const l = await fetchLot({house: 'kcar', id}, {fetchImpl: f});
    expect(l).toMatchObject({make: 'Chevrolet', year: 2015});
    expect((f as any).mock.calls).toHaveLength(0);
    // лота нет среди образцов — идём в сеть, как обычно
    _reset();
    await expect(fetchLot({house: 'kcar', id: 'другой'}, {fetchImpl: f})).rejects.toThrow(/закрыт/);
    expect((f as any).mock.calls).toHaveLength(1);
  });
});
