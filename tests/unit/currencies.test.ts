// Валюта профиля: фиксированный список со значками; старые свободные значения узнаём.
import {describe, expect, it} from 'vitest';
import {CURRENCIES, currencyCode, currencySign, isDirect, isKnownCurrency, krwPerUnit} from '../../src/shared/currencies.js';
import {marketFromProfile} from '../../src/shared/profile.js';

describe('валюта профиля', () => {
  it('коды в списке уникальны и у каждого есть значок', () => {
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
    for (const c of CURRENCIES) expect(c.sign, c.code).toBeTruthy();
  });

  it('«РУБЛЬ» из свободного поля — это RUB и значок ₽, а не слово в ролике', () => {
    expect(currencyCode('РУБЛЬ')).toBe('RUB');
    expect(currencyCode(' руб ')).toBe('RUB');
    expect(currencySign('РУБЛЬ')).toBe('₽');
    expect(isKnownCurrency('РУБЛЬ')).toBe(true);
  });

  it('пусто — доллары; незнакомое показываем кодом, а не подменяем долларом', () => {
    expect(currencyCode(undefined)).toBe('USD');
    expect(currencySign('')).toBe('$');
    expect(currencySign('XYZ')).toBe('XYZ');
    expect(isKnownCurrency('XYZ')).toBe(false);
  });

  it('мост профиля отдаёт ролику код из списка', () => {
    const m = marketFromProfile({company: 'X', language: 'ru', contacts: {whatsapp: null, site: ''},
      pricing: {mode: 'domestic', currency: 'РУБЛЬ'}}, {});
    expect(m.currency).toBe('RUB');
  });
});

describe('курс валюты к воне', () => {
  it('кросс через доллар: 1350 ₩ за $ и 80 ₽ за $ — 16,875 ₩ за ₽', () => {
    expect(krwPerUnit('RUB', {USD: 1, KRW: 1350, RUB: 80})).toBe(16.875);
    expect(krwPerUnit('РУБЛЬ', {USD: 1, KRW: 1350, RUB: 80})).toBe(16.875);
    expect(krwPerUnit('KZT', {USD: 1, KRW: 1350})).toBeNull();
  });
  it('вона и доллар считаются напрямую', () => {
    expect(isDirect('KRW')).toBe(true);
    expect(isDirect('USD')).toBe(true);
    expect(isDirect('RUB')).toBe(false);
  });
});

