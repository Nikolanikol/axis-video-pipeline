// Цена на слайде карусели — в валюте компании (владелец 11.10). Раньше слайд показывал
// доллары по курсу шлюза kmotors и воны мелкой строкой; теперь — валюта из профиля по нашим
// курсам дня (тот же источник, что у роликов), вон на слайде нет. Своя цена клиента
// («Цена на слайде», carousel.json → priceOverride) перебивает расчёт — так он закладывает маржу.
// Без доставки: на слайде «Цена в Корее», доставку и растаможку оговаривают строки под ценой.
import type {CarouselCar, Market} from '../shared/types';

/** Число для слайда в валюте market.currency; null — цены нет (прочерк) */
export const carouselPrice = (car: CarouselCar, market: Pick<Market, 'currency' | 'krwPerUnitToday'>, priceOverride?: number | null): number | null => {
  if (priceOverride) return priceOverride;
  const krw = car.price?.krw ?? null;
  if (!krw) return null;
  const currency = market.currency || 'USD';
  if (currency === 'KRW') return krw;
  if (market.krwPerUnitToday) return Math.round(krw / market.krwPerUnitToday);
  // Курсов нет (источник ни разу не ответил) — для долларов есть курс шлюза, для прочих
  // честный прочерк, а не доллары под чужим значком
  return currency === 'USD' ? car.price?.usd ?? null : null;
};
