// Маршрут в адресе страницы: #/<пайплайн>/<инструмент>. Работают «назад» и закладки.
import {useEffect, useState} from 'react';

export type Route = {pipeline?: string; tool?: string};

const parse = (): Route => {
  const [pipeline, tool] = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return {pipeline, tool};
};

export const href = (pipeline?: string, tool?: string) => `#/${[pipeline, tool].filter(Boolean).join('/')}`;

export const useRoute = () => {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
};

// Последний открытый лот — удобство для этого браузера
const LAST_LOT = 'axis-video:last-lot';
export const lastLot = {
  get: (): string | null => { try { return localStorage.getItem(LAST_LOT); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem(LAST_LOT, id); } catch { /* приватный режим */ } },
};
