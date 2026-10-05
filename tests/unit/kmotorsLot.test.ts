// Лот аукциона со страницы kmotors.shop: ссылки и разбор на настоящих образцах шести площадок
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {LOT_HOUSES, flightOf, missingForCarousel, parseLotLink, parseLotPage} from '../../src/shared/kmotorsLot.js';

const DIR = path.resolve(__dirname, '../fixtures/kmotors-lots');
const page = (house: string) => zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${house}.html.gz`))).toString('utf8');
const idOf = (house: string) => decodeURIComponent(fs.readFileSync(path.join(DIR, `${house}.url`), 'utf8').trim().split('/').pop()!);
const lotOf = (house: string) => {
  const r = parseLotPage(page(house), {house, id: idOf(house)});
  if (!r.ok) throw new Error(`${house}: ${r.reason}`);
  return r.lot as Record<string, any>;
};

describe('ссылка на лот', () => {
  it('понимает адреса kmotors.shop (в том числе служебный office) и carnect.biz', () => {
    expect(parseLotLink('https://www.kmotors.shop/en/auction/lot/heydealer/lG27P8RQ')).toEqual({house: 'heydealer', id: 'lG27P8RQ'});
    expect(parseLotLink('https://office.kmotors.shop/ru/auction/lot/kcar/AC20261001-CA20391074')).toEqual({house: 'kcar', id: 'AC20261001-CA20391074'});
    expect(parseLotLink('https://carnect.biz/lot/sk/SR~SR20260701348~2')).toEqual({house: 'sk', id: 'SR~SR20260701348~2'});
    expect(parseLotLink('kmotors.shop/auction/lot/lotte/AS~AS202609070008~4?utm_source=x')).toEqual({house: 'lotte', id: 'AS~AS202609070008~4'});
  });

  it('номер лота с «~», «+» и «/» декодируется — в адресе он всегда закодирован', () => {
    expect(parseLotLink('https://www.kmotors.shop/en/auction/lot/glovis/KWw95KJ%2Bq4BNNgaIpODYPg%3D%3D').id).toBe('KWw95KJ+q4BNNgaIpODYPg==');
    expect(parseLotLink('https://www.kmotors.shop/en/auction/lot/lotte/AS%7EAS202609070008%7E4').id).toBe('AS~AS202609070008~4');
  });

  it('чужие сайты, объявления Encar и странные пути — с понятным текстом', () => {
    expect(() => parseLotLink('')).toThrow(/ссылку/);
    expect(() => parseLotLink('https://fem.encar.com/cars/detail/41630924')).toThrow(/kmotors/);
    expect(() => parseLotLink('https://www.kmotors.shop/en/auction')).toThrow(/нет лота/);
    expect(() => parseLotLink('https://www.kmotors.shop/en/auction/lot/dokanmazad/123')).toThrow(/площадку/);
    expect(() => parseLotLink('не ссылка совсем ::')).toThrow();
  });
});

describe('разбор страницы лота на настоящих образцах', () => {
  it('образец есть на каждую площадку', () => {
    for (const h of LOT_HOUSES) expect(fs.existsSync(path.join(DIR, `${h}.html.gz`)), h).toBe(true);
  });

  it('HeyDealer (BMW 5 Series 2025): все поля и вся галерея', () => {
    const l = lotOf('heydealer');
    expect(l).toMatchObject({
      house: 'heydealer', externalId: 'lG27P8RQ', make: 'BMW', modelGroup: '5 Series', year: 2025,
      trim: '520i M SPORT', mileageKm: 15892, fuel: 'Gasoline', transmission: 'Automatic',
      displacementCc: 1998, color: 'Brooklyn Grey', body: 'Passenger', ownerChanges: 0, platform: 'HeyDealer · Zero',
    });
    expect(l.vin).toMatch(/^WBA/);
    expect(l.photos).toHaveLength(34);
    expect(l.photos.every((p: string) => p.startsWith('https://'))).toBe(true);
  });

  it('Autobell, K Car, SK, Autohub: марка, год, пробег, топливо, коробка, объём и фото', () => {
    const expected: Record<string, object> = {
      glovis: {make: 'Audi', modelGroup: 'Q5', year: 2023, mileageKm: 47741, fuel: 'Gasoline', displacementCc: 1984, venue: 'Bundang'},
      kcar: {make: 'Chevrolet', modelGroup: 'Orlando', year: 2015, mileageKm: 199518, fuel: 'Diesel', displacementCc: 1998, venue: 'Sejong'},
      sk: {make: 'Hyundai', modelGroup: 'Grandeur', year: 2023, mileageKm: 29514, fuel: 'Gasoline', displacementCc: 3500},
      autohub: {make: 'Kia', modelGroup: 'Sorento', year: 2016, mileageKm: 216712, fuel: 'Diesel', displacementCc: 1995, color: 'White'},
    };
    for (const [house, want] of Object.entries(expected)) {
      const l = lotOf(house);
      expect(l, house).toMatchObject({...want, transmission: 'Automatic'});
      expect(l.photos.length, `${house}: фото`).toBeGreaterThanOrEqual(20);
      expect(missingForCarousel({ok: true, lot: l}), house).toEqual([]);
    }
  });

  it('Lotte: площадка не отдаёт марку, год и пробег — разбор честно говорит null, а не придумывает', () => {
    const l = lotOf('lotte');
    expect(l).toMatchObject({make: null, modelGroup: null, year: null, mileageKm: null, fuel: 'Diesel', transmission: 'Automatic', displacementCc: 2151});
    expect(l.photos.length).toBeGreaterThan(20);
    expect(missingForCarousel({ok: true, lot: l})).toEqual(expect.arrayContaining(['марка и модель', 'год']));
  });

  it('цены на странице для гостя нет — ни у стартовых лотов, ни у ставочных', () => {
    for (const h of LOT_HOUSES) expect(lotOf(h).priceKrw, h).toBeNull();
    expect(lotOf('glovis').priceKind).toBe('start');
    expect(lotOf('heydealer').priceKind).toBe('none');
  });

  it('берёт запись именно запрошенного лота, а не «похожего» из соседнего блока', () => {
    const html = page('heydealer');
    // другой номер той же страницы: нужной записи нет → не подсовываем чужую
    expect(parseLotPage(html, {house: 'heydealer', id: 'нет-такого'})).toEqual({ok: false, reason: 'layout'});
    // без указания номера берётся первая запись
    expect(parseLotPage(html).ok).toBe(true);
  });

  it('«не найдено» и пустая страница — разные исходы', () => {
    expect(parseLotPage('<html>…NEXT_HTTP_ERROR_FALLBACK;404…</html>')).toEqual({ok: false, reason: 'gone'});
    expect(parseLotPage('<html><body>ничего</body></html>')).toEqual({ok: false, reason: 'layout'});
    expect(parseLotPage('')).toEqual({ok: false, reason: 'layout'});
  });

  it('куски потока склеиваются, битый кусок страницу не роняет', () => {
    const html = 'x<script>self.__next_f.push([1,"a:[1]\\n"])</script><script>self.__next_f.push([1,"битый \\u12"])</script>';
    expect(flightOf(html)).toContain('a:[1]');
  });
});
