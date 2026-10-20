// Подача характеристик и подписей под ними (выбор «Подача данных», реестр стиля).
// Источники: «Плитки» — макет «Паспорт», «Таблетки» — «Ценник», «Колонка на подложке» — «Две колонки»,
// «Журнальная строка» — «Журнал» (KOK_VISUAL_KIT, размеры из SVG при ширине кадра 1080);
// «Крупные цифры» и «С иконками» — предложение 20.10, не из макетов. «Линии» — прежний вид.
//
// В ролике плашки входят по одной («Карточка собирается» из видеосценариев того же набора),
// кроме «Линий» — у них прежнее общее появление. На слайде карусели (animated = false) — без движения.
import React from 'react';
import type {DesignId, PlatesId} from '../../shared/types';
import {BODY, HEAD, useTheme} from '../../shared/ui';
import {fit} from '../fit';
import {easeOut} from '../motion/easing';
import {factIcon, splitDot, splitNumber} from './parse';

export type DesignFact = {label?: string; value: string};

type Props = {
  kind: PlatesId; facts: DesignFact[];
  /** Строки под фактами (пояснения к цене и т. п.): у «Колонки» они на той же подложке */
  notes: React.ReactNode[];
  width: number; dense: boolean; compact: boolean; design: DesignId;
  /** Общее появление подробностей — у «Линий» и «Колонки» оно на всём блоке */
  rest: React.CSSProperties;
  /** Время сцены и задержка подписей (ждут фото) — для появления по одной */
  animated: boolean; t: number; delay: number;
};

