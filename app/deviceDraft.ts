// Черновики этого устройства. Записываем прямо при вводе: таймер/эффект не успевает при
// немедленном закрытии формы. Память страницы страхует переходы, если браузер запретил запись.
import {useCallback, useReducer} from 'react';

type Entry<T> = {value: T; persisted: boolean; edited: boolean};
const memory = new Map<string, Entry<unknown>>();
let guarded = false;
const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
const syncGuard = () => {
  const needed = [...memory.values()].some((e) => e.edited && !e.persisted);
  if (needed === guarded) return;
  guarded = needed;
  // Защита переживает уход из редактора: память страницы остаётся и на другом экране.
  if (needed) window.addEventListener('beforeunload', warn);
  else window.removeEventListener('beforeunload', warn);
};

const read = <T,>(key: string, fresh: T, valid: (v: unknown) => v is T): Entry<T> => {
  const cached = memory.get(key);
  if (cached && valid(cached.value)) return cached as Entry<T>;
  let value = fresh;
  let persisted = true;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (valid(raw)) value = raw;
  } catch { persisted = false; }
  const entry = {value, persisted, edited: false};
  memory.set(key, entry);
  syncGuard();
  return entry;
};

export const writeDeviceDraft = <T,>(key: string, value: T): Entry<T> => {
  let persisted = true;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { persisted = false; }
  const entry = {value, persisted, edited: true};
  memory.set(key, entry);
  syncGuard();
  return entry;
};

export const useDeviceDraft = <T,>(key: string, fresh: T, valid: (v: unknown) => v is T) => {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const entry = read(key, fresh, valid);
  const setValue = useCallback((update: T | ((previous: T) => T)) => {
    const previous = read(key, fresh, valid).value;
    writeDeviceDraft(key, typeof update === 'function' ? (update as (v: T) => T)(previous) : update);
    refresh();
  }, [key, fresh, valid]);
  return {value: entry.value, setValue, persisted: entry.persisted};
};
