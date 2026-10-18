// Счётчики посещаемости (19.10): Google Analytics 4 и Яндекс Метрика — cookie только с согласия посетителя.
//
// Номера счётчиков кладёт в страницу сервер (window.__KOK_ANALYTICS, server/seo.mjs) и только на
// боевом адресе: превью и копии на Mac не пишут в статистику прода. Нет номеров — нет и плашки.
// Google — Consent Mode v2: тег стоит в HTML у всех (server/seo.mjs, googleTag) в режиме «denied» —
// без cookie, обезличенные сигналы. «Принять» открывает analytics_storage. Так проверка установки
// в GA4 видит тег, а отказавшийся всё равно остаётся без cookie. Метрика такого режима не имеет —
// она грузится лишь после «Принять». Так описано в политике (app/Legal.tsx, «Какие данные»).
// Выбор помнит этот браузер (localStorage, ключ читает и тег Google в HTML) — не переспрашиваем.
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
  // Тег Google уже в странице в режиме «denied» — согласие только открывает cookie аналитики.
  // Рекламные хранилища не трогаем: рекламы нет, и согласия на неё посетитель не давал
  if (a.ga) window.gtag?.('consent', 'update', {analytics_storage: 'granted'});
  if (a.ym) {
    // Очередь вызовов до загрузки tag.js — как в официальном коде Метрики
    // (tag.js читает очередь ym.a как список arguments и время ym.l)
    if (!window.ym) {
      type Queue = {(...args: unknown[]): void; a?: unknown[]; l?: number};
      const ym: Queue = function () { (ym.a = ym.a || []).push(arguments); };
      ym.l = Date.now();
      window.ym = ym;
    }
    // Вебвизор не включаем: он записывает экран кабинета вместе с данными клиента. ecommerce из готового
    // кода Метрики тоже нет: он читал бы dataLayer — а это очередь тега Google, не покупки
    window.ym(Number(a.ym), 'init', {clickmap: true, trackLinks: true, accurateTrackBounce: true});
    addScript('https://mc.yandex.ru/metrika/tag.js');
  }
};

/**
 * Событие в обе системы: в GA4 — событием, в Метрике — целью с тем же именем. В GA4 уходит и без
 * согласия — тег сам шлёт его без cookie (Consent Mode); в Метрику — только после «Принять»
 */
export const track = (name: string) => {
  window.gtag?.('event', name);
  const a = ids();
  if (started && a?.ym) window.ym?.(Number(a.ym), 'reachGoal', name);
};

/**
 * Плашка согласия внизу экрана. Видна, пока посетитель не выбрал; согласие уже было — сразу запускает
 * счётчики. «Отказаться» запоминаем тоже: иначе плашка вставала бы на каждой странице
 */
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
