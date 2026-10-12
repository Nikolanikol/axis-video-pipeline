// Источник «Китай» (che168): ссылки, переходник ядро → CarouselCar, «Китай» в текстах слайдов,
// долларовая цена на слайде. Образцы — настоящие ответы ядра (tests/fixtures/che168).
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {encarAdUrl, idFromNote, parseCarLink, sourceName, sourceNote} from '../../src/shared/encarLink.js';
import {bodyOf, carFromChe168, colorOf, fuelOf, transmissionOf} from '../../src/shared/che168Car.js';
import {lotFieldsFromCar} from '../../src/shared/lotFromCar';
import {carouselText} from '../../src/carousel/i18n';
import {copyFor} from '../../src/carousel/i18n/copy';
import {carouselPrice} from '../../src/carousel/price';
import {parseCarouselSource} from '../../src/shared/kmotorsLot.js';

const fixture = (id: string) => JSON.parse(readFileSync(new URL(`../fixtures/che168/${id}.json`, import.meta.url), 'utf8'));
const studio = fixture('60152276');   // Jaguar F-PACE, студийный набор
const dealer = fixture('59330310');   // Maserati Levante, дилерский
// Цена в образце — какая была в день съёмки (дилеры её меняют); сверяем с образцом, не с числом
const usd: number = studio.price.amount;

describe('ссылки che168', () => {
  it('все версии сайта дают один номер с приставкой ch-', () => {
    const want = {source: 'che168', id: 'ch-60154824', ref: '60154824'};
    expect(parseCarLink('https://www.che168.com/dealer/513988/60154824.html#pvareaid=100496')).toEqual(want);
    expect(parseCarLink('https://global.che168.com/en/detail/60154824')).toEqual(want);
    expect(parseCarLink('https://m.che168.com/cardetail/index?infoid=60154824')).toEqual(want);
    expect(parseCarLink('ch-60154824')).toEqual(want);
  });

  it('голый номер — по-прежнему Encar', () => {
    expect(parseCarLink('41630924')).toEqual({source: 'encar', id: '41630924'});
  });

  it('страница сайта без номера — просим ссылку целиком', () => {
    expect(() => parseCarLink('https://www.che168.com/')).toThrow(/номера/);
  });

  it('пометка лота, адрес объявления и название источника', () => {
    expect(sourceNote('ch-60154824')).toBe('che168 60154824');
    expect(idFromNote('che168 60154824')).toBe('ch-60154824');
    expect(idFromNote('копия che168 60154824')).toBe('ch-60154824');
    expect(idFromNote('Encar 41630924')).toBe('41630924');
    expect(encarAdUrl('ch-60154824')).toBe('https://global.che168.com/en/detail/60154824');
    expect(encarAdUrl('41630924')).toBe('https://fem.encar.com/cars/detail/41630924');
    expect(sourceName('ch-1')).toBe('che168');
  });

  it('карусели принимают ссылку che168 и свой id при пересборке', () => {
    expect(parseCarouselSource('https://global.che168.com/en/detail/60152276')).toMatchObject({source: 'che168', id: 'ch-60152276'});
    expect(parseCarouselSource('ch-60152276')).toMatchObject({source: 'che168', ref: '60152276'});
  });
});

describe('словарь слайдов: значения Autohome → слова Encar', () => {
  it('топливо: мягкий гибрид — бензин, plug-in — гибрид', () => {
    expect(fuelOf('Gasoline + 48V Mild Hybrid System')).toBe('Gasoline');
    expect(fuelOf('Pure Electric')).toBe('Electric');
    expect(fuelOf('Plug-in Hybrid')).toBe('Hybrid');
    expect(fuelOf('Hybrid')).toBe('Hybrid');
  });

  it('коробка: всё, кроме чистой механики, — автомат', () => {
    expect(transmissionOf('8-speed automatic with manual shift mode')).toBe('Automatic');
    expect(transmissionOf('7-speed wet dual-clutch')).toBe('Automatic');
    expect(transmissionOf('6-speed manual')).toBe('Manual');
  });

  it('кузов и цвет', () => {
    expect(bodyOf('Hardtop Convertible')).toBe('Convertible');
    expect(bodyOf('MPV')).toBe('MiniVan');
    expect(colorOf('Dark Gray')).toBe('Gray');
  });
});

