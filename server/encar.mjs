// Лот по ссылке Encar: карточка машины от шлюза kmotors (тот же, что у каруселей) и фото,
// скачанные к нам в лот.
//
// Фото копируем, а не ссылаемся на Encar: объявление снимут — ролик перестанет собираться;
// а ещё у своих копий работают размытие номера и порядок сцен, как у загруженных руками.
import {fetchCar} from './carousel.mjs';
import {HttpError} from './store.mjs';
import {parseCarLink} from '../src/shared/encarLink.js';

// Только картинки Encar. Адрес приходит из браузера, и без этой проверки через кнопку
// «добавить фото» можно было бы заставить сервер сходить куда угодно — в том числе
// на внутренние адреса машины
const PHOTO_URL_RE = /^https:\/\/ci\.encar\.com\/[^\s]+$/;
// Сколько фото за раз: в объявлении Encar их обычно 20–25, в ролике нужно 3–8
export const MAX_IMPORT = 25;
// Оригинал Encar — 0,4–1,3 МБ; 15 МБ — с запасом, но не даст забить память, если адрес
// вдруг отдаст что-то огромное
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 20_000;

/** Карточка машины по ссылке. Ошибку разбора ссылки отдаём как 400 — её текст для человека */
export const lookupCar = async (link) => {
  let id;
  try { ({id} = parseCarLink(link)); } catch (e) { throw new HttpError(400, e.message); }
  return fetchCar(id);
};

/** Проверить список адресов фото: только Encar, без повторов, не больше MAX_IMPORT */
export const checkPhotoUrls = (urls) => {
  if (!Array.isArray(urls) || !urls.length) throw new HttpError(400, 'Выберите хотя бы одно фото');
  const list = [...new Set(urls.map(String))];
  if (list.length > MAX_IMPORT) throw new HttpError(400, `За раз — не больше ${MAX_IMPORT} фото`);
  const bad = list.find((u) => !PHOTO_URL_RE.test(u));
  if (bad) throw new HttpError(400, 'Добавлять можно только фото из объявления Encar');
  return list;
};

/** Скачать одно фото. Бросает с текстом для интерфейса */
export const downloadPhoto = async (url) => {
  let res;
  try {
    res = await fetch(url, {signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS)});
  } catch (e) {
    throw new HttpError(502, `Encar не отдал фото: ${e?.name === 'TimeoutError' ? 'не ответил вовремя' : e?.message || e}`);
  }
  if (!res.ok) throw new HttpError(502, `Encar не отдал фото (${res.status}) — возможно, объявление изменили`);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > PHOTO_MAX_BYTES) throw new HttpError(413, 'Фото из объявления слишком большое');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > PHOTO_MAX_BYTES) throw new HttpError(413, 'Фото из объявления слишком большое');
  return buffer;
};
