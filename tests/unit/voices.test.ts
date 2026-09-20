// Спикеры озвучки: кто умеет язык, кого выбираем, какой моделью читаем
import {describe, expect, it} from 'vitest';
import registry from '../../config/voices.json';
import {TARGET_LANGUAGES, canSpeak} from '../../src/shared/languages.js';
import {apiSettings, resolveSpeaker, speakerById, speakersFor, voiceConfig} from '../../src/shared/voices.js';

describe('реестр из config/voices.json', () => {
  it('id уникальны, у каждого спикера есть голос, модель и языки', () => {
    const ids = registry.speakers.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of registry.speakers) {
      expect(s.voiceId).toMatch(/^[A-Za-z0-9]{16,}$/);
      expect(s.model).toMatch(/^eleven_/);
      expect(s.languages.length).toBeGreaterThan(0);
    }
  });

  it('у каждого языка с озвучкой есть кому читать', () => {
    for (const l of TARGET_LANGUAGES.filter((x) => x.voice)) {
      expect(speakersFor(registry, l.code).length, `язык ${l.code}`).toBeGreaterThan(0);
    }
  });

  it('спикеры по умолчанию существуют и умеют свой язык', () => {
    for (const [language, id] of Object.entries(registry.defaults)) {
      const s = speakerById(registry, id);
      expect(s, `${language}: спикер ${id}`).toBeTruthy();
      expect(s!.languages).toContain(language);
    }
  });

  it('никто не обещает язык, которого озвучка не умеет', () => {
    for (const s of registry.speakers) {
      for (const l of s.languages) expect(canSpeak(l), `${s.id} обещает ${l}`).toBe(true);
    }
  });
});

describe('выбор спикера', () => {
  const reg = {
    defaults: {mk: 'b'},
    speakers: [
      {id: 'a', name: 'A', voiceId: 'v1', model: 'eleven_v3', languages: ['mk', 'en']},
      {id: 'b', name: 'B', voiceId: 'v2', model: 'eleven_v3', languages: ['mk']},
      {id: 'c', name: 'C', voiceId: 'v3', model: 'eleven_multilingual_v2', languages: ['en']},
    ],
  };

  it('выбранный важнее того, что по умолчанию', () => {
    expect(resolveSpeaker(reg, 'mk', 'a')?.id).toBe('a');
    expect(resolveSpeaker(reg, 'mk', undefined)?.id).toBe('b');
  });

  it('выбор, не умеющий язык, не подставляется молча — берём подходящего', () => {
    // «b» знает только македонский: для английского он не годится
    expect(resolveSpeaker(reg, 'en', 'b')?.id).toBe('a');
  });

  it('нет подходящих — null, а не случайный голос', () => {
    expect(resolveSpeaker(reg, 'sq', 'a')).toBeNull();
    expect(resolveSpeaker({speakers: []}, 'mk', 'a')).toBeNull();
  });
});

describe('чем синтезировать', () => {
  const speaker = {
    id: 'n', name: 'Н', voiceId: 'v1', model: 'eleven_v3', languages: ['mk', 'en'],
    perLanguage: {en: {model: 'eleven_multilingual_v2', settings: {stability: 0.4, similarityBoost: 0.25, style: 0}}},
  };

  it('по умолчанию — модель спикера, без настроек', () => {
    expect(voiceConfig(speaker, 'mk')).toEqual({voiceId: 'v1', model: 'eleven_v3'});
  });

  it('на языке с отдельной настройкой — своя модель и параметры', () => {
    expect(voiceConfig(speaker, 'en')).toEqual({
      voiceId: 'v1', model: 'eleven_multilingual_v2',
      settings: {stability: 0.4, similarityBoost: 0.25, style: 0},
    });
  });

  it('без спикера — null', () => {
    expect(voiceConfig(null, 'mk')).toBeNull();
    expect(voiceConfig({id: 'x', name: 'X', voiceId: '', model: 'm', languages: []}, 'mk')).toBeNull();
  });

  it('настройки переводятся в имена полей ElevenLabs', () => {
    expect(apiSettings({stability: 0.4, similarityBoost: 0.25, style: 0}))
      .toEqual({stability: 0.4, similarity_boost: 0.25, style: 0});
    expect(apiSettings(undefined)).toBeUndefined();
    expect(apiSettings({})).toBeUndefined();
  });
});
