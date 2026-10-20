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
  // Номер PR превью в Coolify (null — не превью)
  preview?: string | null;
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
export type CarouselEntry = {id: string; car: CarouselCar; slides: string[]; updatedAt: string; format?: string; seed?: number;
  // Семейство из пакета KOK_handoff_v1 (src/carousel/families/registry.js); нет — оформление бренда
  family?: string;
  // Своя цена клиента на слайде цены (в валюте профиля)
  priceOverride?: number;
  // Тексты по слайдам (для «Редактировать текст») и свои правки клиента: слайд → поле → текст.
  // У каруселей, собранных до 19.10, текстов нет — править можно после «Пересобрать»
  texts?: {slide: string; fields: Record<string, string>}[];
  textOverrides?: Record<string, Record<string, string>>;
  // Только у каруселей по лотам аукционов: откуда собрана (для «Пересобрать» и кнопки «Открыть лот»)
  lot?: {house: string; id: string; url: string}};
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
// pay — какие кассы включены на сервере (нет ключей — только менеджер)
export type Offer = {contacts: {whatsapp?: string; telegram?: string; email?: string; instagram?: string}; packs: Pack[]; pay?: PayMethods; support?: boolean};
// Включённые способы оплаты: usdt — касса NOWPayments; AnyPay — sbp и card (рубли), card_uah,
// card_uzs, card_kgs (карта в гривнах, сумах, сомах)
export type PayMethods = {usdt: boolean; sbp?: boolean; card?: boolean; card_uah?: boolean; card_uzs?: boolean; card_kgs?: boolean};
export type PayMethod = keyof PayMethods;
// Оплата тарифа через кассу. status — общий для всех касс (cores/PAYMENTS.md): created — счёт выставлен, waiting,
// confirming, paid, partial, failed, expired, refunded, abandoned; credited — кредиты начислены
export type Payment = {
  id: string; status: string; credited: boolean; packId: string; title: string; credits: number | null;
  priceKrw: number; amount: number; currency: string; payCurrency: string | null; sandbox: boolean;
  createdAt: string; creditedAt: string | null;
};
// Условия для витрины гостя: без входа (GET /api/public/offer)
// Продавец для оферты и политики (config/platform.json → legal). Пустое поле — ещё не заполнено
export type Legal = {seller?: string; regNo?: string; country?: string; address?: string; law?: string; site?: string};
export type PublicOffer = Offer & {signup: {credits: number; days: number}; costs: Record<string, number>; legal?: Legal; preview?: string | null};
export type LedgerRow = {
  id: number; delta: number; kind: 'grant' | 'charge' | 'refund' | 'adjust'; pipeline: string | null;
  job_id: string | null; note: string; created_at: string;
  expires_at: string | null; source: CreditLot['source'] | null; price_krw: number | null;
};
// Страница истории кредитов в кабинете
export type LedgerPage = {rows: LedgerRow[]; total: number; page: number; pages: number; pageSize: number};
export type ClientRow = {
  id: string; name: string; created_at: string; person: string | null; email: string | null; phone: string | null;
  platform_role: Role; credits: number; paid_krw: number; generations: number; last_generation: string | null;
  plan_title: string | null; plan_until: string | null;
  // Активность: когда заходил (null — не заходил с 11.10, когда завели отметку), генераций за 30 дней
  last_seen_at: string | null; generations_30d: number; verified: boolean; had_plan: boolean;
  // Клиент поставил аккаунт на удаление: окончательно — в эту дату (null — живой)
  delete_after: string | null;
};
// Быстрые фильтры и сортировки админки — те же имена, что CLIENT_FILTERS/CLIENT_SORTS в server/accounts.mjs
export type ClientFilter = 'all' | 'new' | 'trial' | 'active' | 'renew' | 'lapsed' | 'idle' | 'unverified';
export type ClientSort = 'new' | 'seen' | 'generated' | 'paid' | 'credits' | 'plan';
export type ClientQuery = {q: string; filter: ClientFilter; sort: ClientSort; page: number};
export type ClientList = {
  rows: ClientRow[]; total: number; page: number; pages: number; pageSize: number;
  counts: Record<ClientFilter, number>; renew: ClientRow[];
};
// Курс ₩ за $1 на сегодня: сервер берёт его раз в сутки. stale — источник не ответил, курс старше суток
export type UsdKrw = {krwPerUsd: number; fetchedAt: string; source: string; stale: boolean};
// Все курсы: единиц валюты за $1 (KRW, RUB, KZT…)
export type Rates = {usdRates: Record<string, number>; fetchedAt: string; source: string; stale: boolean};
export type StaffRow = {id: string; email: string; name: string | null; platform_role: Exclude<Role, null>};
export type Registration = {name: string; email: string; phone: string; password: string; company: string};
// Профиль в кабинете: человек и кабинет. pendingEmail — новая почта ждёт кода из письма
export type Account = {
  name: string; email: string; phone: string; emailVerified: boolean; createdAt: string;
  company: string; canEditCompany: boolean; pendingEmail: string | null;
};
// Вход на устройстве: device — «Chrome · Mac», current — тот, с которого смотрят
export type SessionRow = {id: string; device: string; ip: string; createdAt: string; seenAt: string; current: boolean};

