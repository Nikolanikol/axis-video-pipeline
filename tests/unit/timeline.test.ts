// Таймлайн обзора: длительности, привязка к долям, шаблон v1, чистка фрагментов
import {describe, expect, it} from 'vitest';
import {
  BEAT_SEC, EMPTY_FRAMES, MAX_CAPTION, MAX_SEGMENTS, REVIEW_FPS, TEMPLATE_V1,
  WHOLE_FINAL_SEC, WHOLE_HOOK_SEC, applyTemplate, buildTimeline, cutPauses, reviewFrames,
  reviewStoryboard, sanitizeSegments, segmentSeconds, voiceTimeline, wholeReview,
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
    expect(items.map((i) => [i.from, i.frames])).toEqual([[0, 90], [90, 90], [180, 30]]);
    expect(durationInFrames).toBe(210);
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
    expect(frames[0]).toBeLessThan(90);                 // хук — первые 3 с
    expect(frames[frames.length - 1]).toBeGreaterThanOrEqual(total - 90); // финал — последние 3 с
    expect(frames[frames.length - 1]).toBeLessThan(total - 12);            // но не в затемнении в конце
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
    expect(s[2].start + s[2].duration).toBeCloseTo(62.667, 1);
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
  const clips = {l1: {duration: 3.4}, l2: {duration: 1.2}, l3: {duration: 2.0}};

  it('фрагмент на строку: кадр от автора, длина ровно под клип плюс воздух', () => {
    const s = voiceTimeline(lines, clips, 30, {gap: 0.15});
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.kind)).toEqual(['hook', 'caption', 'final']);
    expect(s.map((x) => x.start)).toEqual([0.5, 10, 20]);
    // клип + воздух, прижатое к целому кадру: 3,55 / 1,35 / 2,15 с
    s.forEach((x, i) => expect(x.duration).toBeCloseTo([3.533, 1.333, 2.133][i], 3));
    // длина не привязана к доле: под озвучку ритм задаёт речь, а не бит
    expect(s.every((x) => x.exact === true)).toBe(true);
    s.forEach((x) => expect(segmentSeconds(x)).toBeCloseTo(x.duration, 6));
    expect(s.every((x) => x.speed === 1)).toBe(true);
  });

  it('назад не отматывает: кусок съёмки не показывается дважды', () => {
    // клипы длиннее пауз между фразами — наивная раскладка ушла бы назад
    const tight = {l1: {duration: 6}, l2: {duration: 6}, l3: {duration: 6}};
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
    s.forEach((x, i) => expect(x.duration).toBeCloseTo([3.533, 1.333, 2.133][i], 3));
  });

  it('строки без озвучки пропускаются', () => {
    const s = voiceTimeline(lines, {l2: {duration: 1.2}}, 30);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({start: 10, kind: 'hook'});
    expect(voiceTimeline(lines, {}, 30)).toEqual([]);
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
    expect(c).toMatchObject({start: 0, duration: 0.1, speed: 3, kind: 'hook', accent: true});
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
