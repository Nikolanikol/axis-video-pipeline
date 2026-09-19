// Список фрагментов обзора: тип, что в кадре, старт/длина/скорость, плашка
import React from 'react';
import {MAX_CAPTION, SPEEDS, segmentSeconds} from '../../src/shared/timeline.js';
import type {ReviewSegment, ReviewSource} from '../../src/shared/types';
import {sec, thumbUrl} from './Scrubber';

type Props = {
  segments: ReviewSegment[];
  source: ReviewSource;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (segments: ReviewSegment[]) => void;
  onPlay: (seg: ReviewSegment) => void;
};

const KIND_LABEL: Record<ReviewSegment['kind'], string> = {hook: 'Хук', caption: 'Плашка', final: 'Финал'};
const num = (v: string) => Number(v.replace(',', '.'));

export const SegmentList: React.FC<Props> = ({segments, source, selectedId, onSelect, onChange, onPlay}) => {
  const duration = source.duration ?? 0;
  const update = (id: string, patch: Partial<ReviewSegment>) => onChange(segments.map((s) => (s.id === id ? {...s, ...patch} : s)));
  const move = (i: number, d: number) => {
    const next = [...segments];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    onChange(next);
  };

  if (!segments.length) return <div className="empty small">Фрагментов пока нет: отметь их на таймлайне или разложи шаблон.</div>;

  return (
    <div className="segments">
      {segments.map((s, i) => {
        const out = segmentSeconds(s);
        const over = s.start + s.duration > duration + 0.05;
        return (
          <div key={s.id} className={`seg${s.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(s.id)}>
            <div className="seg-head">
              <span className="seg-num">{i + 1}</span>
              <img src={thumbUrl(source, s.start)} alt="" onClick={(e) => { e.stopPropagation(); onPlay(s); }} title="Проиграть фрагмент" />
              <select value={s.kind} onChange={(e) => update(s.id, {kind: e.target.value as ReviewSegment['kind']})}>
                {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input className="seg-note" value={s.note ?? ''} placeholder="что в кадре" onChange={(e) => update(s.id, {note: e.target.value})} />
              <button className="icon" title="Выше" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, -1); }}>↑</button>
              <button className="icon" title="Ниже" disabled={i === segments.length - 1} onClick={(e) => { e.stopPropagation(); move(i, 1); }}>↓</button>
              <button className="icon" title="Удалить" onClick={(e) => { e.stopPropagation(); onChange(segments.filter((x) => x.id !== s.id)); }}>×</button>
            </div>
            <div className="seg-times">
              <label>старт <input type="number" min={0} max={duration} step={0.1} value={s.start}
                onChange={(e) => update(s.id, {start: Math.max(0, num(e.target.value) || 0)})} /> с</label>
              <label>длина <input type="number" min={0.1} max={duration} step={0.1} value={s.duration}
                onChange={(e) => update(s.id, {duration: Math.max(0.1, num(e.target.value) || 0.1)})} /> с</label>
              <label>скорость
                <select value={s.speed} onChange={(e) => update(s.id, {speed: Number(e.target.value)})}>
                  {SPEEDS.map((v) => <option key={v} value={v}>{v}×</option>)}
                </select>
              </label>
              <span className={over ? 'seg-out warn' : 'seg-out'}>→ {sec(out)}{over ? ' · за концом видео' : ''}</span>
            </div>
            {s.kind === 'caption' && (
              <div className="seg-caption">
                <input value={s.caption ?? ''} maxLength={MAX_CAPTION} placeholder="плашка (пусто — без плашки)"
                  onChange={(e) => update(s.id, {caption: e.target.value})} />
                <label className="check"><input type="checkbox" checked={Boolean(s.accent)} onChange={(e) => update(s.id, {accent: e.target.checked})} /> медью</label>
              </div>
            )}
            {s.kind === 'hook' && <div className="hint">Марка, модель и год — из привязанного лота</div>}
            {s.kind === 'final' && <div className="hint">Цена до порта и контакты — из лота и настроек рынка</div>}
          </div>
        );
      })}
    </div>
  );
};
