// Блоки, общие для роликов: заголовок авто, цена до порта с оговоркой, контакты
import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {fmt, totalUsd} from './model';
import type {Ad} from './types';
import {BODY, CopperText, HEAD, Metal, PAD, clamp, useAsset, useTheme} from './ui';

export type CarTitleProps = {brand: string; model: string; year?: number | string; trim?: string; tagline?: string};

// Тайминги задаём в секундах и переводим в кадры по частоте композиции: в кадрах они
// зависели бы от частоты, а обзоры идут в 60, реклама в 30 — одни и те же блоки играли бы
// с разной скоростью. На 30 кадрах значения совпадают с прежними.
const atSec = (sec: number, fps: number) => Math.round(sec * fps);

// Символ валюты профиля: экспорт из Кореи считается в долларах, внутренний рынок может быть
// в евро/фунтах. Значение цены как есть — конвертация валют вне MVP, дилер вводит своё число;
// а вот символ обязан совпадать с валютой профиля, иначе «€ по цене $» выглядит обманом.
const CURRENCY_SYMBOL: Record<string, string> = {USD: '$', EUR: '€', GBP: '£', JPY: '¥', KRW: '₩'};
const currencySign = (code?: string) => CURRENCY_SYMBOL[code ?? 'USD'] ?? code ?? '$';

// Марка, модель, год, версия и подзаголовок — выезжают снизу
export const CarTitle: React.FC<CarTitleProps> = ({brand, model, year, trim, tagline}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const up = spring({frame: f - atSec(0.2, fps), fps, config: {damping: 200}});
  const bar = interpolate(f, [atSec(0.6, fps), atSec(1.4, fps)], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: PAD}}>
      <div style={{transform: `translateY(${(1 - up) * 80}px)`, opacity: up}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 600, fontSize: 46, letterSpacing: 14, textTransform: 'uppercase'}}>
          {brand}
        </CopperText>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: Math.min(210, Math.floor(1700 / Math.max(1, model.length))),
          lineHeight: 1, color: C.white, textTransform: 'uppercase', marginTop: 6}}>
          {model}
        </div>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 30}}>
          <CopperText style={{fontFamily: HEAD, fontWeight: 700, fontSize: 120, lineHeight: 1.1}}>{year}</CopperText>
          {trim && (
            <div style={{fontFamily: HEAD, fontWeight: 500, fontSize: 64, color: C.grey, textTransform: 'uppercase'}}>{trim}</div>
          )}
        </div>
      </div>
      <Metal style={{height: 8, width: `${bar * 100}%`, marginTop: 40}} />
      <div style={{fontFamily: HEAD, fontWeight: 500, fontSize: 64, color: C.white, marginTop: 28, opacity: bar,
        textTransform: 'uppercase', letterSpacing: 2}}>
        {tagline}
      </div>
    </AbsoluteFill>
  );
};

// Цена до порта (счётчик) и оговорка. delay — кадр появления внутри сцены.
// delay — во сколько кадров композиции появляется цена (по умолчанию через 1,5 с)
export const PriceTag: React.FC<{ad: Ad; delay?: number; padding?: string}> = ({ad, delay, padding = PAD}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const from = delay ?? atSec(1.5, fps);
  const total = totalUsd(ad);
  const count = interpolate(f, [from, from + atSec(1.33, fps)], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const num = total === null ? null : count >= 1 ? total : Math.round((total * count) / 10) * 10;
  const sign = currencySign(ad.currency);
  const label = num === null ? `XX XXX ${sign}` : `${fmt(num)} ${sign}`;
  const priceIn = spring({frame: f - from, fps, config: {damping: 14, mass: 0.6}});
  const note = interpolate(f, [from + atSec(1.17, fps), from + atSec(1.67, fps)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', padding}}>
      <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 40, color: C.grey, textTransform: 'uppercase', letterSpacing: 6}}>
        {(ad.texts.priceLabel ?? '').replace('{port}', ad.port)}
      </div>
      <div style={{transform: `scale(${0.85 + 0.15 * priceIn})`, transformOrigin: 'left center', opacity: Math.min(1, priceIn * 1.5)}}>
        <CopperText style={{fontFamily: HEAD, fontWeight: 700, fontSize: label.length > 8 ? 190 : 230, lineHeight: 1.1,
          display: 'inline-block', whiteSpace: 'nowrap'}}>
          {label}
        </CopperText>
      </div>
      <Metal style={{height: 4, width: 200, marginTop: 10, opacity: note}} />
      <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 40, color: C.white, marginTop: 30, lineHeight: 1.4, opacity: note}}>
        {ad.texts.priceNoteIncluded}<br />
        <span style={{color: C.grey}}>{ad.texts.priceNoteExcluded}</span>
      </div>
    </AbsoluteFill>
  );
};

// WhatsApp на медной плашке и сайт
export const Contacts: React.FC<{whatsapp?: string | null; whatsappLabel?: string; site: string}> = ({whatsapp, whatsappLabel, site}) => {
  const C = useTheme();
  const row: React.CSSProperties = {display: 'flex', alignItems: 'center', gap: 30};
  return (
    <>
    {whatsapp && (
      <Metal style={{...row, padding: '24px 36px', marginBottom: 30}}>
        <Img src={useAsset('iconPhone')} style={{width: 76, filter: 'brightness(0.25) saturate(0)'}} />
        <div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, color: C.bg, opacity: 0.75}}>{whatsappLabel}</div>
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 64, color: C.bg, lineHeight: 1.1, whiteSpace: 'nowrap'}}>{whatsapp}</div>
        </div>
      </Metal>
    )}
    <div style={{fontFamily: HEAD, fontWeight: 500, fontSize: 60, color: C.white, letterSpacing: 4}}>{site}</div>
    </>
  );
};
