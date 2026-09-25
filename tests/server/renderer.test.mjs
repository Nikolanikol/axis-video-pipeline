// Очередь рендера: один ролик на обзор за раз.
// Настоящий рендер здесь не запускается — тяжёлые части подменены: нам важен страж,
// а не картинка. Подмена держит renderMedia незавершённым, поэтому задание остаётся в работе.
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const closed = {count: 0};
vi.mock('@remotion/bundler', () => ({bundle: async () => 'serve://тест'}));
vi.mock('@remotion/renderer', () => ({
  makeCancelSignal: () => ({cancelSignal: Symbol('отмена'), cancel: () => {}}),
  openBrowser: async () => ({close: async () => { closed.count++; }}),
  selectComposition: async () => ({id: 'review-short', durationInFrames: 60, fps: 60, width: 1080, height: 1920}),
  renderMedia: () => new Promise(() => {}),   // никогда не заканчивается: задание висит в работе
  renderStill: async () => ({buffer: Buffer.alloc(0)}),
}));

let env;
let enqueue;
let cancelJob;
let deleteJob;
let retryJob;
let listJobs;
const task = (reviewId) => ({
  owner: {reviewId}, composition: 'review-short', compositionTitle: 'Обзор',
  title: reviewId, frames: [0], inputProps: {},
});

beforeAll(async () => {
  env = await useTempEnv();
  ({enqueue, cancelJob, deleteJob, retryJob, listJobs} = await import('../../server/renderer.mjs'));
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

describe('управление роликом', () => {
  // rv-1 из блока выше застрял в работе (renderMedia не заканчивается), остальные — в очереди
  const runningId = async () => (await listJobs({reviewId: 'rv-1'})).find((j) => j.status === 'running').id;

  it('задание из очереди можно отменить, и оно освобождает очередь', async () => {
    const job = enqueue(task('rv-cancel'));
    expect(job.status).toBe('queued');
    const cancelled = await cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');
    // Отменённое не держит очередь: тот же обзор снова ставится
    expect(enqueue(task('rv-cancel')).status).toBe('queued');
  });

  it('идущий рендер удалять нельзя — сначала отмена', async () => {
    await expect(deleteJob(await runningId())).rejects.toMatchObject({status: 409});
  });

  it('пересобрать идущий нельзя — он и так в работе', async () => {
    await expect(retryJob(await runningId())).rejects.toMatchObject({status: 409});
  });

  it('отмена того, чего нет в работе, — это 409, а не тихий успех', async () => {
    await expect(cancelJob('rv-нет-такого')).rejects.toMatchObject({status: 409});
  });
});
