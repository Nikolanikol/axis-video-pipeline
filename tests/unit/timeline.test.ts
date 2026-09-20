// Таймлайн обзора: длительности, привязка к долям, шаблон v1, чистка фрагментов
import {describe, expect, it} from 'vitest';
import {
  BEAT_SEC, EMPTY_FRAMES, MAX_CAPTION, MAX_SEGMENTS, REVIEW_FPS, TEMPLATE_V1,
  WHOLE_FINAL_SEC, WHOLE_HOOK_SEC, applyTemplate, buildTimeline, cutPauses, reviewFrames,
  reviewStoryboard, sanitizeSegments, segmentSeconds, videoRuns, voiceTimeline, wholeReview,
} from '../../src/shared/timeline.js';
import type {ReviewSegment} from '../../src/shared/types';

const seg = (patch: Partial<ReviewSegment> = {}): ReviewSegment => ({
  id: 'a', start: 0, duration: 2, speed: 1, kind: 'caption', caption: '', ...patch,
});

describe('длительность фрагмента', () => {
  it('исходник / скорость, привязано к доле 0,5 с', () => {
    expect(segmentSeconds(seg({duration: 2}))).toBe(2);
    expect(segmentSeconds(seg({duration: 9, speed: 3}))).toBe(3);
    expect(segmentSeconds(seg({duration: 2.2}))).toBe(2);
    expect(segmentSeconds(seg({duration: 2.3}))).toBe(2.5);
    expect(segmentSeconds(seg({duration: 5, speed: 2}))).toBe(2.5);
  });

  it('не короче доли', () => {
    expect(segmentSeconds(seg({duration: 0.1}))).toBe(BEAT_SEC);
    expect(segmentSeconds(seg({duration: 0.6, speed: 3}))).toBe(BEAT_SEC);
  });
});

describe('таймлайн', () => {
  it('фрагменты идут подряд, склейки — на долях', () => {
    const {items, durationInFrames} = buildTimeline([seg({id: 'a', duration: 3}), seg({id: 'b', duration: 9, speed: 3}), seg({id: 'c', duration: 1.1})]);
    // Считаем от REVIEW_FPS: частоту ролика меняли, ожидания не должны её фиксировать
    const f = (sec: number) => Math.round(sec * REVIEW_FPS);
    expect(items.map((i) => [i.from, i.frames])).toEqual([[0, f(3)], [f(3), f(3)], [f(6), f(1)]]);
    expect(durationInFrames).toBe(f(7));
    const beat = BEAT_SEC * REVIEW_FPS;
    for (const i of items) expect(i.from % beat).toBe(0);
  });

  it('пустой проект — заглушка 3 с', () => {
    expect(reviewFrames([])).toBe(EMPTY_FRAMES);
    expect(reviewStoryboard([])).toEqual([0]);
  });

  it('раскадровка: хук, фрагменты с плашками, финал — внутри ролика', () => {
    const segments = applyTemplate(60, ['78 498 км', 'Дизел', 'Кожа', 'HUD', 'Шибер', 'Ключ']);
    const total = reviewFrames(segments);
    const frames = reviewStoryboard(segments);
    expect(frames.length).toBe(4);
    expect(frames[0]).toBeLessThan(3 * REVIEW_FPS);                              // хук — первые 3 с
    expect(frames[frames.length - 1]).toBeGreaterThanOrEqual(total - 3 * REVIEW_FPS); // финал — последние 3 с
    expect(frames[frames.length - 1]).toBeLessThan(total - 0.4 * REVIEW_FPS);     // но не в затемнении в конце
    for (const f of frames) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(total);
    }
  });
});

