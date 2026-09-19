// Выбор фонового трека и громкости. По умолчанию — как в рынке; можно свой или «без музыки».
import React from 'react';
import {TRACKS} from '../src/shared/model';
import type {Music} from '../src/shared/types';
import {Field} from './LotForm';

const NONE = '__none';
const INHERIT = '';

type Props = {
  value: Music | undefined;
  onChange: (music: Music | undefined) => void;
  // Для лота: настройки рынка, которые действуют, пока в лоте ничего не выбрано
  inherited?: Music;
};

// Выбор фонового трека и громкости. В лоте пустой выбор = «как в рынке».
export const MusicFields: React.FC<Props> = ({value, onChange, inherited}) => {
  const forLot = inherited !== undefined;
  const selected = value?.track === null ? NONE : value?.track ?? (forLot ? INHERIT : NONE);
  const effective = value?.track !== undefined ? value.track : inherited?.track;
  const track = TRACKS.find((t) => t.id === effective);
  const volume = value?.volume ?? inherited?.volume ?? 0.8;
  const inheritedTitle = inherited?.track ? TRACKS.find((t) => t.id === inherited.track)?.title ?? inherited.track : 'без музыки';

  const set = (patch: Partial<Music>) => {
    const next = {...value, ...patch};
    if (next.track === undefined) delete next.track;
    if (next.volume === undefined) delete next.volume;
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div className="music">
      <div className="row">
        <Field label="Трек">
          <select value={selected} onChange={(e) => {
            const v = e.target.value;
            set({track: v === INHERIT ? undefined : v === NONE ? null : v});
          }}>
            {forLot && <option value={INHERIT}>Как в рынке: {inheritedTitle}</option>}
            <option value={NONE}>Без музыки</option>
            {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>)}
          </select>
        </Field>
        <Field label={`Громкость: ${Math.round(volume * 100)}%`} hint={forLot && value?.volume !== undefined
          ? <button className="link" onClick={(e) => { e.preventDefault(); set({volume: undefined}); }}>как в рынке</button>
          : undefined}>
          <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={!track}
            onChange={(e) => set({volume: Number(e.target.value) / 100})} />
        </Field>
      </div>
      {track && (
        <div className="track-info">
          {track.source} · лицензия:{' '}
          {track.url ? <a href={track.url} target="_blank" rel="noreferrer">{track.license}</a> : track.license}
        </div>
      )}
    </div>
  );
};
