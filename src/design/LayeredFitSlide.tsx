import {FitLogo} from './text/FitLogo';
import {motionSpace} from './text/motionSpace';
// «Кино» сохраняет фото на весь кадр, «Редакционный» — заголовок над фото и боковую колонку.
// Текстовые области измеряются до кадра; исходные данные не сокращаются ради макета.
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Logo, clamp, useTheme} from '../shared/ui';
import type {DesignContent} from './DesignSlide';
import {FitText, useFitScope} from './text/FitText';
import {FitBounds} from './text/FitBounds';
import {Facts} from './plates/Facts';
import {MotionTitle, priceMotion} from './motion/text';
import {PhotoDetail, PhotoStack, photoFallback, photoFrame, textDelay} from './motion/photo';
import {resolveStyle} from './style/registry.js';
import {smooth} from './motion/easing';

type Props = {
  content: DesignContent;
  design: 'cinema' | 'editorial';
  index?: number;
  total?: number;
  animated?: boolean;
  variant?: number;
};
export const LayeredFitSlide: React.FC<Props> = ({
  content: c,
  design,
  index = 1,
  total = 1,
  animated = false,
  variant = 0,
}) => {
  const C = useTheme(),
    scope = useFitScope(),
    {width: w, height: h, fps, durationInFrames} = useVideoConfig(),
    frame = useCurrentFrame();
  const moving = animated && !scope.auditOnly,
    style = resolveStyle(C, design),
    t = frame / fps,
    delay = textDelay(style.photoMotion);
  const left = 64,
    right = 150,
    top = 128,
    bottom = 340,
    width = w - left - right,
    limit = h - bottom - 80,
    areaH = h - top - bottom;
  const cover = c.kind === 'cover' || c.kind === 'gallery',
    direction = Math.abs(variant) % 2;
  const titleY =
    design === 'cinema' ? (direction && cover ? top + 130 : top + areaH * (cover ? 0.42 : 0.28)) : top + 115;
  const titleH = cover ? 220 : 190,
    photoY = titleY + titleH + 36;
  const reserve = c.price ? 360 : c.lines?.length ? 210 : 100;
  const detailY = design === 'cinema' ? titleY + titleH + 24 : cover ? limit - reserve : photoY;
  const detailX = design === 'editorial' && !cover ? (direction ? left : left + width * 0.47) : left;
  const detailW = design === 'editorial' && !cover ? width * 0.53 - 25 : width;
  const detailH = Math.max(
    1,
    design === 'cinema' && direction && cover ? Math.min(500, limit - detailY) : limit - detailY,
  );
  const fontHead = {family: C.fonts.head, weight: 600},
    fontBody = {family: C.fonts.body, weight: 500};
  const box = (bw: number, bh: number, maxSize: number, minSize = 30, maxLines = 3, wrap = true) => ({
    width: bw,
    height: Math.max(1, bh),
    maxSize,
    minSize,
    maxLines,
    wrap,
    breakWords: wrap,
    lineHeight: 1.15,
  });
  const photos = (c.photos?.length ? c.photos : c.photo ? [c.photo] : []).filter(Boolean),
    spare = (c.spare ?? []).filter((p) => !photos.includes(p));
  const collage = c.collage || (c.kind === 'gallery' && !!direction),
    photo = photoFallback(style.photoMotion, {single: !collage && photos.length > 0, spare: spare.length});
  const pm = moving ? photoFrame(photo, t) : {frame: {}};
  const source = (url: string) => (/^(https?:|data:|blob:|\/)/.test(url) ? url : staticFile(url));
  const images = (list: string[]) =>
    scope.auditOnly ? null : collage && list.length > 1 ? (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: direction ? '1fr 1fr' : '2fr 1fr',
          gridTemplateRows: list.length > 2 ? '1fr 1fr' : '1fr',
          height: '100%',
          gap: 12,
        }}
      >
        {list.slice(0, 3).map((p, i) => (
          <Img
            key={p + i}
            src={source(p)}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 0,
              gridRow: i === 0 && list.length > 2 ? 'span 2' : undefined,
              objectFit: 'cover',
            }}
          />
        ))}
      </div>
    ) : list[0] ? (
      <Img
        src={source(list[0])}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '50% 58%',
          transform:
            pm.img ??
            (moving && design === 'cinema'
              ? `scale(${interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1, 1.045], clamp)})`
              : undefined),
        }}
      />
    ) : null;
  const imageBox: React.CSSProperties =
    design === 'cinema'
      ? {position: 'absolute', inset: 0, overflow: 'hidden', background: C.panel}
      : {
          position: 'absolute',
          left: cover ? (direction ? left + width * 0.1 : left) : direction ? left + width * 0.59 : left,
          top: photoY,
          width: cover ? width * (direction ? 0.9 : 1) : width * 0.42,
          height: Math.max(1, (cover ? detailY - 30 : limit) - photoY),
          overflow: 'hidden',
          background: C.panel,
        };
  const imageNode = (
    <>
      {c.previousPhotos?.length && <div style={{position: 'absolute', inset: 0}}>{images(c.previousPhotos)}</div>}
      <div style={{position: 'absolute', inset: 0, opacity: c.photoProgress ?? 1}}>{images(photos)}</div>
    </>
  );
  const fill = (url: string) =>
    scope.auditOnly ? null : (
      <Img
        src={source(url)}
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}
      />
    );
  const entrance = moving
    ? interpolate(frame, [Math.round(fps * delay), Math.round(fps * (delay + 0.5))], [0, 1], clamp)
    : 1;
  const move: React.CSSProperties = moving
    ? {opacity: entrance, transform: `translateY(${(1 - entrance) * 24}px)`}
    : {};
  const swap = moving && style.textMotion === 'crossfade' && c.kind === 'cover' && c.subtitle,
    progress = swap ? smooth((t - delay - 1.25) / 0.6) : 0;
  const title = (text: string, opacity: number, secondary = false) => (
    <FitText
      text={text}
      field="title"
      box={box(width, titleH, cover ? 160 : 94, 40, 3)}
      font={{...fontHead, letterSpacingEm: style.textMotion === 'tracking' ? 0.1 : 0}}
      padding={motionSpace(style.textMotion, cover ? 160 : 94)}
      fontUrl={C.fonts.url}
      color={design === 'editorial' ? (C.accentInk ?? C.copper) : C.white}
      fallback={null}
      style={{position: 'absolute', left, top: titleY, opacity}}
      render={(layout) => (
        <div
          style={{
            fontFamily: C.fonts.head,
            fontWeight: 600,
            fontSize: layout.fontSize,
            lineHeight: `${layout.height - (layout.lines.length - 1) * layout.lineAdvance}px`,
          }}
        >
          {layout.lines.map((line, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: layout.lineOffsets[i],
                top: i * layout.lineAdvance,
                whiteSpace: 'nowrap',
              }}
            >
              {moving ? (
                <MotionTitle
                  text={line}
                  kind={
                    secondary || layout.lines.length > 1 || style.textMotion === 'crossfade'
                      ? 'line_lift'
                      : style.textMotion
                  }
                  t={t - delay - i * 0.09}
                  size={layout.fontSize}
                  width={width}
                  colors={{accent: C.copper, onAccent: C.onAccent ?? C.bg, panel: C.panel}}
                />
              ) : (
                line
              )}
            </div>
          ))}
        </div>
      )}
    />
  );
  const priceH = c.price ? 240 : 0,
    contactH = c.contact ? (c.contact.secondary ? 240 : 170) : 0,
    restH = Math.max(1, detailH - priceH - contactH),
    noteH = c.lines?.length ? (c.facts?.length ? Math.min(180, restH * 0.4) : restH) : 0;
  const price = moving ? priceMotion(t - delay) : null;
  return (
    <AbsoluteFill style={{background: C.bg, color: C.white}}>
      {moving && photo === 'stack' ? (
        <PhotoStack t={t} frame={imageBox} spare={spare} fill={fill}>
          {imageNode}
        </PhotoStack>
      ) : moving && photo === 'detail' ? (
        <PhotoDetail t={t} frame={imageBox} spare={spare[0]} fill={fill}>
          {imageNode}
        </PhotoDetail>
      ) : (
        <div style={{...imageBox, ...pm.frame}}>{imageNode}</div>
      )}
      {design === 'cinema' && (
        <AbsoluteFill
          style={{
            background:
              direction && cover
                ? `linear-gradient(to bottom,${C.bg} 0%,${C.bg}ee 34%,${C.bg}22 66%,${C.bg} 94%)`
                : `linear-gradient(to bottom,${C.bg}f5 0%,${C.bg}bb 16%,${C.bg}22 35%,${C.bg}ee 61%,${C.bg} 84%)`,
          }}
        />
      )}
      <div style={{position: 'absolute', left, top, height: 70}}>
        <FitLogo height={46} width={320} on={C.bg} />
      </div>
      <FitText
        text={c.eyebrow ?? ''}
        field="label"
        box={box(width * 0.4, 70, 27, 18, 2)}
        font={fontBody}
        fontUrl={C.fonts.url}
        color={C.grey}
        fallback={null}
        align="end"
        style={{position: 'absolute', right, top}}
      />
      {title(c.title, 1 - progress)}
      {swap && title(c.subtitle!, progress, true)}
      <div
        style={{
          position: 'absolute',
          left: detailX,
          top: detailY,
          width: detailW,
          height: detailH,
          overflow: 'hidden',
          ...(design === 'editorial' && !cover
            ? {borderLeft: `3px solid ${C.copper}`, paddingLeft: 22, boxSizing: 'content-box'}
            : {}),
        }}
      >
        {c.price && (
          <div style={{height: priceH}}>
            <FitText
              text={c.priceLabel ?? ''}
              field="label"
              box={box(detailW, 50, 30, 22, 2)}
              font={fontBody}
              fontUrl={C.fonts.url}
              color={C.grey}
              fallback={null}
              style={price?.label}
            />
            <FitText
              text={c.price}
              field="price"
              box={box(detailW, 180, 162, 42, 1, false)}
              font={{...fontHead, weight: 700}}
              fontUrl={C.fonts.url}
              color={C.accentInk ?? C.copper}
              fallback={null}
              style={price?.figure}
            />
          </div>
        )}
        {c.facts?.length ? (
          <FitBounds
            width={detailW}
            height={restH - noteH}
            field="specs"
            layoutKey={style.plates}
            source={JSON.stringify(c.facts)}
            fonts={[fontBody, {...fontBody, weight: 600}, {...fontHead, weight: 700}]}
            fontUrl={C.fonts.url}
          >
            <Facts
              kind={style.plates}
              facts={c.facts}
              notes={[]}
              width={detailW}
              dense
              compact={false}
              design={design}
              rest={move}
              animated={moving}
              t={t}
              delay={delay}
            />
          </FitBounds>
        ) : null}
        {c.lines?.length ? (
          <FitText
            text={c.lines.join('\n')}
            field="text"
            box={box(detailW, noteH, 38, 30, 10)}
            font={fontBody}
            fontUrl={C.fonts.url}
            color={C.grey}
            fallback={null}
            style={move}
          />
        ) : null}
        {c.contact && (
          <div style={{height: contactH, paddingTop: 10}}>
            <FitText
              text={c.contact.label}
              field="label"
              box={box(detailW, 40, 28, 20, 1, false)}
              font={fontBody}
              fontUrl={C.fonts.url}
              color={C.grey}
              fallback={null}
            />
            <div style={{padding: '12px 20px', height: 120, boxSizing: 'border-box', background: C.copper}}>
              <FitText
                text={c.contact.value}
                field="contact"
                box={box(detailW - 40, 96, 78, 26, 1, false)}
                font={fontHead}
                fontUrl={C.fonts.url}
                color={C.onAccent ?? C.bg}
                fallback={null}
              />
            </div>
            {c.contact.secondary && (
              <FitText
                text={c.contact.secondary}
                field="contact"
                box={box(detailW, 70, 28, 22, 1, false)}
                font={fontBody}
                fontUrl={C.fonts.url}
                color={C.grey}
                fallback={null}
              />
            )}
          </div>
        )}
      </div>
      <div style={{position: 'absolute', left, right, bottom, borderTop: `1px solid ${C.line}`, paddingTop: 20}}>
        <FitText
          text={c.subtitle || C.name}
          field="label"
          box={box(width * 0.78, 60, 23, 18, 2)}
          font={fontBody}
          fontUrl={C.fonts.url}
          color={C.grey}
          fallback={null}
        />
        <span style={{position: 'absolute', right: 0, top: 20, fontFamily: C.fonts.body, fontSize: 23, color: C.grey}}>
          {String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
    </AbsoluteFill>
  );
};
