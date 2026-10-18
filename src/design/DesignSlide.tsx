// Одна библиотека компоновок для неподвижных слайдов и сцен ролика.
// Размер и безопасные поля считаются от композиции, поэтому формат не задаёт дизайн.
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {DesignId} from '../shared/types';
import {BODY, HEAD, Logo, clamp, useTheme} from '../shared/ui';

export type DesignFact = {label?: string; value: string};
export type DesignContent = {
  kind: 'cover' | 'facts' | 'gallery' | 'price' | 'cta';
  // kicker — рубрика мелко над заголовком, когда заголовок — фраза, а не название раздела
  title: string; kicker?: string; eyebrow?: string; subtitle?: string; photo?: string | null; photos?: string[];
  previousPhotos?: string[]; photoProgress?: number; collage?: boolean;
  facts?: DesignFact[]; lines?: string[]; price?: string; priceLabel?: string;
  contact?: {label: string; value: string; secondary?: string};
};

const asset = (url: string) => /^(https?:|data:|blob:|\/)/.test(url) ? url : staticFile(url);
const fit = (text: string, width: number, max: number, min = 32) => Math.max(min, Math.min(max, width / (Math.max(1, text.length) * 0.59)));
const light = (hex: string) => parseInt(hex.slice(1, 3), 16) * .2126 + parseInt(hex.slice(3, 5), 16) * .7152 + parseInt(hex.slice(5, 7), 16) * .0722 > 155;

