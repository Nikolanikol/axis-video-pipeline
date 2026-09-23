// Типы данных проекта: рынок, лот, формат, обзор. Общие для ролика, интерфейса и сервера.
import type brandTheme from '../../config/brand.json';

export type Theme = typeof brandTheme;

// Тексты рынка (язык ролика). Какие ключи нужны — описывает формат в config/formats.json.
export type Texts = Record<string, string>;

// track: id трека из config/music.json, null — без музыки; volume: 0…1
export type Music = {track?: string | null; volume?: number};

// Трек библиотеки (config/music.json, файлы в public/music).
// startSec — с какой доли трека начинать; bpm — темп трека (подгоняется к темпу формата); gain — выравнивание громкости.
export type Track = {
  id: string; file: string; title: string; artist: string; source: string; license: string; url: string;
  startSec: number; bpm: number; gain: number;
};

// Настройки рынка: config/markets/<id>.json
export type Market = {
  name: string; origin: string; originCountry: string; port: string; portCountry: string;
  freightUsd: number; whatsapp: string | null; site: string; texts: Texts;
  music?: Music;
};

// Лот — данные об авто. Любое поле рынка можно переопределить (например, whatsapp: null — скрыть номер).
export type Lot = Partial<Omit<Market, 'texts'>> & {
  market?: string;
  // Последний выбранный формат ролика для этого лота
  format?: string;
  brand: string; model: string; trim?: string; year: number; specs: string[];
  // Цена авто: либо сразу в $, либо в ₩ + курс (₩ за $1). Без цены ролик — черновик с заглушкой.
  carPriceUsd?: number | null; carPriceKrw?: number | null; krwPerUsd?: number | null;
  // Путь в public/, абсолютный путь сервера (/data/...) или http-ссылка
  photos: string[];
  texts?: Partial<Texts>;
};

// Вход любого формата
export type AdProps = {lot: Lot; market: Market; theme?: Partial<Theme>};

// Лот после наложения на настройки рынка
export type Ad = Lot & Omit<Market, 'texts' | 'music'> & {texts: Texts; music: Music};

// Описание формата: config/formats.json
export type Scene = {id: string; title: string; from: number; frames: number; preview: number};
export type TextField = {key: string; label: string; hint?: string; multiline?: boolean};
export type Requirement = 'photos' | 'specs' | 'price';
export type FormatMeta = {
  id: string; title: string; description: string;
  width: number; height: number; fps: number; durationInFrames: number;
  // Темп монтажа: музыка подгоняется к нему, чтобы склейки попадали в доли
  bpm: number;
  scenes: Scene[];
  requires: Requirement[];
  photoRoles: string[];
  texts: TextField[];
};

// Обзоры: проект монтажа (data/reviews/<id>/review.json)
export type {Segment as ReviewSegment, SegmentKind} from './timeline.js';
export type ReviewSource = {
  status: 'processing' | 'ready' | 'error';
  progress?: number;
  error?: string;
  name?: string;
  // Рабочая копия H.264 до 1080×1920, частота REVIEW_FPS: /data/reviews/<id>/proxy-<версия>.mp4
  // (для рендера — полный http-адрес)
  proxy?: string;
  width?: number;
  height?: number;
  duration?: number;
  hasAudio?: boolean;
  // Миниатюры для таймлайна: <base>/0001.jpg … каждые 1/fps секунды
  thumbs?: {fps: number; count: number; base: string};
  // hdr — снято в HDR (iPhone: Dolby Vision + HLG); при сборке рабочей копии цвет переводится в BT.709
  original?: {codec?: string; width?: number; height?: number; fps?: number; rotation?: number; duration?: number; size?: number; hdr?: boolean; transfer?: string};
};
export type {Colour} from './colour.js';
export type {Speaker, VoiceRegistry} from './voices.js';
export type {Line as SubtitleLine} from './subtitles.js';
// Распознанная речь: слова с таймингами (сервер) и строки субтитров (можно править)
export type ReviewSpeech = {
  status: 'running' | 'ready' | 'error';
  error?: string;
  provider?: string;
  language?: string;
  text?: string;
  words?: {text: string; start: number; end: number; type?: string}[];
  // По какому видео считаны тайминги: его можно заменить, а строки останутся
  source?: {name?: string; duration?: number};
  lines: import('./subtitles.js').Line[];
  updatedAt?: string;
};
// Озвучка перевода: по клипу на строку субтитров. Клипы синтезирует сервер, интерфейс их не правит.
export type ReviewVoice = {
  status: 'running' | 'ready' | 'error';
  error?: string;
  enabled: boolean;
  volume?: number;
  voiceId?: string;
  voiceName?: string;
  // Чем озвучено: спикер из реестра и модель синтеза
  speaker?: string;
  speakerName?: string;
  model?: string;
  language?: string;
  // Пока идёт озвучка: сколько строк готово из скольких
  done?: number;
  total?: number;
  // Единая начитка всего перевода: один файл на обзор
  track?: {file: string; duration: number; hash: string};
  // ключ — id строки субтитров. from/to — отрезок дорожки; file/duration — прежний способ (свой клип на строку)
  clips: Record<string, {from?: number; to?: number; file?: string; duration?: number; hash?: string}>;
  updatedAt?: string;
};
/**
 * Звуки машины без голоса — проба. Модель разделения (Demucs) делит дорожку рабочей копии
 * на речь и всё остальное; мы берём «всё остальное»: двери, двигатель, шаги.
 * Нужно потому, что при озвучке живой звук глушится целиком, а вместе с ним пропадает машина.
 * Разделение неидеальное: местами голос просачивается и накладывается на начитку, поэтому
 * включается вручную и так же выключается.
 */
