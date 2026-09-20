// Проекты обзоров: data/reviews/<id>/review.json + source.* (исходник) + proxy-<версия>.mp4 + thumbs-<версия>/
import fs from 'node:fs/promises';
import path from 'node:path';
import {linesFromWords, sanitizeLines} from '../src/shared/subtitles.js';
import {canSpeak, findLanguage, languageName, targetLanguageOf} from '../src/shared/languages.js';
import {sanitizeColour} from '../src/shared/colour.js';
import {sanitizeSegments} from '../src/shared/timeline.js';
import {makeProxy, makeThumbs, probe} from './media.mjs';
import {apiSettings, resolveSpeaker, voiceConfig} from '../src/shared/voices.js';
import {buildScript, lineTimes} from '../src/shared/narration.js';
import {extractAudio, hasKey, hasVoice, synthesizeScript, transcribe, voiceHash} from './speech.mjs';
import {CONFIG_DIR, DATA_DIR, DEFAULT_MARKET, HttpError, checkId, getLot, readJson, withLock, writeJson} from './store.mjs';

export const REVIEWS_DIR = path.join(DATA_DIR, 'reviews');
export const UPLOAD_TMP = path.join(DATA_DIR, 'tmp');
export const MAX_SOURCE_SEC = 10 * 60;
export const THUMBS_FPS = 2;

// Реестр спикеров озвучки — общий на проект, читаем при каждой озвучке (правится редко, файл крошечный)
export const voiceRegistry = () => readJson(path.join(CONFIG_DIR, 'voices.json')).catch(() => ({speakers: [], defaults: {}}));

const reviewDir = (id) => path.join(REVIEWS_DIR, checkId(id));
const reviewFile = (id) => path.join(reviewDir(id), 'review.json');
export const reviewUrl = (id, file) => `/data/reviews/${id}/${file}`;

// Идёт обработка видео: id → доля 0…1; идёт приём загрузки — id в ingesting; идёт распознавание — в transcribing
const progress = new Map();
const ingesting = new Set();
const transcribing = new Set();
// Идёт озвучка: id → {done, total} по строкам
const voicing = new Map();

const withProgress = (review) => {
  const p = progress.get(review.id);
  const withSource = p === undefined || !review.source ? review : {...review, source: {...review.source, progress: p}};
  const withSpeech = transcribing.has(review.id)
    ? {...withSource, speech: {...withSource.speech, status: 'running'}}
    : withSource;
  // Озвучка идёт построчно — показываем, сколько уже готово
  const v = voicing.get(review.id);
  return v ? {...withSpeech, voice: {...withSpeech.voice, status: 'running', done: v.done, total: v.total}} : withSpeech;
};

const read = async (id) => ({...(await readJson(reviewFile(id))), id});

export const getReview = async (id) => {
  const review = await read(id);
  resumeIfStale(review);
  return withProgress(review);
};

const write = async (id, review) => {
  const {id: _ignored, ...data} = review;
  await writeJson(reviewFile(id), {...data, updatedAt: new Date().toISOString()});
  return withProgress(await read(id));
};

