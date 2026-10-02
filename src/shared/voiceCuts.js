// Границы фраз в единой начитке — по самому звуку, а не по разметке ElevenLabs.
//
// Разметка по символам (narration.js → lineTimes) даёт время конца последней буквы строки и
// начала первой буквы следующей. Это приблизительно: модель сдвигает отметки на 30–200 мс
// и особенно путает их, когда читает две строки слитно. Замер на обзоре «Santa fe» (25 строк):
//   • на обычных паузах отметка конца попадает в тишину — там всё чисто;
//   • слитные строки («…filming is» / «one hundred fifty-seven…», «via» / «the link…») разделены
//     70–80 мс настоящей речи: мы играли «до конца первой» и «с начала второй», и этот кусок
//     выпадал — слово обрывалось (владелец 02.10: «обрыв озвучки в конце фраз»);
//   • мягкий вход следующей фразы начинался за 30–60 мс до отметки и срезался.
//
// Поэтому после синтеза границы уточняются по огибающей громкости: между фразами ищем тишину
// и режем внутри неё (с запасом тишины после конца и перед началом — на сдвиг в кадр при
// воспроизведении); в слитной речи режем в самой тихой точке и встык, чтобы ни один отсчёт
// не пропал и не прозвучал дважды. Чистая функция: огибающую считает вызывающий.

export const HOP = 0.01;       // шаг огибающей, с
const QUIET = 0.012;           // громкость (RMS, 0…1) ниже которой считаем тишиной: шум комнаты ~0,002, речь ~0,2
const LOUD = 0.03;             // выше — точно речь (для хвоста последней фразы)
const MIN_RUN = 2;             // тишина короче 20 мс паузой не считается — это просто провал внутри слова
const SEARCH = 0.3;            // как далеко от отметки разметки искать паузу, с
const TAIL_PAD = 0.08;         // сколько тишины оставить после конца фразы, с
const LEAD_PAD = 0.05;         // и перед началом следующей
const TAIL_AFTER_SOUND = 0.12; // у последней фразы — запас после последнего слышимого звука

/**
 * Огибающая громкости: RMS по отрезкам в `hop` секунд.
 * @param {Int16Array} samples — моно, 16 бит
 * @param {number} sampleRate
 * @param {number} [hop]
 * @returns {Float32Array}
 */
export const envelopeOf = (samples, sampleRate, hop = HOP) => {
  const n = Math.max(1, Math.round(sampleRate * hop));
  const out = new Float32Array(Math.floor(samples.length / n));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = i * n; j < (i + 1) * n; j++) {
      const v = samples[j] / 32768;
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / n);
  }
  return out;
};

/** Участки тишины [start, end) в индексах огибающей внутри [lo, hi) */
const quietRuns = (env, lo, hi) => {
  const runs = [];
  let start = -1;
  for (let i = lo; i <= hi; i++) {
    const quiet = i < hi && env[i] < QUIET;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      if (i - start >= MIN_RUN) runs.push({start, end: i});
      start = -1;
    }
  }
  return runs;
};

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Уточнить границы строк по звуку.
 * @param {Record<string, {from: number, to: number}>} clips — отрезки по разметке: строка → секунды в дорожке
 * @param {Float32Array} env — огибающая громкости дорожки (envelopeOf)
 * @param {{hop?: number, duration?: number}} [options] — duration: длина дорожки, дальше неё не режем
 * @returns {Record<string, {from: number, to: number, cutFrom: number, cutTo: number, joinedNext?: boolean}>}
 *   from/to остаются как в разметке (по ним видно, где модель сделала паузу), а cutFrom/cutTo —
 *   откуда и докуда на самом деле играть. joinedNext — следующая строка читается слитно,
 *   границу поставили встык
 */
export const snapCuts = (clips, env, {hop = HOP, duration = Infinity} = {}) => {
  const ids = Object.keys(clips ?? {})
    .filter((id) => Number.isFinite(clips[id]?.from) && Number.isFinite(clips[id]?.to) && clips[id].to > clips[id].from)
    .sort((a, b) => clips[a].from - clips[b].from);
  const out = {};
  for (const id of ids) out[id] = {...clips[id], cutFrom: clips[id].from, cutTo: clips[id].to};
  if (!ids.length || !env?.length) return out;

  // Начало первой фразы: небольшой запас перед ней — мягкий вход
  out[ids[0]].cutFrom = round3(Math.max(0, clips[ids[0]].from - LEAD_PAD));

  // Стыки между соседними фразами
  for (let k = 0; k < ids.length - 1; k++) {
    const a = clips[ids[k]];
    const b = clips[ids[k + 1]];
    const mid = (a.to + b.from) / 2;
    // Окно поиска — вокруг отметок, но не глубже, чем внутрь самих фраз: иначе нашли бы паузу
    // между словами и обрезали фразу посередине
    const lo = Math.max(Math.floor((Math.min(a.to, b.from) - SEARCH) / hop), Math.floor(a.from / hop) + 2);
    const hi = Math.min(Math.ceil((Math.max(a.to, b.from) + SEARCH) / hop), Math.floor(b.to / hop) - 2, env.length);
    if (hi - lo < 3) continue;
    // Пауза, ближайшая к отметкам разметки
    const runs = quietRuns(env, lo, hi);
    const run = runs.sort((p, q) => Math.abs((p.start + p.end) / 2 * hop - mid) - Math.abs((q.start + q.end) / 2 * hop - mid))[0];
    let end;
    let start;
    if (run) {
      const len = (run.end - run.start) * hop;
      // Режем внутри тишины, не у самого края: при воспроизведении граница гуляет на кадр,
      // и пусть она попадает в тишину, а не в звук
      end = run.start * hop + Math.min(TAIL_PAD, len / 2);
      start = run.end * hop - Math.min(LEAD_PAD, len / 2);
    } else {
      // Паузы нет — модель прочитала слитно. Режем в самой тихой точке у отметок и встык
      const from = Math.max(lo, Math.floor((Math.min(a.to, b.from) - 0.1) / hop));
      const to = Math.min(hi, Math.ceil((Math.max(a.to, b.from) + 0.1) / hop));
      let best = from;
      for (let i = from; i < to; i++) if (env[i] < env[best]) best = i;
      end = start = (best + 0.5) * hop;
      out[ids[k]].joinedNext = true;
    }
    // Страховка: фраза не должна выродиться
    if (end - out[ids[k]].cutFrom < 0.05 || out[ids[k + 1]].cutTo - start < 0.05) continue;
    out[ids[k]].cutTo = round3(end);
    out[ids[k + 1]].cutFrom = round3(start);
  }

  // Конец последней фразы: до последнего слышимого звука плюс запас, но не за пределы дорожки
  const last = clips[ids[ids.length - 1]];
  const a = Math.max(0, Math.floor((last.to - 0.3) / hop));
  const b = Math.min(env.length, Math.ceil((last.to + 0.4) / hop));
  let lastLoud = -1;
  for (let i = a; i < b; i++) if (env[i] > LOUD) lastLoud = i;
  const heard = lastLoud >= 0 ? (lastLoud + 1) * hop + TAIL_AFTER_SOUND : last.to;
  out[ids[ids.length - 1]].cutTo = round3(Math.min(duration, Math.max(last.to, heard)));
  return out;
};
