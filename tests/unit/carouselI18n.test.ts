// Язык карусели: русский по профилю, данные Encar — по словарям kmotors, числа — по-русски.
import {describe, expect, it} from 'vitest';
import {carouselLang, carouselText} from '../../src/carousel/i18n';
import dict from '../../src/carousel/i18n/ru-values.json';

const ru = carouselText('ru');
const en = carouselText('en');
const nbsp = (s: string) => s.replace(/ | /g, ' ');

describe('язык карусели', () => {
  it('русский — только по профилю ru, остальные языки получают английский', () => {
    expect(carouselLang('ru')).toBe('ru');
    for (const l of ['en', 'mk', 'sq', undefined]) expect(carouselLang(l)).toBe('en');
  });

  it('данные Encar переводятся словарями kmotors, цвета — своим', () => {
    expect(ru.value('Gasoline')).toBe('Бензин');
    expect(ru.value('Automatic')).toBe('Автомат');
    expect(ru.value('Gray')).toBe('Серый');
    expect(ru.option('Heated steering wheel')).toBe('Рулевое колесо с подогревом');
    // Английский ничего не трогает
    expect(en.value('Gasoline')).toBe('Gasoline');
    expect(en.option('Heated steering wheel')).toBe('Heated steering wheel');
  });

  it('незнакомое слово остаётся английским, а не пропадает', () => {
    expect(ru.value('Quantum drive')).toBe('Quantum drive');
    expect(ru.option('Flux capacitor')).toBe('Flux capacitor');
    expect(ru.value('')).toBe('');
  });

  it('все опции словаря переведены — ни одной пустой строки', () => {
    const options = Object.entries(dict.options);
    expect(options.length).toBeGreaterThan(50);
    // Непустые; кириллица не обязательна — «Bluetooth» по-русски и есть Bluetooth
    for (const [k, v] of options) expect(String(v).trim(), k).not.toBe('');
    // …но в основном перевод настоящий, а не копия английского
    const same = options.filter(([k, v]) => k === v).length;
    expect(same / options.length).toBeLessThan(0.1);
  });

  it('склонения: 1 смена, 3 смены, 7 смен, 11 смен, 21 смена', () => {
    expect(ru.s.ownerChanges(1)).toBe('1 смена владельца');
    expect(ru.s.ownerChanges(3)).toBe('3 смены владельца');
    expect(ru.s.ownerChanges(7)).toBe('7 смен владельца');
    expect(ru.s.ownerChanges(11)).toBe('11 смен владельца');
    expect(ru.s.ownerChanges(21)).toBe('21 смена владельца');
  });

  it('числа по правилам языка', () => {
    expect(nbsp(ru.km(239601))).toBe('239 601 км');
    expect(en.km(239601)).toBe('239,601 km');
    expect(nbsp(ru.usd(10349))).toBe('$10 349');
    expect(ru.liters(4966)).toBe('5,0 л');
    expect(en.liters(1598)).toBe('1.6 L');
    expect(ru.km(null)).toBe('—');
  });

  it('у обоих языков одинаковый набор подписей', () => {
    expect(Object.keys(ru.s).sort()).toEqual(Object.keys(en.s).sort());
    expect(ru.s.priceNotes).toHaveLength(en.s.priceNotes.length);
  });
});
