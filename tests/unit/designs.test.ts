import {describe, expect, it} from 'vitest';
import brand from '../../config/brand.json';
import fonts from '../../config/fonts.json';
import {applyDesignPreset, DESIGNS, matchDesignPreset} from '../../src/shared/designs';
import {isDesign} from '../../src/shared/design.js';
import {contrastIssues} from '../../src/shared/contrast.js';
import {carouselDesignContent} from '../../src/design/DesignCarousel';
import {adDesignContent, carouselSamplerContent} from '../../src/design/DesignAd';
import type {Ad, CarouselCar, Market, Theme} from '../../src/shared/types';

describe('готовые дизайны', () => {
  it('шесть уникальных сочетаний с доступными шрифтами и читаемыми цветами', () => {
    const ids = DESIGNS.flatMap((d) => d.presets.map((p) => p.id));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
    for (const design of DESIGNS) for (const preset of design.presets) {
      expect(isDesign(design.id)).toBe(true);
      expect(fonts.some((f) => f.id === preset.fontPair)).toBe(true);
      expect(contrastIssues(applyDesignPreset(brand, preset.id)), preset.id).toEqual([]);
    }
  });

  it('смена сочетания сохраняет компанию, её файлы и выбранную компоновку', () => {
    const own: Theme = {...brand, name: 'Своя компания', assets: {...brand.assets, logoHorizontal: '/data/workspaces/my/brand/own.png'}, designVariant: 1};
    const before = JSON.stringify(own);
    const next = applyDesignPreset(own, 'paper-wine');
    expect(next.design).toBe('editorial');
    expect(next.designVariant).toBe(1);
    expect(next.name).toBe(own.name);
    expect(next.assets).toEqual(own.assets);
    expect(JSON.stringify(own)).toBe(before);
  });

  it('своя правка снимает готовое сочетание и сохраняет семейство дизайна', () => {
    const next = applyDesignPreset(brand, 'porcelain-cobalt');
    expect(matchDesignPreset(next)?.id).toBe('porcelain-cobalt');
    expect(matchDesignPreset({...next, copper: '#123456'})).toBeUndefined();
    expect({...next, copper: '#123456'}.design).toBe('catalog');
    expect(() => applyDesignPreset(brand, 'unknown')).toThrow();
  });

  it('старый бренд не получает новый дизайн автоматически', () => {
    expect(isDesign((brand as Theme).design)).toBe(false);
    expect(isDesign('unknown')).toBe(false);
    expect(matchDesignPreset(brand)).toBeUndefined();
  });
});

const car: CarouselCar = {id: '1', source: '', brand: 'Ford', model: 'F150', grade: '', trim: '', year: 2018,
  firstRegistered: null, mileageKm: 67842, displacementCc: 5000, transmission: 'Automatic', fuel: 'Gasoline', body: '', color: 'Red',
  seats: null, vin: null, plate: null, history: null,
  price: {krw: 43000000, usd: 32000, krwToUsd: null, quotedAt: null, rateSource: ''},
  options: {comfort: [], safety: [], other: [], total: 0},
  photos: {hero: 'front.jpg', rear: null, interiorShot: null, dashboard: null, exterior: ['front.jpg', 'rear.jpg'], interior: [], other: []}};

describe('содержимое нового оформления', () => {
  const props = {car, market: {name: 'Тест', language: 'en', currency: 'EUR', krwPerUnitToday: 1500,
    origin: 'Incheon', port: 'Durres', originCountry: 'KR', portCountry: 'AL', freightUsd: 1000, whatsapp: null, site: '', texts: {}} satisfies Market};
  it('не выдаёт отсутствие истории за отсутствие происшествий', () => {
    const slide = carouselDesignContent(props, 'history');
    expect(slide.title).toBe('Report available on request');
    expect(slide.facts).toEqual([]);
  });
  it('показывает свою цену именно в валюте профиля', () => {
    const slide = carouselDesignContent({...props, priceOverride: 12345}, 'price');
    expect(slide.price).toContain('€');
    expect(slide.price?.replace(/\D/g, '')).toBe('12345');
  });
  it('не приписывает неизвестные характеристики машине', () => {
    const slide = carouselDesignContent({...props, car: {...car, year: null, mileageKm: null, displacementCc: null, fuel: '', transmission: ''}}, 'specs');
    expect(slide.facts).toEqual([]);
  });
  it('образец карусели не подменяет цену машины ценой ролика с фрахтом', () => {
    const market: Market = {...props.market, currency: 'USD', krwPerUnitToday: 1000};
    const ad: Ad = {...market, brand: 'Ford', model: 'F150', year: 2018, photos: ['front.jpg'], specs: [], texts: {}, music: {},
      carPriceKrw: 43000000, krwPerUsd: 1000, freightUsd: 1000, origin: 'Korea', port: 'Durres'};
    expect(carouselSamplerContent(ad, market, 'price').price).toBe('$43,000');
    expect(adDesignContent(ad, 'price').price).toBe('44 000 $');
  });
});