export const listReviews = async () => {
  await fs.mkdir(REVIEWS_DIR, {recursive: true});
  const dirs = (await fs.readdir(REVIEWS_DIR, {withFileTypes: true})).filter((d) => d.isDirectory());
  const all = await Promise.all(dirs.map((d) => getReview(d.name).catch(() => null)));
  return all.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

const checkLot = async (lotId) => {
  if (!lotId) return null;
  await getLot(lotId);
  return lotId;
};

export const createReview = async ({lotId, title} = {}) => {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const id = `rv-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  let name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : '';
  const linked = await checkLot(lotId);
  if (!name && linked) {
    const lot = await getLot(linked);
    name = [lot.brand, lot.model, lot.year].filter(Boolean).join(' ');
  }
  await fs.mkdir(reviewDir(id), {recursive: true});
  return write(id, {title: name || 'Новый обзор', lotId: linked, market: undefined, source: null, segments: [], sourceVolume: 0, colour: sanitizeColour(null)});
};

// Сохранение из формы. Видео (source) меняется только загрузкой; фрагменты чистятся по длине исходника.
export const updateReview = (id, body) => withLock(`review:${id}`, async () => {
  const current = await read(id);
  // Форма шлёт версию, с которой её открыли. Разошлись — значит обзор поменяли в другом месте
  // (распознавание, озвучка, вторая вкладка), и слепое сохранение затёрло бы чужие правки.
  if (body.baseUpdatedAt && current.updatedAt && body.baseUpdatedAt !== current.updatedAt) {
    throw new HttpError(409, 'Обзор изменился в другом месте — обнови страницу, иначе правки затрут друг друга');
  }
  const music = body.music && typeof body.music === 'object'
    ? Object.fromEntries(Object.entries({
      track: body.music.track === null ? null : typeof body.music.track === 'string' ? body.music.track : undefined,
      volume: Number.isFinite(body.music.volume) ? Math.min(1, Math.max(0, body.music.volume)) : undefined,
    }).filter(([, v]) => v !== undefined))
    : undefined;
  return write(id, {
    ...current,
    title: typeof body.title === 'string' ? body.title.slice(0, 120) : current.title,
    lotId: body.lotId === undefined ? current.lotId : await checkLot(body.lotId),
    market: typeof body.market === 'string' && body.market ? checkId(body.market) : undefined,
    // Язык речи в видео — для распознавания; язык перевода — для субтитров и озвучки
    speechLanguage: typeof body.speechLanguage === 'string' ? body.speechLanguage.slice(0, 8) : current.speechLanguage,
    targetLanguage: findLanguage(body.targetLanguage) ? body.targetLanguage : current.targetLanguage,
    // Спикер озвучки: проверяем при синтезе, здесь просто запоминаем выбор
    voiceSpeaker: typeof body.voiceSpeaker === 'string' ? body.voiceSpeaker.slice(0, 40) : current.voiceSpeaker,
    segments: sanitizeSegments(body.segments ?? current.segments, current.source?.duration),
    // Слова и статус распознавания меняет только сервер; из формы принимаем правки строк
    speech: current.speech && {
      ...current.speech,
      lines: sanitizeLines(body.speech?.lines ?? current.speech.lines, current.source?.duration),
    },
    subtitles: {
      enabled: Boolean(body.subtitles?.enabled),
      useTranslation: Boolean(body.subtitles?.useTranslation),
    },
    // Клипы озвучки пишет только сервер; из формы принимаем включатель и громкость
    voice: current.voice && {
      ...current.voice,
      enabled: Boolean(body.voice?.enabled),
      volume: Number.isFinite(body.voice?.volume) ? Math.min(1, Math.max(0, body.voice.volume)) : current.voice.volume ?? 1,
    },
    music,
    sourceVolume: Number.isFinite(body.sourceVolume) ? Math.min(1, Math.max(0, body.sourceVolume)) : current.sourceVolume ?? 0,
    colour: sanitizeColour(body.colour ?? current.colour),
  });
});

const setSource = (id, source) => withLock(`review:${id}`, async () => write(id, {...(await read(id)), source}));

// Удалить прежние файлы видео, кроме оставляемых
const cleanMedia = async (id, keep = []) => {
  const dir = reviewDir(id);
  for (const f of await fs.readdir(dir)) {
    if (keep.includes(f)) continue;
    if (/^(source\.|proxy-|thumbs-)/.test(f)) await fs.rm(path.join(dir, f), {recursive: true, force: true});
  }
};

/**
 * Пересобрать рабочую копию из уже загруженного исходника — перезаливать файл не нужно.
 * Нужна, когда поменялась сама обработка: например, добавился перевод HDR в обычный цвет.
 * Фрагменты и речь не трогаем: их тайминги считаются от длительности, а она не меняется.
 */
export const reprocessSource = async (id) => {
  const review = await read(id);
  const s = review.source;
  if (!s?.file) throw new HttpError(400, 'Видео не загружено — пересобирать нечего');
  if (progress.has(id) || ingesting.has(id)) throw new HttpError(409, 'Видео уже обрабатывается');
  const info = await probe(path.join(reviewDir(id), s.file)).catch(() => null);
  if (!info?.video) throw new HttpError(400, 'Исходник не читается — загрузи видео заново');
  const saved = await setSource(id, {
    ...s, status: 'processing', progress: 0, error: undefined,
    original: {...info.video, duration: info.duration, size: info.size},
  });
  processVideo(id, s.file, info.duration, {hdr: Boolean(info.video.hdr), transfer: info.video.transfer});
  return saved;
};

// Загрузка исходника: проверяем, что это видео, и запускаем обработку в фоне
export const ingestSource = async (id, uploadedPath, originalName) => {
  try {
    await read(id);
  } catch (e) {
    await fs.rm(uploadedPath, {force: true});
    throw e;
  }
  if (progress.has(id) || ingesting.has(id)) {
    await fs.rm(uploadedPath, {force: true});
    throw new HttpError(409, 'Предыдущее видео ещё обрабатывается');
  }
  ingesting.add(id);
  try {
    return await ingest(id, uploadedPath, originalName);
  } finally {
    ingesting.delete(id);
  }
};

const ingest = async (id, uploadedPath, originalName) => {
  let info;
  try {
    info = await probe(uploadedPath);
  } catch {
    await fs.rm(uploadedPath, {force: true});
    throw new HttpError(400, `Не удалось прочитать видео «${originalName}»`);
  }
  if (!info.video) {
    await fs.rm(uploadedPath, {force: true});
    throw new HttpError(400, `В файле «${originalName}» нет видео`);
  }
  if (info.duration > MAX_SOURCE_SEC) {
    await fs.rm(uploadedPath, {force: true});
    throw new HttpError(400, `Видео длиннее ${MAX_SOURCE_SEC / 60} минут`);
  }
  const ext = (path.extname(originalName).toLowerCase().match(/^\.[a-z0-9]{1,5}$/) ?? ['.mov'])[0];
  const file = `source${ext}`;
  await cleanMedia(id);
  await fs.rename(uploadedPath, path.join(reviewDir(id), file));
  const original = {...info.video, duration: info.duration, size: info.size};
  const saved = await setSource(id, {status: 'processing', progress: 0, name: String(originalName).slice(0, 200), file, original});
  processVideo(id, file, info.duration, {hdr: Boolean(info.video?.hdr), transfer: info.video?.transfer});
  return saved;
};

// Прокси + миниатюры. Результат — в review.json; прогресс — в памяти.
// sourceColour — сведения о цвете исходника (HDR и его кривая), не цветокоррекция
const processVideo = (id, file, duration, sourceColour = {}) => {
  if (progress.has(id)) return;
  progress.set(id, 0);
  (async () => {
    const dir = reviewDir(id);
    const version = Date.now();
    const proxy = `proxy-${version}.mp4`;
    const thumbs = `thumbs-${version}`;
    try {
      await makeProxy(path.join(dir, file), path.join(dir, `${proxy}.part`), duration, (p) => progress.set(id, p * 0.9), sourceColour);
      await fs.rename(path.join(dir, `${proxy}.part`), path.join(dir, proxy));
      const info = await probe(path.join(dir, proxy));
      progress.set(id, 0.95);
      const count = await makeThumbs(path.join(dir, proxy), path.join(dir, thumbs), THUMBS_FPS);
      await cleanMedia(id, [file, proxy, thumbs]);
      const current = (await read(id)).source ?? {};
      await setSource(id, {
        ...current, status: 'ready', progress: 1, error: undefined,
        proxy: reviewUrl(id, proxy), width: info.video?.width, height: info.video?.height,
        duration: info.duration, hasAudio: info.hasAudio,
        thumbs: {fps: THUMBS_FPS, count, base: reviewUrl(id, thumbs)},
      });
    } catch (e) {
      console.error(`Обработка видео ${id}:`, e);
      const current = (await read(id).catch(() => ({}))).source ?? {};
      await setSource(id, {...current, status: 'error', error: String(e?.message || e)}).catch(() => {});
    } finally {
      progress.delete(id);
    }
  })();
};

// Сервер перезапустили посреди обработки — продолжаем
const resumeIfStale = (review) => {
  const s = review.source;
  if (s?.status === 'processing' && !progress.has(review.id) && s.file) {
    processVideo(review.id, s.file, s.original?.duration ?? 0, {hdr: Boolean(s.original?.hdr), transfer: s.original?.transfer});
  }
};

export const isProcessing = (id) => progress.has(id) || ingesting.has(id);

// Заново разбить сохранённые слова на строки — без обращения к сервису и без оплаты
export const rebuildLines = (id) => withLock(`review:${id}`, async () => {
  const review = await read(id);
  const words = review.speech?.words;
  if (!words?.length) throw new HttpError(400, 'Сначала распознай речь');
  return write(id, {...review, speech: {...review.speech, lines: linesFromWords(words)}});
});

// Распознавание речи: звук из рабочей копии → ElevenLabs → слова с таймингами и строки субтитров
export const transcribeReview = async (id) => {
  const review = await read(id);
  if (review.source?.status !== 'ready') throw new HttpError(400, 'Видео ещё не готово');
  if (!review.source.hasAudio) throw new HttpError(400, 'В этом видео нет звука — распознавать нечего');
  if (!hasKey()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  if (transcribing.has(id)) throw new HttpError(409, 'Распознавание уже идёт');
  transcribing.add(id);
  const saveSpeech = (speech) => withLock(`review:${id}`, async () => write(id, {...(await read(id)), speech}));
  (async () => {
    const dir = reviewDir(id);
    try {
      const audio = await extractAudio(path.join(dir, path.basename(review.source.proxy)), path.join(dir, 'speech.m4a'));
      const result = await transcribe(audio, {language: review.speechLanguage || undefined});
      // Запоминаем, по какому видео считаны тайминги: его можно заменить, а строки останутся
      const src = (await read(id)).source ?? {};
      await saveSpeech({
        ...result, status: 'ready',
        source: {name: src.name ?? '', duration: src.duration ?? 0},
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`Распознавание ${id}:`, e.message);
      await saveSpeech({...(await read(id).catch(() => ({}))).speech, status: 'error', error: String(e?.message || e)}).catch(() => {});
    } finally {
      transcribing.delete(id);
    }
  })();
  return {...review, speech: {...review.speech, status: 'running'}};
};
/**
 * Озвучка перевода: по клипу на строку субтитров, голос — ELEVENLABS_VOICE_ID.
 * Клип с тем же текстом и голосом переиспользуется, поэтому правка одной строки стоит одну строку.
 */
export const voiceReview = async (id, {language, market} = {}) => {
  const review = await read(id);
  const target = findLanguage(language) ? language : targetLanguageOf(review, market);
  const lines = (review.speech?.lines ?? []).filter((l) => (l.translation || '').trim());
  if (!lines.length) throw new HttpError(400, 'Нечего озвучивать: у строк нет перевода');
  if (!canSpeak(target)) throw new HttpError(400, `Голос не умеет говорить на языке «${languageName(target)}» — субтитры на нём делать можно, озвучку нет`);
  if (!hasVoice()) throw new HttpError(400, 'Нет ключа ElevenLabs: добавь ELEVENLABS_API_KEY в .env и перезапусти сервер');
  // Голос, модель и настройки — из реестра: на разных языках один спикер читается по-разному
  const registry = await voiceRegistry();
  const speaker = resolveSpeaker(registry, target, review.voiceSpeaker);
  const config = voiceConfig(speaker, target);
  if (!config) throw new HttpError(400, `Нет спикера для языка «${languageName(target)}» — добавь его в config/voices.json`);
  if (voicing.has(id)) throw new HttpError(409, 'Озвучка уже идёт');
  voicing.set(id, {done: 0, total: lines.length});
  const saveVoice = (patch) => withLock(`review:${id}`, async () => {
    const current = await read(id);
    return write(id, {...current, voice: {...current.voice, ...patch}});
  });
  (async () => {
    const dir = path.join(reviewDir(id), 'voice');
    try {
      await fs.mkdir(dir, {recursive: true});
      const language = target;
      const {voiceId: voice, model} = config;
      const settings = apiSettings(config.settings);
      // Весь перевод — одной начиткой: так голос ровный, а паузы ставит сама модель
      const {text, spans} = buildScript(lines);
      const hash = voiceHash(text, {voice, model, language, settings});
      const name = `track-${hash}.mp3`;
      const file = path.join(dir, name);
      let times = review.voice?.track?.hash === hash ? review.voice.clips : null;
      if (!times) {
        const {audio, alignment} = await synthesizeScript(text, {language, voice, model, settings});
        await fs.writeFile(file, audio);
        times = lineTimes(spans, alignment);
        if (!Object.keys(times).length) throw new HttpError(502, 'ElevenLabs вернул начитку без разметки по символам');
      }
      voicing.set(id, {done: lines.length, total: lines.length});
      const {duration} = await probe(file);
      // Прежние файлы (в том числе построчные клипы старых обзоров) не копим
      for (const f of await fs.readdir(dir)) if (f !== name) await fs.rm(path.join(dir, f), {force: true});
      await saveVoice({
        status: 'ready', error: '', enabled: true,
        voiceId: voice, speaker: speaker.id, speakerName: speaker.name, model, language,
        track: {file: reviewUrl(id, `voice/${name}`), duration: Math.round((duration || 0) * 100) / 100, hash},
        clips: times, done: undefined, total: undefined, updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`Озвучка ${id}:`, e.message);
      await saveVoice({status: 'error', error: String(e?.message || e)}).catch(() => {});
    } finally {
      voicing.delete(id);
    }
  })();
  return {...review, voice: {...review.voice, status: 'running', done: 0, total: lines.length, speaker: speaker.id, speakerName: speaker.name}};
};

export const defaultMarketFor = (review, lot) => lot?.market || review.market || DEFAULT_MARKET;
