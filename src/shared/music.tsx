// Фоновая музыка: трек из реестра, подгонка темпа под формат, затухание в конце.
import React from 'react';
import {Audio, interpolate, staticFile, useVideoConfig} from 'remotion';
import {findTrack} from './model';
import type {Music} from './types';
import {clamp} from './ui';

// Кодек AAC в рендере добавляет ~48 мс задержки (измерено), компенсируем, чтобы доля совпадала со склейкой
export const AUDIO_LATENCY_SEC = 0.048;
const FADE_IN = 12;
const FADE_OUT = 30;

// Скорость трека, при которой его доли совпадают с темпом монтажа формата
export const tempoRate = (trackBpm: number, formatBpm: number) => formatBpm / trackBpm;

// Музыка на весь ролик: плавно входит и затухает к концу, темп подогнан под формат
export const BackgroundMusic: React.FC<{music?: Music; bpm: number}> = ({music, bpm}) => {
  const {fps, durationInFrames} = useVideoConfig();
  // Музыка убрана из настроек (авторские права), поэтому трека обычно нет — тогда просто
  // ничего не рисуем. Беззвучную дорожку в mp4 добавляет сам рендер (enforceAudioTrack),
  // так что ролик без музыки всё равно не превращается в GIF. Механизм оставлен на случай,
  // если появится лицензионная музыка.
  const track = findTrack(music?.track);
  if (!track) return null;
  const v = Math.min(1, Math.max(0, music?.volume ?? 0.8)) * track.gain;
  const rate = tempoRate(track.bpm, bpm);
  return (
    <Audio
      src={staticFile(track.file)}
      trimBefore={(track.startSec + AUDIO_LATENCY_SEC * rate) * fps}
      playbackRate={rate}
      volume={(f) => interpolate(f, [0, FADE_IN, durationInFrames - FADE_OUT, durationInFrames - 1], [0, v, v, 0], clamp)}
    />
  );
};