describe('шаблон v1', () => {
  it('11 фрагментов, 25 секунд, хук первым, финал последним', () => {
    const s = applyTemplate(60, []);
    expect(s).toHaveLength(TEMPLATE_V1.length);
    expect(reviewFrames(s) / REVIEW_FPS).toBe(25);
    expect(s[0].kind).toBe('hook');
    expect(s[s.length - 1].kind).toBe('final');
    expect(s[2].speed).toBe(3);
    expect(s[2].duration).toBe(9);
  });

  it('фрагменты не выходят за исходник и идут по порядку', () => {
    const s = applyTemplate(40, []);
    for (const x of s) expect(x.start + x.duration).toBeLessThanOrEqual(40 + 1e-9);
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBeGreaterThanOrEqual(s[i - 1].start);
  });

  it('короткий исходник: фрагменты укорачиваются, а не вылезают', () => {
    const s = applyTemplate(5, []);
    for (const x of s) {
      expect(x.duration).toBeLessThanOrEqual(5);
      expect(x.start + x.duration).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it('плашки берут характеристики лота по порядку, пустые строки пропускаются', () => {
    const s = applyTemplate(60, ['78 498 км', '', 'Дизел · автоматик', 'Кожен ентериер']);
    const captions = s.filter((x) => x.caption).map((x) => x.caption);
    expect(captions).toEqual(['78 498 км', 'Дизел · автоматик', 'Кожен ентериер']);
    expect(s[1].caption).toBe('78 498 км');
  });

  it('id фрагментов уникальны', () => {
    const s = applyTemplate(60, []);
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });
});

describe('обзор целиком', () => {
  it('три фрагмента: заставка, весь материал, финал — без пропусков и наложений', () => {
    const s = wholeReview(62.667);
    expect(s.map((x) => x.kind)).toEqual(['hook', 'caption', 'final']);
    expect(s[0].start).toBe(0);
    expect(s[0].duration).toBe(WHOLE_HOOK_SEC);
    expect(s[2].duration).toBe(WHOLE_FINAL_SEC);
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBeCloseTo(s[i - 1].start + s[i - 1].duration, 3);
    // Хвост короче доли в ролик не попадает. Длины обязаны быть кратны доле, иначе
    // середина вычитает съёмку дальше начала финала и картинка на стыке прыгает назад.
    // Прежде хвост добирался именно такой ценой.
    const covered = s[2].start + s[2].duration;
    expect(covered).toBeLessThanOrEqual(62.667 + 1e-9);
    expect(62.667 - covered).toBeLessThan(BEAT_SEC);
    expect(s.every((x) => x.speed === 1)).toBe(true);
  });

  it('короткий исходник: только заставка и финал, за материал не вылезаем', () => {
    const s = wholeReview(5);
    expect(s.map((x) => x.kind)).toEqual(['hook', 'final']);
    expect(s[s.length - 1].start + s[s.length - 1].duration).toBeLessThanOrEqual(5 + 1e-9);
    expect(wholeReview(0.4)).toHaveLength(1);
    expect(wholeReview(0)).toHaveLength(1);
  });
});

describe('раскладка под озвучку', () => {
  const lines = [
    {id: 'l1', start: 0.5, end: 3, text: 'а'},
    {id: 'l2', start: 10, end: 12, text: 'б'},
    {id: 'l3', start: 20, end: 22, text: 'в'},
  ];
  // Единая начитка: длина фразы — её отрезок дорожки
  const clips = {track: {file: '/v/track.mp3'}, clips: {
    l1: {from: 0, to: 3.4}, l2: {from: 4, to: 5.2}, l3: {from: 6, to: 8},
  }};

  it('фрагмент на строку: кадр от автора, длина — из начитки вместе с её паузами', () => {
    const s = voiceTimeline(lines, clips, 30, {gap: 0.15});
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.kind)).toEqual(['hook', 'caption', 'final']);
    expect(s.map((x) => x.start)).toEqual([0.5, 10, 20]);
    // Фразе отведено время до начала следующей (4 и 2 с), последней — её длина плюс хвост.
    // Свой зазор не добавляем: паузы модели уже внутри дорожки, иначе их вырежет и заменит тишиной.
    const floorFrame = (sec: number) => Math.floor(sec * REVIEW_FPS) / REVIEW_FPS;
    s.forEach((x, i) => expect(x.duration).toBeCloseTo(floorFrame([4, 2, 2.15][i]), 5));
    // длина не привязана к доле: под озвучку ритм задаёт речь, а не бит
    expect(s.every((x) => x.exact === true)).toBe(true);
    s.forEach((x) => expect(segmentSeconds(x)).toBeCloseTo(x.duration, 6));
    expect(s.every((x) => x.speed === 1)).toBe(true);
  });

  it('почти нулевые перескоки склеиваются встык: лишние склейки рвут картинку на ровном месте', () => {
    // Фразы идут подряд по съёмке, между ними доли секунды — это не монтаж, а остаток округления
    const tight = [{id: 'l1', start: 0, end: 2}, {id: 'l2', start: 2.04, end: 4}, {id: 'l3', start: 4.1, end: 6}];
    const voice = {track: {file: '/v/t.mp3'}, clips: {
      l1: {from: 0, to: 2}, l2: {from: 2, to: 4}, l3: {from: 4, to: 6},
    }};
    const s = voiceTimeline(tight, voice, 30);
    for (let i = 1; i < s.length; i++) {
      const end = s[i - 1].start + segmentSeconds(s[i - 1]);
      expect(s[i].start, `стык ${i}`).toBeCloseTo(end, 5);
    }
  });

  it('назад не отматывает: кусок съёмки не показывается дважды', () => {
    // клипы длиннее пауз между фразами — наивная раскладка ушла бы назад
    const tight = {track: {file: '/v/t.mp3'}, clips: {l1: {from: 0, to: 6}, l2: {from: 6, to: 12}, l3: {from: 12, to: 18}}};
    const s = voiceTimeline(lines, tight, 30, {gap: 0});
    for (let i = 1; i < s.length; i++) {
      expect(s[i].start).toBeGreaterThanOrEqual(s[i - 1].start + segmentSeconds(s[i - 1]) - 1 / REVIEW_FPS);
    }
  });

  it('материала мало — перескоки ужимаются, но порядок и границы держатся', () => {
    const s = voiceTimeline(lines, clips, 21, {gap: 0.15});
    expect(s).toHaveLength(3);
    for (const x of s) expect(x.start + segmentSeconds(x)).toBeLessThanOrEqual(21 + 1e-6);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].start).toBeGreaterThanOrEqual(s[i - 1].start + segmentSeconds(s[i - 1]) - 1 / REVIEW_FPS);
    }
    // длительности озвучки не режутся: фразы звучат целиком
    const floorFrame = (sec: number) => Math.floor(sec * REVIEW_FPS) / REVIEW_FPS;
    s.forEach((x, i) => expect(x.duration).toBeCloseTo(floorFrame([4, 2, 2.15][i]), 5));
  });

  it('строки без озвучки пропускаются', () => {
    const s = voiceTimeline(lines, {track: {file: '/v/t.mp3'}, clips: {l2: {from: 0, to: 1.2}}}, 30);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({start: 10, kind: 'hook'});
    expect(voiceTimeline(lines, {clips: {}}, 30)).toEqual([]);
  });

  it('id уникальны', () => {
    const s = voiceTimeline(lines, clips, 30);
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });
});

