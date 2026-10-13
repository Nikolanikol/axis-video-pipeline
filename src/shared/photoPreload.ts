// Заранее загруженные фото для превью в браузере (плеер Remotion).
//
// Сцена ролика начинает качать своё фото только когда до неё доходит воспроизведение, а
// плеер, в отличие от рендера, не ждёт: пока фото не пришло, сцена стояла тёмным фоном —
// на телефоне по мобильной сети это были секунды «чёрных заглушек» (владелец 13.10).
// Теперь превью сразу при открытии качает все фото объявления и их размытые фоны:
// <Img> Remotion сам берёт заранее загруженную копию (prefetch → usePreload), а пропорции
// фото (usePhotoRatio в ui.tsx) запоминаются здесь, чтобы сцена знала раскладку с первого кадра.
//
// На сервере (рендер) сюда никто не обращается: preloadPhotos зовёт только app/Preview.tsx,
// и knownRatio / preloadedSrc отдают исходный адрес — рендер работает как раньше.
import {prefetch} from 'remotion';

const blobs = new Map<string, string>();
const ratios = new Map<string, number>();

/** Пропорция фото, если она уже известна (фото загружено заранее), иначе null */
export const knownRatio = (url: string) => ratios.get(url) ?? null;
/** Адрес для загрузки: заранее скачанная копия в памяти или исходный адрес */
export const preloadedSrc = (url: string) => blobs.get(url) ?? url;
export const rememberRatio = (url: string, ratio: number) => { ratios.set(url, ratio); };

/**
 * Скачать фото заранее. Возвращает уборку: освобождает копии в памяти (смена объявления,
 * уход с экрана). Ошибка загрузки одного фото не страшна — сцена догрузит его сама, как раньше.
 */
export const preloadPhotos = (urls: string[]) => {
  const handles = urls.map((url) => {
    const handle = prefetch(url, {method: 'blob-url'});
    handle.waitUntilDone().then((blob) => {
      blobs.set(url, blob);
      const img = new Image();
      img.onload = () => rememberRatio(url, img.naturalWidth / img.naturalHeight);
      img.src = blob;
    }).catch(() => {});
    return {url, handle};
  });
  return () => {
    for (const {url, handle} of handles) {
      blobs.delete(url);
      handle.free();
    }
  };
};
