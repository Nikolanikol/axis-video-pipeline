// Сторож зависшего рендера. Срок здесь укорочен до долей секунды: проверяем поведение,
// а не выдержку. Отдельным файлом — короткий срок не должен мешать тестам очереди.
process.env.RENDER_STALL_MS = '400';

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const closed = {count: 0};
const cancelled = {count: 0};
vi.mock('@remotion/bundler', () => ({bundle: async () => 'serve://тест'}));
vi.mock('@remotion/renderer', () => ({
  makeCancelSignal: () => ({cancelSignal: Symbol('отмена'), cancel: () => { cancelled.count++; }}),
  openBrowser: async () => ({close: async () => { closed.count++; }}),
  selectComposition: async () => ({id: 'review-short', durationInFrames: 60, fps: 60, width: 1080, height: 1920}),
  // Рендер, который не двигается и не заканчивается — ровно то, что мы ловим
  renderMedia: () => new Promise(() => {}),
  renderStill: async () => ({buffer: Buffer.alloc(0)}),
}));

let env;
let enqueue;
let getJob;
const task = (reviewId) => ({
  owner: {reviewId}, composition: 'review-short', compositionTitle: 'Обзор',
  title: reviewId, frames: [0], inputProps: {},
});
const waitFor = async (check, ms = 5000) => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > until) throw new Error('не дождались');
    await new Promise((r) => setTimeout(r, 50));
  }
};

beforeAll(async () => {
  env = await useTempEnv();
  ({enqueue, getJob} = await import('../../server/renderer.mjs'));
});
afterAll(() => env.cleanup());

describe('зависший рендер', () => {
  it('снимается сам и объясняет, на каком шаге встал', async () => {
    const job = enqueue(task('rv-stall'));
    const done = await waitFor(async () => {
      const j = await getJob(job.id);
      return j?.status === 'error' ? j : null;
    });
    expect(done.error).toMatch(/Завис на шаге/);
    expect(done.error).toMatch(/Рендер видео/);   // встал именно там, где перестал двигаться
    expect(cancelled.count).toBeGreaterThan(0);   // отмену до Remotion донесли
    expect(closed.count).toBeGreaterThan(0);      // браузер закрыт, а не брошен
  });

  it('очередь едет дальше: после снятого задания можно запускать снова', async () => {
    const again = enqueue(task('rv-stall'));
    expect(again.status).toBe('queued');
  });
});
