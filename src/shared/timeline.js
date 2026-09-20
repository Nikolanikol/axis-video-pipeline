// Таймлайн обзора: фрагменты исходного видео → кадры ролика.
// (clipOf — из narration.js: длина фразы берётся из начитки)
// Общий модуль (JS) — его используют ролик, интерфейс, сервер и тесты.

/**
 * @typedef {'hook' | 'caption' | 'final'} SegmentKind
 * @typedef {{
 *   id: string, start: number, duration: number, speed: number,
 *   kind: SegmentKind, caption?: string, accent?: boolean, note?: string, exact?: boolean, voiceLine?: string,
 * }} Segment
 * start и duration — секунды исходника; speed — ускорение (1, 2, 3).
 * exact — длину не привязывать к доле (раскладка под озвучку: ритм задаёт речь).
 * hook — заставка с моделью, caption — фрагмент с плашкой (пустая — без плашки), final — цена и контакты.
 */

// 60 кадров: половина съёмки — проход камеры вокруг машины, и на 30 он заметно дёрганый.
// Детализация от частоты не зависит, но плавность движения — да. Цена: рендер вдвое дольше
// и файлы примерно на 40 % тяжелее. Рекламные форматы остаются на своей частоте (config/formats.json).
export const REVIEW_FPS = 60;
// Темп монтажа: длительности фрагментов кратны доле, чтобы склейки попадали в музыку
export const REVIEW_BPM = 120;
export const BEAT_SEC = 60 / REVIEW_BPM;
export const SPEEDS = [1, 2, 3];
export const KINDS = ['hook', 'caption', 'final'];
export const MAX_SEGMENTS = 30;
export const MAX_CAPTION = 80;
// Шортсы: не длиннее минуты
export const MAX_REVIEW_SEC = 60;
// Пустой проект: заглушка на 3 секунды
export const EMPTY_FRAMES = 3 * REVIEW_FPS;

import {clipOf, narrationSlots} from './narration.js';