describe('чистка пауз', () => {
  // Речь: 0,5–3 | 4–6 | 12–14 (пауза 6 с) | 14,5–16
  const lines = [
    {id: 'l1', start: 0.5, end: 3, text: 'а'},
    {id: 'l2', start: 4, end: 6, text: 'б'},
    {id: 'l3', start: 12, end: 14, text: 'в'},
    {id: 'l4', start: 14.5, end: 16, text: 'г'},
  ];
  const whole: ReviewSegment[] = [seg({id: 'm', start: 0, duration: 18, kind: 'caption'})];

  it('длинная тишина уходит, короткая остаётся', () => {
    const out = cutPauses(whole, lines);
    expect(out).toHaveLength(2);
    // первый кусок закрывает 0,5–6 (пауза 1 с внутри осталась), второй — 12–16
    expect(out[0].start).toBeLessThanOrEqual(0.5);
    expect(out[0].start + out[0].duration).toBeGreaterThanOrEqual(6);
    expect(out[1].start).toBeLessThanOrEqual(12);
    expect(out[1].start + out[1].duration).toBeGreaterThanOrEqual(16);
    // ролик стал короче исходника, но ни одно слово не срезано
    const total = out.reduce((n, s) => n + segmentSeconds(s), 0);
    expect(total).toBeLessThan(18);
    for (const l of lines) expect(out.some((s) => s.start <= l.start && s.start + s.duration >= l.end)).toBe(true);
  });

  it('куски идут по порядку, не налезают друг на друга и не выходят за фрагмент', () => {
    const out = cutPauses(whole, lines);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start + out[i - 1].duration - 1e-9);
    for (const s of out) expect(s.start + s.duration).toBeLessThanOrEqual(18 + 1e-9);
    for (const s of out) expect((s.duration / 0.5) % 1).toBeCloseTo(0, 6);
  });

  it('заставку, финал и ускоренные фрагменты не трогает', () => {
    const src: ReviewSegment[] = [
      seg({id: 'h', start: 0, duration: 3, kind: 'hook'}),
      seg({id: 'f', start: 0, duration: 18, kind: 'caption', speed: 3}),
      seg({id: 'e', start: 16.5, duration: 1.5, kind: 'final'}),
    ];
    expect(cutPauses(src, lines)).toEqual(src);
  });

  it('без речи или без фрагментов ничего не меняет', () => {
    expect(cutPauses(whole, [])).toEqual(whole);
    expect(cutPauses([], lines)).toEqual([]);
  });

  it('плашка остаётся на первом куске, id не повторяются', () => {
    const out = cutPauses([seg({id: 'm', start: 0, duration: 18, kind: 'caption', caption: '78 498 км'})], lines);
    expect(out[0].caption).toBe('78 498 км');
    expect(out.slice(1).every((s) => s.caption === '')).toBe(true);
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
  });

  it('не плодит фрагменты сверх лимита', () => {
    const many = Array.from({length: MAX_SEGMENTS + 10}, (_, i) => ({id: `x${i}`, start: i * 3, end: i * 3 + 1}));
    const out = cutPauses([seg({id: 'm', start: 0, duration: (MAX_SEGMENTS + 10) * 3, kind: 'caption'})], many);
    expect(out.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  });
});

