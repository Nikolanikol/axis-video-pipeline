// Языки перевода: на них делаем субтитры и озвучку. Общий модуль (интерфейс, сервер, тесты).
// voice — умеет ли этот язык голосовая модель (eleven_v3). Субтитры можно делать на любом.

/** @typedef {{code: string, name: string, voice: boolean}} TargetLanguage */

/** @type {TargetLanguage[]} */
export const TARGET_LANGUAGES = [
  {code: 'mk', name: 'македонский', voice: true},
  {code: 'sq', name: 'албанский', voice: false},
  {code: 'sr', name: 'сербский', voice: true},
  {code: 'bg', name: 'болгарский', voice: true},
  {code: 'hr', name: 'хорватский', voice: true},
  {code: 'el', name: 'греческий', voice: true},
  {code: 'de', name: 'немецкий', voice: true},
  {code: 'en', name: 'английский', voice: true},
  {code: 'ru', name: 'русский', voice: true},
];

export const DEFAULT_TARGET = 'mk';

/** @param {string} code @returns {TargetLanguage | null} */
export const findLanguage = (code) => TARGET_LANGUAGES.find((l) => l.code === code) ?? null;

/** Название языка для сообщений; незнакомый код показываем как есть */
export const languageName = (code) => findLanguage(code)?.name ?? String(code || '');

/** Умеет ли голосовая модель говорить на этом языке */
export const canSpeak = (code) => Boolean(findLanguage(code)?.voice);

/**
 * Язык перевода обзора: свой, иначе язык рынка, иначе македонский.
 * @param {{targetLanguage?: string}} review
 * @param {{language?: string} | null} [market]
 */
export const targetLanguageOf = (review, market) =>
  (findLanguage(review?.targetLanguage) ? review.targetLanguage : null)
  ?? (findLanguage(market?.language) ? market.language : null)
  ?? DEFAULT_TARGET;
