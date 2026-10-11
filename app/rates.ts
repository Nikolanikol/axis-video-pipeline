// Курсы валют на сегодня (сервер берёт их раз в сутки, server/rates.mjs): один запрос на
// страницу, общий для шапки, формы объявления и превью.
import {useEffect, useMemo, useState} from 'react';
import {krwPerUnit} from '../src/shared/currencies';
import type {Market} from '../src/shared/types';
import {api, Rates} from './api';

let today: Promise<Rates | null> | null = null;

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
    if (market.currency === 'KRW') return market;
    const per = krwPerUnit(market.currency ?? 'USD', rates?.usdRates);
    return per ? {...market, krwPerUnitToday: per} : market;
  }, [market, rates]);
};