describe('чистка фрагментов из формы', () => {
  it('границы исходника, скорость, тип, подпись', () => {
    const [a, b, c] = sanitizeSegments([
      {id: 'a', start: -5, duration: 100, speed: 7, kind: 'bad', caption: 'x'.repeat(200)},
      {id: 'b', start: 19.99, duration: 5, speed: 2, kind: 'final'},
      {id: 'c', start: 'x', duration: null, speed: '3', kind: 'hook', accent: 1},
    ], 20);
    expect(a).toMatchObject({start: 0, duration: 20, speed: 1, kind: 'caption'});
    expect(a.caption).toHaveLength(MAX_CAPTION);
    expect(b.start).toBeLessThanOrEqual(19.9);
    expect(b.start + b.duration).toBeLessThanOrEqual(20 + 1e-9);
    expect(b).toMatchObject({speed: 2, kind: 'final'});
    // duration теперь показывает, сколько исходника фрагмент реально съест.
    // Минимум для скорости 3 — доля экрана (0,5 с) × 3 = 1,5 с; прежние 0,1 с были
    // фикцией: движок всё равно вычитывал полторы секунды.
    expect(c).toMatchObject({start: 0, duration: 1.5, speed: 3, kind: 'hook', accent: true});
  });

  it('мусор отбрасывается, повторные и кривые id заменяются', () => {
    const out = sanitizeSegments([null, 5, {id: 'dup'}, {id: 'dup'}, {id: '../evil'}], 10);
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe('dup');
    expect(out[1].id).not.toBe('dup');
    expect(out[2].id).not.toBe('../evil');
    expect(sanitizeSegments('не массив', 10)).toEqual([]);
  });

  it('не больше лимита фрагментов; без длины исходника — без верхней границы', () => {
    const many = Array.from({length: MAX_SEGMENTS + 5}, (_, i) => ({id: `s${i}`, start: 100, duration: 50}));
    const out = sanitizeSegments(many, undefined);
    expect(out).toHaveLength(MAX_SEGMENTS);
    expect(out[0]).toMatchObject({start: 100, duration: 50});
  });
});

