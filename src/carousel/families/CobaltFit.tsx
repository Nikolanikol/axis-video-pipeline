// Cobalt Shift v1: явные области названия, рубрик, цены, CTA и подписи.
// Неподвижные факты/история остаются прежними; исходные короткие тексты не сокращаются.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FitText} from '../../design/text/FitText';
import {LogoCorner, Photo, fitW, scale, upper, type FamilySlideProps, W} from './kit';
import {familyById} from './registry.js';
import {COBALT_SLIDES} from './CobaltShift';
import {Facts, History} from './fit/Shared';

const fonts = familyById('cobalt_shift')!.fonts;
const text = (source: string, field: string, width: number, height: number, max: number, color: string,
  options: {min?: number; lines?: number; wrap?: boolean; body?: boolean; weight?: number; align?: 'start' | 'middle' | 'end'; lastWordColor?: string} = {}) =>
  !source ? null : <FitText text={source} field={field} box={{width, height: Math.max(1, height), maxSize: Math.max(max, options.min ?? 36),
    minSize: options.min ?? 36, maxLines: options.lines ?? 3, wrap: options.wrap !== false, breakWords: options.wrap !== false, lineHeight: 1.12}}
    font={{family: options.body ? fonts.body : fonts.head, weight: options.weight ?? 700}} fontUrl={fonts.url}
    color={color} align={options.align} lastWordColor={options.lastWordColor} fallback={null} />;

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors, h}) => {
  const {y} = scale(h), name = upper([car.brand, car.model].filter(Boolean).join(' '));
  const year = car.year ? String(car.year) : '', km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  const side = Boolean(year || km), nameW = side ? 640 : 960, sideW = 960 - nameW - 76, areaH = h - y(860);
  return <AbsoluteFill style={{background: colors.accent}}>
    <Photo src={car.photos.hero} style={{left: 0, top: 0, width: W, height: y(860), borderBottomLeftRadius: 56, borderBottomRightRadius: 56}} position="45% 60%" />
    <LogoCorner on={colors.bg} />
    <div style={{position: 'absolute', left: 60, right: 60, top: y(860), bottom: 0, display: 'flex', alignItems: 'center', gap: 36}}>
      {text(name, 'name', nameW, areaH - 60, fitW(name, nameW, 210, 70, .52), '#FFFFFF', {min: 48, lines: 4})}
      {side && <><div style={{height: areaH * .65, width: 4, background: '#ffffffcc'}} />
        <div style={{flex: 1, minWidth: 0}}>
          {text(year, 'label', sideW, 160, 118, '#FFFFFF', {min: 42, lines: 1, wrap: false})}
          {text(km, 'label', sideW, 110, 66, '#FFFFFF', {min: 32, lines: 1, wrap: false})}
        </div></>}
    </div>
  </AbsoluteFill>;
};

const Pill: React.FC<{label: string; color: string}> = ({label, color}) => <div style={{position: 'absolute', right: 52, top: 56, zIndex: 3,
  background: color, borderRadius: 32, padding: '14px 40px 18px'}}>
  {text(label, 'section', 620, 160, fitW(label, 620, 104, 44, .5), '#FFFFFF', {min: 36, lines: 3})}
