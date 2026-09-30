// Короткая плашка внизу экрана: «Удалено: BMW X3», «Создана копия». Для быстрых действий
// (доли секунды), где окно на весь экран было бы лишним миганием, а без отметки непонятно,
// сработало ли. Вызывается откуда угодно — toast('…'); показывает <Toasts/> в оболочке.
import React, {useEffect, useState} from 'react';

// Через событие окна, а не контекст React: toast() зовут из обработчиков в любых экранах,
// и тянуть туда провайдер ради одной плашки — лишнее
const EVENT = 'kok-toast';
type Item = {id: number; text: string; kind: 'ok' | 'error'};

export const toast = (text: string, kind: Item['kind'] = 'ok') =>
  window.dispatchEvent(new CustomEvent<Omit<Item, 'id'>>(EVENT, {detail: {text, kind}}));

// Сколько держать плашку: успеть прочитать два-три слова, но не мешать дальше
const SHOW_MS = 3200;

// Показываем не больше трёх плашек разом: серия удалений не должна закрывать пол-экрана
export const Toasts: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const id = ++n;
      setItems((list) => [...list.slice(-2), {id, ...(e as CustomEvent<Omit<Item, 'id'>>).detail}]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), SHOW_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
};
