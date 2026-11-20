import {FitLogo} from './text/FitLogo';
import {motionSpace} from './text/motionSpace';
// Версия «Каталога» с явными областями текста. Включается только у новых сборок v1;
// фото, факты и движения остаются прежними модулями. Нижняя безопасная зона свободна.
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Logo, clamp, useTheme} from '../shared/ui';
import type {DesignContent} from './DesignSlide';
import {FitText, useFitScope} from './text/FitText';
import {FitBounds} from './text/FitBounds';
import {Facts} from './plates/Facts';
import {resolveStyle} from './style/registry.js';
import {MotionTitle, priceMotion} from './motion/text';
import {PhotoDetail, PhotoStack, photoFallback, photoFrame, textDelay} from './motion/photo';
import {smooth} from './motion/easing';

export const CatalogFitSlide: React.FC<{content: DesignContent; index?: number; total?: number; animated?: boolean; variant?: number}> =
({content: c, index = 1, total = 1, animated = false, variant = 0}) => {
  const C = useTheme(), scope = useFitScope(), {width: w, height: h, fps} = useVideoConfig(), frame = useCurrentFrame();
  const moving = animated && !scope.auditOnly, style = resolveStyle(C, 'catalog');
  const t = frame / fps, delay = textDelay(style.photoMotion), ink = C.accentInk ?? C.copper;
  const left = 64, right = 150, top = 128, bottom = 340, width = w - left - right;
  const areaH = h - top - bottom, cover = c.kind === 'cover' || c.kind === 'gallery';
  const photoY = top + 105, photoH = areaH * (cover ? .45 : .27);
  const titleY = photoY + photoH + 36, titleH = cover ? 220 : 190;
  const detailY = titleY + titleH + 24, detailH = Math.max(1, h - bottom - 80 - detailY);
  const fontHead = {family: C.fonts.head, weight: 600}, fontBody = {family: C.fonts.body, weight: 500};
  const box = (height: number, maxSize: number, minSize = 30, maxLines = 3, wrap = true) =>
    ({width, height: Math.max(1, height), maxSize, minSize, maxLines, wrap, breakWords: wrap, lineHeight: 1.15});
  const photos = (c.photos?.length ? c.photos : c.photo ? [c.photo] : []).filter(Boolean);
  const spare = (c.spare ?? []).filter((url) => !photos.includes(url));
  const collage = c.collage || (c.kind === 'gallery' && Boolean(variant % 2));
  const photo = photoFallback(style.photoMotion, {single: !collage && photos.length > 0, spare: spare.length});
  const pm = moving ? photoFrame(photo, t) : {frame: {}};
  const source = (url: string) => /^(https?:|data:|blob:|\/)/.test(url) ? url : staticFile(url);
  const fill = (url: string) => scope.auditOnly ? null : <Img src={source(url)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />;
  const images = (list: string[]) => scope.auditOnly ? null : collage && list.length > 1
    ? <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: list.length > 2 ? '1fr 1fr' : '1fr', height: '100%', gap: 12}}>
      {list.slice(0, 3).map((url, i) => <Img key={`${i}-${url}`} src={source(url)} style={{width: '100%', height: '100%', minHeight: 0,
        gridRow: i === 0 && list.length > 2 ? 'span 2' : undefined, objectFit: 'cover'}} />)}</div>
    : list[0] ? <Img src={source(list[0])} style={{width: '100%', height: '100%', objectFit: 'cover', transform: pm.img}} /> : null;
  const photoBox: React.CSSProperties = {position: 'absolute', left: 0, right: 0, top: photoY, height: photoH, overflow: 'hidden', background: C.panel};
  const photoNode = <>{c.previousPhotos?.length && <div style={{position: 'absolute', inset: 0}}>{images(c.previousPhotos)}</div>}
    <div style={{position: 'absolute', inset: 0, opacity: c.photoProgress ?? 1}}>{images(photos)}</div></>;
  const enter = moving ? interpolate(frame, [Math.round(fps * delay), Math.round(fps * (delay + .5))], [0, 1], clamp) : 1;
  const move: React.CSSProperties = moving ? {opacity: enter, transform: `translateX(${(1 - enter) * -32}px)`} : {};
  const swap = moving && style.textMotion === 'crossfade' && c.kind === 'cover' && c.subtitle;
  const swapProgress = swap ? smooth((t - delay - 1.25) / .6) : 0;
  const title = (text: string, opacity = 1, secondary = false) => <FitText text={text} field="title" box={box(titleH, cover ? 160 : 94, 40)}
    font={{...fontHead, letterSpacingEm: style.textMotion === 'tracking' ? .1 : 0}} padding={motionSpace(style.textMotion, cover ? 160 : 94)} fontUrl={C.fonts.url} color={cover ? C.white : ink} fallback={null}
    style={{position: 'absolute', left, top: titleY, opacity}}
    render={(layout) => <div style={{fontFamily: C.fonts.head, fontWeight: 600, fontSize: layout.fontSize,
      lineHeight: `${layout.height - (layout.lines.length - 1) * layout.lineAdvance}px`}}>
      {layout.lines.map((line, i) => <div key={i} style={{position: 'absolute', left: layout.lineOffsets[i], top: i * layout.lineAdvance, whiteSpace: 'nowrap'}}>
        {moving ? <MotionTitle text={line} kind={secondary || layout.lines.length > 1 || style.textMotion === 'crossfade' ? 'line_lift' : style.textMotion}
          t={t - delay - i * .09} size={layout.fontSize} width={width} colors={{accent: C.copper, onAccent: C.onAccent ?? C.bg, panel: C.panel}} /> : line}
      </div>)}
    </div>} />;
  const priceH = c.price ? 240 : 0, contactH = c.contact ? (c.contact.secondary ? 240 : 170) : 0;
  const restH = Math.max(1, detailH - priceH - contactH);
  const noteH = c.lines?.length ? (c.facts?.length ? Math.min(180, restH * .4) : restH) : 0;
  const price = moving ? priceMotion(t - delay) : null;
  return <AbsoluteFill style={{background: C.bg, color: C.white}}>
    {moving && photo === 'stack' ? <PhotoStack t={t} frame={photoBox} spare={spare} fill={fill}>{photoNode}</PhotoStack>
      : moving && photo === 'detail' ? <PhotoDetail t={t} frame={photoBox} spare={spare[0]} fill={fill}>{photoNode}</PhotoDetail>
      : <div style={{...photoBox, ...pm.frame}}>{photoNode}</div>}
    <div style={{position: 'absolute', left, top, height: 70}}><FitLogo height={46} width={320} on={C.bg}/></div>
    <FitText text={c.eyebrow ?? ''} field="label" box={{...box(70, 27, 18, 2), width: width * .4}} font={fontBody}
      fontUrl={C.fonts.url} color={C.grey} fallback={null} align="end" style={{position: 'absolute', right, top}} />
    {title(c.title, 1 - swapProgress)}{swap && title(c.subtitle!, swapProgress, true)}
    <div style={{position: 'absolute', left, top: detailY, width, height: detailH, overflow: 'hidden'}}>
      {c.price && <div style={{height: priceH}}>
        <FitText text={c.priceLabel ?? ''} field="label" box={box(50, 30, 22, 2)} font={fontBody} fontUrl={C.fonts.url}
          color={C.grey} fallback={null} style={price?.label} />
        <div style={{height: 180, overflow: 'hidden'}}><FitText text={c.price} field="price" box={box(180, 162, 42, 1, false)} font={{...fontHead, weight: 700}}
          fontUrl={C.fonts.url} color={ink} fallback={null} style={price?.figure} /></div>
      </div>}
      {c.facts?.length ? <FitBounds width={width} height={restH - noteH} field="specs" layoutKey={style.plates} source={JSON.stringify(c.facts)} fontUrl={C.fonts.url}
        fonts={[fontBody, {...fontBody, weight: 600}, {...fontHead, weight: 700}]}>
        <Facts kind={style.plates} facts={c.facts} notes={[]} width={width} dense compact={false} design="catalog" rest={move} animated={moving} t={t} delay={delay} />
      </FitBounds> : null}
      {c.lines?.length ? <FitText text={c.lines.join('\n')} field="text" box={box(noteH, 38, 30, 10)} font={fontBody}
        fontUrl={C.fonts.url} color={C.grey} fallback={null} style={move} /> : null}
      {c.contact && <div style={{height: contactH, paddingTop: 10}}>
        <FitText text={c.contact.label} field="label" box={box(40, 28, 20, 1, false)} font={fontBody} fontUrl={C.fonts.url} color={C.grey} fallback={null} />
        <div style={{padding: '12px 20px', background: C.copper, height: 120, overflow: 'hidden'}}>
          <FitText text={c.contact.value} field="contact" box={{...box(96, 78, 26, 1, false), width: width - 40}} font={fontHead}
            fontUrl={C.fonts.url} color={C.onAccent ?? C.bg} fallback={null} />
        </div>
        {c.contact.secondary && <FitText text={c.contact.secondary} field="contact" box={box(70, 28, 22, 1, false)} font={fontBody} fontUrl={C.fonts.url} color={C.grey} fallback={null} />}
      </div>}
    </div>
    <div style={{position: 'absolute', left, right, bottom, borderTop: `1px solid ${C.line}`, paddingTop: 20}}>
      <FitText text={c.subtitle || C.name} field="label" box={{...box(60, 23, 18, 2), width: width * .78}} font={fontBody} fontUrl={C.fonts.url} color={C.grey} fallback={null} />
      <span style={{position: 'absolute', right: 0, top: 20, fontFamily: C.fonts.body, fontSize: 23, color: C.grey}}>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    </div>
  </AbsoluteFill>;
};