export const Facts: React.FC<Props> = ({kind, facts, notes, width, dense, compact, design, rest, animated, t, delay}) => {
  const C = useTheme();
  if (!facts.length) return <>{notes}</>;
  // Скругление идёт за множителем углов бренда, как у остальных плашек: «Острые» дают прямые углы и здесь
  const round = (px: number) => px * (C.style?.radius ?? 1);
  // «Карточка собирается»: сдвиг 32 px (в сценарии 24–40), проявление 0,45 с, шаг 0,1 с (0,08–0,12).
  // Один смысловой блок за раз
  const piece = (i: number): React.CSSProperties => {
    if (!animated) return {};
    const v = easeOut((t - delay - .15 - i * .1) / .45);
    return {opacity: v, transform: `translateY(${(1 - v) * 32}px)`};
  };
  const key = (fact: DesignFact, i: number) => `${i}-${fact.value}`;
  const caption = (size: number, extra: React.CSSProperties = {}): React.CSSProperties =>
    ({fontFamily: BODY, fontSize: size, color: C.grey, overflowWrap: 'anywhere', ...extra});
  const upper = {letterSpacing: '.06em', textTransform: 'uppercase'} as const;

  if (kind === 'row') {
    // «Журнал»: факты в ряд над тонкой линией; главное крупно, после « · » — подпись мелко под ним
    const cols = Math.min(3, facts.length, width >= 560 ? 3 : 2);
    return <>
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: compact ? '18px 20px' : '26px 28px',
        borderTop: `1px solid ${C.line}`, paddingTop: compact ? 18 : 26}}>
        {facts.map((fact, i) => {
          const {main, note} = splitDot(fact.value);
          return <div key={key(fact, i)} style={{...piece(i), minWidth: 0}}>
            <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fit(main, width / cols - 20, dense ? 40 : 50, 24), lineHeight: 1.1,
              color: C.white, overflowWrap: 'anywhere'}}>{main}</div>
            {(fact.label || note) && <div style={caption(compact ? 20 : 24, {marginTop: 8})}>{[fact.label, note].filter(Boolean).join(' · ')}</div>}
          </div>;
        })}
      </div>{notes}</>;
  }

  if (kind === 'big') {
    // Крупные цифры: число отдельно и очень крупно, единица и остальное — подписью под ним.
    // Факт без числа в начале («Автомат · красный») — тем же местом, но кеглем строки
    const cols = width >= 560 && facts.length > 1 ? 2 : 1;
    return <>
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: compact ? '20px 24px' : '30px 32px'}}>
        {facts.map((fact, i) => {
          const n = splitNumber(fact.value);
          const big = n ? n.number : splitDot(fact.value).main;
          const small = n ? n.rest : splitDot(fact.value).note;
          return <div key={key(fact, i)} style={{...piece(i), minWidth: 0}}>
            <div style={{fontFamily: HEAD, fontWeight: 700, lineHeight: 1, color: i === 0 ? C.copper : C.white, overflowWrap: 'anywhere',
              fontSize: fit(big, width / cols - 16, n ? (dense ? 84 : 104) : (dense ? 44 : 54), 28)}}>{big}</div>
            {(fact.label || small) && <div style={caption(compact ? 20 : 24, {...upper, marginTop: 10})}>{[fact.label, small].filter(Boolean).join(' · ')}</div>}
          </div>;
        })}
      </div>{notes}</>;
  }

  if (kind === 'icons') {
    // С иконками: значок по смыслу факта (пробег, топливо, коробка, владельцы, история) в круге
    // цвета панели, значок — цветом акцента. Набор lucide-react — тот же, что у опций карусели
    const size = compact ? 52 : 64;
    return <>
      <div style={{display: 'flex', flexDirection: 'column', gap: compact ? 14 : 20}}>
        {facts.map((fact, i) => {
          const Icon = factIcon(`${fact.label ?? ''} ${fact.value}`);
          return <div key={key(fact, i)} style={{...piece(i), display: 'flex', alignItems: 'center', gap: compact ? 16 : 22, minWidth: 0}}>
            <span style={{flex: 'none', width: size, height: size, borderRadius: round(size / 2), background: C.panel, color: C.copper,
              display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Icon size={size * .5} strokeWidth={1.9} /></span>
            <div style={{minWidth: 0}}>
              {fact.label && <div style={caption(compact ? 20 : 23, {marginBottom: 4})}>{fact.label}</div>}
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: fit(fact.value, width - size - 24, dense ? 40 : 48, 26), lineHeight: 1.15,
                color: C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
            </div>
          </div>;
        })}
      </div>{notes}</>;
  }

  if (kind === 'tiles') {
    // «Паспорт»: сетка 2×2, плашка 464×145 со скруглением 24. В узкой колонке — одна в ряд
    const cols = width >= 560 ? 2 : 1;
    return <>
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: compact ? 14 : 24}}>
        {facts.map((fact, i) => <div key={key(fact, i)} style={{...piece(i), background: C.panel, borderRadius: round(24),
          padding: compact ? '16px 20px' : '22px 24px', minWidth: 0}}>
          {fact.label && <div style={caption(compact ? 20 : 23, {...upper, marginBottom: 8})}>{fact.label}</div>}
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fit(fact.value, width / cols - 48, dense ? 44 : 56, 26), lineHeight: 1.1,
            color: C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
        </div>)}
      </div>{notes}</>;
  }

  if (kind === 'pills') {
    // «Ценник»: короткие «таблетки» высотой 54 и кегль 27 — подписи, а не крупные данные
    return <>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: compact ? 10 : 14}}>
        {facts.map((fact, i) => <span key={key(fact, i)} style={{...piece(i), background: C.panel, borderRadius: round(27),
          padding: compact ? '10px 20px' : '13px 26px', fontFamily: BODY, fontSize: compact ? 25 : 30, lineHeight: 1.2, color: C.white,
          maxWidth: '100%', overflowWrap: 'anywhere'}}>
          {fact.label ? <span style={{color: C.grey}}>{fact.label} </span> : null}{fact.value}</span>)}
      </div>{notes}</>;
  }

  if (kind === 'column') {
    // «Две колонки»: данные и подписи под ними — на одной подложке; значение крупно, первое — акцентом
    return <div style={{...rest, background: C.panel, borderRadius: round(24), padding: compact ? '22px 26px' : '32px 32px',
      display: 'flex', flexDirection: 'column', gap: compact ? 16 : 26}}>
      {facts.map((fact, i) => <div key={key(fact, i)} style={piece(i)}>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fit(fact.value, width - 64, dense ? 50 : 62, 28), lineHeight: 1.08,
          color: i === 0 ? C.copper : C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
        {fact.label && <div style={caption(compact ? 18 : 21, {...upper, marginTop: 6})}>{fact.label}</div>}
      </div>)}
      {notes}
    </div>;
  }

  // «Линии» — прежний вид: значение и тонкая линия под ним; в «Каталоге» подпись слева в той же строке
  return <>{facts.map((fact, i) => <div key={key(fact, i)} style={{...rest, borderBottom: `1px solid ${C.line}`, paddingBottom: compact ? 14 : 22,
    ...(design === 'catalog' ? {display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24} : {})}}>
    {fact.label && <div style={{fontFamily: BODY, fontSize: compact ? 25 : 29, color: C.grey, marginBottom: design === 'catalog' ? 0 : 7}}>{fact.label}</div>}
    <div style={{fontFamily: design === 'editorial' ? HEAD : BODY, fontWeight: 500,
      fontSize: fit(fact.value, width * (design === 'catalog' && fact.label ? .57 : 1), dense ? 42 : 54, 28),
      lineHeight: 1.18, color: C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
  </div>)}{notes}</>;
};
