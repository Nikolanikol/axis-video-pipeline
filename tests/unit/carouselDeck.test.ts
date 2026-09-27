// Форматы карусели и библиотека слайдов: реестр согласован с вёрсткой, варианты воспроизводимы.
import {describe, expect, it} from 'vitest';
import {CAROUSEL_FORMATS, carouselSlides} from '../../src/carousel/formats';
import {DECK_SLIDES} from '../../src/carousel/deck/Deck';
import {COPY, fill, pick} from '../../src/carousel/i18n/copy';

describe('форматы карусели', () => {
  it('id уникальны, «Классика» на месте', () => {
    expect(new Set(CAROUSEL_FORMATS.map((f) => f.id)).size).toBe(CAROUSEL_FORMATS.length);
    expect(CAROUSEL_FORMATS.map((f) => f.id)).toEqual(expect.arrayContaining(['classic', 'showcase', 'spread', 'full']));
  });

  it('каждый слайд нового формата есть в библиотеке — иначе молча вышла бы обложка', () => {
    for (const f of CAROUSEL_FORMATS.filter((x) => x.id !== 'classic')) {
      for (const s of f.slides) expect(DECK_SLIDES, `${f.id}: ${s}`).toContain(s);
    }
  });

  it('размеры: квадрат, 4:5 и 9:16; слайдов столько, сколько решил владелец', () => {
    const by = Object.fromEntries(CAROUSEL_FORMATS.map((f) => [f.id, f]));
    expect([by.showcase.width, by.showcase.height, by.showcase.slides.length]).toEqual([1080, 1080, 9]);
    expect([by.spread.width, by.spread.height, by.spread.slides.length]).toEqual([1080, 1350, 6]);
    expect([by.full.width, by.full.height, by.full.slides.length]).toEqual([1080, 1080, 12]);
    expect([by.classic.width, by.classic.height]).toEqual([1080, 1920]);
  });

  it('история во всех форматах; на проде её убирают — слайдов на один меньше', () => {
    for (const f of CAROUSEL_FORMATS) {
      expect(f.slides, f.id).toContain('history');
      expect(carouselSlides(f.id, false)).toHaveLength(f.slides.length - 1);
    }
  });

  it('незнакомый формат — «Классика», а не пустая карусель', () => {
    expect(carouselSlides('нет-такого')).toEqual(CAROUSEL_FORMATS.find((f) => f.id === 'classic')!.slides);
  });
});

describe('варианты', () => {
  const items = ['a', 'b', 'c', 'd'];
  it('одно зерно — один выбор; зёрна дают разные варианты', () => {
    expect(pick(items, 42, 'cover')).toBe(pick(items, 42, 'cover'));
    const seen = new Set(Array.from({length: 50}, (_, s) => pick(items, s + 1, 'cover')));
    expect(seen.size).toBeGreaterThan(2);
  });

  it('слайды одной карусели не берут один и тот же номер варианта разом', () => {
    const keys = ['cover', 'exterior', 'interior', 'engine', 'safety', 'cta'];
    const picks = Array.from({length: 20}, (_, s) => keys.map((k) => pick(items, s + 1, k)).join(''));
    expect(picks.some((p) => new Set(p).size > 1)).toBe(true);
  });

  it('подстановка данных', () => {
    expect(fill('%model%\\n{уже доступен}', {model: 'Hyundai Equus'})).toBe('Hyundai Equus\\n{уже доступен}');
  });
});

describe('тексты слайдов', () => {
  it('у русского и английского одинаковые разделы и число вариантов', () => {
    const shape = (o: unknown): unknown => (Array.isArray(o) ? o.length : o && typeof o === 'object'
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o);
    expect(shape(COPY.ru)).toEqual(shape(COPY.en));
  });

  it('у каждого заголовка ровно одно выделенное слово и нет лишних скобок', () => {
    for (const [lang, copy] of Object.entries(COPY)) {
      for (const [slide, sect] of Object.entries(copy)) {
        for (const t of (sect as {title?: string[]}).title ?? []) {
          if (t === '%model%') continue;
          expect((t.match(/\{[^}]+\}/g) ?? []).length, `${lang}.${slide}: ${t}`).toBe(1);
          expect(t.replace(/\{[^}]+\}/g, ''), `${lang}.${slide}`).not.toMatch(/[{}]/);
        }
      }
    }
  });
});