/** Ответ сервера с ошибкой: текст уже для человека, сторону сервера записал его журнал (app/errorReport.ts её не шлёт) */
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

// Ответ без нашего JSON: сервер не дошёл до своего обработчика. Так отвечает прокси Coolify, пока
// контейнер перезапускается после выкладки (502/503), или когда долгая сборка не уложилась в его
// ожидание (504). Раньше человек видел «502 Bad Gateway» или голое «504» — и не понимал, что делать
const PROXY_TEXT: Record<number, string> = {
  413: 'Файл слишком большой для загрузки',
  502: 'Сервер перезапускается — подождите минуту и попробуйте ещё раз',
  503: 'Сервер перезапускается — подождите минуту и попробуйте ещё раз',
  504: 'Сервер не дождался ответа — попробуйте ещё раз. Если повторится — напишите в поддержку',
};
const failure = (status: number, body: {error?: string} | null, fallback?: string) => new ApiError(
  body?.error || fallback || PROXY_TEXT[status] || `Сервер ответил ошибкой (${status}) — попробуйте ещё раз`, status);

// Запрос не ушёл вовсе: нет интернета или сервер недоступен. fetch бросает TypeError с текстом
// браузера («Failed to fetch», в Safari «Load failed») — его человеку не показываем
export const OFFLINE = 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз';
const send = (url: string, init?: RequestInit) => fetch(url, init).catch(() => { throw new ApiError(OFFLINE, 0); });

/**
 * Текст ошибки для экрана. ApiError уже написан для человека. Всё прочее — поломка самого
 * интерфейса (TypeError из кода): её текст английский и ничего не скажет клиенту, поэтому
 * показываем общую фразу, а саму ошибку отправляем нам (errorReport → тревога в «Сбои»)
 */
export const errorText = (e: unknown): string => {
  if (e instanceof ApiError) return e.message;
  void import('./errorReport').then((m) => m.reportError('error', e));
  return 'Что-то пошло не так на странице — обновите её и попробуйте ещё раз. Мы уже получили отчёт о сбое';
};

