// Браузерная сторона подбора. До вызова нужно дождаться выбранного начертания.
// Remotion-адаптер FitText задерживает кадр до загрузки и измерения.
import {graphemeCount} from '../../shared/textLayout.js';
export type TextFont = {family: string; weight: number; style?: string; letterSpacing?: number; letterSpacingEm?: number};

export const browserTextMeasure = (font: TextFont) => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Измерение текста недоступно');
  return (text: string, size: number) => {
    context.font = `${font.style ?? 'normal'} ${font.weight} ${size}px ${font.family}`;
    const metrics = context.measureText(text);
    // Advance может быть меньше видимой ширины курсива или букв с выносом.
    const ink = Math.max(0, metrics.actualBoundingBoxLeft) + Math.max(0, metrics.actualBoundingBoxRight);
    const count = graphemeCount(text);
    const spacing = (font.letterSpacing ?? 0) + size * (font.letterSpacingEm ?? 0);
    return {width: Math.max(metrics.width, ink) + Math.max(0, count - 1) * spacing,
      left: Math.max(0, metrics.actualBoundingBoxLeft),
      ascent: Math.max(metrics.fontBoundingBoxAscent ?? size, metrics.actualBoundingBoxAscent),
      descent: Math.max(metrics.fontBoundingBoxDescent ?? size * .25, metrics.actualBoundingBoxDescent)};
  };
};
