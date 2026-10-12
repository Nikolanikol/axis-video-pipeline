// Цена на слайде карусели: валюта компании по курсу дня или своя цена клиента.
import {describe, expect, it} from 'vitest';
import {carouselPrice} from '../../src/carousel/price';
import {carouselText} from '../../src/carousel/i18n';
import type {CarouselCar} from '../../src/shared/types';

const car = {price: {krw: 60_430_000, usd: 44_641, krwToUsd: 1 / 1353.68, quotedAt: '2026-10-11'}} as unknown as CarouselCar;

describe('цена на слайде карусели', () => {
  it('₽ — из вон по курсу дня; ₩ — как на Encar', () => {
    expect(carouselPrice(car, {currency: 'RUB', krwPerUnitToday: 15.7855})).toBe(Math.round(60_430_000 / 15.7855));
    expect(carouselPrice(car, {currency: 'KRW'})).toBe(60_430_000);
  });

  it('доллары — по нашему курсу дня, без него — по курсу шлюза', () => {
    expect(carouselPrice(car, {currency: 'USD', krwPerUnitToday: 1341.69})).toBe(Math.round(60_430_000 / 1341.69));
    expect(carouselPrice(car, {currency: 'USD'})).toBe(44_641);
  });

  it('нет курса для ₽ — прочерк, а не доллары под значком ₽', () => {
    expect(carouselPrice(car, {currency: 'RUB'})).toBeNull();
  });

  it('своя цена клиента перебивает расчёт', () => {
    expect(carouselPrice(car, {currency: 'RUB', krwPerUnitToday: 15.7855}, 4_200_000)).toBe(4_200_000);
  });

  it('запись: $ и € — перед числом, ₽ и прочие — после; без цены — прочерк', () => {
    expect(carouselText('en').money(44641, 'USD')).toBe('$44,641');
    expect(carouselText('ru').money(3828197, 'RUB')).toBe(`${(3828197).toLocaleString('ru-RU')} ₽`);
    expect(carouselText('ru').money(null, 'RUB')).toBe('—');
  });
});
