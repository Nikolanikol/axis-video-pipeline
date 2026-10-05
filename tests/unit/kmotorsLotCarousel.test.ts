// Лот аукциона → карусель: ссылка, id папки, раскладка фото и карточка на настоящих образцах
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {
  LOT_HOUSES, LOT_SKIP_SLIDES, carFromLot, lotCarId, lotPageUrl, lotPhotoRoles, parseCarouselSource, parseLotPage,
} from '../../src/shared/kmotorsLot.js';
import {carouselSlides, CAROUSEL_FORMATS} from '../../src/carousel/formats';

const DIR = path.resolve(__dirname, '../fixtures/kmotors-lots');
const lotOf = (house: string) => {
  const html = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${house}.html.gz`))).toString('utf8');
  const id = decodeURIComponent(fs.readFileSync(path.join(DIR, `${house}.url`), 'utf8').trim().split('/').pop()!);
  const r = parseLotPage(html, {house, id});
  if (!r.ok) throw new Error(house);
  return r.lot as Record<string, any>;
};

describe('что дали в строку карусели', () => {
  it('Encar по-прежнему разбирается как раньше', () => {
    expect(parseCarouselSource('https://fem.encar.com/cars/detail/41630924')).toEqual({source: 'encar', id: '41630924'});
    expect(parseCarouselSource('41630924')).toEqual({source: 'encar', id: '41630924'});
  });

  it('ссылка на лот даёт безопасный id папки и исходный номер', () => {
    const r: any = parseCarouselSource('https://www.kmotors.shop/en/auction/lot/lotte/AS%7EAS202609070008%7E4');
    expect(r).toMatchObject({source: 'lot', house: 'lotte', lotId: 'AS~AS202609070008~4'});
    expect(r.id).toMatch(/^km-lotte-[0-9a-f]{10}$/);
    expect(r.id).toBe(lotCarId('lotte', 'AS~AS202609070008~4'));
  });

  it('id папки: один лот — один id, разные лоты — разные, всегда годится под checkId', () => {
    const ids = LOT_HOUSES.map((h) => lotCarId(h, '1135.20.1100.FJQlAvTQPwdu-Xck_C5EHA'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(lotCarId('kcar', 'a')).toBe(lotCarId('kcar', 'a'));
    expect(lotCarId('kcar', 'a')).not.toBe(lotCarId('kcar', 'b'));
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
  });

  it('папка собранной карусели — так зовёт «Пересобрать»', () => {
    expect(parseCarouselSource('km-kcar-0123456789')).toEqual({source: 'lot-saved', id: 'km-kcar-0123456789'});
  });

  it('чужой сайт и пустая строка — с понятным текстом', () => {
    expect(() => parseCarouselSource('https://example.com/x')).toThrow(/Encar и лоты/);
    expect(() => parseCarouselSource('')).toThrow(/ссылку/);
    expect(() => parseCarouselSource('https://www.kmotors.shop/en/auction')).toThrow(/нет лота/);
  });

  it('адрес лота для кнопки «Открыть лот» кодирует номер', () => {
    expect(lotPageUrl('sk', 'SR~1/2')).toBe('https://www.kmotors.shop/en/auction/lot/sk/SR~1%2F2');
  });
});

describe('карточка машины из лота', () => {
  it('на образцах пяти площадок: название, характеристики и фото на месте, цены и истории нет', () => {
    for (const h of LOT_HOUSES.filter((x) => x !== 'lotte')) {
      const car = carFromLot(lotOf(h));
      expect(car.brand && car.model && car.year, h).toBeTruthy();
      expect(car.mileageKm, h).toBeGreaterThan(0);
      expect(car.price, h).toBeNull();
      expect(car.history, h).toBeNull();
      expect(car.options.total, h).toBe(0);
      expect(car.photos.hero, h).toMatch(/^https:/);
      expect(car.id, h).toMatch(/^[A-Za-z0-9]{1,14}$/);
    }
  });

  it('HeyDealer: марка, модель и комплектация попадают на обложку', () => {
    expect(carFromLot(lotOf('heydealer'))).toMatchObject({brand: 'BMW', model: '5 Series', grade: '520i M SPORT', year: 2025});
  });
});

describe('раскладка фото по ролям', () => {
  const urls = Array.from({length: 40}, (_, i) => `https://x/${i}.jpg`);

  it('обложка — первый кадр, кузовные следом, салон — из середины списка, роли не повторяются', () => {
    const r = lotPhotoRoles(urls);
    expect(r.hero).toBe(urls[0]);
    expect(r.exterior).toEqual(urls.slice(1, 6));
    expect(r.interior[0]).toBe(urls[10]);
    expect(r.rear).toBe(urls[2]);
    expect([r.hero, ...r.exterior, ...r.interior, ...r.other]).toHaveLength(new Set([r.hero, ...r.exterior, ...r.interior, ...r.other]).size);
  });

  it('короткий список (три кадра) не падает и не выдаёт пустых ролей обложки', () => {
    const r = lotPhotoRoles(urls.slice(0, 3));
    expect(r.hero).toBe(urls[0]);
    expect(r.interiorShot).toBeTruthy();
  });
});

describe('слайды лота', () => {
  it('без цены, истории и опций во всех форматах; обложка и контакты остаются', () => {
    for (const f of CAROUSEL_FORMATS) {
      const s = carouselSlides(f.id, true, LOT_SKIP_SLIDES);
      for (const gone of LOT_SKIP_SLIDES) expect(s, f.id).not.toContain(gone);
      expect(s[0]).toBe('cover');
      expect(s.at(-1)).toBe('cta');
    }
  });
});
