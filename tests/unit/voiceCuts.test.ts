// Границы фраз по звуку: режем в паузах, слитную речь — встык, ничего не теряем и не дублируем
import {describe, expect, it} from 'vitest';
import {HOP, snapCuts} from '../../src/shared/voiceCuts.js';
import {clipOf, voicePlan} from '../../src/shared/narration.js';

// Огибающая из описания: [секунды, громкость]… — отрезки подряд
const envOf = (parts: [number, number][]) => {
  const out: number[] = [];
  for (const [sec, level] of parts) for (let i = 0; i < Math.round(sec / HOP); i++) out.push(level);
  return Float32Array.from(out);
};
const LOUD = 0.2;
const QUIET = 0.002;

describe('границы фраз по звуку', () => {
  it('обычная пауза: конец и начало — внутри тишины, с запасом', () => {
    // речь 0–1, пауза 1,0–1,4, речь 1,4–2,4. Разметка ошиблась: конец на 0,9 (в звуке), начало на 1,5 (в звуке)
    const env = envOf([[1, LOUD], [0.4, QUIET], [1, LOUD]]);
    const cuts = snapCuts({a: {from: 0, to: 0.9}, b: {from: 1.5, to: 2.4}}, env, {duration: 2.4});
    expect(cuts.a.cutTo).toBeGreaterThanOrEqual(1.0);   // не раньше конца звука
    expect(cuts.a.cutTo).toBeLessThan(1.4);             // и не позже начала следующего
    expect(cuts.b.cutFrom).toBeGreaterThan(1.0);
    expect(cuts.b.cutFrom).toBeLessThanOrEqual(1.4);    // начало — до звука, мягкий вход не срезан
    expect(cuts.a.cutTo).toBeLessThanOrEqual(cuts.b.cutFrom); // не накладываются
    expect(cuts.a.joinedNext).toBeUndefined();
  });

  it('слитная речь без паузы: граница встык в самой тихой точке — кусок между отметками не выпадает', () => {
    // Сплошной звук с «провалом» на 1,05 (слог кончился). Разметка: конец 1,0, начало 1,1 — между ними 0,1 с речи
    const env = envOf([[1.05, LOUD], [0.02, 0.06], [1.05, LOUD]]);
    const cuts = snapCuts({a: {from: 0, to: 1.0}, b: {from: 1.1, to: 2.1}}, env, {duration: 2.12});
    expect(cuts.a.joinedNext).toBe(true);
    expect(cuts.a.cutTo).toBe(cuts.b.cutFrom);          // встык: ни дыры, ни повтора
    expect(cuts.a.cutTo).toBeGreaterThan(1.0);
    expect(cuts.a.cutTo).toBeLessThan(1.1);
  });

  it('разметка у клипа остаётся как была: по ней видно, где модель сделала паузу', () => {
    const env = envOf([[1, LOUD], [0.4, QUIET], [1, LOUD]]);
    const cuts = snapCuts({a: {from: 0, to: 0.9}, b: {from: 1.5, to: 2.4}}, env);
    expect(cuts.a.from).toBe(0);
    expect(cuts.a.to).toBe(0.9);
    expect(cuts.b.from).toBe(1.5);
  });

  it('поиск паузы не уходит внутрь фразы: пауза между словами не принимается за стык', () => {
    // Внутри фразы a есть пауза 0,5–0,7 (запятая); настоящий стык — 1,6–1,8. Разметка слегка мимо
    const env = envOf([[0.5, LOUD], [0.2, QUIET], [0.9, LOUD], [0.2, QUIET], [1, LOUD]]);
    const cuts = snapCuts({a: {from: 0, to: 1.65}, b: {from: 1.85, to: 2.8}}, env);
    expect(cuts.a.cutTo).toBeGreaterThan(1.6);          // не 0,5–0,7
  });

  it('последняя фраза: хвост звука не режется отметкой, но и за дорожку не выходим', () => {
    const env = envOf([[1, LOUD], [0.3, 0.05], [0.5, QUIET]]); // голос тянется до 1,3, отметка конца — 1,0
    const cuts = snapCuts({a: {from: 0, to: 1.0}}, env, {duration: 1.6});
    expect(cuts.a.cutTo).toBeGreaterThanOrEqual(1.3);
    expect(cuts.a.cutTo).toBeLessThanOrEqual(1.6);
    const short = snapCuts({a: {from: 0, to: 1.0}}, env, {duration: 1.35});
    expect(short.a.cutTo).toBeLessThanOrEqual(1.35);
  });

  it('пустая огибающая или строки без отметок — отрезки остаются по разметке, ничего не падает', () => {
    expect(snapCuts({a: {from: 0, to: 1}}, new Float32Array(0)).a.cutTo).toBe(1);
    expect(snapCuts({}, envOf([[1, LOUD]]))).toEqual({});
    expect(Object.keys(snapCuts({a: {from: 2, to: 1}} as never, envOf([[3, LOUD]])))).toEqual([]);
  });
});

describe('уточнённые границы в озвучке', () => {
  const track = {file: '/t.mp3', duration: 10};

  it('clipOf играет cutFrom…cutTo, а без них — разметку, как раньше', () => {
    const cut = {track, clips: {a: {from: 1, to: 2, cutFrom: 0.95, cutTo: 2.08}}};
    expect(clipOf(cut, 'a')).toMatchObject({offset: 0.95, duration: 1.13, rawFrom: 1, rawTo: 2});
    const old = {track, clips: {a: {from: 1, to: 2}}};
    expect(clipOf(old, 'a')).toMatchObject({offset: 1, duration: 1, rawFrom: 1, rawTo: 2});
  });

  it('запас тишины не делает обычную паузу «слитным чтением»: фразы остаются на местах автора', () => {
    // Модель сделала паузу 0,3 с. Запасы после конца и перед началом съедают почти всю её:
    // границы воспроизведения смыкаются, но по разметке фразы НЕ слитны — и клеить их нельзя
    const voice = {
      track,
      clips: {
        a: {from: 0, to: 1, cutFrom: 0, cutTo: 1.15},
        b: {from: 1.3, to: 2.3, cutFrom: 1.15, cutTo: 2.3},
      },
    };
    const lines = [{id: 'a', start: 0, end: 1}, {id: 'b', start: 5, end: 6}];
    const fps = 60;
    const items = [{seg: {speed: 1, start: 0, kind: 'caption'}, from: 0, frames: 10 * fps}];
    const plan = voicePlan(items, lines, voice, fps);
    // «b» стоит на месте автора (5 с), а не вплотную за «a»
    expect(plan.find((c) => c.id === 'b')!.from).toBeGreaterThan(Math.round(2 * fps));
  });

  it('слитная речь по звуку (joinedNext) клеится вплотную, как слитная по разметке', () => {
    const voice = {
      track,
      clips: {
        a: {from: 0, to: 1, cutFrom: 0, cutTo: 1.05, joinedNext: true},
        b: {from: 1.5, to: 2.5, cutFrom: 1.05, cutTo: 2.5},
      },
    };
    const lines = [{id: 'a', start: 0, end: 1}, {id: 'b', start: 5, end: 6}];
    const fps = 60;
    const items = [{seg: {speed: 1, start: 0, kind: 'caption'}, from: 0, frames: 10 * fps}];
    const plan = voicePlan(items, lines, voice, fps);
    const a = plan.find((c) => c.id === 'a')!;
    expect(plan.find((c) => c.id === 'b')!.from).toBe(a.from + a.frames);
  });
});
