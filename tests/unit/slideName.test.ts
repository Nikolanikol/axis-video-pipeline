// Имя слайда при сохранении в папку (браузер) — то же, что при скачивании с сервера:
// иначе одна и та же карусель ложилась бы в папку под разными именами
import {describe, expect, it} from 'vitest';
import {slideFileName} from '../../server/carousel.mjs';
import {slideName} from '../../app/saveFiles';

describe('имя файла слайда', () => {
  it('совпадает с серверным', () => {
    for (const car of [{brand: 'Audi', model: 'A6', id: '40990828'}, {brand: 'Hyundai', model: 'Grand Starex', id: '1'},
      {brand: '', model: '', id: '7'}, {brand: 'Kia', model: 'K5 (Optima)', id: '42'}]) {
      for (const n of [1, 9, 12]) expect(slideName(car, n)).toBe(slideFileName(car, n));
    }
  });
});