const round = (v, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Длительность фрагмента в ролике (сек): исходник / ускорение.
 * Обычно привязана к доле — так склейки попадают в музыку.
 * У фрагментов с exact длина точная, до кадра: под озвучку, где ритм задаёт речь, а не бит.
 */
export const segmentSeconds = (seg) => {
  const raw = seg.duration / seg.speed;
  if (seg.exact) return Math.max(1 / REVIEW_FPS, Math.round(raw * REVIEW_FPS) / REVIEW_FPS);
  return Math.max(BEAT_SEC, Math.round(raw / BEAT_SEC) * BEAT_SEC);
};

/** Шаг, которым может меняться экранное время фрагмента: доля темпа, у exact — кадр */
const screenStep = (seg) => (seg.exact ? 1 / REVIEW_FPS : BEAT_SEC);

/**
 * Прижимает фрагмент к исходнику так, чтобы его экранное время в него помещалось.
 * segmentSeconds округляет длину ВВЕРХ к доле — без этой поправки ролик читает
 * дальше конца съёмки, и последний кадр подмерзает. В voiceTimeline такая защита
 * уже стоит; здесь она общая для всех раскладок.
 * @param {Segment} seg
 * @param {number} limit — длительность исходника
 * @returns {Segment}
 */
export const fitToSource = (seg, limit) => {
  if (!Number.isFinite(limit) || limit <= 0) return seg;
  // Метку автора не двигаем НИКОГДА: сдвиг начала назад каскадом ломает стык
  // с предыдущим фрагментом. Ужимается только длина.
  const room = Math.max(0, limit - seg.start); // исходника доступно с метки
  // Доля темпа при ускорении съедает вдвое-втрое больше съёмки: 0,5 с экрана при x3 — это 1,5 с.
  // Если места не хватает даже на минимум, сперва снимаем ускорение…
  let speed = seg.speed;
  while (speed > 1 && BEAT_SEC * speed > room) speed -= 1;
  // …но только если это и правда помогло: когда доля не влезает даже на x1, снижение
  // ускорения ничего не даёт, и менять замысел автора незачем — вернём как было.
  if (BEAT_SEC * speed > room) speed = seg.speed;
  // Доля не влезла — считаем этот фрагмент по кадрам, а не по долям темпа
  const fitted = {...seg, speed, exact: seg.exact || BEAT_SEC * speed > room};
  const step = screenStep(fitted);
  // Допуск на погрешность деления: 2,3333 / (1/30) даёт 69,99999, и без него
  // фрагмент терял кадр, а стык с соседом расходился и рвал картинку
  const maxScreen = Math.floor((room / speed) / step + 1e-6) * step;
  const screen = Math.max(step, Math.min(segmentSeconds(fitted), maxScreen));
  const fixed = Math.min(screen * speed, room);
  // У фрагментов под озвучку длина кратна кадру. Округление до знаков после запятой
  // ломает кратность (2,3333 → 2,333), стык расходится на кадр, и картинка рвётся там,
  // где съёмка продолжается: было 20 кусков съёмки вместо 10.
  return {...fitted, duration: fitted.exact ? Math.floor(fixed * REVIEW_FPS + 1e-6) / REVIEW_FPS : round(fixed)};
};

/**
 * @param {Segment[]} segments
 * @returns {{items: {seg: Segment, index: number, from: number, frames: number}[], durationInFrames: number}}
 */
export const buildTimeline = (segments, fps = REVIEW_FPS) => {
  let from = 0;
  const items = segments.map((seg, index) => {
    const frames = Math.round(segmentSeconds(seg) * fps);
    const item = {seg, index, from, frames};
    from += frames;
    return item;
  });
  return {items, durationInFrames: from};
};

/**
 * Непрерывные куски съёмки: соседние фрагменты, идущие по исходнику подряд и с той же
 * скоростью, — это один кусок, и рвать его нечем. Каждый новый элемент видео заново
 * перематывает файл, и на стыке дёргается кадр; при этом разреза в СОДЕРЖАНИИ там нет.
 * Плашки, субтитры и карточки от разреза не зависят — они ложатся поверх отдельными слоями.
 * @param {{seg: Segment, index: number, from: number, frames: number}[]} items — из buildTimeline
 * @returns {{seg: Segment, from: number, frames: number}[]}
 */
export const videoRuns = (items, fps = REVIEW_FPS) => {
  const runs = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    // Докуда предыдущий кусок уже прочитал исходник
    const readTo = last ? last.seg.start + (last.frames / fps) * last.seg.speed : 0;
    // Полкадра допуска: длины хранятся в секундах и округляются
    const joins = last && last.seg.speed === it.seg.speed && Math.abs(readTo - it.seg.start) < 0.5 / fps;
    if (joins) last.frames += it.frames;
    else runs.push({seg: it.seg, from: it.from, frames: it.frames});
  }
  return runs;
};

/** Длительность ролика в кадрах (у пустого проекта — заглушка) */
export const reviewFrames = (segments, fps = REVIEW_FPS) => buildTimeline(segments, fps).durationInFrames || EMPTY_FRAMES;

/** Кадры раскадровки: хук, пара фрагментов с плашками, финал */
export const reviewStoryboard = (segments, fps = REVIEW_FPS) => {
  const {items} = buildTimeline(segments, fps);
  if (!items.length) return [0];
  const at = (it, k) => it.from + Math.min(it.frames - 1, Math.round(it.frames * k));
  const hook = items.find((i) => i.seg.kind === 'hook') ?? items[0];
  const final = [...items].reverse().find((i) => i.seg.kind === 'final') ?? items[items.length - 1];
  const middle = items.filter((i) => i !== hook && i !== final);
  const withCaption = middle.filter((i) => i.seg.caption);
  const pool = withCaption.length >= 2 ? withCaption : middle;
  const picks = pool.length <= 2 ? pool : [pool[Math.floor(pool.length / 3)], pool[Math.floor((pool.length * 2) / 3)]];
  // Финал берём с середины: в конце ролика затемнение
  return [...new Set([at(hook, 0.8), ...picks.map((i) => at(i, 0.6)), at(final, 0.5)])].sort((a, b) => a - b);
};

