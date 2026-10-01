// Клиент API сервера: вход и кабинет, админка, настройки, лоты и фото, обзоры, речь и озвучка,
// рендеры, карусели. Типы ответов — общие с сервером.
import type {CarouselCar, FormatMeta, Lot, Market, Profile, Review, Texts, Theme} from '../src/shared/types';

export type MarketEntry = Market & {id: string};
export type ProfileEntry = Profile & {id: string};
// Дефолты текстов платформы: режим цены → язык → тексты. Клиент их не пишет, только читает
export type Copy = Record<string, Record<string, Texts>>;
// Размытие: [x, y, w, h] в долях кадра, по «стволу» имени файла фото
export type Region = [number, number, number, number];
// sources — откуда скачано фото (имя файла без версии → адрес снимка Encar); ведёт сервер
export type LotEntry = Lot & {id: string; updatedAt?: string; note?: string; blur?: Record<string, Region[]>; sources?: Record<string, string>};
export type PhotoInfo = {path: string; source: string; regions: Region[]};
// Пара шрифтов из config/fonts.json. url пустой — пара встроена в проект и не требует сети
export type FontPair = {id: string; title: string; note: string; head: string; body: string; url: string};
// Палитра из config/palettes.json: восемь цветов темы, прошедшие проверку контраста
export type Palette = {id: string; title: string; note: string; colors: Record<string, string>};
export type Config = {
  brand: Theme; markets: MarketEntry[]; defaultMarket: string; formats: FormatMeta[]; pipelines: unknown[];
  // Профили клиента идут на смену рынкам; copy — дефолты текстов платформы
  profiles: ProfileEntry[]; defaultProfile: string; copy: Copy;
  // Компания и адрес её файлов (/data/workspaces/<id>)
  workspace: {id: string; url: string};
  // Боевой запуск (NODE_ENV=production). Интерфейс по нему прячет пайплайн обзоров
  production: boolean;
  fonts: FontPair[];
  palettes?: Palette[];
  carouselFormats?: CarouselFormat[];
  // ambience — установлено ли локальное окружение для выделения звуков машины (проба)
  features: {speech: boolean; voice: boolean; ambience?: boolean};
  // Цены генераций в кредитах: {ads, carousels, reviews}
  credits?: Record<string, number>;
  voices?: import('../src/shared/types').VoiceRegistry;
};
export type ReviewEntry = Review & {id: string};
// Готовая карусель: карточка авто от шлюза и адреса семи картинок
// format и seed — чем собрана: формат из реестра и зерно варианта (у старых карусель их нет — «Классика»)
export type CarouselEntry = {id: string; car: CarouselCar; slides: string[]; updatedAt: string; format?: string; seed?: number};
export type CarouselFormat = {id: string; title: string; note: string; width: number; height: number; slides: string[]};
export type JobQuery = {lot?: string; review?: string};
export type Job = {
  id: string; lotId?: string; reviewId?: string; title: string; format: string; formatTitle: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  stage: string; progress: number; createdAt: string; finishedAt?: string; error?: string;
  video: string; storyboard: string;
};

// Кабинет SMMAKER: кто вошёл и сколько у компании кредитов
export type CreditLot = {
  id: number; remaining: number; credits: number; expiresAt: string;
  source: 'signup' | 'pack' | 'bonus' | 'legacy' | 'subscription'; packId: string | null; createdAt: string;
};
// Подписка: тариф и до какого числа оплачено (конец последней партии подписки)
export type Subscription = {planId: string | null; title: string; credits: number; until: string};
// Баланс для шапки и кабинета; subscription — чтобы показать «подписка до» и полосу продления
export type Balance = {credits: number; nextExpiry: {at: string; credits: number} | null; lots: CreditLot[]; subscription: Subscription | null};
export type Role = 'admin' | 'manager' | null;
export type User = {id: string; email: string; name: string | null; emailVerified: boolean; role: Role; isAdmin: boolean; isStaff: boolean};
export type Me =
  | {authRequired: false}
  | {authRequired: true; user: null; signup: {credits: number; days: number}}
  | {authRequired: true; user: User; workspace: {id: string; name: string; role: string} | null; balance: Balance | null};
// kind: plan — подписка на месяц (кредиты сгорают в конце месяца), topup — докупка, сгорает вместе с подпиской
export type Pack = {id: string; title: string; credits: number; price_krw: number; valid_days: number; active: boolean; sort: number; kind: 'plan' | 'topup'};
export type Offer = {contacts: {whatsapp?: string; telegram?: string; email?: string}; packs: Pack[]};
// Условия для витрины гостя: без входа (GET /api/public/offer)
export type PublicOffer = Offer & {signup: {credits: number; days: number}; costs: Record<string, number>};
export type LedgerRow = {
  id: number; delta: number; kind: 'grant' | 'charge' | 'refund' | 'adjust'; pipeline: string | null;
  job_id: string | null; note: string; created_at: string;
  expires_at: string | null; source: CreditLot['source'] | null; price_krw: number | null;
};
export type ClientRow = {
  id: string; name: string; created_at: string; person: string | null; email: string | null; phone: string | null;
  platform_role: Role; credits: number; paid_krw: number; generations: number; last_generation: string | null;
  plan_title: string | null; plan_until: string | null;
};
// Курс ₩ за $1 на сегодня: сервер берёт его раз в сутки. stale — источник не ответил, курс старше суток
export type UsdKrw = {krwPerUsd: number; fetchedAt: string; source: string; stale: boolean};
export type StaffRow = {id: string; email: string; name: string | null; platform_role: Exclude<Role, null>};
export type Registration = {name: string; email: string; phone: string; password: string; company: string};

