// Распознавание речи через ElevenLabs Scribe. Ключ — в .env (ELEVENLABS_API_KEY), в ответы и логи не попадает.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {linesFromWords} from '../src/shared/subtitles.js';
import {run} from './media.mjs';
import {HttpError} from './store.mjs';

const BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
// У fetch в Node своего срока нет: оборванное соединение висит вечно, а вместе с ним —
// распознавание или озвучка, потому что замок снимается только после ответа. Файлы здесь
// до 10 минут звука, ответ обычно за минуту; пятнадцать — потолок, а не ожидаемое время.
const CALL_TIMEOUT_MS = Number(process.env.ELEVENLABS_TIMEOUT_MS || 15 * 60 * 1000);
const deadline = () => AbortSignal.timeout(CALL_TIMEOUT_MS);
// Обрыв по сроку приходит как TimeoutError — переводим на человеческий, иначе в статусе обзора
// окажется «The operation was aborted due to timeout»
const call = async (url, init) => {
  try {
    return await fetch(url, {...init, signal: deadline()});
  } catch (e) {
    if (e?.name === 'TimeoutError') {
      throw new HttpError(504, `ElevenLabs не ответил за ${Math.round(CALL_TIMEOUT_MS / 60000)} мин — попробуй ещё раз`);
    }
    throw new HttpError(502, `Не достучались до ElevenLabs: ${e?.message || e}`);
  }
};
const MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
export const hasKey = () => Boolean(process.env.ELEVENLABS_API_KEY);

// Только звук: моно 16 кГц — этого хватает для распознавания, файл маленький
export const extractAudio = async (video, out) => {
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-f', 'mp4', out]);
  return out;
};

const message = (status, body, need = 'Speech to Text') => {
  if (status === 401) return 'ElevenLabs не принял ключ: проверь ELEVENLABS_API_KEY в .env';
  if (status === 403) return `У ключа нет доступа ${need} — включи его в настройках ключа`;
  if (status === 429) return 'ElevenLabs: превышен лимит запросов или кредитов';
  const detail = body?.detail?.message ?? body?.detail ?? body?.message;
  return `ElevenLabs (${status}): ${typeof detail === 'string' ? detail : 'не удалось распознать'}`;
};

/**
 * Речь → слова с таймингами и строки субтитров.
 * @param {string} file — аудио или видео
 * @param {{language?: string}} options — язык исходника (ISO-639, например rus)
 */
export const transcribe = async (file, {language} = {}) => {
  if (!hasKey()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  const form = new FormData();
  form.append('model_id', MODEL);
  form.append('timestamps_granularity', 'word');
  form.append('diarize', 'false');
  form.append('tag_audio_events', 'false');
  if (language) form.append('language_code', language);
  form.append('file', new Blob([await fs.readFile(file)]), path.basename(file));

  const res = await call(`${BASE}/v1/speech-to-text`, {
    method: 'POST',
    headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, message(res.status, body));

  const words = (body?.words ?? []).filter((w) => w.type !== 'audio_event');
  return {
    provider: `elevenlabs:${MODEL}`,
    language: body?.language_code ?? language ?? '',
    words,
    lines: linesFromWords(words),
    text: body?.text ?? '',
  };
};

// Озвучка: модель и голос приходят из реестра спикеров (config/voices.json).
// Только модели v3 умеют македонский; английский лучше звучит на multilingual_v2 — поэтому
// модель задаётся на язык, а не одна на всё.
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';
export const hasVoice = () => hasKey();

/** Ключ клипа: тот же текст тем же голосом, моделью и настройками не переозвучиваем */
export const voiceHash = (text, {voice = '', model = TTS_MODEL, language = '', settings} = {}) =>
  crypto.createHash('sha1')
    .update(`${voice}|${model}|${language}|${settings ? JSON.stringify(settings) : ''}|${text}`)
    .digest('hex').slice(0, 10);

/**
 * Текст → mp3 указанным голосом.
 * @param {string} text
 * @param {{language?: string, voice?: string, model?: string, settings?: object}} options
 * @returns {Promise<Buffer>}
 */
export const synthesize = async (text, {language, voice, model = TTS_MODEL, settings} = {}) => {
  if (!hasKey()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  if (!voice) throw new HttpError(400, 'Не выбран голос: проверь config/voices.json');
  const res = await call(`${BASE}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      text, model_id: model,
      ...(language ? {language_code: language} : {}),
      ...(settings ? {voice_settings: settings} : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, message(res.status, body, 'Text to Speech'));
  }
  return Buffer.from(await res.arrayBuffer());
};

/**
 * Начитка одним запросом: весь текст + разметка по символам.
 * Так голос ровный на всём переводе, а паузы между фразами ставит сама модель.
 * @param {string} text
 * @param {{language?: string, voice?: string, model?: string, settings?: object}} options
 * @returns {Promise<{audio: Buffer, alignment: object}>}
 */
export const synthesizeScript = async (text, {language, voice, model = TTS_MODEL, settings} = {}) => {
  if (!hasKey()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  if (!voice) throw new HttpError(400, 'Не выбран голос: проверь config/voices.json');
  const res = await call(`${BASE}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      text, model_id: model,
      ...(language ? {language_code: language} : {}),
      ...(settings ? {voice_settings: settings} : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, message(res.status, body, 'Text to Speech'));
  }
  const body = await res.json();
  if (!body?.audio_base64) throw new HttpError(502, 'ElevenLabs вернул начитку без звука');
  // alignment размечен по отправленному тексту, normalized_alignment — по приведённому
  return {audio: Buffer.from(body.audio_base64, 'base64'), alignment: body.alignment ?? body.normalized_alignment};
};
