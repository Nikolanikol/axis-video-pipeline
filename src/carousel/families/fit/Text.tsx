// Области принадлежат конкретному семейству; здесь только начертание и измеренный вывод.
import React from 'react';
import {FitText} from '../../../design/text/FitText';
import {useTheme} from '../../../shared/ui';

type Props = {
  text?: string;
  field?: string;
  w: number;
  h: number;
  max: number;
  min?: number;
  lines?: number;
  color: string;
  body?: boolean;
  weight?: number;
  italic?: boolean;
  tracking?: number;
  trackingEm?: number;
  nowrap?: boolean;
  align?: 'start' | 'middle' | 'end';
  style?: React.CSSProperties;
  outline?: {color: string; width: number};
};
export const Text: React.FC<Props> = ({
  text = '',
  field = 'label',
  w,
  h,
  max,
  min = 32,
  lines = 3,
  color,
  body,
  weight = 700,
  italic,
  tracking,
  trackingEm,
  nowrap,
  align,
  style,
  outline,
}) => {
  const theme = useTheme();
  return text ? (
    <FitText
      text={text}
      field={field}
      box={{
        width: w,
        height: Math.max(1, h),
        maxSize: Math.max(max, min),
        minSize: min,
        maxLines: nowrap ? 1 : lines,
        wrap: !nowrap,
        breakWords: !nowrap,
        lineHeight: 1.1,
      }}
      font={{
        family: body ? theme.fonts.body : theme.fonts.head,
        weight,
        style: italic ? 'italic' : undefined,
        letterSpacing: tracking,
        letterSpacingEm: trackingEm,
      }}
      fontUrl={theme.fonts.url}
      color={color}
      align={align}
      style={style}
      outline={outline}
      fallback={null}
    />
  ) : null;
};
export const At: React.FC<{x: number; y: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
  x,
  y,
  children,
  style,
}) => <div style={{position: 'absolute', left: x, top: y, boxSizing: 'border-box', ...style}}>{children}</div>;
