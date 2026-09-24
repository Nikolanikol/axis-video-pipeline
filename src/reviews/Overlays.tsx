// Оформление обзора поверх съёмки: плашки, субтитры, заставка, карточка цены.
//
// Слой намеренно отделён от видео. Плашка — это НАЛОЖЕНИЕ, а не монтажная склейка:
// чтобы её показать, резать съёмку не нужно. Пока оформление жило внутри фрагмента,
// каждая плашка требовала своего элемента видео, тот перематывал файл — и на месте
// появления плашки дёргался кадр. Теперь съёмка идёт непрерывными кусками
// (timeline.js → videoRuns), а этот слой ложится сверху по времени.
import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CarTitle, Contacts, PriceTag} from '../shared/blocks';
import {resolveAd} from '../shared/model';
import {lineText} from '../shared/subtitles.js';
import type {ReviewProps, ReviewSegment, SubtitleLine} from '../shared/types';
import {BODY, HEAD, Metal, PAD, Shade, TopLogo, clamp, radius, useAsset, useTheme} from '../shared/ui';

// Тайминги оформления — в секундах: в кадрах они зависели бы от частоты композиции,
// и на 60 кадрах всё оформление шло вдвое быстрее (затемнение финала читалось как обрыв).
const atSec = (sec: number, fps: number) => Math.round(sec * fps);

/** Плашка фрагмента: тёмная с медной полосой или медная (акцент) */
export const CaptionPlate: React.FC<{text: string; accent?: boolean}> = ({text, accent}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const a = spring({frame: f - atSec(0.13, fps), fps, config: {damping: 200}});
  const style: React.CSSProperties = {fontFamily: BODY, fontWeight: 600, fontSize: 52, padding: '22px 34px', color: accent ? C.bg : C.white};
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'flex-start', padding: PAD}}>
      <div style={{opacity: a, transform: `translateX(${(1 - a) * -60}px)`}}>
        {accent
          ? <Metal style={style}>{text}</Metal>
          : (
            <div style={{display: 'flex', alignItems: 'stretch', background: `${C.panel}e0`}}>
              <Metal style={{width: 12}} />
              <div style={style}>{text}</div>
            </div>
          )}
      </div>
    </AbsoluteFill>
  );
};

/** Субтитры: над плашкой, по центру, внутри безопасной зоны */
export const Subtitle: React.FC<{text: string}> = ({text}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const a = interpolate(f, [0, atSec(0.13, fps)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', padding: '0 150px 500px 80px', opacity: a}}>
      <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 46, lineHeight: 1.25, color: C.white, textAlign: 'center',
        background: `${C.bg}cc`, borderRadius: radius(C, 8), padding: '14px 24px', maxWidth: 850}}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Финал: затемнение, логотип, цена до порта, контакты */
export const FinalCard: React.FC<{props: ReviewProps}> = ({props}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const dim = interpolate(f, [0, atSec(0.27, fps)], [0, 1], clamp);
  const logo = spring({frame: f - atSec(0.07, fps), fps, config: {damping: 200}});
  const contacts = spring({frame: f - atSec(0.4, fps), fps, config: {damping: 200}});
  const {lot, market} = props;
  const ad = lot ? resolveAd({lot, market}) : null;
  const texts = ad?.texts ?? market.texts;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `${C.bg}c8`, opacity: dim}} />
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 190}}>
        <Img src={useAsset('logoStacked')} style={{height: 200, opacity: logo, transform: `scale(${0.9 + 0.1 * logo})`}} />
      </AbsoluteFill>
      {ad
        ? <PriceTag ad={ad} delay={atSec(0.13, fps)} padding="0 150px 720px 80px" />
        : (
          <AbsoluteFill style={{justifyContent: 'center', padding: '0 150px 0 80px'}}>
            <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 96, lineHeight: 1.05, color: C.white, textTransform: 'uppercase', opacity: logo}}>
              {texts.ctaAccent}
            </div>
          </AbsoluteFill>
        )}
      <AbsoluteFill style={{justifyContent: 'flex-end', padding: PAD}}>
        <div style={{opacity: contacts, transform: `translateY(${(1 - contacts) * 40}px)`}}>
          <Contacts whatsapp={ad ? ad.whatsapp : market.whatsapp} whatsappLabel={texts.whatsappLabel} site={ad ? ad.site : market.site} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Empty: React.FC<{text: string}> = ({text}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: 120, textAlign: 'center',
      fontFamily: BODY, fontWeight: 600, fontSize: 48, color: C.grey}}>
      {text}
    </AbsoluteFill>
  );
};

// offset — с какой секунды файла играть: в единой начитке это отрезок общей дорожки
export type VoiceClip = {id: string; from: number; frames: number; file: string; offset: number};
export type SubtitleCue = {id: string; from: number; frames: number; line: SubtitleLine};

/**
 * Оформление одного фрагмента. Съёмку не трогает: только то, что ложится поверх.
 * Держать это отдельно важно — иначе «показать плашку» снова начнёт означать «разрезать видео».
 */
export const SegmentOverlay: React.FC<{
  seg: ReviewSegment;
  props: ReviewProps;
  title: {brand: string; model: string; year?: number; trim?: string; tagline: string};
  subtitles: SubtitleCue[];
  useTranslation: boolean;
}> = ({seg, props, title, subtitles, useTranslation}) => (
  <>
    {seg.kind === 'hook' && <><Shade /><CarTitle {...title} /></>}
    {seg.kind === 'caption' && seg.caption ? <CaptionPlate text={seg.caption} accent={seg.accent} /> : null}
    {seg.kind === 'caption' && subtitles.map(({id, from, frames, line}) => (
      <Sequence key={`sub-${id}`} from={from} durationInFrames={frames} name={`субтитр ${id}`}>
        <Subtitle text={lineText(line, useTranslation)} />
      </Sequence>
    ))}
    {seg.kind === 'final' ? <FinalCard props={props} /> : <TopLogo />}
  </>
);
