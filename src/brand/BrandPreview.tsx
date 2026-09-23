// Образец бренда: один кадр, на котором видны все настройки разом.
//
// Зачем отдельная композиция, если превью ролика уже есть: ролик показывает бренд по частям
// и во времени — акцент мелькнул на второй секунде, плашка на седьмой. Подбирать по нему
// цвета мучительно. Здесь всё собрано на одном экране: акцент, фон, плашки, линии, основной
// и второстепенный текст, оба шрифта, логотип.
//
// Композиция из одного кадра и без единой анимации: это образец, а не ролик.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {themeOf} from '../shared/model';
import type {Theme} from '../shared/types';
import {BODY, CopperText, HEAD, ThemeProvider, useAsset, useTheme} from '../shared/ui';
import {Img} from 'remotion';

const PAD = 96;

/** Подпись к образцу: мелко, второстепенным цветом — чтобы не спорить с самим образцом */
const Label: React.FC<{children: React.ReactNode}> = ({children}) => {
  const C = useTheme();
  return (
    <div style={{
      fontFamily: BODY, fontWeight: 600, fontSize: 24, letterSpacing: 5,
      textTransform: 'uppercase', color: C.grey, marginBottom: 18,
    }}>{children}</div>
  );
};

const Sampler: React.FC = () => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{background: C.bg, padding: PAD, display: 'flex', flexDirection: 'column', gap: 46}}>
      {/* Шапка — как на слайдах карусели */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontWeight: 600,
        fontSize: 30, letterSpacing: 7, textTransform: 'uppercase', color: C.grey,
      }}>
        <span>{C.name}</span><span>01 / 07</span>
      </div>

      <div>
        <Label>акцент и заголовок</Label>
        <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
          textTransform: 'uppercase'}}>Vehicle history</CopperText>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 104, lineHeight: 1.02,
          color: C.white, textTransform: 'uppercase', marginTop: 14}}>Hyundai Equus</div>
        <CopperText style={{fontFamily: HEAD, fontWeight: 600, fontSize: 56, lineHeight: 1.2}}>
          VS500 Prestige
        </CopperText>
      </div>

      <div>
        <Label>текст и второстепенный текст</Label>
        <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 40, color: C.white, lineHeight: 1.3}}>
          Ventilated seats, head-up display
        </div>
        <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.grey, marginTop: 10}}>
          2015 · Gasoline · Automatic · 239,601 km
        </div>
      </div>

      <div>
        <Label>плашки и линии</Label>
        <div style={{display: 'flex', gap: 22}}>
          {[['4', 'Insurance claims'], ['7', 'Owner changes']].map(([v, l]) => (
            <div key={l} style={{
              flex: 1, background: C.panel, borderRadius: 18, border: `1px solid ${C.line}`, padding: '30px 28px',
            }}>
              <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 80, lineHeight: 1, color: C.copperLight}}>{v}</div>
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 24, letterSpacing: 3,
                textTransform: 'uppercase', color: C.grey, marginTop: 12}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop: 26}}>
          {['Head-up display', 'Adaptive cruise control'].map((t, i) => (
            <div key={t} style={{display: 'flex', alignItems: 'center', gap: 20, padding: '22px 0',
              borderTop: i ? `1px solid ${C.line}` : undefined}}>
              <span style={{width: 10, height: 10, borderRadius: 5, background: C.copper}} />
              <span style={{fontFamily: BODY, fontWeight: 500, fontSize: 36, color: C.white}}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>рамка акцентом</Label>
        <div style={{border: `3px solid ${C.copper}`, borderRadius: 22, padding: '38px 40px', textAlign: 'center'}}>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 26, letterSpacing: 6,
            textTransform: 'uppercase', color: C.grey}}>Price in Korea</div>
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 96, lineHeight: 1.1, color: C.white}}>$6,905</div>
        </div>
      </div>

      <div style={{marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between'}}>
        <div>
          <Label>логотип</Label>
          <Img src={useAsset('logoStacked')} style={{height: 150}} />
        </div>
        {/* Сами цвета плитками: по ним видно, что задано, даже если на образце цвет нигде не виден */}
        <div style={{display: 'flex', gap: 12}}>
          {(['bg', 'panel', 'line', 'grey', 'white', 'copper'] as const).map((k) => (
            <div key={k} style={{textAlign: 'center'}}>
              <div style={{width: 74, height: 74, borderRadius: 12, background: C[k], border: `1px solid ${C.line}`}} />
              <div style={{fontFamily: BODY, fontSize: 18, color: C.grey, marginTop: 8}}>{k}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BrandPreview: React.FC<{theme?: Partial<Theme>}> = ({theme}) => (
  <ThemeProvider value={themeOf(theme)}>
    <Sampler />
  </ThemeProvider>
);
