import React from 'react';
import {Logo, useTheme} from '../../shared/ui';
import {contrast} from '../../shared/contrast.js';
import {FitText, useFitScope} from './FitText';

// Картинка сохраняет настройки подложки. Название вместо картинки получает свою
// измеряемую область и сплошную подложку: цвет акцента может сливаться с фото или фоном.
export const FitLogo: React.FC<{width: number; height: number; on: string}> = ({width, height, on}) => {
  const theme = useTheme(),
    scope = useFitScope();
  if (!scope.enabled || theme.assets?.logoHorizontal !== '')
    return (
      <Logo
        asset="logoHorizontal"
        width={width}
        height={height}
        on={on}
        style={{textAlign: 'left', objectPosition: 'left'}}
      />
    );
  const ink = contrast(theme.white, on) >= contrast(theme.bg, on) ? theme.white : theme.bg;
  return (
    <div style={{width, height, background: on, padding: '3px 6px', boxSizing: 'border-box'}}>
      <FitText
        text={(theme.name || '').trim().toLocaleUpperCase(scope.language)}
        field="brand"
        box={{
          width: width - 12,
          height: height - 6,
          maxSize: height * 0.72,
          minSize: 14,
          maxLines: 2,
          lineHeight: 1.05,
          wrap: true,
          breakWords: true,
        }}
        font={{family: theme.fonts.head, weight: 700, letterSpacingEm: 0.04}}
        fontUrl={theme.fonts.url}
        color={ink}
        fallback={null}
      />
    </div>
  );
};
