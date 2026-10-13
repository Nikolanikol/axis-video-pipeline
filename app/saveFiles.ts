// Сохранить картинки или ролик на телефон — в галерею, а не в «Файлы».
//
// Сайт не может сам положить файлы в фотопленку: браузеры этого не дают. Рабочий путь один —
// системное «Поделиться» сразу со всеми файлами: на iPhone там «Сохранить изображения»
// (одно нажатие — всё в «Фото»), там же Instagram и TikTok. Раньше «Скачать все» на телефоне
// складывало 7 PNG в «Файлы», и их приходилось искать (владелец 30.09).
//
// Файлы готовим ЗАРАНЕЕ, до нажатия. Safari разрешает «Поделиться» только сразу после
// нажатия: если между нажатием и вызовом успеть скачать слайды, он отказывает (NotAllowedError).
import {useEffect, useState} from 'react';
import {ApiError} from './api';

/** Телефон или планшет, где браузер умеет делиться файлами — там кнопка «В галерею» */
export const canSaveToGallery = (() => {
  try {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    return touch && typeof navigator.canShare === 'function'
      && navigator.canShare({files: [new File([''], 'x.png', {type: 'image/png'})]});
  } catch { return false; }
})();

/**
 * Какой телефон: сохранение ролика в галерею устроено по-разному (владелец 13.10).
 * iPhone: ссылка на mp4 кладёт ролик в «Файлы», в «Фото» его нет — путь только через
 * «Поделиться» → «Сохранить видео». Android: обычное скачивание кладёт ролик в «Загрузки», и
 * галерея (Google Фото, Samsung) сама показывает папку Download; а в «Поделиться» пункта
 * «Сохранить» обычно нет — там приложения. iPad с iPadOS 13+ называет себя Mac — узнаём по касанию.
 */
export const phoneKind: 'ios' | 'android' | null = (() => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
})();

// Скачать файл в память, сообщая, сколько байт пришло: ролик весит 6–7 МБ, и без процента
// кнопка «Готовлю видео…» пару секунд выглядела зависшей (владелец 13.10)
const fetchFile = async ({url, name, type}: {url: string; name: string; type: string}, onBytes: (loaded: number, total: number) => void) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body || !total) return new File([await res.blob()], name, {type});
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded, total);
  }
  return new File(chunks as BlobPart[], name, {type});
};

/**
 * Скачать файлы в память заранее (только на телефоне — на компьютере архив). files: null — ещё
 * готовятся или не нужны; progress — 0…100 или null, если сервер не сказал размер.
 * key — чтобы при смене карусели не отдать слайды прежней.
 */
export const usePreparedFilesProgress = (key: string | null, urls: {url: string; name: string; type: string}[]) => {
  const [files, setFiles] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const list = JSON.stringify(urls);
  useEffect(() => {
    setFiles(null);
    setProgress(null);
    if (!canSaveToGallery || !key || !urls.length) return;
    let alive = true;
    const bytes = urls.map(() => ({loaded: 0, total: 0}));
    const report = () => {
      const total = bytes.reduce((a, b) => a + b.total, 0);
      // Пока не все файлы назвали размер — процент врал бы, показываем без него
      if (alive && total && bytes.every((b) => b.total)) setProgress(Math.min(99, Math.floor(bytes.reduce((a, b) => a + b.loaded, 0) / total * 100)));
    };
    Promise.all(urls.map((u, i) => fetchFile(u, (loaded, total) => { bytes[i] = {loaded, total}; report(); })))
      .then((f) => { if (alive) { setFiles(f); setProgress(100); } })
      .catch(() => { if (alive) { setFiles(null); setProgress(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, list]);
  return {files, progress};
};
export const usePreparedFiles = (key: string | null, urls: {url: string; name: string; type: string}[]) => usePreparedFilesProgress(key, urls).files;

/** Открыть «Поделиться» с готовыми файлами. Отмена в окне — не ошибка */
export const shareFiles = async (files: File[]) => {
  try { await navigator.share({files}); } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    // Отказ браузера (NotAllowedError — меню открыли не сразу после нажатия, файлы не те) — не
    // поломка кода: текстом для человека, без отчёта в «Сбои» (ApiError errorText не отправляет)
    throw new ApiError('Телефон не открыл «Поделиться» — нажмите кнопку ещё раз или скачайте файлы', 0);
  }
};

// ——— Компьютер: все файлы в выбранную папку, картинками, без архива ———
// File System Access API: браузер один раз спрашивает папку и даёт писать в неё. Есть в
// Chrome и Edge; в Safari и Firefox нет — там остаётся ZIP (владелец 30.09 выбрал папку:
// архив приходится распаковывать, а серия отдельных загрузок в Chrome упирается в вопрос
// «Разрешить скачивать несколько файлов?» и иногда теряет часть).
type DirHandle = {
  name: string;
  getFileHandle: (name: string, opts: {create: boolean}) => Promise<{createWritable: () => Promise<{write: (b: Blob) => Promise<void>; close: () => Promise<void>}>}>;
};
// Своих типов у showDirectoryPicker в lib.dom нет (API есть не во всех браузерах) — описываем нужное
type PickerWindow = Window & {showDirectoryPicker?: (opts?: {id?: string; mode?: 'readwrite'; startIn?: string}) => Promise<DirHandle>};

// typeof window — проверка не должна падать там, где окна нет (тесты, серверная сборка)
export const canSaveToFolder = !canSaveToGallery && typeof window !== 'undefined'
  && typeof (window as PickerWindow).showDirectoryPicker === 'function';

/**
 * Спросить папку и записать в неё файлы. Папку спрашиваем ПЕРВЫМ делом: браузер показывает
 * выбор только сразу после нажатия, как и «Поделиться». id — браузер запоминает последнюю
 * папку, и в следующий раз предлагает её же. Возвращает имя папки или null, если отменили.
 */
export const saveToFolder = async (files: {url: string; name: string}[], onProgress: (done: number) => void): Promise<string | null> => {
  let dir: DirHandle;
  try {
    dir = await (window as PickerWindow).showDirectoryPicker!({id: 'kok-carousel', mode: 'readwrite', startIn: 'downloads'});
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return null;
    throw e;
  }
  for (const [i, {url, name}] of files.entries()) {
    const blob = await (await fetch(url)).blob();
    const out = await (await dir.getFileHandle(name, {create: true})).createWritable();
    await out.write(blob);
    await out.close();
    onProgress(i + 1);
  }
  return dir.name;
};

/**
 * Имя файла слайда — то же, что отдаёт сервер при скачивании (slideFileName в
 * server/carousel.mjs): марка-модель-номер-порядок. Порядок в имени обязателен: в папке их
 * до двенадцати подряд, и порядок должен читаться без открытия.
 */
export const slideName = (car: {brand?: string; model?: string; id?: string}, n: number) => {
  const name = [car.brand, car.model].filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'car';
  return `${name}-${car.id ?? '0'}-${n}.png`;
};
