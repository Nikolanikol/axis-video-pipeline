// Переход между сценами ролика. «Растворение» — прежнее (0,4 с), «Вертикальная смена» — пакет
// KOK_STYLE_MOTION_PACK, остальные 8 — KOK Motion Studio V3 (lib/transition-core.js, «KOK Originals»):
// формулы и кривые оттуда, сдвиги переведены из пикселей демо-карточки в доли кадра, как советует
// сама студия («нормализовать к размеру сцены») — иначе на 1080×1920 толчок не доезжал бы до края.
//
// Как устроено: следующая сцена начинается ровно на своём кадре (склейки под темп музыки не
// сдвигаются), предыдущая живёт на overlap кадров дольше — под ней. Уходящая сцена знает свою
// долю выхода, входящая — входа; на одном кадре они равны, и два слоя складываются в один переход.
// Входящая лежит сверху (следующая Sequence), поэтому шторкам и диафрагме хватает обрезки только её.
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame} from 'remotion';
import type {SceneTransitionId} from '../../shared/types';
import {cut, smooth, STUDIO_EASE} from './easing';

/**
 * Сколько секунд сцены идут внахлёст. Растворению хватает 0,4 с (прежние 12 кадров при 30);
 * вертикальной смене — 0,75 с из пакета (быстрее два слоя читаются как рывок); переходам студии —
 * её 0,8 с по умолчанию, резкой панораме — 0,65 с, как у её группы «Motion Blur»
 */
const SECONDS: Record<SceneTransitionId, number> = {
  fade: .4, push: .75, dissolve: .8, push_side: .8, wipe_cut: .8, diagonal: .8, iris: .8, depth_zoom: .8, whip: .65, shutters: .8,
};
export const sceneOverlap = (id: SceneTransitionId, fps: number) => Math.round(fps * SECONDS[id]);

// Кривая каждого перехода — как в студии; fade — прежняя Easing.inOut(quad) Remotion
const fadeEase = Easing.inOut(Easing.quad);
const EASE: Record<SceneTransitionId, (t: number) => number> = {
  fade: (t) => fadeEase(cut(t)), push: smooth,
  dissolve: STUDIO_EASE.inOut, push_side: STUDIO_EASE.inOut, shutters: STUDIO_EASE.inOut,
  wipe_cut: STUDIO_EASE.smooth, iris: STUDIO_EASE.smooth, depth_zoom: STUDIO_EASE.smooth,
  diagonal: STUDIO_EASE.snap, whip: STUDIO_EASE.snap,
};

/**
 * Стиль слоя сцены в переходе. role: 'in' — входящая, 'out' — уходящая; raw — доля 0…1.
 * Размытие — только у «Резкой панорамы» и только на её 0,65 с: в каждом кадре оно вдвое
 * замедляло бы рендер на сервере (CLAUDE.md)
 */
export const sceneLayer = (id: SceneTransitionId, role: 'in' | 'out', raw: number): React.CSSProperties => {
  const e = EASE[id](raw);
  const inv = 1 - e;
  const blur = (px: number) => px > .05 ? {filter: `blur(${px.toFixed(2)}px)`} : {};
  switch (id) {
    // Уходящая не гаснет: входящая проявляется поверх неё, без провала в фон
    case 'fade': return role === 'in' ? {opacity: e} : {};
    // Обе сцены едут с одной скоростью: входящая снизу, уходящая вверх
    case 'push': return {transform: `translateY(${role === 'in' ? inv * 100 : -e * 100}%)`};
    case 'dissolve': return {opacity: role === 'in' ? e : 1 - e};
    case 'push_side': return {transform: `translateX(${role === 'in' ? inv * 100 : -e * 100}%)`};
    case 'wipe_cut': return role === 'in' ? {clipPath: `inset(0 ${100 * inv}% 0 0)`} : {};
    // В студии срез доходит лишь до 100% сверху и 65% снизу — в конце сцена открывалась скачком;
    // 135% доводят нижний край ровно до 100%
    case 'diagonal': return role === 'in' ? {clipPath: `polygon(0 0, ${135 * e}% 0, ${Math.max(0, 135 * e - 35)}% 100%, 0 100%)`} : {};
    case 'iris': return role === 'in' ? {clipPath: `circle(${e * 75}% at 50% 50%)`} : {};
    case 'depth_zoom': return role === 'in'
      ? {transform: `scale(${.78 + .22 * e})`, opacity: cut((e - .07) * 1.4)}
      : {transform: `scale(${1 + .56 * e})`, opacity: cut(1 - e * 1.2)};
    case 'whip': {
      const smear = 12 * Math.sin(Math.PI * e) * .8;
      return role === 'in'
        ? {transform: `translateX(${inv * 100}%)`, opacity: cut(e * 2), ...blur(smear)}
        : {transform: `translateX(${-e * 100}%)`, opacity: cut((1 - e) * 2), ...blur(smear)};
    }
    case 'shutters': return role === 'in' ? {clipPath: `inset(${50 * inv}% 0 ${50 * inv}% 0)`} : {};
  }
};

/**
 * Обёртка сцены в Sequence. frames — собственная длина сцены, overlap — нахлёст в кадрах.
 * У первой сцены нет входа, у последней — выхода
 */
export const SceneMove: React.FC<{id: SceneTransitionId; first: boolean; last: boolean; frames: number; overlap: number; children: React.ReactNode}> =
  ({id, first, last, frames, overlap, children}) => {
    const f = useCurrentFrame();
    const exiting = !last && f >= frames;
    const style = exiting ? sceneLayer(id, 'out', (f - frames) / overlap) : first ? {} : sceneLayer(id, 'in', f / overlap);
    return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  };
