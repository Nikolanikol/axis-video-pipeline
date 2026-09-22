// Начитка: сборка текста, разбор разметки по символам, откуда играть строку
import {describe, expect, it} from 'vitest';
import {buildScript, clipOf, lineTimes, narrationSlots, voicePlan, voicedCount} from '../../src/shared/narration.js';

const lines = [
  {id: 'l1', translation: 'Прва реченица.'},
  {id: 'l2', translation: 'Втора реченица.'},
  {id: 'l3', translation: 'Трета.'},
];

describe('текст начитки', () => {
  it('строки склеиваются, границы каждой известны', () => {
    const {text, spans} = buildScript(lines);
    expect(text).toBe('Прва реченица. Втора реченица. Трета.');
    expect(spans.map((s) => s.id)).toEqual(['l1', 'l2', 'l3']);
    // границы указывают ровно на свою строку
    for (const s of spans) {
      const part = text.slice(s.from, s.to + 1);
      expect(part).toBe(lines.find((l) => l.id === s.id)!.translation);
    }
  });

  it('строки без перевода пропускаются, лишние пробелы снимаются', () => {
    const {text, spans} = buildScript([
      {id: 'a', translation: '  Прва.  '}, {id: 'b', translation: ''}, {id: 'c'} as never, {id: 'd', translation: 'Втора.'},
    ]);
    expect(text).toBe('Прва. Втора.');
    expect(spans.map((s) => s.id)).toEqual(['a', 'd']);
  });

  it('пустой вход — пустой текст', () => {
    expect(buildScript([])).toEqual({text: '', spans: []});
    expect(buildScript(undefined as never)).toEqual({text: '', spans: []});
  });
});

describe('разметка по символам → отрезки строк', () => {
  // «аб вг»: по 0,1 с на символ
  const alignment = {
    characters: ['а', 'б', ' ', 'в', 'г'],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
  };
  const spans = [{id: 'l1', from: 0, to: 1}, {id: 'l2', from: 3, to: 4}];

  it('строка берёт время от первого своего символа до последнего', () => {
    expect(lineTimes(spans, alignment)).toEqual({l1: {from: 0, to: 0.2}, l2: {from: 0.3, to: 0.5}});
  });

  it('строки вне разметки отбрасываются, а не ломают остальные', () => {
    const out = lineTimes([...spans, {id: 'l9', from: 50, to: 60}], alignment);
    expect(Object.keys(out)).toEqual(['l1', 'l2']);
    expect(lineTimes(spans, undefined as never)).toEqual({});
  });
});

describe('откуда играть строку', () => {
  const track = {track: {file: '/v/track.mp3'}, clips: {l1: {from: 1.5, to: 4}}};
  const old = {clips: {l1: {file: '/v/l1.mp3', duration: 2.5}}};

  it('единая начитка — отрезок общей дорожки', () => {
    expect(clipOf(track, 'l1')).toEqual({file: '/v/track.mp3', offset: 1.5, duration: 2.5});
  });

  it('прежние обзоры со своим файлом на строку продолжают играть', () => {
    expect(clipOf(old, 'l1')).toEqual({file: '/v/l1.mp3', offset: 0, duration: 2.5});
  });

  it('битые и отсутствующие записи — null, а не тишина в кадре', () => {
    expect(clipOf(track, 'нет')).toBeNull();
    expect(clipOf({clips: {l1: {from: 2, to: 2}}, track: {file: '/t.mp3'}}, 'l1')).toBeNull();
    expect(clipOf({clips: {l1: {from: 1, to: 2}}}, 'l1')).toBeNull();   // дорожки нет
    expect(clipOf(null, 'l1')).toBeNull();
  });

  it('считаем только те строки, которые реально звучат', () => {
    expect(voicedCount(track)).toBe(1);
    expect(voicedCount({clips: {l1: {from: 1, to: 2}}})).toBe(0);
    expect(voicedCount(null)).toBe(0);
  });
});

