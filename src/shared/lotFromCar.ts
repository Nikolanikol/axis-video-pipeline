// Лот по машине из Encar: поля формы и фото в порядке, удобном для ролика.
//
// Слова переводим теми же словарями, что и карусель (src/carousel/i18n), на языке профиля:
// у одной машины в карусели и в ролике должно быть одно и то же «Автомат», а не два
// разных перевода. Язык, которого словарь не знает, получает английский — как и карусель.
import {carouselLang, carouselText} from '../carousel/i18n';
import type {CarouselCar, Lot} from './types';

// Строка характеристики длиннее этого упрётся в безопасную зону кадра (как SPEC_MAX в форме)
export const SPEC_MAX = 26;

// hookTagline — не поле лота: интерфейс кладёт его в lot.texts, если есть что сказать
export type CarFields = Pick<Lot, 'brand' | 'model' | 'trim' | 'year' | 'specs' | 'carPriceKrw' | 'history'> & {hookTagline: string};

// Подзаголовок хука длиннее — не влезает в строку под годом (кегль 64, заглавные)
export const TAGLINE_MAX = 28;
// Пробег, который сам по себе довод: меньше — пишем его в подзаголовок
const LOW_MILEAGE_KM = 50_000;

/**
 * Подзаголовок хука из данных машины — вместо общей фразы профиля («Из Кореи»), которую
 * никто не меняет. Только проверяемые плюсы и точными словами: Encar знает не о ДТП, а о
 * страховых случаях — поэтому «без страховых случаев», а не «без ДТП». Были случаи —
 * о них здесь молчим (подробно — сцена истории в «Цене сразу»). Нечего сказать — пусто,
 * и ролик берёт фразу из профиля.
 */
export const taglineFromCar = (car: CarouselCar, language?: string): string => {
  const ru = carouselLang(language) === 'ru';
  const facts: string[] = [];
  const h = car.history;
  if (h && h.accidentsTotal === 0) facts.push(ru ? 'Без страховых случаев' : 'No insurance claims');
  if (h && h.ownerChanges === 0) facts.push(ru ? 'Один владелец' : 'One owner');
  if (car.mileageKm !== null && car.mileageKm < LOW_MILEAGE_KM) {
    const k = Math.max(1, Math.round(car.mileageKm / 1000));
    facts.push(ru ? `Пробег ${k} тыс. км` : `Only ${k}k km`);
  }
  // Два факта, если вместе влезают; иначе первый — он и сильнее
  const two = facts.slice(0, 2).join(' · ');
  return two.length <= TAGLINE_MAX ? two : (facts[0] ?? '');
};

/** Поля лота из карточки. Пустые строки характеристик выбрасываем: «—» в ролике хуже пустоты */
export const lotFieldsFromCar = (car: CarouselCar, language?: string): CarFields => {
  const tx = carouselText(carouselLang(language));
  const engine = [car.displacementCc ? tx.liters(car.displacementCc) : '', car.fuel ? tx.value(car.fuel).toLowerCase() : '']
    .filter(Boolean).join(' · ');
  const drive = [car.transmission ? tx.value(car.transmission) : '', car.color ? tx.value(car.color).toLowerCase() : '']
    .filter(Boolean).join(' · ');
  const specs = [car.mileageKm !== null ? tx.km(car.mileageKm) : '', engine, drive]
    // Не влезла строка — оставляем без второй половины, а не обрезаем посреди слова
    .map((s) => (s.length > SPEC_MAX ? s.split(' · ')[0] : s))
    .filter(Boolean);
  return {
    brand: tx.value(car.brand),
    model: tx.value(car.model),
    // grade — комплектация («40 TFSI Premium»); trim у Encar — поколение («C7»), в ролике оно лишнее
    trim: car.grade || '',
    year: car.year ?? new Date().getFullYear(),
    specs: specs.length ? specs : ['', '', ''],
    carPriceKrw: car.price?.krw ?? null,
    history: car.history ? {
      accidentsTotal: car.history.accidentsTotal, accidentsOwn: car.history.accidentsOwn,
      accidentsOther: car.history.accidentsOther, ownerChanges: car.history.ownerChanges,
      theft: car.history.theft, flood: car.history.flood, totalLoss: car.history.totalLoss,
    } : null,
    hookTagline: taglineFromCar(car, language),
  };
};

// recommended — ракурс опознан шлюзом (перед, зад, салон, приборы): такие выбраны по умолчанию
export type CarPhoto = {url: string; label: string; recommended: boolean};

/**
 * Фото объявления по порядку: сначала ракурсы, которые шлюз опознал по кодам Encar
 * (перед, зад, салон, приборная панель) — они и есть «рекомендованные»: первые три фото
 * лота идут в сцены хука и характеристик. Дальше остальной экстерьер, салон и прочее.
 * Повторы убираем: hero обычно совпадает с первым фото экстерьера.
 */
export const carPhotos = (car: CarouselCar): CarPhoto[] => {
  const p = car.photos;
  const out: CarPhoto[] = [];
  const seen = new Set<string>();
  const add = (url: string | null, label: string, recommended: boolean) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({url, label, recommended});
  };
  add(p.hero, 'перед', true);
  add(p.rear, 'зад', true);
  add(p.interiorShot, 'салон', true);
  add(p.dashboard, 'приборы', true);
  p.exterior.forEach((u) => add(u, 'снаружи', false));
  p.interior.forEach((u) => add(u, 'салон', false));
  p.other.forEach((u) => add(u, 'детали', false));
  return out;
};

/**
 * Сколько фото брать, когда выбирает автоматика. Самому ёмкому формату («Галерея») нужно 9:
 * хук, три в стопку, пять в галерею. Больше не качаем — лишние секунды ожидания, а добавить
 * руками можно в «Изменить».
 */
export const AUTO_PHOTOS = 9;

/**
 * Фото, которые автоматика берёт в лот без вопросов (основной путь «вставил ссылку →
 * собрал»). Сначала рекомендованные ракурсы — перед, зад, салон, приборы: они и встают
 * в хук и стопку. Дальше вперемешку снаружи и салон: галерея из восьми фото салона подряд
 * скучнее, чем чередование.
 */
export const autoPickPhotos = (car: CarouselCar, count = AUTO_PHOTOS): string[] => {
  const all = carPhotos(car);
  const picked = all.filter((p) => p.recommended).map((p) => p.url);
  const rest = all.filter((p) => !p.recommended);
  const outside = rest.filter((p) => p.label === 'снаружи').map((p) => p.url);
  const inside = rest.filter((p) => p.label !== 'снаружи').map((p) => p.url);
  while (picked.length < count && (outside.length || inside.length)) {
    const next = (picked.length % 2 ? inside.shift() ?? outside.shift() : outside.shift() ?? inside.shift())!;
    picked.push(next);
  }
  return picked.slice(0, count);
};

/**
 * Лот ещё не заполнен — данные из Encar можно вписать, не спрашивая. Заполнен хоть чем-то
 * (марка, модель, характеристики, цена) — интерфейс сначала спросит: правки человека
 * молча не перетираем. Год не считаем: у нового лота он уже стоит текущий.
 */
export const lotIsBlank = (lot: Partial<Lot>): boolean =>
  !lot.brand?.trim() && !lot.model?.trim() && !lot.trim?.trim()
  && (lot.specs ?? []).every((s) => !s.trim())
  && !lot.carPriceKrw && !lot.carPriceUsd;
