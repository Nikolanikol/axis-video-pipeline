// Лот по машине из Encar: поля формы и фото в порядке, удобном для ролика.
//
// Слова переводим теми же словарями, что и карусель (src/carousel/i18n), на языке профиля:
// у одной машины в карусели и в ролике должно быть одно и то же «Автомат», а не два
// разных перевода. Язык, которого словарь не знает, получает английский — как и карусель.
import {carouselLang, carouselText} from '../carousel/i18n';
import type {CarouselCar, Lot} from './types';

// Строка характеристики длиннее этого упрётся в безопасную зону кадра (как SPEC_MAX в форме)
export const SPEC_MAX = 26;

export type CarFields = Pick<Lot, 'brand' | 'model' | 'trim' | 'year' | 'specs' | 'carPriceKrw'>;

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
  };
};

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
 * Лот ещё не заполнен — данные из Encar можно вписать, не спрашивая. Заполнен хоть чем-то
 * (марка, модель, характеристики, цена) — интерфейс сначала спросит: правки человека
 * молча не перетираем. Год не считаем: у нового лота он уже стоит текущий.
 */
export const lotIsBlank = (lot: Partial<Lot>): boolean =>
  !lot.brand?.trim() && !lot.model?.trim() && !lot.trim?.trim()
  && (lot.specs ?? []).every((s) => !s.trim())
  && !lot.carPriceKrw && !lot.carPriceUsd;
