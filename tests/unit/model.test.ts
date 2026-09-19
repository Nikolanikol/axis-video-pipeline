// Логика лота: цена, лот поверх настроек рынка, чего не хватает для рендера
import {describe, expect, it} from 'vitest';
import mk from '../../config/markets/mk.json';
import {fmt, getFormat, missing, priceUsd, resolveAd, totalUsd} from '../../src/shared/model';
import type {Lot, Market} from '../../src/shared/types';

const market = mk as Market;
const lot = (patch: Partial<Lot> = {}): Lot => ({
  brand: 'Audi', model: 'A6', year: 2018, specs: ['78 498 км'], photos: ['a.jpg'],
  carPriceKrw: 12_300_000, krwPerUsd: 1390, ...patch,
});

describe('цена', () => {
  it('₩ по курсу округляется до доллара', () => {
    expect(priceUsd(lot())).toBe(8849);
  });

  it('цена в $ главнее цены в ₩', () => {
    expect(priceUsd(lot({carPriceUsd: 9000}))).toBe(9000);
  });

  it('без курса или без цены — null (в ролике заглушка)', () => {
    expect(priceUsd(lot({krwPerUsd: null}))).toBeNull();
    expect(priceUsd(lot({carPriceKrw: null}))).toBeNull();
  });

  it('цена до порта = авто + фрахт рынка', () => {
    expect(totalUsd(resolveAd({lot: lot(), market}))).toBe(8849 + market.freightUsd);
    expect(totalUsd(resolveAd({lot: lot({freightUsd: 2000}), market}))).toBe(8849 + 2000);
    expect(totalUsd(resolveAd({lot: lot({krwPerUsd: null}), market}))).toBeNull();
  });

  it('числа форматируются с обычными пробелами', () => {
    expect(fmt(10349)).toBe('10 349');
    expect(fmt(105000)).toBe('105 000');
    expect(fmt(950)).toBe('950');
  });
});

describe('лот поверх настроек рынка', () => {
  it('незаполненные поля лота не перекрывают рынок', () => {
    const ad = resolveAd({lot: lot({freightUsd: undefined, whatsapp: undefined}), market});
    expect(ad.freightUsd).toBe(market.freightUsd);
    expect(ad.whatsapp).toBe(market.whatsapp);
  });

  it('null в лоте перекрывает рынок (скрыть WhatsApp)', () => {
    expect(resolveAd({lot: lot({whatsapp: null}), market}).whatsapp).toBeNull();
  });

  it('тексты: лот меняет только свои ключи', () => {
    const ad = resolveAd({lot: lot({texts: {hookTagline: 'Тест'}}), market});
    expect(ad.texts.hookTagline).toBe('Тест');
    expect(ad.texts.ctaBenefit).toBe(market.texts.ctaBenefit);
  });

  it('музыка: громкость из лота, трек из рынка; null — без музыки', () => {
    expect(resolveAd({lot: lot({music: {volume: 0.3}}), market}).music).toEqual({track: market.music?.track, volume: 0.3});
    expect(resolveAd({lot: lot({music: {track: null}}), market}).music.track).toBeNull();
    expect(resolveAd({lot: lot(), market}).music).toEqual(market.music);
  });
});

describe('форматы', () => {
  it('неизвестный или пустой формат — первый из реестра', () => {
    expect(getFormat(undefined).id).toBe('price-ad');
    expect(getFormat('нет-такого').id).toBe('price-ad');
  });

  it('проверка, чего не хватает лоту', () => {
    const f = getFormat('price-ad');
    expect(missing(lot(), f)).toEqual([]);
    expect(missing(lot({photos: [], specs: ['', ''], krwPerUsd: null}), f)).toEqual(['photos', 'specs', 'price']);
  });
});
