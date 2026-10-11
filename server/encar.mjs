// Лот по ссылке Encar: карточка машины от шлюза kmotors (тот же, что у каруселей) и фото,
// скачанные к нам в лот.
//
// Фото копируем, а не ссылаемся на Encar: объявление снимут — ролик перестанет собираться;
// а ещё у своих копий работают размытие номера и порядок сцен, как у загруженных руками.
import {fetchCar} from './carousel.mjs';
import {fetchChe168Car} from './che168.mjs';
import {HttpError, renderMarket} from './store.mjs';
import {parseCarLink} from '../src/shared/encarLink.js';

// Только картинки Encar и che168 (CDN Autohome — *.autoimg.cn). Адрес приходит из браузера, и без
// этой проверки через кнопку «добавить фото» можно было бы заставить сервер сходить куда
// угодно — в том числе на внутренние адреса машины
const PHOTO_URL_RE = /^https:\/\/(ci\.encar\.com|[a-z0-9-]+\.autoimg\.cn)\/[^\s]+$/;
// Сколько фото за раз: в объявлении Encar их обычно 20–25, в ролике нужно 3–8
export const MAX_IMPORT = 25;
// Оригинал Encar — 0,4–1,3 МБ; 15 МБ — с запасом, но не даст забить память, если адрес
// вдруг отдаст что-то огромное
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 20_000;

/** Карточка машины по ссылке. Ошибку разбора ссылки отдаём как 400 — её текст для человека */
export const lookupCar = async (link) => {
  let parsed;
  try { parsed = parseCarLink(link); } catch (e) { throw new HttpError(400, e.message); }
  // Машина из Китая — через ядро che168; названия опций — на языке постов профиля
  if (parsed.source === 'che168') return fetchChe168Car(parsed.ref, (await renderMarket()).language);
  return fetchCar(parsed.id);
};

/** Проверить список адресов фото: только Encar, без повторов, не больше MAX_IMPORT */
export const checkPhotoUrls = (urls) => {
  if (!Array.isArray(urls) || !urls.length) throw new HttpError(400, 'Выберите хотя бы одно фото');
  const list = [...new Set(urls.map(String))];
  if (list.length > MAX_IMPORT) throw new HttpError(400, `За раз — не больше ${MAX_IMPORT} фото`);
  const bad = list.find((u) => !PHOTO_URL_RE.test(u));
  if (bad) throw new HttpError(400, 'Добавлять можно только фото из объявления Encar или che168');
  return list;
};

/** Скачать одно фото. Бросает с текстом для интерфейса */
export const downloadPhoto = async (url) => {
  let res;
  try {
    res = await fetch(url, {signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS)});
  } catch (e) {
    throw new HttpError(502, `Площадка не отдала фото: ${e?.name === 'TimeoutError' ? 'не ответила вовремя' : e?.message || e}`);
  }
  if (!res.ok) throw new HttpError(502, `Площадка не отдала фото (${res.status}) — возможно, объявление изменили`);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > PHOTO_MAX_BYTES) throw new HttpError(413, 'Фото из объявления слишком большое');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > PHOTO_MAX_BYTES) throw new HttpError(413, 'Фото из объявления слишком большое');
  return buffer;
};
