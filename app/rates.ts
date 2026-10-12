// Курсы валют на сегодня (сервер берёт их раз в сутки, server/rates.mjs): один запрос на
// страницу, общий для шапки, формы объявления и превью.
import {useEffect, useMemo, useState} from 'react';
import {krwPerUnit} from '../src/shared/currencies';
import type {Market} from '../src/shared/types';
import {api, Rates} from './api';

// Промис общий на всю страницу: шапка, форма и превью не шлют каждый свой запрос.
// Ошибка — null: без курсов экраны показывают заглушку цены, а не падают
let today: Promise<Rates | null> | null = null;

/** Курсы на сегодня (единиц за $1); до ответа сервера — null */
export const useRates = () => {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    today ??= api.rates().catch(() => null);
    today.then(setRates);
  }, []);
  return rates;
};

/**
 * Рынок с курсом валюты компании на сегодня — как его собирает сервер для рендера
 * (renderMarket): превью и карточки обязаны считать цену так же, как готовый ролик
 */
export const useTodayMarket = <M extends Market>(market: M): M => {
  const rates = useRates();
  return useMemo(() => {
    // Как renderMarket: курс дня и для долларов — им считает цену слайд карусели
    // ₩ за $1 — для долларовой цены машин из Китая (как в renderMarket)
    const usd = krwPerUnit('USD', rates?.usdRates) ?? undefined;
    if (market.currency === 'KRW') return usd ? {...market, krwPerUsdToday: usd} : market;
    const per = krwPerUnit(market.currency ?? 'USD', rates?.usdRates);
    return per ? {...market, krwPerUnitToday: per, krwPerUsdToday: usd} : {...market, krwPerUsdToday: usd};
  }, [market, rates]);
};
