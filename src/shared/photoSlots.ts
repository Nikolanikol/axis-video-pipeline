// Куда какое фото идёт в «Галерее»: хук, стопка из трёх, склейки галереи или никуда.
//
// Владелец 30.09 попросил управлять этим руками. По умолчанию у фото «авто» — место по
// порядку, как было: 1-е хук, 2–4-е стопка, остальные галерея. Выбранное руками главнее
// порядка, а «авто»-фото заполняют то, что осталось. Одна функция считает раскладку и для
// ролика, и для подписей в сетке фото — подпись под снимком не может разойтись с роликом.
import type {Lot} from './types';

export type Slot = NonNullable<Lot['slots']>[string];
export const SLOT_TITLES: Record<Slot, string> = {auto: 'Авто', hook: 'Хук', stack: 'Стопка', gallery: 'Галерея', skip: 'Не брать'};

// Стопка — три фото: 3 × 607 px почти ровно высота кадра 1920 (см. GalleryAd)
export const STACK_SIZE = 3;

/**
 * Ключ фото для выбора места — имя файла без версии и расширения («1790693688538-lweh»).
 * Не сам адрес: размытие номера выпускает новую версию файла (…~2.jpg), и выбор по адресу
 * терялся бы после каждого размытия. Так же ключами-«стволами» хранится lot.blur.
 */
export const photoKey = (url: string) => url.split('?')[0].split('/').pop()!.replace(/(~\d+)?\.[a-z]+$/i, '');

export type Layout = {
  hook: string | null;
  stack: string[];
  // Ровно `cuts` кадров (по кругу, если своих меньше) — или пусто, если фото нет совсем
  gallery: string[];
  // Место каждого фото в ролике — для подписи в сетке; null — в ролик не попадает
  placed: Record<string, 'hook' | 'stack' | 'gallery' | null>;
};

/**
 * Раскладка фото по местам «Галереи». cuts — сколько склеек в галерее (GALLERY_CUTS),
 * подписи в форме лота обязаны передавать то же число: при 8 против 5 они врали (30.09).
 */
export const photoLayout = (photos: string[], slots: Lot['slots'] = {}, cuts = 8): Layout => {
  const slot = (p: string): Slot => slots?.[photoKey(p)] ?? 'auto';
  const usable = photos.filter((p) => slot(p) !== 'skip');
  const auto = usable.filter((p) => slot(p) === 'auto');
  const take = (p: string) => { const i = auto.indexOf(p); if (i >= 0) auto.splice(i, 1); };

  // Хук — первое отмеченное «Хук», иначе первое «авто». Лишние «Хук» идут в галерею:
  // хук в ролике один, а выкидывать отмеченное фото молча было бы странно
  const hooks = usable.filter((p) => slot(p) === 'hook');
  const hook = hooks[0] ?? auto[0] ?? null;
  if (hook) take(hook);

  const stack = usable.filter((p) => slot(p) === 'stack').slice(0, STACK_SIZE);
  while (stack.length < STACK_SIZE && auto.length) { stack.push(auto[0]); take(auto[0]); }

  const own = [...hooks.slice(1), ...usable.filter((p) => slot(p) === 'gallery'), ...auto];
  // Своих меньше четырёх — добавляем стопку: восемь склеек из одного-двух снимков мелькают
  // одним и тем же (так было у лота из пяти фото, раскадровка 30.09). Нет ничего — хук
  const pool = own.length >= 4 ? own : [...own, ...stack].length ? [...own, ...stack] : hook ? [hook] : [];
  const gallery = pool.length ? Array.from({length: cuts}, (_, i) => pool[i % pool.length]) : [];

  const placed: Layout['placed'] = Object.fromEntries(photos.map((p) => [p, null]));
  for (const p of new Set(gallery)) placed[p] = 'gallery';
  for (const p of stack) placed[p] = 'stack';
  if (hook) placed[hook] = 'hook';
  return {hook, stack, gallery, placed};
};
