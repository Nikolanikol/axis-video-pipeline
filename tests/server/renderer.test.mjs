// Очередь рендера: один ролик на обзор за раз.
// Настоящий рендер здесь не запускается — тяжёлые части подменены: нам важен страж,
// а не картинка. Подмена держит renderMedia незавершённым, поэтому задание остаётся в работе.
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

vi.mock('@remotion/bundler', () => ({bundle: async () => 'serve://тест'}));
vi.mock('@remotion/renderer', () => ({
  openBrowser: async () => ({close: async () => {}}),
  selectComposition: async () => ({id: 'review-short', durationInFrames: 60, fps: 60, width: 1080, height: 1920}),
  renderMedia: () => new Promise(() => {}),   // никогда не заканчивается: задание висит в работе
  renderStill: async () => ({buffer: Buffer.alloc(0)}),
}));

let env;
let enqueue;
const task = (reviewId) => ({
  owner: {reviewId}, composition: 'review-short', compositionTitle: 'Обзор',
  title: reviewId, frames: [0], inputProps: {},
});

beforeAll(async () => {
  env = await useTempEnv();
  ({enqueue} = await import('../../server/renderer.mjs'));
});
afterAll(() => env.cleanup());

describe('очередь рендера', () => {
  it('повторное нажатие не ставит второе такое же задание', () => {
    const first = enqueue(task('rv-1'));
    expect(first.status).toBe('queued');
    // Десять нажатий подряд — это десять одинаковых роликов и часы очереди
    for (let i = 0; i < 5; i++) {
      expect(() => enqueue(task('rv-1'))).toThrow(/уже/);
    }
  });

  it('ошибка говорит, что делать, и это 409, а не поломка', () => {
    try {
      enqueue(task('rv-1'));
      throw new Error('должно было отказать');
    } catch (e) {
      expect(e.status).toBe(409);
      expect(e.message).toMatch(/очереди|идёт/);
    }
  });

  it('другой обзор рендерить не мешает', () => {
    expect(enqueue(task('rv-2')).status).toBe('queued');
    expect(() => enqueue(task('rv-2'))).toThrow(/уже/);
  });
});
