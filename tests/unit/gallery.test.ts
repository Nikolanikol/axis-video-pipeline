// Формат «Галерея»: какие фото куда идут — по порядку и выбранные руками
import {describe, expect, it} from 'vitest';
import {photoKey, photoLayout} from '../../src/shared/photoSlots';

const lot = (n: number) => Array.from({length: n}, (_, i) => `/data/workspaces/w/lots/l/photos/p${i + 1}.jpg`);
const short = (list: string[]) => list.map((p) => photoKey(p));

describe('раскладка по порядку (ничего не выбрано)', () => {
  it('1-е хук, 2–4-е стопка, дальше галерея', () => {
    const l = photoLayout(lot(12), {}, 8);
    expect(photoKey(l.hook!)).toBe('p1');
    expect(short(l.stack)).toEqual(['p2', 'p3', 'p4']);
    expect(short(l.gallery)).toEqual(['p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']);
  });

  it('своих фото на галерею мало — добираем из стопки; хук не берём, соседние склейки разные', () => {
    // Лот из пяти фото раньше давал восемь раз один и тот же снимок
    const g = short(photoLayout(lot(5), {}, 8).gallery);
    expect(g).toEqual(['p5', 'p2', 'p3', 'p4', 'p5', 'p2', 'p3', 'p4']);
    for (let i = 1; i < g.length; i++) expect(g[i]).not.toBe(g[i - 1]);
  });

  it('одно фото — везде оно; нет фото — пусто', () => {
    const one = photoLayout(lot(1), {}, 3);
    expect(short(one.gallery)).toEqual(['p1', 'p1', 'p1']);
    expect(photoLayout([], {}, 3)).toMatchObject({hook: null, stack: [], gallery: []});
  });
});

describe('выбор руками', () => {
  it('выбранное главнее порядка, «авто» заполняют остальное', () => {
    const l = photoLayout(lot(10), {p7: 'hook', p9: 'stack', p2: 'gallery'}, 8);
    expect(photoKey(l.hook!)).toBe('p7');
    // В стопке — отмеченное, остальные места по порядку из «авто»
    expect(short(l.stack)).toEqual(['p9', 'p1', 'p3']);
    expect(short(l.gallery).slice(0, 7)).toEqual(['p2', 'p4', 'p5', 'p6', 'p8', 'p10', 'p2']);
  });

  it('«не брать» не попадает никуда', () => {
    const l = photoLayout(lot(6), {p1: 'skip', p5: 'skip'}, 8);
    expect(photoKey(l.hook!)).toBe('p2');
    const all = [l.hook!, ...l.stack, ...l.gallery].map(photoKey);
    expect(all).not.toContain('p1');
    expect(all).not.toContain('p5');
    expect(l.placed[lot(6)[0]]).toBeNull();
  });

  it('выбор держится за файл, а не за адрес: размытие меняет версию, место остаётся', () => {
    const blurred = '/data/workspaces/w/lots/l/photos/p3~2.jpg';
    expect(photoKey(blurred)).toBe('p3');
    expect(photoKey(photoLayout([...lot(2), blurred], {p3: 'hook'}).hook!)).toBe('p3');
  });

  it('подпись в сетке совпадает с роликом', () => {
    const photos = lot(6);
    const l = photoLayout(photos, {p6: 'hook'}, 8);
    expect(l.placed[photos[5]]).toBe('hook');
    expect(l.placed[photos[0]]).toBe('stack');
  });
});
