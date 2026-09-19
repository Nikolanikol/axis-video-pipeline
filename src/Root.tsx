// Корень Remotion: каждый формат и обзор — композиция с id из реестра.
// Данные по умолчанию (lot.json, рынок mk) нужны Remotion Studio и CLI.
import React from 'react';
import {Composition} from 'remotion';
import lot from '../lot.json';
import mk from '../config/markets/mk.json';
import {FORMAT_COMPONENTS} from './formats';
import {ReviewShort} from './reviews/ReviewShort';
import {FORMATS} from './shared/model';
import {REVIEW_FPS, reviewFrames} from './shared/timeline.js';
import type {AdProps, Lot, Market, ReviewProps} from './shared/types';

// Каждый формат — отдельная композиция с id формата. В Studio — лот из lot.json на рынке Македонии.
const defaultProps: AdProps = {lot: lot as Lot, market: mk as Market};
const reviewDefaults: ReviewProps = {review: {title: 'Обзор', segments: []}, lot: lot as Lot, market: mk as Market};

export const Root: React.FC = () => (
  <>
    {FORMATS.map((f) => (
      <Composition
        key={f.id}
        id={f.id}
        component={FORMAT_COMPONENTS[f.id]}
        durationInFrames={f.durationInFrames}
        fps={f.fps}
        width={f.width}
        height={f.height}
        defaultProps={defaultProps}
      />
    ))}
    {/* Обзоры: длительность считается по фрагментам */}
    <Composition
      id="review-short"
      component={ReviewShort}
      durationInFrames={reviewFrames([], REVIEW_FPS)}
      fps={REVIEW_FPS}
      width={1080}
      height={1920}
      defaultProps={reviewDefaults}
      calculateMetadata={({props}) => ({durationInFrames: reviewFrames(props.review.segments, REVIEW_FPS)})}
    />
  </>
);
