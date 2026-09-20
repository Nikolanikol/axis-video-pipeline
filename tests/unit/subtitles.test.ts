// Субтитры: слова с таймингами → строки, чистка правок, привязка к фрагментам
import {describe, expect, it} from 'vitest';
import {MAX_LINE_CHARS, lineText, linesForSegment, linesFromWords, sanitizeLines, speechStale, voiceForSegment} from '../../src/shared/subtitles.js';

const words = (...items: [string, number, number][]) => items.map(([text, start, end]) => ({text, start, end, type: 'word'}));

describe('строки из слов', () => {
  it('фраза не рвётся посреди, конец предложения — новая строка', () => {
    const lines = linesFromWords(words(
      ['Смотрим', 0, 0.5], ['Audi', 0.5, 0.9], ['A6,', 0.9, 1.4], ['2018', 1.4, 2], ['год,', 2, 2.4], ['дизель.', 2.4, 3],
      ['Пробег', 3.2, 3.6], ['78', 3.6, 4], ['498', 4, 4.5], ['км.', 4.5, 4.9],
    ));
    expect(lines.map((l) => l.text)).toEqual(['Смотрим Audi A6, 2018 год, дизель.', 'Пробег 78 498 км.']);
    expect(lines[0]).toMatchObject({start: 0, end: 3});
    expect(lines[1].start).toBe(3.2);
  });

  it('пауза в речи разрывает строку', () => {
    const lines = linesFromWords(words(['Раз', 0, 0.4], ['два', 0.4, 0.8], ['три', 3, 3.4]));
    expect(lines).toHaveLength(2);
    expect(lines[1].text).toBe('три');
  });

  it('длинная речь без пауз режется по длине', () => {
    const lines = linesFromWords(words(...Array.from({length: 20}, (_, i) => ['слово', i * 0.2, i * 0.2 + 0.2] as [string, number, number])));
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(MAX_LINE_CHARS + 8);
  });

  it('звуки вроде [tone] и пустые слова в субтитры не идут', () => {
    const lines = linesFromWords([
      {text: '[tone]', start: 0, end: 0.2, type: 'audio_event'},
      {text: ' ', start: 0.2, end: 0.3, type: 'spacing'},
      {text: 'Привет', start: 0.3, end: 0.8, type: 'word'},
    ]);
    expect(lines).toEqual([expect.objectContaining({text: 'Привет'})]);
  });

  it('пустой вход — пустой список', () => {
    expect(linesFromWords([])).toEqual([]);
    expect(linesFromWords(undefined as never)).toEqual([]);
  });
});

describe('правки строк', () => {
  it('границы, длина текста, пустые строки', () => {
    const out = sanitizeLines([
      {id: 'l1', start: -5, end: 100, text: 'x'.repeat(300), translation: 'y'},
      {id: '../bad', start: 2, end: 1, text: 'текст'},
      {id: 'l3', start: 1, end: 2, text: '', translation: ''},
    ], 20);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({start: 0, end: 20});
    expect(out[0].text).toHaveLength(200);
    expect(out[1].id).toBe('l2');
    expect(out[1].end).toBeGreaterThan(out[1].start);
  });

  it('показываем перевод, только когда он есть и выбран', () => {
    const line = {id: 'l1', start: 0, end: 1, text: 'Привет', translation: 'Здраво'};
    expect(lineText(line, true)).toBe('Здраво');
    expect(lineText(line, false)).toBe('Привет');
    expect(lineText({...line, translation: ''}, true)).toBe('Привет');
  });
});

