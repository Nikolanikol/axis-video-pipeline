// Только жизненный цикл запроса: сумму и сам факт списания узнаём из баланса сервера.
// Одна подписка оболочки обновляет его и для быстрых КП, и во время долгой сборки карусели.
let pending = 0;
const listeners = new Set<(pending: number) => void>();
const emit = () => { for (const listener of listeners) listener(pending); };
export const creditRequestsPending = () => pending;
export const watchCreditActivity = (listener: (pending: number) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const withCreditActivity = async <T,>(run: () => Promise<T>): Promise<T> => {
  pending++; emit();
  try { return await run(); }
  finally { pending--; emit(); }
};
