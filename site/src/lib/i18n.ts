// Тексты витрины — словари приложения (app/i18n), а не свои копии: один текст правится в одном месте.
//
// Сам app/i18n/index.tsx сюда не импортируем: он тянет React (язык там — живая переменная с подпиской),
// а витрина — статика, язык у каждой страницы свой и известен при сборке. Поэтому здесь своя
// крошечная обёртка с теми же правилами: {имя} — подстановка, формы числа — Intl.PluralRules,
// нет перевода — русский текст, названия из конфигов — по русскому названию (names.ts).
import {ru} from '../../../app/i18n/ru';
import {en} from '../../../app/i18n/en';
import {sq} from '../../../app/i18n/sq';
import {names} from '../../../app/i18n/names';
import {faq as faqI18n} from '../../../app/i18n/faq';
import seo from '../../../config/seo.json';

export const LANGS = ['ru', 'en', 'sq'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_TITLES: Record<Lang, {short: string; title: string}> = {
  ru: {short: 'RU', title: 'Русский'},
  en: {short: 'EN', title: 'English'},
  sq: {short: 'SQ', title: 'Shqip'},
};

type Key = keyof typeof ru;
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & {other: string};
type Vars = Record<string, string | number>;
const DICTS: Record<Lang, Record<string, string | Plural>> = {ru, en, sq};

const fill = (s: string, vars?: Vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
const raw = (lang: Lang, key: Key) => DICTS[lang][key] || ru[key];

export const makeT = (lang: Lang) => {
  const t = (key: Key, vars?: Vars) => {
    const v = raw(lang, key);
    return fill(typeof v === 'string' ? v : v.other, vars);
  };
  /** «3 кредита», «3 credits»: форма числа по правилам языка */
  t.n = (key: Key, n: number, vars?: Vars) => {
    const v = raw(lang, key) as Plural;
    const forms = typeof v === 'string' ? {other: v} : v;
    return fill(forms[new Intl.PluralRules(lang).select(n)] ?? forms.other, {n, ...vars});
  };
  /** Название из конфига (формат, палитра, тариф) по русскому тексту; нет перевода — как есть */
  t.cfg = (ruName: string) => (lang === 'ru' ? ruName : names[lang][ruName] ?? ruName);
  t.lang = lang;
  return t;
};
export type T = ReturnType<typeof makeT>;

/** Вопросы витрины: русские — config/seo.json (их же видит Google в разметке), переводы — app/i18n/faq.ts */
export const faqFor = (lang: Lang): {q: string; a: string}[] => (lang === 'ru' ? seo.faq : faqI18n[lang]);