export const DesignSlide: React.FC<{content: DesignContent; design: DesignId; index?: number; total?: number;
  animated?: boolean; variant?: number}> = ({content: c, design, index = 1, total = 1, animated = false, variant = 0}) => {
  const C = useTheme();
  const {width: w, height: h, fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const portrait = h / w > 1.6;
  const crop = !animated && portrait ? (h - w * 1.25) / 2 : 0;
  const left = 64;
  const right = animated ? 150 : 64;
  const top = animated ? 128 : crop + 64;
  const bottom = animated ? 340 : crop + 64;
  const areaW = w - left - right;
  const areaH = h - top - bottom;
  const compact = areaH < 1000;
  const direction = Math.abs(Math.trunc(variant)) % 2;
  const entrance = animated ? interpolate(frame, [0, Math.round(fps * .5)], [0, 1], clamp) : 1;
  const move: React.CSSProperties = animated ? {opacity: entrance, transform: design === 'catalog'
    ? `translateX(${(1 - entrance) * -32}px)` : `translateY(${(1 - entrance) * 24}px)`} : {};
  const safe: React.CSSProperties = {position: 'absolute', left, right, top, bottom};
  // Заголовок-фраза («Салон, в котором хочется ехать») идёт в две строки: подбор под одну строку
  // ужал бы его до 42 px. Название модели и рубрика — по-прежнему в одну
  const titleSize = fit(c.title, areaW * (c.kicker && c.kind !== 'cover' ? 1.9 : 1), c.kind === 'cover' ? (compact ? 122 : 160) : (compact ? 76 : 94), 36);
  const bodySize = compact ? 30 : 38;
  // Высота рубрики и заголовка: в «Редакционном» фото стоит под ними, и при заголовке-фразе в две
  // строки (или с рубрикой) прежний отступ 265/335 px давал наезд текста на фото (проба 19.10).
  // 0,55 — средняя ширина буквы заголовочных шрифтов пресетов в долях кегля
  const kickerH = c.kicker ? (compact ? 24 : 28) * 1.2 + (compact ? 12 : 18) : 0;
  const titleLines = Math.max(1, Math.ceil(c.title.length * titleSize * .55 / areaW));
  const headingH = kickerH + titleLines * titleSize * 1.06;
  // Без рубрики — прежние отступы, чтобы ролик и старые слайды не сдвинулись
  const below = (base: number) => c.kicker ? Math.max(base, 115 + headingH + (compact ? 30 : 45)) : base;
  const photos = (c.photos?.length ? c.photos : c.photo ? [c.photo] : []).filter(Boolean);
  const hasImageLogo = C.assets?.logoHorizontal !== '';
  const header = (
    <div style={{position: 'absolute', left, right, top, height: 70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22, zIndex: 3}}>
      <div style={{maxWidth: areaW * .57, overflow: 'hidden', ...(light(C.bg) && hasImageLogo
        ? {background: '#171719', padding: '12px 18px', borderRadius: 4} : {})}}>
        <Logo asset="logoHorizontal" height={46} width={Math.min(380, areaW * .48)} style={{textAlign: 'left', objectFit: 'contain', objectPosition: 'left'}} />
      </div>
      <div style={{fontFamily: BODY, fontSize: compact ? 23 : 27, color: C.grey, textAlign: 'right', maxWidth: areaW * .4, overflowWrap: 'anywhere'}}>{c.eyebrow}</div>
    </div>
  );
  const footer = (
    <div style={{position: 'absolute', bottom, left, right, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
      borderTop: `1px solid ${C.line}`, paddingTop: 22, fontFamily: BODY, fontSize: 23, color: C.grey, zIndex: 3}}>
      <span style={{maxWidth: areaW * .78, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'}}>{c.subtitle || C.name}</span>
      <span style={{whiteSpace: 'nowrap'}}>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    </div>
  );
  const heading = (size = titleSize, color = C.white) => <>
    {c.kicker && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: compact ? 24 : 28, letterSpacing: '.08em', textTransform: 'uppercase',
      color: C.copper, marginBottom: compact ? 12 : 18, overflowWrap: 'anywhere'}}>{c.kicker}</div>}
    <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: size, lineHeight: 1.06, color, overflowWrap: 'anywhere'}}>{c.title}</div>
  </>;
  const image = (style: React.CSSProperties, collage = false) => {
    const block = (list: string[], opacity = 1) => <div style={{position: 'absolute', inset: 0, opacity}}>
      {(collage || c.collage) && list.length > 1 ? <div style={{display: 'grid', gridTemplateColumns: direction ? '1fr 1fr' : '2fr 1fr',
        gridTemplateRows: list.length > 2 ? '1fr 1fr' : '1fr', height: '100%', gap: 12}}>
        {list.slice(0, 3).map((url, i) => <Img key={`${url}-${i}`} src={asset(url)} style={{width: '100%', height: '100%', minHeight: 0,
          gridRow: list.length > 2 && i === 0 ? 'span 2' : undefined, objectFit: 'cover', objectPosition: '50% 58%'}} />)}
      </div> : list[0] ? <Img src={asset(list[0])} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 58%',
        transform: animated && design === 'cinema' ? `scale(${interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1, 1.045], clamp)})` : undefined}} /> : null}
    </div>;
    return <div style={{position: 'absolute', overflow: 'hidden', background: C.panel, ...style}}>
      {c.previousPhotos?.length ? block(c.previousPhotos) : null}{block(photos, c.photoProgress ?? 1)}
    </div>;
  };
  const details = (availableWidth: number, dense = false) => (
    <div style={{...move, display: 'flex', flexDirection: 'column', gap: compact ? 14 : 24, minWidth: 0}}>
      {c.price && <div>
        <div style={{fontFamily: BODY, fontSize: compact ? 25 : 30, color: C.grey, marginBottom: 15}}>{c.priceLabel}</div>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fit(c.price, availableWidth, compact ? 118 : 162, 42), lineHeight: 1.05, color: C.copper, whiteSpace: 'nowrap'}}>{c.price}</div>
      </div>}
      {/* Под фразой — три опции, на квадрате две: с заголовком в две строки и текстом остальные уходили на подвал */}
      {(c.facts ?? []).slice(0, (dense ? 4 : 5) - (c.kicker && c.lines?.length ? (compact ? 2 : 1) : 0)).map((fact, i) => <div key={`${i}-${fact.value}`} style={{borderBottom: `1px solid ${C.line}`, paddingBottom: compact ? 14 : 22,
        ...(design === 'catalog' ? {display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24} : {})}}>
        {fact.label && <div style={{fontFamily: BODY, fontSize: compact ? 25 : 29, color: C.grey, marginBottom: design === 'catalog' ? 0 : 7}}>{fact.label}</div>}
        <div style={{fontFamily: design === 'editorial' ? HEAD : BODY, fontWeight: 500,
          fontSize: fit(fact.value, availableWidth * (design === 'catalog' && fact.label ? .57 : 1), dense ? 42 : 54, 28),
          lineHeight: 1.18, color: C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
      </div>)}
      {(c.lines ?? []).slice(0, dense ? 3 : 4).map((line, i) => <div key={i} style={{fontFamily: BODY, fontSize: dense ? bodySize - 3 : bodySize,
        lineHeight: 1.35, color: C.grey, overflowWrap: 'anywhere'}}>{line}</div>)}
      {c.contact && <div style={{marginTop: 15}}>
        <div style={{fontFamily: BODY, fontSize: compact ? 26 : 32, color: C.grey, marginBottom: 15}}>{c.contact.label}</div>
        <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: fit(c.contact.value, availableWidth - 40, compact ? 60 : 78, 26), lineHeight: 1.2,
          background: C.copper, color: C.bg, padding: '22px 20px', overflowWrap: 'anywhere'}}>{c.contact.value}</div>
        {c.contact.secondary && <div style={{fontFamily: BODY, fontSize: 28, color: C.grey, marginTop: 22, overflowWrap: 'anywhere'}}>{c.contact.secondary}</div>}
      </div>}
    </div>
  );
  const cover = c.kind === 'cover';
  const gallery = c.kind === 'gallery';
  return (
    <AbsoluteFill style={{background: C.bg, color: C.white}}>
      {design === 'cinema' ? <>
        {image({inset: 0}, gallery)}
        <AbsoluteFill style={{background: direction && cover
          ? `linear-gradient(to bottom, ${C.bg} 0%, ${C.bg}ee 34%, ${C.bg}22 66%, ${C.bg} 94%)`
          : `linear-gradient(to bottom, ${C.bg}f5 0%, ${C.bg}bb 16%, ${C.bg}22 35%, ${C.bg}ee 61%, ${C.bg} 84%)`}} />
        <div style={{position: 'absolute', left, right, ...(direction && cover ? {top: top + 130} : {bottom: bottom + 95}), ...move}}>
          {heading()}
          <div style={{marginTop: compact ? 26 : 40}}>{details(areaW, true)}</div>
        </div>
      </> : design === 'editorial' ? <>
        <div style={{...safe, top: top + 115, ...move}}>{heading(titleSize, C.copper)}</div>
        {cover || gallery ? <>
          {image({left: direction ? left + areaW * .1 : left, right, top: top + below(compact ? 275 : 335), bottom: bottom + (c.price ? 390 : c.lines?.length ? 210 : 125)}, gallery || Boolean(direction))}
          <div style={{position: 'absolute', left, right, bottom: bottom + 100}}>{details(areaW, true)}</div>
        </> : <>
          {image({left: direction ? left + areaW * .59 : left, width: areaW * .42, top: top + below(265), bottom: bottom + 110})}
          <div style={{position: 'absolute', top: top + below(265), left: direction ? left : left + areaW * .47, width: areaW * .53,
            borderLeft: `3px solid ${C.copper}`, paddingLeft: 25}}>{details(areaW * .53 - 25, true)}</div>
        </>}
      </> : <>
        {image({left: 0, right: 0, top: top + 105, height: areaH * (cover || gallery ? .48 : .29)}, gallery || Boolean(direction))}
        <div style={{position: 'absolute', left, right, top: top + 140 + areaH * (cover || gallery ? .48 : .29), ...move}}>
          {heading(titleSize, cover ? C.white : C.copper)}
          <div style={{marginTop: compact ? 24 : 36}}>{details(areaW, true)}</div>
        </div>
      </>}
      {header}{footer}
    </AbsoluteFill>
  );
};
