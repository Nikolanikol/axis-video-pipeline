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

/** Телефон или планшет, где браузер умеет делиться файлами — там кнопка «В галерею» */
export const canSaveToGallery = (() => {
  try {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    return touch && typeof navigator.canShare === 'function'
      && navigator.canShare({files: [new File([''], 'x.png', {type: 'image/png'})]});
  } catch { return false; }
})();

/**
 * Скачать файлы в память заранее (только на телефоне — на компьютере архив). null — ещё
 * готовятся или не нужны. key — чтобы при смене карусели не отдать слайды прежней.
 */
export const usePreparedFiles = (key: string | null, urls: {url: string; name: string; type: string}[]) => {
  const [files, setFiles] = useState<File[] | null>(null);
  const list = JSON.stringify(urls);
  useEffect(() => {
    setFiles(null);
    if (!canSaveToGallery || !key || !urls.length) return;
    let alive = true;
    Promise.all(urls.map(async ({url, name, type}) => new File([await (await fetch(url)).blob()], name, {type})))
      .then((f) => { if (alive) setFiles(f); })
      .catch(() => { if (alive) setFiles(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, list]);
  return files;
};

/** Открыть «Поделиться» с готовыми файлами. Отмена в окне — не ошибка */
export const shareFiles = async (files: File[]) => {
  try { await navigator.share({files}); } catch (e) {
    if ((e as Error)?.name !== 'AbortError') throw e;
  }
};