const request = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? {'Content-Type': 'application/json'} : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // Сессия кончилась или вход сброшен на другом устройстве — перезагрузка покажет экран входа
  if (res.status === 401 && !url.startsWith('/api/auth/')) window.location.reload();
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data as T;
};

export const api = {
  me: () => request<Me>('GET', '/api/auth/me'),
  login: (email: string, password: string) => request<{ok: true}>('POST', '/api/auth/login', {email, password}),
  register: (data: Registration) => request<{ok: true}>('POST', '/api/auth/register', data),
  logout: () => request<{ok: true}>('POST', '/api/auth/logout'),
  verify: (code: string) => request<{ok: true}>('POST', '/api/auth/verify', {code}),
  resendVerify: () => request<{sent: boolean}>('POST', '/api/auth/verify/resend'),
  verifyLink: (token: string) => request<{ok: true}>('POST', '/api/auth/verify/link', {token}),
  forgot: (email: string) => request<{ok: true}>('POST', '/api/auth/forgot', {email}),
  reset: (token: string, password: string) => request<{ok: true}>('POST', '/api/auth/reset', {token, password}),
  ledger: () => request<LedgerRow[]>('GET', '/api/account/ledger'),
  offer: () => request<Offer>('GET', '/api/account/offer'),
  publicOffer: () => request<PublicOffer>('GET', '/api/public/offer'),
  admin: {
    clients: () => request<ClientRow[]>('GET', '/api/admin/clients'),
    clientLedger: (id: string) => request<LedgerRow[]>('GET', `/api/admin/clients/${id}/ledger`),
    packs: () => request<Pack[]>('GET', '/api/admin/packs'),
    savePack: (pack: Pack) => request<Pack>('PUT', `/api/admin/packs/${pack.id}`, pack),
    grantPack: (id: string, packId: string, note: string) =>
      request<Balance>('POST', `/api/admin/clients/${id}/packs`, {packId, note}),
    grantBonus: (id: string, credits: number, note: string) =>
      request<Balance>('POST', `/api/admin/clients/${id}/bonus`, {credits, note}),
    staff: () => request<StaffRow[]>('GET', '/api/admin/staff'),
    setRole: (email: string, role: Role) => request<StaffRow[]>('PUT', '/api/admin/staff', {email, role}),
  },
  config: () => request<Config>('GET', '/api/config'),
  saveBrand: (theme: Theme) => request<Theme>('PUT', '/api/brand', theme),
  saveMarket: (id: string, market: Market) => request<MarketEntry>('PUT', `/api/markets/${id}`, market),
  saveProfile: (id: string, profile: Profile) => request<ProfileEntry>('PUT', `/api/profiles/${id}`, profile),
  lots: () => request<LotEntry[]>('GET', '/api/lots'),
  createLot: (data: Partial<Lot>) => request<LotEntry>('POST', '/api/lots', data),
  saveLot: (lot: LotEntry) => request<LotEntry>('PUT', `/api/lots/${lot.id}`, lot),
  // Удалить лот вместе с фото и роликами; копия — новый лот с теми же полями и фото
  deleteLot: (id: string) => request<{id: string; deleted: boolean; renders: number}>('DELETE', `/api/lots/${id}`),
  copyLot: (id: string) => request<LotEntry>('POST', `/api/lots/${id}/copy`),
  // Машина по ссылке Encar (через шлюз kmotors) и фото из объявления — скачиваются в лот
  lookupCar: (link: string) => request<CarouselCar>('POST', '/api/encar/lookup', {link}),
  importPhotos: (id: string, urls: string[]) => request<LotEntry>('POST', `/api/lots/${id}/photos/import`, {urls}),
  usdKrw: () => request<UsdKrw>('GET', '/api/rates/usd-krw'),
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
  cancelRender: (id: string) => request<Job>('POST', `/api/renders/${id}/cancel`),
  retryRender: (id: string) => request<Job>('POST', `/api/renders/${id}/retry`),
  deleteRender: (id: string) => request<{id: string; deleted: boolean}>('DELETE', `/api/renders/${id}`),
  reviews: () => request<ReviewEntry[]>('GET', '/api/reviews'),
  review: (id: string) => request<ReviewEntry>('GET', `/api/reviews/${id}`),
  createReview: (data: {lotId?: string | null; title?: string}) => request<ReviewEntry>('POST', '/api/reviews', data),
  saveReview: (r: ReviewEntry, baseUpdatedAt?: string) => request<ReviewEntry>('PUT', `/api/reviews/${r.id}`, {...r, baseUpdatedAt}),
  // Логотип: сервер сам доводит файл (фон, поля, размер, SVG → PNG) и возвращает обновлённый бренд
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch('/api/brand/logo', {method: 'POST', body: form});
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Не удалось загрузить логотип');
    return body as {url: string; width: number; height: number; bytes: number; brand: Theme;
      notes: string[]; warnings: string[]; hasRaw: boolean};
  },
  // clean — фон убран, raw — как загружен, none — без логотипа, название компании текстом
  logoVariant: (variant: 'clean' | 'raw' | 'none') =>
    request<{url: string; brand: Theme}>('PUT', '/api/brand/logo/variant', {variant}),
  // Карусели: ссылка Encar → слайды формата; seed — зерно варианта (нет — случайное)
  buildCarousel: (link: string, format?: string, seed?: number) => request<CarouselEntry>('POST', '/api/carousels', {link, format, seed}),
  carousels: () => request<CarouselEntry[]>('GET', '/api/carousels'),
  deleteCarousel: (id: string) => request<{id: string; deleted: boolean}>('DELETE', `/api/carousels/${id}`),
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
