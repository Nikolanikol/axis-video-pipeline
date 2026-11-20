import type {TextMotionId} from '../../shared/types';
// Максимальный вынос эффектов motion/text.tsx в пикселях кадра: обводка/размытие,
// подложка .3em и смещение букв .32em. Подбор использует тот же запас и без анимации.
export const motionSpace = (kind: TextMotionId, maxSize: number) => {
  if (kind === 'focus') return 24;
  if (kind === 'underline') return Math.ceil(maxSize * 0.22);
  if (kind === 'highlight') return Math.ceil(maxSize * 0.14);
  if (kind === 'label') return Math.ceil(maxSize * 0.3);
  if (kind === 'letters' || kind === 'word_steps') return Math.ceil(maxSize * 0.32);
  return 0;
};
