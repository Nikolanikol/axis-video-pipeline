// Обзор авто (review-short): съёмка + оформление AXIS двумя независимыми дорожками.
// Съёмка идёт непрерывными кусками (timeline.js → videoRuns): плашка — это наложение,
// резать под неё видео не нужно, иначе на каждой плашке перематывается файл и дёргается кадр.
// Само оформление — src/reviews/Overlays.tsx. Тайминги — src/shared/timeline.js.
import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {defined, resolveAd, themeOf} from '../shared/model';
import {BackgroundMusic} from '../shared/music';
import {linesForSegment, voiceForSegment} from '../shared/subtitles.js';
import {colourFilter, isNeutral, warmthChannels} from '../shared/colour.js';
import {voicePlan} from '../shared/narration.js';
import {REVIEW_BPM, buildTimeline, videoRuns} from '../shared/timeline.js';
import type {ReviewProps, ReviewSegment, ReviewSource} from '../shared/types';
import {ThemeProvider, clamp} from '../shared/ui';
import {Empty, SegmentOverlay, SubtitleCue} from './Overlays';

// Тайминги оформления задаём в СЕКУНДАХ и переводим в кадры по частоте композиции.
// В кадрах их держать нельзя: при переходе обзоров на 60 кадров всё оформление стало
// вдвое быстрее, и затемнение под карточкой цены начало читаться как обрыв съёмки.
const FADE_IN_SEC = 0.3;
const FADE_OUT_SEC = 0.4;
const AUDIO_FADE_SEC = 0.1; // снимает щелчок живого звука на склейке

// Фрагмент исходника. Вертикальное видео — на весь кадр; горизонтальное — целиком, на размытом фоне.
const Clip: React.FC<{source: ReviewSource; seg: ReviewSegment; frames: number; volume: number}> = ({source, seg, frames, volume}) => {
  const {fps} = useVideoConfig();
  const portrait = (source.width ?? 9) / (source.height ?? 16) < 0.7;
  const muted = !volume || seg.speed !== 1;
  // Живой звук вводим и выводим плавно: встык склейка даёт щелчок, а обрезанная
  // на полуслове реплика звучит оборванной. Музыка так устроена с самого начала.
  const fade = Math.min(Math.round(AUDIO_FADE_SEC * fps), Math.floor(frames / 3));
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
  const f = useCurrentFrame(); const {durationInFrames, fps} = useVideoConfig();
  const inFrames = Math.round(FADE_IN_SEC * fps);
  const outFrames = Math.round(FADE_OUT_SEC * fps);
  const o = Math.max(interpolate(f, [0, inFrames], [1, 0], clamp), interpolate(f, [durationInFrames - outFrames, durationInFrames - 1], [0, 1], clamp));
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
  // Озвучка считается один раз по всему таймлайну
  const cues = voiceOn ? voicePlan(items, review.speech?.lines ?? [], review.voice, fps) : [];
  const grade = {
    filter: isNeutral(review.colour) ? undefined : colourFilter(review.colour, WARMTH_ID),
    warm: review.colour?.warmth ? warmthChannels(review.colour) : null,
  };
  const runs = videoRuns(items, fps);
  // Звуки машины без голоса: отдельная дорожка, выделенная моделью разделения. Включена —
  // играет вместо живого звука, и при озвучке её глушить незачем: второго голоса в ней нет.
  const ambienceOn = Boolean(review.ambience?.enabled && review.ambience.file);
  // Живой звук при озвучке молчит: иначе в кадре говорят двое. Если играют звуки машины,
  // сырую дорожку тем более не пускаем — они бы наложились друг на друга.
  const liveVolume = voiceOn || ambienceOn ? 0 : review.sourceVolume ?? 0;
  // Подпись под названием: своя у обзора, иначе из рынка. Пустую строку уважаем — это «без подписи»
  const tagline = review.tagline ?? market.texts.hookTagline;
  const title = ad
    ? {brand: ad.brand, model: ad.model, year: ad.year, trim: ad.trim, tagline: review.tagline ?? ad.texts.hookTagline}
    : {brand: '', model: review.title, tagline};
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
            {runs.map((run) => (
              <Sequence key={`clip-${run.seg.id}`} from={run.from} durationInFrames={run.frames} name={`съёмка ${run.seg.note || run.seg.kind}`}>
                <Clip source={source} seg={run.seg} frames={run.frames} volume={liveVolume} />
              </Sequence>
            ))}
          </AbsoluteFill>
        )}
        {/* Звуки машины без голоса — отдельной дорожкой вместо живого звука. Своим слоем,
            потому что это другой файл: в съёмке речь и машина вместе, здесь только машина */}
        {source && ambienceOn && runs.map((run) => (
          <Sequence key={`amb-${run.seg.id}`} from={run.from} durationInFrames={run.frames} name={`звуки ${run.seg.note || run.seg.kind}`}>
            <Audio
              src={review.ambience!.file!}
              volume={review.sourceVolume ?? 0}
              trimBefore={Math.round(run.seg.start * fps)}
              playbackRate={run.seg.speed}
            />
          </Sequence>
        ))}
        {/* Озвучка — одним слоем на весь ролик: начитка непрерывна, и граница фрагмента
            картинки не должна обрывать фразу на полуслове */}
        {source && cues.map(({id, from, frames, file, offset}) => (
          <Sequence key={`voice-${id}`} from={from} durationInFrames={frames} name={`озвучка ${id}`}>
            <Audio src={file} volume={review.voice?.volume ?? 1} trimBefore={Math.round(offset * fps)} />
          </Sequence>
        ))}
        {/* Оформление: плашки, субтитры, карточки — поверх съёмки, своими слоями */}
        {source && items.map(({seg, from, frames}) => {
          const lines = review.speech?.lines ?? [];
          // Субтитр держится ровно столько, сколько звучит фраза; без озвучки — по речи автора
          const spoken = cues
            .filter((c) => c.from >= from && c.from < from + frames)
            .map((c) => ({...c, from: c.from - from, frames: Math.min(c.frames, from + frames - c.from)}));
          const subtitles: SubtitleCue[] =
            !review.subtitles?.enabled || !lines.length ? []
              : spoken.length ? spoken
                : linesForSegment(lines, seg, frames, fps);
          return (
            <Sequence key={seg.id} from={from} durationInFrames={frames} name={seg.note || seg.kind}>
              <SegmentOverlay
                seg={seg}
                props={props}
                title={title}
                subtitles={subtitles}
                useTranslation={Boolean(review.subtitles?.useTranslation)}
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
