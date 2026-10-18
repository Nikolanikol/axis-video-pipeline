// Счётчики посещаемости (19.10): Google Analytics 4 и Яндекс Метрика — только с согласия посетителя.
//
// Номера счётчиков кладёт в страницу сервер (window.__KOK_ANALYTICS, server/seo.mjs) и только на
// боевом адресе: превью и копии на Mac не пишут в статистику прода. Нет номеров — нет и плашки.
// Скрипты Google и Яндекса грузятся лишь после «Принять»: до согласия аналитических cookie нет
// вовсе — так требует и политика (app/Legal.tsx, раздел «Какие данные»), и закон для гостей из ЕС.
// Выбор помнит этот браузер (localStorage) — переспрашивать на каждой странице незачем.
import React, {useEffect, useState} from 'react';

type Ids = {ga: string; ym: string};
declare global {
  interface Window {
    __KOK_ANALYTICS?: Ids;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
  }
}

const KEY = 'kok:analytics-consent';
const ids = (): Ids | null => {
  const a = window.__KOK_ANALYTICS;
  return a && (a.ga || a.ym) ? a : null;
};
const readChoice = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const saveChoice = (v: 'yes' | 'no') => { try { localStorage.setItem(KEY, v); } catch { /* приватный режим — спросим снова */ } };

const addScript = (src: string) => {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
};

let started = false;
const start = () => {
  const a = ids();
  if (!a || started) return;
  started = true;
  if (a.ga) {
    window.dataLayer = window.dataLayer || [];
    // gtag обязан класть в dataLayer именно arguments, а не массив — так устроен загрузчик Google
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', a.ga);
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(a.ga)}`);
  }
  if (a.ym) {
    // Очередь вызовов до загрузки tag.js — как в официальном коде Метрики
    // (tag.js читает очередь ym.a как список arguments и время ym.l)
    if (!window.ym) {
      type Queue = {(...args: unknown[]): void; a?: unknown[]; l?: number};
      const ym: Queue = function () { (ym.a = ym.a || []).push(arguments); };
      ym.l = Date.now();
      window.ym = ym;
    }
    // Вебвизор не включаем: он записывает экран кабинета вместе с данными клиента
    window.ym(Number(a.ym), 'init', {clickmap: true, trackLinks: true, accurateTrackBounce: true});
    addScript('https://mc.yandex.ru/metrika/tag.js');
  }
};

/** Событие в обе системы: в GA4 — событием, в Метрике — целью с тем же именем. Без согласия — ничего */
export const track = (name: string) => {
  if (!started) return;
  const a = ids();
  window.gtag?.('event', name);
  if (a?.ym) window.ym?.(Number(a.ym), 'reachGoal', name);
};

/** Плашка согласия внизу экрана. Видна, пока посетитель не выбрал; согласие уже было — сразу запускает счётчики */
export const ConsentBar: React.FC = () => {
  const [choice, setChoice] = useState(readChoice);
  useEffect(() => { if (choice === 'yes') start(); }, [choice]);
  if (!ids() || choice) return null;
  const pick = (v: 'yes' | 'no') => { saveChoice(v); setChoice(v); };
  return (
    <div className="consent" role="dialog" aria-label="Согласие на cookie">
      <p>
        Мы используем cookie Google Analytics и Яндекс Метрики, чтобы понимать, как пользуются сайтом.
        Подробно — в <a href="/privacy">политике</a>.
      </p>
      <div className="consent-actions">
        <button className="btn ghost" onClick={() => pick('no')}>Отказаться</button>
        <button className="btn primary" onClick={() => pick('yes')}>Принять</button>
      </div>
    </div>
  );
};

/**
 * Витрина, отрисованная сервером для гостя (#prerender, server/seo.mjs), стоит на экране, пока React
 * не нарисует своё. Снимаем её, как только своё готово: витрину — при монтировании Landing, всё
 * прочее (кабинет, документ, ошибка) — из AuthGate
 */
export const dropPrerender = () => document.getElementById('prerender')?.remove();
