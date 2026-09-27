// Музыка убрана из продукта: сохранённый в лоте или обзоре трек до ролика не доходит.
import {describe, expect, it} from 'vitest';
import {resolveAd} from '../../src/shared/model';
import {NO_MUSIC, withoutMusic} from '../../src/shared/nomusic.js';
import type {Lot, Market} from '../../src/shared/types';

const market = {name: 'X', texts: {}, music: {track: 'eleven-balkan-trap', volume: 0.5}} as unknown as Market;
// Как у двух обзоров Audi A6: трек сохранён ещё тогда, когда выбор был
const lot = {brand: 'Audi', model: 'A6', year: 2018, specs: [], photos: [], music: {track: 'eleven-balkan-trap', volume: 0.05}} as unknown as Lot;

describe('без музыки', () => {
  it('трек лота и трек рынка перекрыты пустым', () => {
    expect(resolveAd({lot: withoutMusic(lot), market}).music.track).toBeNull();
  });

  it('без withoutMusic механизм по-прежнему играет — вернуть музыку можно', () => {
    expect(resolveAd({lot, market}).music.track).toBe('eleven-balkan-trap');
  });

  it('пустые данные не ломает', () => {
    expect(withoutMusic(null)).toBeNull();
    expect(withoutMusic({a: 1})).toEqual({a: 1, music: NO_MUSIC});
  });
});