// Обрывы на стыках: фриз у конца исходника и нахлёст фрагментов шаблона.
// Симптомы разные, причина общая — экранное время считалось отдельно от материала.
describe('фрагмент не читает дальше конца исходника', () => {
  // segmentSeconds округляет длину ВВЕРХ к доле. Без поправки ролик просит у Remotion
  // кадры за концом съёмки, и последний кадр повисает.
  const reads = (s: ReviewSegment) => s.start + segmentSeconds(s) * s.speed;

  it('длину, округлённую вверх, прижимает к материалу', () => {
    const [s] = sanitizeSegments([seg({start: 45, duration: 99})], 47.3);
    expect(reads(s)).toBeLessThanOrEqual(47.3 + 1e-9);
  });

  it('держится на любых длинах, скоростях и точках старта', () => {
    for (const limit of [0.4, 1, 2.644, 9.7, 47.3, 60, 121.5]) {
      for (const speed of [1, 2, 3]) {
        for (const exact of [false, true]) {
          for (const k of [0, 0.37, 0.5, 0.83, 0.99]) {
            const raw = seg({start: limit * k, duration: limit, speed, exact});
            const [s] = sanitizeSegments([raw], limit);
            expect(reads(s), `${limit}с x${speed}${exact ? ' exact' : ''} от ${(limit * k).toFixed(2)}`)
              .toBeLessThanOrEqual(limit + 1 / REVIEW_FPS / 2);
          }
        }
      }
    }
  });

  it('снимает ускорение, если всей съёмки не хватает на долю', () => {
    const [s] = sanitizeSegments([seg({start: 0, duration: 0.5, speed: 3})], 0.5);
    expect(s.speed).toBe(1);
    expect(reads(s)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('повторная чистка ничего не меняет', () => {
    const once = sanitizeSegments([seg({start: 45, duration: 99})], 47.3);
    expect(sanitizeSegments(once, 47.3)).toEqual(once);
  });
});

describe('шаблон v1 идёт по исходнику вперёд', () => {
  // Раньше старты раскладывались по «своему максимуму» каждого пункта, и у ускоренного
  // он был другим: фрагменты налезали друг на друга, картинка прыгала назад.
  for (const limit of [12, 25, 47.3, 60, 180]) {
    it(`без нахлёстов на исходнике ${limit} с`, () => {
      const out = applyTemplate(limit, ['a', 'b', 'c', 'd', 'e', 'f']);
      expect(out).toHaveLength(TEMPLATE_V1.length);
      let prevEnd = 0;
      for (const s of out) {
        expect(s.start, `${s.note} стартует раньше конца предыдущего`).toBeGreaterThanOrEqual(prevEnd - 1e-9);
        prevEnd = s.start + s.duration;
      }
      expect(prevEnd).toBeLessThanOrEqual(limit + 1e-9);
    });
  }

  // Шаблон обещает 25 с экрана, но просит больше материала: ускоренный пункт берёт
  // 3 с экрана из 9 с съёмки. Порог — сумма seconds × speed.
  const BUDGET = TEMPLATE_V1.reduce((n, t) => n + t.seconds * t.speed, 0);
  const SCREEN = TEMPLATE_V1.reduce((n, t) => n + t.seconds, 0);

  it(`с ${BUDGET} с исходника отдаёт полные ${SCREEN} с экрана и доходит до конца`, () => {
    for (const limit of [BUDGET, BUDGET + 9, 60, 180]) {
      const out = applyTemplate(limit, []);
      const screen = out.reduce((n, s) => n + segmentSeconds(s), 0);
      expect(screen, `исходник ${limit} с`).toBeCloseTo(SCREEN, 6);
      const last = out[out.length - 1];
      expect(last.start + last.duration).toBeCloseTo(limit, 6);
    }
  });

  it('материала меньше порога — ролик короче, но БЕЗ повтора кадров', () => {
    // Полные 25 с из короткой съёмки достижимы только повтором материала —
    // это и читалось как рывок на склейке. Лучше честно отдать меньше.
    for (const limit of [8, 12, 20, 25]) {
      const out = applyTemplate(limit, []);
      const screen = out.reduce((n, s) => n + segmentSeconds(s), 0);
      expect(screen, `исходник ${limit} с`).toBeLessThanOrEqual(SCREEN + 1e-9);
      let prevEnd = 0;
      for (const s of out) {
        expect(s.start, `исходник ${limit} с, ${s.note}`).toBeGreaterThanOrEqual(prevEnd - 1e-9);
        prevEnd = s.start + s.duration;
      }
    }
  });

  it('материал короче шаблона — ужимает пропорционально, а не обрезает хвост', () => {
    const out = applyTemplate(10, []);
    expect(out).toHaveLength(TEMPLATE_V1.length);
    const last = out[out.length - 1];
    expect(last.start + last.duration).toBeLessThanOrEqual(10 + 1e-9);
  });
});

// Разрыв кадров там, где в съёмке разрыва нет.
// Плашка привязана к фрагменту, поэтому «показать плашку» раньше означало «разрезать видео».
// Но плашка — это наложение: непрерывную съёмку надо играть одним куском.
describe('непрерывная съёмка играет одним куском', () => {
  const runsOf = (segs: ReviewSegment[]) => videoRuns(buildTimeline(segs, REVIEW_FPS).items, REVIEW_FPS);

  it('«обзор целиком» — три фрагмента, но ни одной перемотки', () => {
    const src = 62.833333;
    const segs = sanitizeSegments(wholeReview(src), src);
    expect(segs).toHaveLength(3);
    expect(runsOf(segs)).toHaveLength(1);
  });

  it('стыки «обзора целиком» ровные — ни прыжка назад, ни пропуска', () => {
    for (const src of [9.7, 20, 47.3, 62.833333, 180]) {
      const segs = sanitizeSegments(wholeReview(src), src);
      let readTo = segs[0].start;
      for (const s of segs) {
        expect(s.start, `исходник ${src} с, ${s.note}`).toBeCloseTo(readTo, 6);
        readTo = s.start + segmentSeconds(s) * s.speed;
      }
      expect(readTo).toBeLessThanOrEqual(src + 1e-9);
    }
  });

  it('шаблон v1 режет там, где разрыв настоящий', () => {
    const segs = sanitizeSegments(applyTemplate(62.833333, []), 62.833333);
    expect(runsOf(segs)).toHaveLength(segs.length);
  });

  it('смена скорости разрывает кусок даже при стыке встык', () => {
    const segs: ReviewSegment[] = [
      seg({id: 'a', start: 0, duration: 2, speed: 1}),
      seg({id: 'b', start: 2, duration: 6, speed: 3}),
    ];
    expect(runsOf(segs)).toHaveLength(2);
  });

  it('округление длины не наползает на следующий фрагмент', () => {
    // Отмечено встык: 0→2.3 и 2.3→5. Раньше первый округлялся до 2.5 и залезал на второй,
    // а тот отматывал картинку назад.
    const segs = sanitizeSegments([
      seg({id: 'a', start: 0, duration: 2.3}),
      seg({id: 'b', start: 2.3, duration: 2.7}),
    ], 10);
    const readTo = segs[0].start + segmentSeconds(segs[0]) * segs[0].speed;
    expect(readTo).toBeLessThanOrEqual(segs[1].start + 1e-9);
  });

  it('нахлёст, размеченный автором, остаётся как есть', () => {
    // Прыгать по съёмке назад — нормальный монтаж, движок в это не лезет
    const segs = sanitizeSegments([
      seg({id: 'a', start: 40, duration: 2}),
      seg({id: 'b', start: 10, duration: 2}),
    ], 60);
    expect(segs[0].start).toBe(40);
    expect(segs[1].start).toBe(10);
  });
});
