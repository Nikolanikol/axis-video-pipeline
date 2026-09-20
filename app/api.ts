// Клиент API сервера: лоты, фото, обзоры, речь, озвучка, рендеры. Типы ответов — общие с сервером.
import type {FormatMeta, Lot, Market, Review, Theme} from '../src/shared/types';

export type MarketEntry = Market & {id: string};
// Размытие: [x, y, w, h] в долях кадра, по «стволу» имени файла фото
export type Region = [number, number, number, number];
export type LotEntry = Lot & {id: string; updatedAt?: string; note?: string; blur?: Record<string, Region[]>};
export type PhotoInfo = {path: string; source: string; regions: Region[]};
export type Config = {
  brand: Theme; markets: MarketEntry[]; defaultMarket: string; formats: FormatMeta[]; pipelines: unknown[];
  features: {speech: boolean; voice: boolean};
  voices?: import('../src/shared/types').VoiceRegistry;
};
export type ReviewEntry = Review & {id: string};
export type JobQuery = {lot?: string; review?: string};
export type Job = {
  id: string; lotId?: string; reviewId?: string; title: string; format: string; formatTitle: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: string; progress: number; createdAt: string; finishedAt?: string; error?: string;
  video: string; storyboard: string; videoSilent?: string;
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
  render: (id: string, format: string, silent: boolean) =>
    request<Job>('POST', `/api/lots/${id}/render`, {format, silent}),
  jobs: (q: JobQuery) => request<Job[]>('GET', `/api/renders?${new URLSearchParams(q as Record<string, string>)}`),
  reviews: () => request<ReviewEntry[]>('GET', '/api/reviews'),
  review: (id: string) => request<ReviewEntry>('GET', `/api/reviews/${id}`),
  createReview: (data: {lotId?: string | null; title?: string}) => request<ReviewEntry>('POST', '/api/reviews', data),
  saveReview: (r: ReviewEntry, baseUpdatedAt?: string) => request<ReviewEntry>('PUT', `/api/reviews/${r.id}`, {...r, baseUpdatedAt}),
  renderReview: (id: string, silent: boolean) => request<Job>('POST', `/api/reviews/${id}/render`, {silent}),
  reprocessVideo: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/reprocess`),
  transcribe: (id: string) => request<ReviewEntry>('POST', `/api/reviews/${id}/transcribe`),
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