/**
 * Чистит фрагменты из формы: границы исходника, допустимые скорость и тип, длина подписи.
 * @param {unknown} raw
 * @param {number | null | undefined} sourceDuration
 * @returns {Segment[]}
 */
export const sanitizeSegments = (raw, sourceDuration) => {
  if (!Array.isArray(raw)) return [];
  const limit = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Infinity;
  const seen = new Set();
  const out = [];
  for (const s of raw.slice(0, MAX_SEGMENTS)) {
    if (!s || typeof s !== 'object') continue;
    const id = typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) && !seen.has(s.id) ? s.id : `s${out.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    const start = Math.min(Math.max(0, Number(s.start) || 0), Math.max(0, limit - 0.1));
    const duration = Math.min(Math.max(0.1, Number(s.duration) || 0), limit - start);
    // У фрагментов под озвучку длины кратны кадру. Округление до знаков после запятой
    // ломает эту кратность (2,3333 → 2,333), и следующий стык расходится на кадр —
    // картинка рвётся там, где съёмка продолжается. Поэтому их держим на сетке кадров.
    const grid = (v) => (s.exact ? Math.floor(v * REVIEW_FPS + 1e-6) / REVIEW_FPS : round(v));
    out.push({
      id,
      start: grid(start),
      duration: grid(duration),
      speed: SPEEDS.includes(Number(s.speed)) ? Number(s.speed) : 1,
      exact: Boolean(s.exact),
      voiceLine: typeof s.voiceLine === 'string' && /^[\w-]{1,20}$/.test(s.voiceLine) ? s.voiceLine : undefined,
      kind: KINDS.includes(s.kind) ? s.kind : 'caption',
      caption: typeof s.caption === 'string' ? s.caption.slice(0, MAX_CAPTION) : '',
      accent: Boolean(s.accent),
      note: typeof s.note === 'string' ? s.note.slice(0, MAX_CAPTION) : '',
    });
  }
  // Длины правим одним проходом и обязательно по ИСХОДНОЙ разметке: fitToSource
  // переписывает duration округлённой длиной, и после него уже не отличить,
  // пересекались фрагменты у автора или наползли от округления.
  return out.map((cur, i) => {
    const next = out[i + 1];
    // Предел — конец съёмки, а если следом идёт фрагмент дальше по исходнику и автор
    // не размечал перекрытия, то и его начало: иначе округление длины вверх заедет
    // на соседа, и тот отмотает картинку назад. Авторский нахлёст и прыжки по съёмке
    // не трогаем — это монтаж.
    const abuts = next && next.start > cur.start && cur.start + cur.duration <= next.start + 1e-9;
    return fitToSource(cur, abuts ? Math.min(limit, next.start) : limit);
  });
};

// Шаблон v1: обход авто, 25 с. spec — какая строка характеристик лота идёт в плашку.
export const TEMPLATE_V1 = [
  {kind: 'hook', seconds: 3, speed: 1, note: 'Фронт 3/4'},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Заход сбоку', spec: 0},
  {kind: 'caption', seconds: 3, speed: 3, note: 'Проход вдоль борта'},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Фронт, решётка'},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Салон через дверь', spec: 1},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Сиденья, консоль', spec: 2},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Мультимедиа', spec: 3},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Люк', spec: 4},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Задний ряд'},
  {kind: 'caption', seconds: 2, speed: 1, note: 'Руль и приборка', spec: 5},
  {kind: 'final', seconds: 3, speed: 1, note: 'Фронт — цена и контакты'},
];

// Обзор целиком: заставка в начале, весь материал подряд, карточка с ценой в конце
export const WHOLE_HOOK_SEC = 3;
export const WHOLE_FINAL_SEC = 4.5;

/**
 * Раскладка «обзор целиком»: ничего не режет, только надевает заставку и финал на края исходника.
 * @param {number} sourceDuration
 * @returns {Segment[]}
 */
export const wholeReview = (sourceDuration) => {
  const total = Number(sourceDuration) > 0 ? Number(sourceDuration) : 0;
  const id = (n) => `w${n}-${Math.random().toString(36).slice(2, 6)}`;
  if (total < BEAT_SEC * 2) return [{id: id(1), start: 0, duration: round(Math.max(BEAT_SEC, total)), speed: 1, kind: 'hook', caption: '', accent: false, note: 'Весь материал'}];
  // Коротким исходникам середина не достаётся: только заставка и финал
  if (total < WHOLE_HOOK_SEC + WHOLE_FINAL_SEC + BEAT_SEC) {
    const hook = round(Math.min(WHOLE_HOOK_SEC, total / 2));
    return [
      {id: id(1), start: 0, duration: hook, speed: 1, kind: 'hook', caption: '', accent: false, note: 'Заставка'},
      {id: id(2), start: hook, duration: round(total - hook), speed: 1, kind: 'final', caption: '', accent: false, note: 'Цена и контакты'},
    ];
  }
  // Середину берём целым числом долей. Иначе segmentSeconds округлит её вверх, кусок
  // вычитает исходник дальше начала финала — и на стыке картинка прыгает назад.
  // Ровные стыки важны ещё и потому, что непрерывную съёмку ролик играет одним куском.
  const middle = Math.max(BEAT_SEC, Math.floor((total - WHOLE_HOOK_SEC - WHOLE_FINAL_SEC) / BEAT_SEC) * BEAT_SEC);
  const finalStart = round(WHOLE_HOOK_SEC + middle);
  return [
    {id: id(1), start: 0, duration: WHOLE_HOOK_SEC, speed: 1, kind: 'hook', caption: '', accent: false, note: 'Заставка поверх начала'},
    {id: id(2), start: WHOLE_HOOK_SEC, duration: round(middle), speed: 1, kind: 'caption', caption: '', accent: false, note: 'Обзор целиком'},
    // Финал длится ровно WHOLE_FINAL_SEC. Остаток съёмки (меньше доли) не добираем:
    // иначе длина перестанет быть кратной доле и стык уедет с бита.
    {id: id(3), start: finalStart, duration: round(Math.min(WHOLE_FINAL_SEC, total - finalStart)), speed: 1, kind: 'final', caption: '', accent: false, note: 'Цена и контакты'},
  ];
};

// Между фразами оставляем воздух, иначе озвучка звучит очередью
export const VOICE_GAP = 0.15;
// Щель короче этого считаем случайной и склеиваем встык: длины округляются вниз до целого кадра,
// курсор понемногу отстаёт, и картинка рвалась там, где съёмка на деле продолжается.
export const VOICE_SNAP = 0.25;

/**
 * Раскладка под озвучку: по фрагменту на строку перевода, длина — под синтезированный клип.
 * Кадр остаётся тот же, что был под этой фразой у автора, поэтому картинка не разъезжается с речью.
 * @param {{id: string, start: number, end: number}[]} lines
 * @param {{clips?: object, track?: {file: string}} | null | undefined} voice — озвучка: начитка или прежние клипы
 * @param {number} sourceDuration
 * @returns {Segment[]}
 */
export const voiceTimeline = (lines, voice, sourceDuration, {gap = VOICE_GAP} = {}) => {
  const limit = Number(sourceDuration) > 0 ? Number(sourceDuration) : Infinity;
  const usable = (Array.isArray(lines) ? lines : []).filter((l) => clipOf(voice, l?.id));
  // Длина фразы на экране — из начитки: у единой дорожки паузы уже внутри неё
  const slots = narrationSlots(usable, voice, {gap});
  // Сразу прижимаем к целому кадру: план и таймлайн должны считать одинаково, иначе
  // между фрагментами копится щель и картинка рвётся на ровном месте.
  // Округлять до знаков после запятой нельзя: 2,3333 станет 2,333, а прижатие к кадру
  // срежет с этого ещё кадр — ровно та щель, из-за которой появлялись лишние склейки.
  const want = slots.map((s) => Math.floor(s.seconds * REVIEW_FPS) / REVIEW_FPS);
  const total = want.reduce((a, b) => a + b, 0);

  // Курсор по исходнику идёт только вперёд: отмотка назад показала бы кусок дважды — это и читается как рывок.
  // Перескок к «своему» кадру ужимаем множителем, чтобы материала хватило до последней фразы.
  const plan = (factor) => {
    const starts = [];
    let pos = 0;
    usable.forEach((line, i) => {
      const wanted = pos + Math.max(0, line.start - pos) * factor;
      // Почти нулевой перескок — это не монтажное решение, а остаток округления
      const start = wanted - pos <= VOICE_SNAP ? pos : wanted;
      starts.push(start);
      pos = start + want[i];
    });
    return {starts, end: pos};
  };
  let factor = 1;
  if (plan(1).end > limit) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (plan(mid).end > limit) hi = mid; else lo = mid;
    }
    factor = lo;
  }
  const {starts} = plan(factor);

  const out = [];
  usable.forEach((line, i) => {
    const wanted = want[i];
    // Материала может не хватить, только если озвучка длиннее самой съёмки
    const start = Math.min(starts[i], Math.max(0, limit - wanted));
    // За исходник не вылезаем: у самого конца съёмки фрагмент может оказаться короче фразы
    const room = Math.min(wanted, limit - start);
    // Длина уже кратна кадру — режем только если упёрлись в конец съёмки
    const duration = room >= wanted ? wanted : Math.max(1 / REVIEW_FPS, Math.floor(room * REVIEW_FPS) / REVIEW_FPS);
    out.push({
      id: `v${i + 1}-${line.id}`.slice(0, 40),
      // Старт тоже держим на целом кадре: округление до знаков после запятой сдвигало
      // его вверх и последний фрагмент вылезал за конец съёмки
      start: Math.floor(start * REVIEW_FPS) / REVIEW_FPS,
      duration,
      speed: 1,
      exact: true,
      kind: i === 0 ? 'hook' : i === usable.length - 1 ? 'final' : 'caption',
      caption: '',
      accent: false,
      // Какую фразу озвучки играет этот фрагмент. Связываем явно: старты поджимаются под остаток
      // материала, и фрагмент может начаться позже своей фразы — по совпадению времён её не найти.
      voiceLine: line.id,
      note: i === 0 ? 'Заставка' : i === usable.length - 1 ? 'Цена и контакты' : `Фраза ${i + 1}`,
    });
  });
  return out.slice(0, MAX_SEGMENTS);
};

// Чистка пауз: тишина короче PAUSE_MIN_GAP остаётся, по краям фраз оставляем PAUSE_KEEP на дыхание
export const PAUSE_MIN_GAP = 1;
export const PAUSE_KEEP = 0.3;

/** Подгоняет кусок под долю: длину округляем вверх, чтобы не срезать слово, и держим внутри фрагмента */
const fitBeat = (start, end, lo, hi) => {
  const room = Math.max(BEAT_SEC, Math.floor((hi - lo) / BEAT_SEC) * BEAT_SEC);
  let duration = Math.min(room, Math.max(BEAT_SEC, Math.ceil((end - start) / BEAT_SEC) * BEAT_SEC));
  let from = Math.min(start, hi - duration);
  if (from < lo) from = lo;
  if (from + duration > hi) duration = Math.max(BEAT_SEC, Math.floor((hi - from) / BEAT_SEC) * BEAT_SEC);
  return {start: round(from), duration: round(duration)};
};

/**
 * Убирает из фрагментов длинные паузы: каждый фрагмент с речью разбивается по тишине.
 * Заставку, финал и ускоренные фрагменты не трогает — там карточки и своя логика звука.
 * @param {Segment[]} segments
 * @param {{start: number, end: number}[]} lines — строки речи, время исходника
 * @returns {Segment[]}
 */
export const cutPauses = (segments, lines, {minGap = PAUSE_MIN_GAP, keep = PAUSE_KEEP} = {}) => {
  const list = Array.isArray(segments) ? segments : [];
  const speech = (Array.isArray(lines) ? lines : [])
    .filter((l) => Number.isFinite(l?.start) && Number.isFinite(l?.end) && l.end > l.start)
    .sort((a, b) => a.start - b.start);
  if (!speech.length || !list.length) return list;

  const split = (gap) => {
    const out = [];
    for (const seg of list) {
      const segEnd = seg.start + seg.duration;
      const inside = seg.kind === 'caption' && seg.speed === 1
        ? speech.filter((l) => l.end > seg.start && l.start < segEnd)
        : [];
      if (!inside.length) { out.push(seg); continue; }
      // Склеиваем соседние фразы, если пауза между ними короткая
      const spans = [];
      for (const l of inside) {
        const start = Math.max(seg.start, l.start);
        const end = Math.min(segEnd, l.end);
        const last = spans[spans.length - 1];
        if (last && start - last.end <= gap) last.end = Math.max(last.end, end);
        else spans.push({start, end});
      }
      let prevEnd = seg.start;
      spans.forEach((span, i) => {
        const from = Math.max(prevEnd, span.start - keep);
        const to = Math.min(segEnd, span.end + keep);
        const fit = fitBeat(from, to, prevEnd, segEnd);
        prevEnd = fit.start + fit.duration;
        out.push({
          ...seg,
          id: `${seg.id}-${i + 1}`.slice(0, 40),
          start: fit.start,
          duration: fit.duration,
          // Плашку показываем один раз, на первом куске
          caption: i === 0 ? seg.caption : '',
          // Куски одного фрагмента нумеруем, иначе в списке они неразличимы
          note: spans.length > 1 ? `${seg.note || 'Без пауз'} · ${i + 1}`.slice(0, MAX_CAPTION) : seg.note,
        });
      });
    }
    return out;
  };

  let gap = minGap;
  let out = split(gap);
  // Не плодим фрагменты сверх лимита: короткие паузы оставляем в ролике
  for (let i = 0; out.length > MAX_SEGMENTS && i < 6; i++) out = split((gap *= 1.5));
  return out.slice(0, MAX_SEGMENTS);
};

/**
 * Раскладывает шаблон по исходнику: стартовые точки — равномерно, подписи — из характеристик лота.
 * Точные моменты потом выбираются на таймлайне.
 * @param {number} sourceDuration
 * @param {string[]} specs
 * @returns {Segment[]}
 */
export const applyTemplate = (sourceDuration, specs = [], template = TEMPLATE_V1) => {
  const total = Number(sourceDuration) > 0 ? Number(sourceDuration) : 0;
  const specList = specs.filter(Boolean);
  // Сколько исходника съедает каждый пункт: экранные секунды × ускорение
  let want = template.map((t) => t.seconds * t.speed);
  const need = want.reduce((a, b) => a + b, 0);
  // Материала меньше, чем просит шаблон, — ужимаем всё пропорционально
  if (need > total && need > 0) want = want.map((w) => (w * total) / need);
  // Раздаём не старты, а ПРОМЕЖУТКИ: иначе у ускоренных пунктов свой «максимальный старт»,
  // порядок ломается и фрагменты налезают друг на друга — картинка прыгает назад
  const spare = Math.max(0, total - want.reduce((a, b) => a + b, 0));
  const gap = template.length > 1 ? spare / (template.length - 1) : 0;
  let at = 0;
  return template.map((t, i) => {
    const start = at;
    at = start + want[i] + gap;
    return {
      id: `s${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
      start: round(start),
      duration: round(want[i]),
      speed: t.speed,
      kind: t.kind,
      caption: t.spec === undefined ? '' : (specList[t.spec] ?? ''),
      accent: false,
      note: t.note,
    };
  });
};