const request = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
  const isForm = body instanceof FormData;
  const res = await send(url, {
    method,
    headers: body !== undefined && !isForm ? {'Content-Type': 'application/json'} : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  // Сессия кончилась или вход сброшен на другом устройстве — перезагрузка покажет экран входа
  if (res.status === 401 && !url.startsWith('/api/auth/')) window.location.reload();
  if (!res.ok) throw failure(res.status, data);
  // 200 и не JSON — не наш ответ (так отвечает зависший прокси или страница-заглушка): пустые
  // данные уронили бы экран дальше по коду. Пустой JSON-ответ (обработчик ничего не вернул) — норма
  if (data === null && !res.headers.get('content-type')?.includes('json')) throw new ApiError('Сервер ответил непонятно — обновите страницу и попробуйте ещё раз', res.status);
  return (data ?? {}) as T;
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
  restore: (token: string) => request<{ok: true}>('POST', '/api/auth/restore', {token}),
  ledger: (page = 1) => request<LedgerPage>('GET', `/api/account/ledger?page=${page}`),
  offer: () => request<Offer>('GET', '/api/account/offer'),
  pay: {
    checkout: (packId: string, method: PayMethod = 'usdt') => request<{id: string; url: string}>('POST', '/api/payments/checkout', {packId, method}),
    list: () => request<Payment[]>('GET', '/api/account/payments'),
    get: (id: string) => request<Payment>('GET', `/api/account/payments/${encodeURIComponent(id)}`),
  },
  account: {
    // Ссылка на бота поддержки с одноразовым ключом привязки кабинета; null — поддержка выключена
    supportLink: () => request<{url: string | null}>('POST', '/api/account/support-link'),
    profile: () => request<Account>('GET', '/api/account/profile'),
    save: (data: {name: string; company?: string}) => request<Account>('PUT', '/api/account/profile', data),
    changePassword: (current: string, password: string) =>
      request<{ok: true; closed: number}>('POST', '/api/account/password', {current, password}),
    changeEmail: (email: string, password: string) =>
      request<{sent: boolean; pendingEmail: string}>('POST', '/api/account/email', {email, password}),
    confirmEmail: (code: string) => request<{ok: true; email: string}>('POST', '/api/account/email/confirm', {code}),
    cancelEmail: () => request<{ok: true}>('DELETE', '/api/account/email'),
    sessions: () => request<SessionRow[]>('GET', '/api/account/sessions'),
    closeSession: (id: string) => request<SessionRow[]>('DELETE', `/api/account/sessions/${id}`),
    closeOthers: () => request<SessionRow[]>('POST', '/api/account/sessions/close-others'),
    // Удалить аккаунт: пароль и название компании руками. Окончательно — через 14 дней
    remove: (password: string, confirm: string) => request<{ok: true; until: string}>('POST', '/api/account/delete', {password, confirm}),
  },
  publicOffer: () => request<PublicOffer>('GET', '/api/public/offer'),
  admin: {
    clients: (query: ClientQuery) =>
      request<ClientList>('GET', `/api/admin/clients?${new URLSearchParams({...query, page: String(query.page)})}`),
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
  rates: () => request<Rates>('GET', '/api/rates'),
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
    const res = await send('/api/brand/logo', {method: 'POST', body: form});
    const body = await res.json().catch(() => null);
    if (!res.ok) throw failure(res.status, body, res.status < 500 ? 'Не удалось загрузить логотип' : undefined);
    return body as {url: string; width: number; height: number; bytes: number; brand: Theme;
      notes: string[]; warnings: string[]; hasRaw: boolean};
  },
  // clean — фон убран, raw — как загружен, none — без логотипа, название компании текстом
  logoVariant: (variant: 'clean' | 'raw' | 'none') =>
    request<{url: string; brand: Theme}>('PUT', '/api/brand/logo/variant', {variant}),
  // Своя иконка преимущества в CTA — та же обработка, что у логотипа
  uploadIcon: async (file: File) => {
    const form = new FormData();
    form.append('icon', file);
    const res = await send('/api/brand/icon', {method: 'POST', body: form});
    const body = await res.json().catch(() => null);
    if (!res.ok) throw failure(res.status, body, res.status < 500 ? 'Не удалось загрузить иконку' : undefined);
    return body as {url: string; width: number; height: number; bytes: number; brand: Theme;
      notes: string[]; warnings: string[]; hasRaw: boolean};
  },
  // clean — фон убран, raw — как загружена, default — встроенное рукопожатие
  iconVariant: (variant: 'clean' | 'raw' | 'default') =>
    request<{url: string; brand: Theme}>('PUT', '/api/brand/icon/variant', {variant}),
  // Карусели: ссылка Encar → слайды формата; seed — зерно варианта (нет — случайное)
  buildCarousel: (link: string, format?: string, seed?: number, family?: string | null) =>
    request<CarouselEntry>('POST', '/api/carousels', {link, format, seed, family: family ?? null}),
  carousels: () => request<CarouselEntry[]>('GET', '/api/carousels'),
  // Пересобрать со своей ценой — бесплатно: машина, формат и вариант прежние; null — вернуть расчёт
  repriceCarousel: (id: string, price: number | null) => request<CarouselEntry>('POST', `/api/carousels/${id}/price`, {price}),
  editCarouselTexts: (id: string, slide: string, fields: Record<string, string>) =>
    request<CarouselEntry>('POST', `/api/carousels/${id}/texts`, {slide, fields}),
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
    const res = await send('/api/voices/preview', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({speaker, language, text})});
    if (!res.ok) throw failure(res.status, await res.json().catch(() => null), res.status < 500 ? 'Не удалось озвучить' : undefined);
    return URL.createObjectURL(await res.blob());
  },
  // Загрузка видео с прогрессом (fetch его не умеет)
  uploadVideo: (id: string, file: File, onProgress: (share: number) => void) => new Promise<ReviewEntry>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/reviews/${id}/source`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data: {error?: string} | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* не JSON — ответ прокси */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as ReviewEntry);
      else reject(failure(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError('Загрузка прервалась — проверьте интернет и загрузите видео ещё раз', 0));
    const form = new FormData();
    form.append('video', file);
    xhr.send(form);
  }),
  job: (id: string) => request<Job>('GET', `/api/renders/${id}`),
};