describe('сколько времени отвести фразе', () => {
  const ids = [{id: 'l1'}, {id: 'l2'}, {id: 'l3'}];

  it('единая начитка: до начала следующей фразы — вместе с паузой модели', () => {
    const voice = {track: {file: '/v/t.mp3'}, clips: {
      l1: {from: 0, to: 2}, l2: {from: 2.5, to: 4}, l3: {from: 5, to: 6},
    }};
    // 0→2,5 и 2,5→5: полсекунды паузы остаются внутри отрезка, а не вырезаются
    expect(narrationSlots(ids, voice).map((s) => s.seconds)).toEqual([2.5, 2.5, 1.15]);
  });

  it('отрезок никогда не короче самой фразы', () => {
    const voice = {track: {file: '/v/t.mp3'}, clips: {l1: {from: 0, to: 3}, l2: {from: 1, to: 2}}};
    expect(narrationSlots([{id: 'l1'}, {id: 'l2'}], voice)[0].seconds).toBe(3);
  });

  it('прежние обзоры: длина клипа плюс зазор', () => {
    const voice = {clips: {l1: {file: '/a.mp3', duration: 2}, l2: {file: '/b.mp3', duration: 1}}};
    expect(narrationSlots([{id: 'l1'}, {id: 'l2'}], voice, {gap: 0.15}).map((s) => s.seconds)).toEqual([2.15, 1.15]);
  });

  it('строки без звука пропускаются', () => {
    expect(narrationSlots(ids, {clips: {}})).toEqual([]);
    expect(narrationSlots([], null as never)).toEqual([]);
  });
});

