// Корень Remotion: каждый формат и обзор — композиция с id из реестра.
// Данные по умолчанию (lot.json, рынок mk) нужны Remotion Studio и CLI.
import React from 'react';
import {Composition} from 'remotion';
import lot from '../lot.json';
import mk from '../config/markets/mk.json';
import {FORMAT_COMPONENTS} from './formats';
import {CAROUSEL_SLIDES, Carousel} from './carousel/Carousel';
import {ReviewShort} from './reviews/ReviewShort';
import {FORMATS} from './shared/model';
import {REVIEW_FPS, reviewFrames} from './shared/timeline.js';
import type {AdProps, CarouselProps, Lot, Market, ReviewProps} from './shared/types';

// Каждый формат — отдельная композиция с id формата. В Studio — лот из lot.json на рынке Македонии.
const defaultProps: AdProps = {lot: lot as Lot, market: mk as Market};
// Заглушка для Studio: карусель всегда приходит с данными от шлюза
const carouselDefaults: CarouselProps = {
  car: {
    id: '0', source: '', brand: 'Hyundai', model: 'Equus', grade: '', trim: '',
    year: null, firstRegistered: null, mileageKm: null, displacementCc: null,
    transmission: '', fuel: '', body: '', color: '', seats: null, vin: null, plate: null,
    price: null, history: null,
    options: {comfort: [], safety: [], other: [], total: 0},
    photos: {exterior: [], interior: [], other: []},
  },
  market: mk as Market,
};
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
    {/* Карусель: кадр на слайд, на выходе не видео, а семь картинок через renderStill */}
    <Composition
      id="carousel"
      component={Carousel}
      durationInFrames={CAROUSEL_SLIDES}
      fps={1}
      width={1080}
      height={1920}
      defaultProps={carouselDefaults}
    />
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
