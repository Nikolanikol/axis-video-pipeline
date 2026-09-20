// Спикеры озвучки: кто каким голосом и какой моделью читает перевод.
// Реестр — config/voices.json. Общий модуль: сервер, интерфейс и тесты выбирают спикера одинаково.
//
// Модель и настройки синтеза задаются на язык, а не на спикера: один и тот же голос на разных
// языках звучит по-разному, и подбирать их приходится отдельно. Например, клон владельца по-македонски
// идёт на eleven_v3 (только она знает македонский), а по-английски — на eleven_multilingual_v2,
// где речь чище и быстрее.

/**
 * @typedef {{stability?: number, similarityBoost?: number, style?: number}} VoiceSettings
 * @typedef {{
 *   id: string, name: string, voiceId: string, note?: string, model: string,
 *   languages: string[], perLanguage?: Record<string, {model?: string, settings?: VoiceSettings, note?: string}>,
 * }} Speaker
 * @typedef {{defaults?: Record<string, string>, speakers?: Speaker[]}} VoiceRegistry
 */

/** Спикеры, умеющие этот язык (в порядке реестра) @returns {Speaker[]} */
export const speakersFor = (registry, language) =>
  (registry?.speakers ?? []).filter((s) => s?.voiceId && (s.languages ?? []).includes(language));

/** Спикер по id — без проверки языка: выбор мог остаться от прежнего языка @returns {Speaker | null} */
export const speakerById = (registry, id) =>
  (registry?.speakers ?? []).find((s) => s?.id === id) ?? null;

/**
 * Кто будет читать: выбранный, иначе назначенный языку по умолчанию, иначе первый подходящий.
 * Выбор, не умеющий язык, молча не подставляем — иначе ролик озвучит не тот голос.
 * @returns {Speaker | null}
 */
export const resolveSpeaker = (registry, language, chosenId) => {
  const fits = speakersFor(registry, language);
  const chosen = chosenId ? fits.find((s) => s.id === chosenId) : null;
  if (chosen) return chosen;
  const byDefault = fits.find((s) => s.id === registry?.defaults?.[language]);
  return byDefault ?? fits[0] ?? null;
};

/**
 * Чем синтезировать этого спикера на этом языке: голос, модель и настройки.
 * @returns {{voiceId: string, model: string, settings?: VoiceSettings} | null}
 */
export const voiceConfig = (speaker, language) => {
  if (!speaker?.voiceId) return null;
  const tuned = speaker.perLanguage?.[language] ?? {};
  return {
    voiceId: speaker.voiceId,
    model: tuned.model ?? speaker.model,
    ...(tuned.settings ? {settings: tuned.settings} : {}),
  };
};

/** Настройки для API ElevenLabs: там свои имена полей */
export const apiSettings = (settings) => {
  if (!settings) return undefined;
  const out = {};
  if (Number.isFinite(settings.stability)) out.stability = settings.stability;
  if (Number.isFinite(settings.similarityBoost)) out.similarity_boost = settings.similarityBoost;
  if (Number.isFinite(settings.style)) out.style = settings.style;
  return Object.keys(out).length ? out : undefined;
};