describe('укладка озвучки по всему ролику', () => {
  const fps = 60;
  // Обзор целиком: заставка 0–3, середина 3–10, финал 10–14 (в секундах исходника и ролика)
  const items = [
    {seg: {start: 0, duration: 3, speed: 1, kind: 'hook'}, from: 0, frames: 3 * fps},
    {seg: {start: 3, duration: 7, speed: 1, kind: 'caption'}, from: 3 * fps, frames: 7 * fps},
    {seg: {start: 10, duration: 4, speed: 1, kind: 'final'}, from: 10 * fps, frames: 4 * fps},
  ];
  const lines = [
    {id: 'l1', start: 0.5, end: 2, text: 'а'},
    {id: 'l2', start: 9.5, end: 10.5, text: 'б'},   // начинается в середине, звучит через стык
    {id: 'l3', start: 11, end: 12, text: 'в'},
  ];
  const voice = {track: {file: '/v/t.mp3'}, clips: {
    l1: {from: 0, to: 2}, l2: {from: 2.5, to: 5.5}, l3: {from: 6, to: 7},
  }};

  it('фраза на стыке фрагментов звучит целиком, а не обрывается их границей', () => {
    const plan = voicePlan(items, lines, voice, fps);
    const l2 = plan.find((c) => c.id === 'l2')!;
    // клип длится 3 с — раньше его резал конец середины на 10-й секунде
    expect(l2.frames).toBe(3 * fps);
    expect(l2.from).toBe(Math.round(9.5 * fps));
  });

  it('фразы не накладываются и идут по порядку', () => {
    const plan = voicePlan(items, lines, voice, fps);
    expect(plan.map((c) => c.id)).toEqual(['l1', 'l2', 'l3']);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].from).toBeGreaterThanOrEqual(plan[i - 1].from + plan[i - 1].frames);
    }
  });

  it('за конец ролика не вылезает', () => {
    const rollEnd = items[items.length - 1].from + items[items.length - 1].frames;
    for (const c of voicePlan(items, lines, voice, fps)) {
      expect(c.from + c.frames).toBeLessThanOrEqual(rollEnd);
    }
  });

  it('если начитка длиннее съёмки — поджимаются паузы, а последняя фраза остаётся', () => {
    // Синтез говорит чуть медленнее автора: фразы те же, но каждая длиннее, и хвост
    // не влезает в 14 секунд ролика, если класть их строго по временам исходника
    const slow = {track: {file: '/v/t.mp3'}, clips: {
      l1: {from: 0, to: 3}, l2: {from: 3, to: 7.5}, l3: {from: 8, to: 13},
    }};
    const plan = voicePlan(items, lines, slow, fps);
    expect(plan.map((c) => c.id)).toEqual(['l1', 'l2', 'l3']);
    // все три звучат целиком, ничего не обрезано концом ролика
    expect(plan.map((c) => c.frames)).toEqual([3 * fps, 4.5 * fps, 5 * fps]);
    const rollEnd = items[items.length - 1].from + items[items.length - 1].frames;
    expect(plan.at(-1)!.from + plan.at(-1)!.frames).toBeLessThanOrEqual(rollEnd);
  });

  it('речи больше, чем ролика — хвост честно обрезается, начало не едет', () => {
    const tooMuch = {track: {file: '/v/t.mp3'}, clips: {
      l1: {from: 0, to: 9}, l2: {from: 9, to: 18}, l3: {from: 18, to: 27},
    }};
    const plan = voicePlan(items, lines, tooMuch, fps);
    expect(plan[0].from).toBe(Math.round(0.5 * fps));  // первая — на своём месте
    const rollEnd = items[items.length - 1].from + items[items.length - 1].frames;
    for (const c of plan) expect(c.from + c.frames).toBeLessThanOrEqual(rollEnd);
  });

  it('фразы, прочитанные слитно, не разносятся по паузам автора', () => {
    // Автор на своём языке сделал паузу посреди мысли: «Пробег,» … «пробег сто шестнадцать».
    // В переводе это одно предложение, и модель прочитала его без паузы — в дорожке клипы
    // идут встык. Разнести их по местам его пауз значит вставить тишину в середину фразы.
    const split = [
      {id: 'a', start: 0.5, end: 1, text: 'Пробег,'},
      {id: 'b', start: 4.0, end: 6, text: 'пробег сто шестнадцать тысяч'},   // пауза 3 секунды
    ];
    const glued = {track: {file: '/v/t.mp3'}, clips: {
      a: {from: 0, to: 0.8},
      b: {from: 0.8, to: 3},     // встык: модель паузы не делала
    }};
    const plan = voicePlan(items, split, glued, fps);
    expect(plan.map((c) => c.id)).toEqual(['a', 'b']);
    // Вторая начинается ровно там, где кончилась первая, а не на 4-й секунде
    expect(plan[1].from).toBe(plan[0].from + plan[0].frames);
  });

  it('там, где модель паузу сделала, место автора сохраняется', () => {
    const split = [
      {id: 'a', start: 0.5, end: 1, text: 'первая'},
      {id: 'b', start: 4.0, end: 6, text: 'вторая'},
    ];
    const apart = {track: {file: '/v/t.mp3'}, clips: {
      a: {from: 0, to: 0.8},
      b: {from: 1.6, to: 3.8},   // в дорожке между ними 0,8 с тишины — это настоящая пауза
    }};
    const plan = voicePlan(items, split, apart, fps);
    expect(plan[1].from).toBe(Math.round(4 * fps));
  });

  it('каждая фраза звучит ровно один раз', () => {
    const plan = voicePlan(items, lines, voice, fps);
    expect(new Set(plan.map((c) => c.id)).size).toBe(plan.length);
  });

  it('без озвучки и на ускоренных фрагментах — пусто', () => {
    expect(voicePlan(items, lines, {clips: {}}, fps)).toEqual([]);
    expect(voicePlan(items, lines, null, fps)).toEqual([]);
    const fast = items.map((i) => ({...i, seg: {...i.seg, speed: 3}}));
    expect(voicePlan(fast, lines, voice, fps)).toEqual([]);
  });
});
