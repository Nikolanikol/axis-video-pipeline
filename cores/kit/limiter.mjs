// Ограничитель параллельных запросов к источнику (cores/CONTRACT.md, раздел 5).
// Бережём источник и свой IP: пачка запросов разом — самый быстрый путь в блокировку.
// Очередь не бесконечная: переполнилась — OVERLOADED сразу, а не минута ожидания.
// Общий набор cores/kit.
import { CoreError } from './errors.mjs';

export function createLimiter({ concurrency = 4, maxQueue = 100 } = {}) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };

  return {
    run(fn) {
      if (queue.length >= maxQueue) {
        return Promise.reject(new CoreError('OVERLOADED', 'Ядро перегружено запросами — повторите чуть позже', { details: { queue: queue.length } }));
      }
      return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
    },
    stats: () => ({ active, queued: queue.length, concurrency }),
  };
}