export type ReviewAmbience = {
  status: 'running' | 'ready' | 'error';
  error?: string;
  // Какой шаг идёт сейчас — работа длится минуты, и молчащая кнопка выглядит зависшей
  stage?: string;
  // Использовать в ролике. Файл может быть готов, а слой выключен — это разные вещи
  enabled?: boolean;
  file?: string;
  // По какому видео посчитано: исходник можно заменить, а дорожка останется от прежнего
  source?: {name: string; duration: number};
  updatedAt?: string;
};

export type Review = {
  id?: string;
  title: string;
  // Подпись под названием на заставке. Не задана — берём из рынка; пустая строка — без подписи
  tagline?: string;
  lotId?: string | null;
  market?: string;
  source?: ReviewSource | null;
  segments: import('./timeline.js').Segment[];
  music?: Music;
  // Громкость живого звука с видео (0 — выключен; на ускоренных фрагментах всегда выключен)
  sourceVolume?: number;
  // Цветокоррекция съёмки на весь ролик (оформление не трогает)
  colour?: import('./colour.js').Colour;
  // Речь: язык исходника (ISO-639, например rus), распознавание и показ субтитров
  speechLanguage?: string;
  // Язык субтитров-перевода и озвучки (пусто — берём язык рынка)
  targetLanguage?: string;
  // Кто читает перевод: id спикера из config/voices.json (пусто — по умолчанию для языка)
  voiceSpeaker?: string;
  speech?: ReviewSpeech | null;
  subtitles?: {enabled: boolean; useTranslation: boolean};
  voice?: ReviewVoice | null;
  ambience?: ReviewAmbience | null;
  updatedAt?: string;
};
/**
 * Карточка авто для карусели — то, что отдаёт шлюз kmotors (/api/vehicle/{id}).
 * Поля уже нормализованы: английские названия, числа, абсолютные адреса фото.
 * Пустая строка означает «источник не дал» — корейское слово на слайд не попадает.
 */
export type CarouselCar = {
  id: string;
  source: string;
  brand: string; model: string; grade: string; trim: string;
  year: number | null;
  firstRegistered: string | null;
  mileageKm: number | null;
  displacementCc: number | null;
  transmission: string; fuel: string; body: string; color: string;
  seats: number | null;
  vin: string | null; plate: string | null;
  // Цена в Корее: воны, доллары и курс с отметкой времени — без неё цифры в постах
  // расходятся между днями, и объяснить расхождение нечем
  price: {krw: number; usd: number | null; krwToUsd: number; quotedAt: string; rateSource: string} | null;
  // null — история недоступна. Это НЕ то же самое, что «происшествий не было»
  history: {
    accidentsOwn: number; accidentsOther: number; accidentsTotal: number;
    accidentYears: number[]; maxPayoutKrw: number | null;
    ownerChanges: number; theft: number; flood: number; totalLoss: number;
  } | null;
  options: {comfort: string[]; safety: string[]; other: string[]; total: number};
  photos: {exterior: string[]; interior: string[]; other: string[]};
};

export type CarouselProps = {car: CarouselCar; market: Market; theme?: Partial<Theme>};

export type ReviewProps = {review: Review; lot?: Lot | null; market: Market; theme?: Partial<Theme>};
