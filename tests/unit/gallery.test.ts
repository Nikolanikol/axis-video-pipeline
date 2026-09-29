// Формат «Галерея»: какие фото идут в склейки
import {describe, expect, it} from 'vitest';
import {galleryPhotos} from '../../src/formats/gallery-ad/GalleryAd';

const lot = (n: number) => Array.from({length: n}, (_, i) => `p${i + 1}`);

describe('фото галереи', () => {
  it('сначала пятое и дальше, соседние склейки не повторяют один снимок', () => {
    expect(galleryPhotos(lot(12), 8)).toEqual(['p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']);
  });
  it('своих не хватает — добираем из стопки; хук не берём', () => {
    // Лот из пяти фото раньше давал восемь раз один и тот же снимок
    const shots = galleryPhotos(lot(5), 8);
    expect(shots).toEqual(['p5', 'p2', 'p3', 'p4', 'p5', 'p2', 'p3', 'p4']);
    expect(shots).not.toContain('p1');
    for (let i = 1; i < shots.length; i++) expect(shots[i]).not.toBe(shots[i - 1]);
  });
  it('одно фото — повторяем его; нет фото — пусто', () => {
    expect(galleryPhotos(lot(1), 3)).toEqual(['p1', 'p1', 'p1']);
    expect(galleryPhotos([], 3)).toEqual([]);
  });
});
