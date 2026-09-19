// Языки перевода: выбор языка субтитров и озвучки
import {describe, expect, it} from 'vitest';
import {
  DEFAULT_TARGET, TARGET_LANGUAGES, canSpeak, findLanguage, languageName, targetLanguageOf,
} from '../../src/shared/languages.js';

describe('список языков', () => {
  it('коды уникальны, у каждого есть название', () => {
    expect(new Set(TARGET_LANGUAGES.map((l) => l.code)).size).toBe(TARGET_LANGUAGES.length);
    for (const l of TARGET_LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2}$/);
      expect(l.name.length).toBeGreaterThan(2);
    }
  });

  it('язык по умолчанию есть в списке и с озвучкой', () => {
    expect(findLanguage(DEFAULT_TARGET)).toBeTruthy();
    expect(canSpeak(DEFAULT_TARGET)).toBe(true);
  });

  it('албанский есть для субтитров, но без озвучки — голос его не умеет', () => {
    expect(findLanguage('sq')).toBeTruthy();
    expect(canSpeak('sq')).toBe(false);
  });

  it('незнакомый код: не язык и без озвучки', () => {
    expect(findLanguage('xx')).toBeNull();
    expect(canSpeak('xx')).toBe(false);
    expect(languageName('xx')).toBe('xx');
    expect(languageName('mk')).toBe('македонский');
  });
});

describe('язык перевода обзора', () => {
  it('свой язык обзора важнее языка рынка', () => {
    expect(targetLanguageOf({targetLanguage: 'en'}, {language: 'mk'})).toBe('en');
  });

  it('без своего — берём язык рынка', () => {
    expect(targetLanguageOf({}, {language: 'sr'})).toBe('sr');
    expect(targetLanguageOf({targetLanguage: ''}, {language: 'sr'})).toBe('sr');
  });

  it('мусор и пустота падают в язык по умолчанию', () => {
    expect(targetLanguageOf({targetLanguage: 'zz'}, {language: 'qq'})).toBe(DEFAULT_TARGET);
    expect(targetLanguageOf({}, null)).toBe(DEFAULT_TARGET);
    expect(targetLanguageOf(undefined as never, undefined)).toBe(DEFAULT_TARGET);
  });
});
