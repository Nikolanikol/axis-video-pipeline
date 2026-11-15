// Язык интерфейса KOK (15.11, владелец: интерфейс на английском, по возможности — на албанском).
//
// Своё лёгкое решение, без библиотеки: словари — обычные модули (ru.ts — источник, en.ts и sq.ts
// обязаны иметь те же ключи, это проверяет TypeScript), язык — одна переменная модуля с подпиской
// (useSyncExternalStore). Библиотека (i18next и т. п.) дала бы больше, чем нужно, и тянула бы
// загрузку словарей по сети — а витрину рисует ещё и сервер (server/seo.mjs), где всё синхронно.
//
// Язык гостя: выбранный раньше (localStorage) → язык браузера → русский. На сервере всегда русский:
// поисковикам отдаём русскую витрину, а браузер гостя с английским сразу перерисует её по-своему
// (серверная копия всё равно убирается — dropPrerender).
//
// Один переключатель на всё (15.11, владелец: аудитория международная): этот язык — ещё и язык
// постов компании (profile.language: слайды, ролики) и язык писем человека (smmaker_users.lang).
// Связка — в app/config.tsx: при входе язык берётся с сервера, каждая смена пишется обратно.
import React, {useSyncExternalStore} from 'react';
import {ru} from './ru';
import {en} from './en';
import {sq} from './sq';
import {names} from './names';

export type Lang = 'ru' | 'en' | 'sq';
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & {other: string};
export type Key = keyof typeof ru;
// Словарь другого языка — те же ключи; строка остаётся строкой, формы числа — формами числа
export type Dict = {[K in Key]: (typeof ru)[K] extends string ? string : Plural};

export const LANGS: {id: Lang; short: string; title: string}[] = [
  {id: 'ru', short: 'RU', title: 'Русский'},
  {id: 'en', short: 'EN', title: 'English'},
  {id: 'sq', short: 'SQ', title: 'Shqip'},
];

const DICTS: Record<Lang, Dict> = {ru: ru as Dict, en, sq};
const STORE_KEY = 'kok.lang';
export const isLang = (v: unknown): v is Lang => v === 'ru' || v === 'en' || v === 'sq';

// localStorage в приватном окне и при запрете cookie бросает — язык тогда просто не запоминается
const stored = (): Lang | null => {
  try { const v = window.localStorage.getItem(STORE_KEY); return isLang(v) ? v : null; } catch { return null; }
};

const detect = (): Lang => {
  if (typeof window === 'undefined') return 'ru';
  const saved = stored();
  if (saved) return saved;
  // Русский — для всех, кто читает по-русски, в том числе с браузером на украинском, казахском,
  // узбекском: наши клиенты — дилеры СНГ, а английский им дальше русского
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = (l || '').toLowerCase().split('-')[0];
    if (base === 'ru' || base === 'uk' || base === 'be' || base === 'kk' || base === 'uz' || base === 'ky') return 'ru';
    if (base === 'sq') return 'sq';
    if (base === 'en') return 'en';
  }
  return 'ru';
};

let current: Lang = detect();
const listeners = new Set<() => void>();

const applyToPage = (lang: Lang) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
};
applyToPage(current);

export const getLang = () => current;

export const setLang = (lang: Lang) => {
  if (lang === current) return;
  current = lang;
  try { window.localStorage.setItem(STORE_KEY, lang); } catch { /* не запомнится — не беда */ }
  applyToPage(lang);
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useLang = (): Lang => useSyncExternalStore(subscribe, getLang, () => 'ru');

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

// Нет перевода (ключ забыт или пуст) — русский текст, а не пустое место или имя ключа
const raw = (lang: Lang, key: Key) => DICTS[lang][key] || ru[key];

const pick = (lang: Lang, forms: Plural, n: number) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;

export type T = {
  lang: Lang;
  /** Строка по ключу; {имя} подставляется из vars */
  (key: Key, vars?: Vars): string;
  /** Число со словом в нужной форме: «3 кредита», «3 credits»; {n} — само число */
  n: (key: Key, count: number, vars?: Vars) => string;
  /** Название из конфига (формат, палитра) — по русскому тексту, нет перевода — как есть */
  // Не «name»: у функции это встроенное свойство только для чтения — присвоение падает
  cfg: (ru: string) => string;
};

export const makeT = (lang: Lang): T => {
  const t = ((key: Key, vars?: Vars) => {
    const v = raw(lang, key);
    return fill(typeof v === 'string' ? v : v.other, vars);
  }) as T;
  t.lang = lang;
  t.n = (key, count, vars) => {
    const v = raw(lang, key);
    return fill(typeof v === 'string' ? v : pick(lang, v, count), {n: count, ...vars});
  };
  t.cfg = (s) => (lang === 'ru' ? s : names[lang][s] ?? s);
  return t;
};

/** Переводчик текущего языка; экран перерисуется сам, когда язык сменят */
export const useT = (): T => makeT(useLang());

/**
 * Переводчик вне компонента — в обработчиках и помощниках (сообщение после запроса, подпись
 * цены). Сам перерисовку не вызывает: экран, где это видно, и так зовёт useT
 */
export const tNow = (): T => makeT(current);

// Даты и числа по языку: «26.10.2026» по-русски, «26/10/2026» по-английски (британский порядок —
// день перед месяцем, как привычно и в Корее для клиентов СНГ, и в Европе)
const LOCALES: Record<Lang, string> = {ru: 'ru-RU', en: 'en-GB', sq: 'sq-AL'};
export const locale = () => LOCALES[current];

/**
 * Переключатель языка: RU · EN · SQ. Выбор запоминается в этом браузере.
 * compact — выпадающий список «EN ▾» для шапки рабочих экранов: три кнопки (108 px) рядом с вкладками
 * разделов на 1024 px переносились на вторую строку, а список занимает ~60 px
 */
export const LangSwitch: React.FC<{className?: string; compact?: boolean}> = ({className, compact}) => {
  const lang = useLang();
  const t = makeT(lang);
  if (compact) {
    return (
      <select className={['lang-select', className].filter(Boolean).join(' ')} value={lang} aria-label={t('lang.label')}
        title={t('lang.label')} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l.id} value={l.id} lang={l.id} title={l.title}>{l.short}</option>)}
      </select>
    );
  }
  return (
    <div className={['lang-switch', className].filter(Boolean).join(' ')} role="radiogroup" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={l.id === lang} title={l.title} lang={l.id}
          className={l.id === lang ? 'lang-opt on' : 'lang-opt'} onClick={() => setLang(l.id)}>{l.short}</button>
      ))}
    </div>
  );
};
