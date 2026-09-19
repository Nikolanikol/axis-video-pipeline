// Обзор авто (review-short): съёмка + оформление AXIS двумя независимыми дорожками.
// Съёмка идёт непрерывными кусками (timeline.js → videoRuns): плашка — это наложение,
// резать под неё видео не нужно, иначе на каждой плашке перематывается файл и дёргается кадр.
// Само оформление — src/reviews/Overlays.tsx. Тайминги — src/shared/timeline.js.
import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {defined, resolveAd, themeOf} from '../shared/model';
import {BackgroundMusic} from '../shared/music';
import {linesForSegment, voiceForSegment} from '../shared/subtitles.js';
import {colourFilter, isNeutral, warmthChannels} from '../shared/colour.js';
import {REVIEW_BPM, buildTimeline, videoRuns} from '../shared/timeline.js';
import type {ReviewProps, ReviewSegment, ReviewSource} from '../shared/types';
import {ThemeProvider, clamp} from '../shared/ui';
import {Empty, SegmentOverlay, SubtitleCue} from './Overlays';

const FADE_IN = 9;   // 0,3 с
const FADE_OUT = 12; // 0,4 с
const AUDIO_FADE = 3; // кадра: снимает щелчок живого звука на склейке

// Фрагмент исходника. Вертикальное видео — на весь кадр; горизонтальное — целиком, на размытом фоне.
const Clip: React.FC<{source: ReviewSource; seg: ReviewSegment; frames: number; volume: number}> = ({source, seg, frames, volume}) => {
  const {fps} = useVideoConfig();
  const portrait = (source.width ?? 9) / (source.height ?? 16) < 0.7;
  const muted = !volume || seg.speed !== 1;
  // Живой звук вводим и выводим плавно: встык склейка даёт щелчок, а обрезанная
  // на полуслове реплика звучит оборванной. Музыка так устроена с самого начала.
  const fade = Math.min(AUDIO_FADE, Math.floor(frames / 3));
  const level = frames >= 6 && fade >= 1
    ? (f: number) => interpolate(f, [0, fade, frames - fade, frames - 1], [0, volume, volume, 0], clamp)
    : volume;
  const video = (style: React.CSSProperties, withSound: boolean) => (
    <OffthreadVideo
      src={source.proxy!}
      // Целый кадр: seg.start — секунды с тремя знаками, дробного trimBefore Remotion не ждёт
      trimBefore={Math.round(seg.start * fps)}
      playbackRate={seg.speed}
      muted={!withSound || muted}
      volume={level}
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

// Теплота — матрица каналов: CSS такого не умеет, поэтому маленький SVG-фильтр.
// Лежит скрытым в кадре: на ссылку url(#id) в CSS-фильтре нужен живой элемент в документе.
const WarmthFilter: React.FC<{id: string; r: number; b: number}> = ({id, r, b}) => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <defs>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${r} 0 0 0 0  0 1 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`} />
      </filter>
    </defs>
  </svg>
);

const WARMTH_ID = 'axis-warmth';

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
  // Цветокоррекция: фильтр на слой съёмки, теплота — через SVG-матрицу
  const grade = {
    filter: isNeutral(review.colour) ? undefined : colourFilter(review.colour, WARMTH_ID),
    warm: review.colour?.warmth ? warmthChannels(review.colour) : null,
  };
  const title = ad
    ? {brand: ad.brand, model: ad.model, year: ad.year, trim: ad.trim, tagline: ad.texts.hookTagline}
    : {brand: '', model: review.title, tagline: market.texts.hookTagline};
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {!source && <Empty text={review.source?.status === 'processing' ? 'Видео готовится…' : 'Загрузи видео обзора'} />}
        {source && !items.length && <Empty text="Добавь фрагменты" />}
        {/* Цвет накладывается на всю съёмку разом и не достаёт до оформления выше */}
        {grade.warm && <WarmthFilter id={WARMTH_ID} r={grade.warm.r} b={grade.warm.b} />}
        {/* Съёмка: непрерывные куски играют одним элементом, без перемотки на стыке */}
        {source && (
          <AbsoluteFill style={{filter: grade.filter}}>
            {videoRuns(items, fps).map((run) => (
              <Sequence key={`clip-${run.seg.id}`} from={run.from} durationInFrames={run.frames} name={`съёмка ${run.seg.note || run.seg.kind}`}>
                <Clip source={source} seg={run.seg} frames={run.frames} volume={voiceOn ? 0 : review.sourceVolume ?? 0} />
              </Sequence>
            ))}
          </AbsoluteFill>
        )}
        {/* Оформление: плашки, субтитры, карточки — поверх съёмки, своими слоями */}
        {source && items.map(({seg, from, frames}) => {
          const lines = review.speech?.lines ?? [];
          // Озвучка перевода заменяет живой звук: иначе в кадре два голоса разом
          const voice = voiceOn ? voiceForSegment(lines, review.voice!.clips, seg, frames, fps) : [];
          // С озвучкой субтитр держится ровно столько, сколько звучит фраза
          const subtitles: SubtitleCue[] =
            !review.subtitles?.enabled || !lines.length ? []
              : voice.length ? voice
                : linesForSegment(lines, seg, frames, fps);
          return (
            <Sequence key={seg.id} from={from} durationInFrames={frames} name={seg.note || seg.kind}>
              <SegmentOverlay
                seg={seg}
                props={props}
                title={title}
                voice={voice}
                subtitles={subtitles}
                useTranslation={Boolean(review.subtitles?.useTranslation)}
                voiceVolume={review.voice?.volume ?? 1}
              />
            </Sequence>
          );
        })}
        <Fade />
        <BackgroundMusic music={music} bpm={REVIEW_BPM} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