</div>;

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y} = scale(h), pool = [car.photos.rear, ...car.photos.exterior, car.photos.hero].filter(Boolean);
  const [a, b] = [pool[0], pool.find((photo) => photo !== pool[0]) ?? pool[0]];
  const parts = upper(content.kicker ?? content.title).split(/\s+/), last = parts.pop() ?? '';
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={a} style={{left: 0, top: 0, width: 760, height: y(600), borderBottomRightRadius: 56}} />
    <Photo src={b} style={{left: 0, top: y(640), width: 760, bottom: y(40), borderTopRightRadius: 56, borderBottomRightRadius: 56}} />
    <LogoCorner on={colors.bg} />
    <div style={{position: 'absolute', left: 790, top: 56, width: 254, height: h - 112, overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: h - 112, left: 0, width: h - 112, height: 254, transform: 'rotate(-90deg)', transformOrigin: '0 0'}}>
        {text(parts.join(' '), 'section', h - 112, 70, 58, colors.bg, {min: 28, lines: 2, align: 'end'})}
        {text(last, 'section', h - 112, 180, 220, colors.accent, {min: 50, lines: 1, wrap: false, align: 'end'})}
      </div>
    </div>
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const pool = [car.photos.interiorShot, ...car.photos.interior, car.photos.dashboard].filter(Boolean);
  const a = pool[0], b = pool.find((photo) => photo !== a) ?? a, half = (h - 84) / 2;
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={a} style={{left: 28, top: 28, width: W - 56, height: half, borderRadius: 44}} />
    <Photo src={b} style={{left: 28, top: 56 + half, width: W - 56, height: half, borderRadius: 44}} />
    <LogoCorner on={colors.bg} /><Pill label={upper(content.kicker ?? content.title)} color={colors.accent} />
  </AbsoluteFill>;
};
const Gallery: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const pool = Array.from(new Set([...(content.photos ?? []), ...car.photos.exterior, ...car.photos.interior, car.photos.hero].filter(Boolean)));
  const g = 24, cw = (W - 3 * g) / 2, ch = (h - 3 * g) / 2;
  return <AbsoluteFill style={{background: colors.light}}>
    {[0, 1, 2, 3].map((i) => <Photo key={i} src={pool[i % Math.max(1, pool.length)]} style={{left: g + i % 2 * (cw + g), top: g + Math.floor(i / 2) * (ch + g), width: cw, height: ch, borderRadius: 36}} />)}
    <LogoCorner on={colors.bg} /><Pill label={upper(content.kicker ?? content.title)} color={colors.accent} />
  </AbsoluteFill>;
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h), areaH = h - y(920), amountH = Math.min(240, areaH * .65);
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={car.photos.exterior[1] ?? car.photos.hero} style={{left: 0, top: 0, width: W, height: y(820), borderBottomLeftRadius: 56, borderBottomRightRadius: 56}} />
    <LogoCorner on={colors.bg} />
    <div style={{position: 'absolute', left: 60, top: y(860), width: 960, height: areaH}}>
      {text(content.price ?? '—', 'price', 960, amountH, 250 * k, colors.accent, {min: 42, lines: 1, wrap: false})}
      <div style={{marginTop: 12}}>{text(upper(content.priceLabel), 'label', 960, areaH - amountH - 12, 38, colors.bg, {min: 26, lines: 3, body: true})}</div>
    </div>
  </AbsoluteFill>;
};
const Cta: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {k} = scale(h), c = content.contact, caption = upper(content.lines?.join('\n'));
  const titleH = 250 * k, captionH = caption ? 140 * k : 0, gap = 28 * k;
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.bg} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 150, bottom: 60 * k, display: 'flex', flexDirection: 'column', gap}}>
      {text(upper(content.title), 'title', 960, titleH, 170 * k, colors.bg, {min: 40, lines: 3, lastWordColor: colors.accent})}
      <Photo src={car.photos.hero} style={{position: 'relative', flex: 1, minHeight: 160, borderRadius: 40}} />
      {c && <div style={{flex: 'none', height: c.secondary ? 204 : 164, borderRadius: 40, background: colors.accent, color: '#fff', display: 'flex', alignItems: 'center', padding: '12px 44px', gap: 24}}>
        <div style={{minWidth: 0, flex: 1}}>
          {text(c.label, 'label', 760, 40, 30, '#FFFFFF', {min: 20, lines: 1, wrap: false, body: true, weight: 600})}
          {text(c.value, 'contact', 760, 90, 70 * k, '#FFFFFF', {min: 26, lines: 1, wrap: false})}
        {c.secondary && text(c.secondary, 'contact', 760, 42, 28, '#FFFFFF', {min: 22, lines: 1, wrap: false, body: true, weight: 600})}
        </div><div style={{fontSize: 80 * k}}>→</div>
      </div>}
      {caption && text(caption, 'text', 960, captionH, caption.length > 48 ? 28 * k : 34 * k, colors.bg, {min: 28, lines: 4, body: true})}
    </div>
  </AbsoluteFill>;
};

export const COBALT_FIT_SLIDES: Record<string, React.FC<FamilySlideProps>> = {...COBALT_SLIDES,
  cover: Cover, exterior: Exterior, interior: Interior, gallery: Gallery, price: Price, cta: Cta,
  engine: (p) => Facts({...p, family: 'cobalt_shift'}), specs: (p) => Facts({...p, family: 'cobalt_shift'}), history: History};
