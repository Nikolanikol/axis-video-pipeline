// Распознавание речи через ElevenLabs Scribe. Ключ — в .env (ELEVENLABS_API_KEY), в ответы и логи не попадает.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {linesFromWords} from '../src/shared/subtitles.js';
import {run} from './media.mjs';
import {HttpError} from './store.mjs';

const BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
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

  const res = await fetch(`${BASE}/v1/speech-to-text`, {
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

// Озвучка: только модели v3 умеют македонский, остальные — нет
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';
export const voiceId = () => process.env.ELEVENLABS_VOICE_ID || '';
export const hasVoice = () => Boolean(hasKey() && voiceId());

/** Ключ клипа: тот же текст тем же голосом не переозвучиваем */
export const voiceHash = (text, {voice = voiceId(), model = TTS_MODEL, language = ''} = {}) =>
  crypto.createHash('sha1').update(`${voice}|${model}|${language}|${text}`).digest('hex').slice(0, 10);

/**
 * Текст → mp3 голосом из ELEVENLABS_VOICE_ID.
 * @param {string} text
 * @param {{language?: string, voice?: string, model?: string}} options
 * @returns {Promise<Buffer>}
 */
export const synthesize = async (text, {language, voice = voiceId(), model = TTS_MODEL} = {}) => {
  if (!hasKey()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  if (!voice) throw new HttpError(400, 'Не выбран голос: добавь ELEVENLABS_VOICE_ID в .env и перезапусти сервер');
  const res = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({text, model_id: model, ...(language ? {language_code: language} : {})}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, message(res.status, body, 'Text to Speech'));
  }
  return Buffer.from(await res.arrayBuffer());
};
