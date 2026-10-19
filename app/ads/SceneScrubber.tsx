// Панель плеера под превью (образец владельца 20.10): круглая ▶ / пауза, время «00:02 / 00:15»,
// полоса перемотки, «Смотреть целиком». Нажать на полосу или тянуть — перемотка (плеер на паузе),
// под пальцем — сцена и время («Галерея · 0:06»). Сцены для правки — в панели «Текст».
// Кадр приходит подпиской (listen), а не пропсом: панель перерисовывается сама, без всего экрана.
import React, {useEffect, useRef, useState} from 'react';
import {Maximize2, Pause, Play} from 'lucide-react';
import type {FormatMeta} from '../../src/shared/types';

type Props = {
  format: FormatMeta;
  /** Подписка на кадр плеера; возвращает отписку */
  listen: (fn: (frame: number) => void) => () => void;
  seekFrame: (frame: number) => void;
  playing: boolean;
  onToggle: () => void;
  /** «Смотреть целиком»; нет — кнопки нет (режим просмотра) */
  onExpand?: () => void;
};

const clock = (frame: number, fps: number) => {
  const s = Math.max(0, Math.floor(frame / fps));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const SceneScrubber: React.FC<Props> = ({format, listen, seekFrame, playing, onToggle, onExpand}) => {
  const [frame, setFrame] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  useEffect(() => listen(setFrame), [listen]);

  const total = format.durationInFrames;
  const at = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * (total - 1));
  };
  const sceneAt = (f: number) => [...format.scenes].reverse().find((s) => f >= s.from) ?? format.scenes[0];
  const shown = drag ?? frame;
  // Нажали — сразу перемотка в эту точку; тянем — следом за пальцем; отпустили — стоим на кадре
  const seek = (x: number) => { const f = at(x); setDrag(f); seekFrame(f); };
  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); active.current = true; seek(e.clientX); };
  const move = (e: React.PointerEvent) => { if (active.current) seek(e.clientX); };
  const up = () => { active.current = false; setDrag(null); };
  // С клавиатуры: стрелки — ±1 с, Home / End — начало и конец
  const key = (e: React.KeyboardEvent) => {
    const go = (f: number) => { e.preventDefault(); seekFrame(Math.min(total - 1, Math.max(0, f))); };
    if (e.key === 'ArrowRight') go(frame + format.fps);
    else if (e.key === 'ArrowLeft') go(frame - format.fps);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(total - 1);
  };
  const pct = `${(shown / Math.max(1, total - 1)) * 100}%`;
  const scene = sceneAt(shown);

  return <div className="mle-bar">
    <button type="button" className="mle-bar-play" aria-label={playing ? 'Пауза' : 'Смотреть'} onClick={onToggle}>
      {playing ? <Pause size={18} /> : <Play size={18} />}</button>
    <span className="mle-bar-time">{clock(shown, format.fps)} / {clock(total, format.fps)}</span>
    <div className={`mle-scrub${drag !== null ? ' dragging' : ''}`} role="slider" tabIndex={0}
      aria-label="Перемотка ролика" aria-valuemin={0} aria-valuemax={total - 1} aria-valuenow={shown}
      aria-valuetext={`${scene.title}, ${clock(shown, format.fps)}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      <div className="mle-scrub-track" ref={track}>
        <i className="mle-scrub-fill" style={{width: pct}} />
        <b className="mle-scrub-knob" style={{left: pct}} />
      </div>
      {drag !== null && <span className="mle-scrub-tip" style={{left: pct}}>{scene.title} · {clock(drag, format.fps)}</span>}
    </div>
    {onExpand && <button type="button" className="mle-bar-icon" aria-label="Смотреть целиком" onClick={onExpand}><Maximize2 size={18} /></button>}
  </div>;
};
