// Обзор авто (review-short): фрагменты своего вертикального видео + оформление AXIS.
// Хук с моделью → фрагменты с плашками → финал с ценой до порта и контактами. Тайминги — src/shared/timeline.js.
import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CarTitle, Contacts, PriceTag} from '../shared/blocks';
import {defined, resolveAd, themeOf} from '../shared/model';
import {BackgroundMusic} from '../shared/music';
import {lineText, linesForSegment, voiceForSegment} from '../shared/subtitles.js';
import {REVIEW_BPM, buildTimeline} from '../shared/timeline.js';
import type {ReviewProps, ReviewSegment, ReviewSource, SubtitleLine} from '../shared/types';
import {BODY, HEAD, Metal, PAD, Shade, ThemeProvider, TopLogo, clamp, useTheme} from '../shared/ui';

const FADE_IN = 9;   // 0,3 с
const FADE_OUT = 12; // 0,4 с

// Фрагмент исходника. Вертикальное видео — на весь кадр; горизонтальное — целиком, на размытом фоне.
const Clip: React.FC<{source: ReviewSource; seg: ReviewSegment; volume: number}> = ({source, seg, volume}) => {
  const {fps} = useVideoConfig();
  const portrait = (source.width ?? 9) / (source.height ?? 16) < 0.7;
  const muted = !volume || seg.speed !== 1;
  const video = (style: React.CSSProperties, withSound: boolean) => (
    <OffthreadVideo
      src={source.proxy!}
      trimBefore={seg.start * fps}
      playbackRate={seg.speed}
      muted={!withSound || muted}
      volume={volume}
      style={{width: '100%', height: '100%', ...style}}
    />
  );
  if (portrait) return <AbsoluteFill>{video({objectFit: 'cover'}, true)}</AbsoluteFill>;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{filter: 'blur(50px) brightness(0.35)', transform: 'scale(1.3)'}}>{video({objectFit: 'cover'}, false)}</AbsoluteFill>
      <AbsoluteFill>{video({objectFit: 'contain'}, true)}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// Плашка фрагмента: тёмная с медной полосой или медная (акцент)
const CaptionPlate: React.FC<{text: string; accent?: boolean}> = ({text, accent}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const a = spring({frame: f - 4, fps, config: {damping: 200}});
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

// Субтитры: над плашкой, по центру, внутри безопасной зоны
const Subtitle: React.FC<{text: string}> = ({text}) => {
  const C = useTheme();
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 4], [0, 1], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', padding: '0 150px 500px 80px', opacity: a}}>
      <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 46, lineHeight: 1.25, color: C.white, textAlign: 'center',
        background: `${C.bg}cc`, borderRadius: 8, padding: '14px 24px', maxWidth: 850}}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Финал поверх последнего фрагмента: затемнение, логотип, цена до порта, контакты
const FinalCard: React.FC<{props: ReviewProps}> = ({props}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const dim = interpolate(f, [0, 8], [0, 1], clamp);
  const logo = spring({frame: f - 2, fps, config: {damping: 200}});
  const contacts = spring({frame: f - 12, fps, config: {damping: 200}});
  const {lot, market} = props;
  const ad = lot ? resolveAd({lot, market}) : null;
  const texts = ad?.texts ?? market.texts;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `${C.bg}c8`, opacity: dim}} />
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 190}}>
        <Img src={staticFile('brand/logo-stacked.svg')} style={{height: 200, opacity: logo, transform: `scale(${0.9 + 0.1 * logo})`}} />
      </AbsoluteFill>
      {ad
        ? <PriceTag ad={ad} delay={4} padding="0 150px 720px 80px" />
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

const Empty: React.FC<{text: string}> = ({text}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: 120, textAlign: 'center',
      fontFamily: BODY, fontWeight: 600, fontSize: 48, color: C.grey}}>
      {text}
    </AbsoluteFill>
  );
};

const Fade: React.FC = () => {
  const f = useCurrentFrame(); const {durationInFrames} = useVideoConfig();
  const o = Math.max(interpolate(f, [0, FADE_IN], [1, 0], clamp), interpolate(f, [durationInFrames - FADE_OUT, durationInFrames - 1], [0, 1], clamp));
  return <AbsoluteFill style={{background: '#000', opacity: o}} />;
};

export const ReviewShort: React.FC<ReviewProps> = (props) => {
  const {review, lot, market} = props;
  const theme = themeOf(props.theme);
  const {fps} = useVideoConfig();
  const {items} = buildTimeline(review.segments, fps);
  const source = review.source?.status === 'ready' && review.source.proxy ? review.source : null;
  const ad = lot ? resolveAd({lot, market}) : null;
  const music = {...market.music, ...defined(review.music ?? {})};
  const voiceOn = Boolean(review.voice?.enabled && review.voice.clips && Object.keys(review.voice.clips).length);
  const title = ad
    ? {brand: ad.brand, model: ad.model, year: ad.year, trim: ad.trim, tagline: ad.texts.hookTagline}
    : {brand: '', model: review.title, tagline: market.texts.hookTagline};
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {!source && <Empty text={review.source?.status === 'processing' ? 'Видео готовится…' : 'Загрузи видео обзора'} />}
        {source && !items.length && <Empty text="Добавь фрагменты" />}
        {source && items.map(({seg, from, frames}) => {
          const lines = review.speech?.lines ?? [];
          // Озвучка перевода заменяет живой звук: иначе в кадре два голоса разом
          const voice = voiceOn ? voiceForSegment(lines, review.voice!.clips, seg, frames, fps) : [];
          // С озвучкой субтитр держится ровно столько, сколько звучит фраза
          const subtitles: {id: string; from: number; frames: number; line: SubtitleLine}[] =
            !review.subtitles?.enabled || !lines.length ? []
              : voice.length ? voice
                : linesForSegment(lines, seg, frames, fps);
          return (
          <Sequence key={seg.id} from={from} durationInFrames={frames} name={seg.note || seg.kind}>
            <Clip source={source} seg={seg} volume={voiceOn ? 0 : review.sourceVolume ?? 0} />
            {voice.map(({id, from: at, frames: dur, file}) => (
              <Sequence key={`${seg.id}-voice-${id}`} from={at} durationInFrames={dur} name={`озвучка ${id}`}>
                <Audio src={file} volume={review.voice?.volume ?? 1} />
              </Sequence>
            ))}
            {seg.kind === 'hook' && <><Shade /><CarTitle {...title} /></>}
            {seg.kind === 'caption' && seg.caption ? <CaptionPlate text={seg.caption} accent={seg.accent} /> : null}
            {seg.kind === 'caption' && subtitles.map(({id, from, frames: dur, line}) => (
              <Sequence key={`${seg.id}-${id}`} from={from} durationInFrames={dur} name={`субтитр ${id}`}>
                <Subtitle text={lineText(line, Boolean(review.subtitles?.useTranslation))} />
              </Sequence>
            ))}
            {seg.kind === 'final' ? <FinalCard props={props} /> : <TopLogo />}
          </Sequence>
          );
        })}
        <Fade />
        <BackgroundMusic music={music} bpm={REVIEW_BPM} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