describe('озвучка внутри фрагмента', () => {
  const lines = [
    {id: 'l1', start: 0, end: 2, text: 'первая'},
    {id: 'l2', start: 4, end: 6, text: 'вторая'},
    {id: 'l3', start: 10, end: 12, text: 'третья'},
  ];
  // Прежний способ: свой файл на строку — такие обзоры ещё есть
  const clips = {clips: {
    l1: {file: '/v/l1.mp3', duration: 2.5},
    l2: {file: '/v/l2.mp3', duration: 1},
    l3: {file: '/v/l3.mp3', duration: 3},
  }};
  // Единая начитка: отрезки общей дорожки
  const track = {track: {file: '/v/track.mp3'}, clips: {
    l1: {from: 0, to: 2.5}, l2: {from: 3, to: 4}, l3: {from: 5, to: 8},
  }};

  it('фраза звучит там, где она была у автора, — озвучка не убегает от картинки', () => {
    const out = voiceForSegment(lines, clips, {start: 0, duration: 8, speed: 1}, 240, 30);
    expect(out.map((o) => o.id)).toEqual(['l1', 'l2']);
    expect(out[0]).toMatchObject({from: 0, frames: 75, file: '/v/l1.mp3'});
    // строка начиналась на 4-й секунде — клип и стоит на 4-й, а не сразу за первым
    expect(out[1]).toMatchObject({from: 120, frames: 30, file: '/v/l2.mp3'});
  });

  it('если клип длиннее паузы, следующая фраза сдвигается, а не накладывается', () => {
    const long = {clips: {l1: {file: '/v/l1.mp3', duration: 5}, l2: {file: '/v/l2.mp3', duration: 1}}};
    const out = voiceForSegment(lines, long, {start: 0, duration: 8, speed: 1}, 240, 30);
    expect(out[0]).toMatchObject({from: 0, frames: 150});
    expect(out[1].from).toBe(150);                       // 4-я секунда занята — встаём следом
    expect(out[1].from).toBeGreaterThanOrEqual(out[0].from + out[0].frames);
  });

  it('берутся только фразы, начинающиеся внутри фрагмента — клип не звучит дважды', () => {
    // строка l1 началась раньше фрагмента: её озвучка звучит в своём фрагменте, не здесь
    const out = voiceForSegment(lines, clips, {start: 1, duration: 5, speed: 1}, 150, 30);
    expect(out.map((o) => o.id)).toEqual(['l2']);
  });

  it('за длину фрагмента не вылезает', () => {
    const out = voiceForSegment(lines, clips, {start: 10, duration: 2, speed: 1}, 60, 30);
    expect(out[0]).toMatchObject({id: 'l3', from: 0, frames: 60});
  });

  it('единая начитка: фраза играет отрезком общей дорожки', () => {
    const out = voiceForSegment(lines, track, {start: 0, duration: 8, speed: 1}, 240, 30);
    expect(out.map((o) => o.id)).toEqual(['l1', 'l2']);
    // файл один на всех, а откуда играть — задаёт offset
    expect(out[0]).toMatchObject({file: '/v/track.mp3', offset: 0, frames: 75});
    expect(out[1]).toMatchObject({file: '/v/track.mp3', offset: 3, frames: 30});
  });

  it('фрагмент со своей фразой играет её, даже если начался позже неё', () => {
    // Раскладка «под озвучку» поджимает старты: фрагмент начинается на 4,2 с, а фраза была на 4 с
    const seg = {start: 4.2, duration: 2, speed: 1, voiceLine: 'l2'};
    const out = voiceForSegment(lines, track, seg, 60, 30);
    expect(out.map((o) => o.id)).toEqual(['l2']);
    expect(out[0]).toMatchObject({from: 0, offset: 3, frames: 30});
  });

  it('фрагмент ссылается на несуществующую фразу — тишина, а не чужой голос', () => {
    expect(voiceForSegment(lines, track, {start: 0, duration: 2, speed: 1, voiceLine: 'нет'}, 60, 30)).toEqual([]);
  });

  it('без клипов и на ускоренном фрагменте — пусто', () => {
    expect(voiceForSegment(lines, {clips: {}}, {start: 0, duration: 8, speed: 1}, 240, 30)).toEqual([]);
    expect(voiceForSegment(lines, clips, {start: 0, duration: 8, speed: 2}, 120, 30)).toEqual([]);
  });
});

describe('строки внутри фрагмента', () => {
  const lines = [
    {id: 'l1', start: 0, end: 2, text: 'первая'},
    {id: 'l2', start: 4, end: 6, text: 'вторая'},
    {id: 'l3', start: 10, end: 12, text: 'третья'},
  ];

  it('берутся только пересекающиеся, время пересчитывается в кадры фрагмента', () => {
    const out = linesForSegment(lines, {start: 3.5, duration: 3, speed: 1}, 90, 30);
    expect(out.map((o) => o.id)).toEqual(['l2']);
    expect(out[0]).toMatchObject({from: 15, frames: 60});
  });

  it('ускоренный фрагмент — без субтитров: звука на нём тоже нет', () => {
    expect(linesForSegment(lines, {start: 0, duration: 6, speed: 2}, 90, 30)).toEqual([]);
    expect(linesForSegment(lines, {start: 0, duration: 9, speed: 3}, 90, 30)).toEqual([]);
    // на обычной скорости те же строки видны
    expect(linesForSegment(lines, {start: 0, duration: 6, speed: 1}, 180, 30).map((o) => o.id)).toEqual(['l1', 'l2']);
  });

  it('фрагмент без речи — пусто', () => {
    expect(linesForSegment(lines, {start: 7, duration: 2, speed: 1}, 60, 30)).toEqual([]);
  });
});

describe('речь и видео должны быть об одном', () => {
  const lines = [{id: 'l1', start: 0, end: 2, text: 'а'}, {id: 'l2', start: 58, end: 62, text: 'б'}];

  it('видео заменили — речь помечается чужой', () => {
    const speech = {source: {name: 'IMG_3678.MOV', duration: 62.7}, lines};
    expect(speechStale(speech, {name: 'IMG_3678.MOV', duration: 62.7})).toBe(false);
    expect(speechStale(speech, {name: 'IMG_3640.MOV', duration: 85.3})).toBe(true);
    // тот же файл, но перезалит другой длины — тоже чужая
    expect(speechStale(speech, {name: 'IMG_3678.MOV', duration: 85.3})).toBe(true);
  });

  it('у старых обзоров пометки нет — ловим явное: речь длиннее съёмки', () => {
    const speech = {lines};
    expect(speechStale(speech, {duration: 85.3})).toBe(false);
    expect(speechStale(speech, {duration: 30})).toBe(true);
  });

  it('без речи или без видео сравнивать нечего', () => {
    expect(speechStale({lines: []}, {duration: 10})).toBe(false);
    expect(speechStale(null, {duration: 10})).toBe(false);
    expect(speechStale({lines}, null)).toBe(false);
  });
});
