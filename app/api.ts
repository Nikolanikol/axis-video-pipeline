// Клиент API сервера: лоты, фото, обзоры, речь, озвучка, рендеры. Типы ответов — общие с сервером.
import type {CarouselCar, FormatMeta, Lot, Market, Profile, Review, Texts, Theme} from '../src/shared/types';

export type MarketEntry = Market & {id: string};
export type ProfileEntry = Profile & {id: string};
// Дефолты текстов платформы: режим цены → язык → тексты. Клиент их не пишет, только читает
export type Copy = Record<string, Record<string, Texts>>;
// Размытие: [x, y, w, h] в долях кадра, по «стволу» имени файла фото
export type Region = [number, number, number, number];
export type LotEntry = Lot & {id: string; updatedAt?: string; note?: string; blur?: Record<string, Region[]>};
export type PhotoInfo = {path: string; source: string; regions: Region[]};
// Пара шрифтов из config/fonts.json. url пустой — пара встроена в проект и не требует сети
export type FontPair = {id: string; title: string; note: string; head: string; body: string; url: string};
export type Config = {
  brand: Theme; markets: MarketEntry[]; defaultMarket: string; formats: FormatMeta[]; pipelines: unknown[];
  // Профили клиента идут на смену рынкам; copy — дефолты текстов платформы
  profiles: ProfileEntry[]; defaultProfile: string; copy: Copy;
  // Боевой запуск (NODE_ENV=production). Интерфейс по нему прячет пайплайн обзоров
  production: boolean;
  fonts: FontPair[];
  // ambience — установлено ли локальное окружение для выделения звуков машины (проба)
  features: {speech: boolean; voice: boolean; ambience?: boolean};
  voices?: import('../src/shared/types').VoiceRegistry;
};
export type ReviewEntry = Review & {id: string};
// Готовая карусель: карточка авто от шлюза и адреса семи картинок
export type CarouselEntry = {id: string; car: CarouselCar; slides: string[]; updatedAt: string};
export type JobQuery = {lot?: string; review?: string};
export type Job = {
  id: string; lotId?: string; reviewId?: string; title: string; format: string; formatTitle: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: string; progress: number; createdAt: string; finishedAt?: string; error?: string;
  video: string; storyboard: string;
};

const request = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? {'Content-Type': 'application/json'} : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data as T;
};

export const api = {
  config: () => request<Config>('GET', '/api/config'),
  saveBrand: (theme: Theme) => request<Theme>('PUT', '/api/brand', theme),
  saveMarket: (id: string, market: Market) => request<MarketEntry>('PUT', `/api/markets/${id}`, market),
  saveProfile: (id: string, profile: Profile) => request<ProfileEntry>('PUT', `/api/profiles/${id}`, profile),
  lots: () => request<LotEntry[]>('GET', '/api/lots'),
  createLot: (data: Partial<Lot>) => request<LotEntry>('POST', '/api/lots', data),
  saveLot: (lot: LotEntry) => request<LotEntry>('PUT', `/api/lots/${lot.id}`, lot),
  uploadPhotos: (id: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    return request<LotEntry>('POST', `/api/lots/${id}/photos`, form);
  },
  deletePhoto: (id: string, path: string) =>
    request<LotEntry>('DELETE', `/api/lots/${id}/photos?path=${encodeURIComponent(path)}`),
  photoInfo: (id: string, path: string) =>
    request<PhotoInfo>('GET', `/api/lots/${id}/photo?path=${encodeURIComponent(path)}`),
  blurPhoto: (id: string, path: string, regions: Region[]) =>
    request<LotEntry>('PUT', `/api/lots/${id}/photo`, {path, regions}),
  render: (id: string, format: string) =>
    request<Job>('POST', `/api/lots/${id}/render`, {format}),
  jobs: (q: JobQuery) => request<Job[]>('GET', `/api/renders?${new URLSearchParams(q as Record<string, string>)}`),
  reviews: () => request<ReviewEntry[]>('GET', '/api/reviews'),
  review: (id: string) => request<ReviewEntry>('GET', `/api/reviews/${id}`),
  createReview: (data: {lotId?: string | null; title?: string}) => request<ReviewEntry>('POST', '/api/reviews', data),
  saveReview: (r: ReviewEntry, baseUpdatedAt?: string) => request<ReviewEntry>('PUT', `/api/reviews/${r.id}`, {...r, baseUpdatedAt}),
  // Карусели: ссылка Encar → семь слайдов
  // Логотип: сервер проверяет формат, размер и прозрачность и возвращает обновлённый бренд
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch('/api/brand/logo', {method: 'POST', body: form});
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Не удалось загрузить логотип');
    return body as {url: string; width: number; height: number; bytes: number; brand: Theme};
  },
  buildCarousel: (link: string) => request<CarouselEntry>('POST', '/api/carousels', {link}),
  carousels: () => request<CarouselEntry[]>('GET', '/api/carousels'),
  renderReview: (id: string) => request<Job>('POST', `/api/reviews/${id}/render`, {}),
  reprocessVideo: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/reprocess`),
  transcribe: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/transcribe`),
  // Выделить звуки машины без голоса (проба; работает, если установлено окружение с моделью)
  separateAmbience: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/ambience`),
  rebuildLines: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/relines`),
  voiceReview: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/voice`),
  // Прослушать спикера: сервер отдаёт mp3, играем его сразу
  previewVoice: async (speaker: string, language: string, text: string) => {
    const res = await fetch('/api/voices/preview', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({speaker, language, text})});
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Не удалось озвучить');
    return URL.createObjectURL(await res.blob());
  },
  // Загрузка видео с прогрессом (fetch его не умеет)
  uploadVideo: (id: string, file: File, onProgress: (share: number) => void) => new Promise<ReviewEntry>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/reviews/${id}/source`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data: {error?: string} = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* не JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as ReviewEntry);
      else reject(new Error(data.error || `${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('Загрузка прервалась'));
    const form = new FormData();
    form.append('video', file);
    xhr.send(form);
  }),
  job: (id: string) => request<Job>('GET', `/api/renders/${id}`),
};