describe('карточка ядра → CarouselCar', () => {
  it('студийный набор: поля, цена в долларах, Китай', () => {
    const car = carFromChe168(studio, 'ru');
    expect(car).toMatchObject({
      id: 'ch-60152276', source: 'che168', origin: 'CN', brand: 'Jaguar', model: 'F-PACE', grade: '300-Sport',
      year: 2020, displacementCc: 1997, transmission: 'Automatic', fuel: 'Gasoline', body: 'SUV', history: null,
    });
    expect(car.price).toMatchObject({krw: null, usd});
  });

  it('студийный набор: обложка — «перед» (№3), а не №1 с наклейкой площадки', () => {
    const car = carFromChe168(studio, 'en');
    const n = (u: string | null) => studio.photos.findIndex((p: {url: string}) => p.url === u) + 1;
    expect(n(car.photos.hero)).toBe(3);
    expect(n(car.photos.rear)).toBe(2);
    expect(n(car.photos.dashboard)).toBe(5);
    const all = [car.photos.hero, ...car.photos.exterior, ...car.photos.interior, ...car.photos.other];
    expect(all.map(n)).not.toContain(1);   // наклейка
    expect(all.map(n)).not.toContain(19);  // ключ
  });

  it('дилерский набор: обложка — первый кадр, марка добавлена к серии без марки', () => {
    const car = carFromChe168(dealer, 'en');
    expect(car.brand).toBe('Maserati');
    expect(car.model).toBe('Levante');
    expect(car.photos.hero).toBe(dealer.photos[0].url);
  });

  it('опции на языке профиля, заметные — первыми', () => {
    const ru = carFromChe168(studio, 'ru');
    expect(ru.options.total).toBeGreaterThan(10);
    expect(ru.options.comfort[0]).toMatch(/[А-Яа-я]/);
    const en = carFromChe168(studio, 'en');
    expect(en.options.comfort.slice(0, 5).join(' ')).not.toMatch(/Power Windows|Anti-pinch/);
  });

  it('поля объявления ролика: доллары, маршрут из Китая, подзаголовок без Кореи', () => {
    const f = lotFieldsFromCar(carFromChe168(studio, 'ru'), 'ru');
    expect(f).toMatchObject({carPriceKrw: null, carPriceUsd: usd, originCountry: 'КИТАЙ', origin: 'Xian'});
    expect(f.hookTagline).not.toMatch(/Коре/);
  });

  it('пустой ответ не роняет переходник', () => {
    const car = carFromChe168({ref: '1'}, 'ru');
    expect(car.brand).toBe('');
    expect(car.photos.hero).toBeNull();
    expect(car.price).toBeNull();
  });
});

describe('тексты и цена слайдов для машины из Китая', () => {
  it('«Цена в Китае», «Импорт из Китая» — и Корея для Encar как была', () => {
    expect(carouselText('ru', 'CN').s.priceInKorea).toBe('Цена в Китае');
    expect(carouselText('en', 'CN').s.priceInKorea).toBe('Price in China');
    expect(carouselText('ru').s.priceInKorea).toBe('Цена в Корее');
    const cn = JSON.stringify(copyFor('ru', 'CN'));
    expect(cn).not.toMatch(/Коре/);
    expect(cn).toMatch(/из Китая/);
    expect(JSON.stringify(copyFor('en', 'CN'))).not.toMatch(/Korea/);
  });

  it('цена: доллары как есть, ₩ и ₽ — через курс дня', () => {
    const car = carFromChe168(studio, 'en');
    expect(carouselPrice(car, {currency: 'USD'})).toBe(usd);
    expect(carouselPrice(car, {currency: 'KRW', krwPerUsdToday: 1341.69})).toBe(Math.round(usd * 1341.69));
    expect(carouselPrice(car, {currency: 'RUB', krwPerUsdToday: 1341.69, krwPerUnitToday: 15.7855}))
      .toBe(Math.round((usd * 1341.69) / 15.7855));
    // Курса нет — прочерк, а не доллары под чужим значком
    expect(carouselPrice(car, {currency: 'RUB'})).toBeNull();
  });
});
