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
import {useT} from './i18n';

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
export const track = (name: string, params?: Record<string, string | number>) => {
  window.gtag?.('event', name, params);
  const a = ids();
  // Доход цели Метрика берёт только из order_price (+ currency); у Google то же самое — value
  const ym = params?.value !== undefined ? {order_price: params.value, currency: params.currency} : params;
  if (started && a?.ym) window.ym?.(Number(a.ym), 'reachGoal', name, ym);
};

// Отметки «уже отправлено» в этом браузере. Нет localStorage (приватный режим) — событие может уйти
// повторно; для отчётов это меньшая беда, чем не отправить вовсе
const mark = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

/**
 * Первая генерация компании (18.11, план витрины, P0) — шаг между регистрацией и оплатой: видно,
 * сколько зарегистрировавшихся вообще попробовали сервис. Сервер отдаёт в балансе generated — было
 * ли хоть одно списание (server/billing.mjs). Отправляем, только когда этот браузер сам видел «ещё
 * не было» и потом «уже было»: иначе после выкладки событие разом ушло бы от всех давних клиентов.
 * Генерация бесплатная (без списания) или в другом браузере — не считается; для воронки это редкость
 */
export const trackFirstGeneration = (workspaceId: string | undefined, generated: boolean | undefined) => {
  if (!workspaceId || generated === undefined) return;
  const key = `kok:first-gen:${workspaceId}`;
  const was = mark.get(key);
  if (!generated) { if (!was) mark.set(key, 'wait'); return; }
  if (was !== 'wait') return;
  mark.set(key, 'sent');
  track('first_generation');
};

/**
 * Оплата (18.11): экран возврата из кассы увидел, что заказ зачислен. Сумма — в долларах, как цена
 * пакета на витрине; transaction_id — номер заказа: GA4 по нему сам отбрасывает повторы, а мы ещё и
 * помним отправленные в этом браузере (возврат из кассы открывают и по ссылке из письма). Тестовые
 * заказы (sandbox) не шлём. Оплата по реквизитам через менеджера сюда не попадает — её видно в админке
 */
export const trackPurchase = (p: {id: string; priceUsd: number; packId: string; sandbox: boolean}) => {
  if (p.sandbox) return;
  const key = `kok:purchase:${p.id}`;
  if (mark.get(key)) return;
  mark.set(key, 'sent');
  track('purchase', {transaction_id: p.id, value: p.priceUsd, currency: 'USD', item_id: p.packId});
};

/**
 * Плашка согласия внизу экрана. Видна, пока посетитель не выбрал; согласие уже было — сразу запускает
 * счётчики. «Отказаться» запоминаем тоже: иначе плашка вставала бы на каждой странице
 */
export const ConsentBar: React.FC = () => {
  const [choice, setChoice] = useState(readChoice);
  const t = useT();
  useEffect(() => { if (choice === 'yes') start(); }, [choice]);
  if (!ids() || choice) return null;
  const pick = (v: 'yes' | 'no') => { saveChoice(v); setChoice(v); };
  return (
    <div className="consent" role="dialog" aria-label={t('consent.aria')}>
      <p>
        {t('consent.text')}{' '}
        {t('consent.more')}<a href="/privacy">{t('consent.policy')}</a>.
      </p>
      <div className="consent-actions">
        <button className="btn ghost" onClick={() => pick('no')}>{t('consent.no')}</button>
        <button className="btn primary" onClick={() => pick('yes')}>{t('consent.yes')}</button>
      </div>
    </div>
  );
};

