// Таймлайн исходника: видео, полоса миниатюр с фрагментами, отметки начала/конца.
// Клавиши: пробел — пуск/пауза, ←/→ — 0,5 с (с Shift — кадр), I — начало, O — конец, Enter — добавить фрагмент.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {REVIEW_FPS} from '../../src/shared/timeline.js';
import type {ReviewSegment, ReviewSource} from '../../src/shared/types';

export type Seek = (time: number, playFor?: number) => void;

type Props = {
  source: ReviewSource;
  segments: ReviewSegment[];
  selected: ReviewSegment | null;
  onSelect: (id: string) => void;
  onAdd: (start: number, duration: number) => void;
  onUpdate: (id: string, patch: Partial<ReviewSegment>) => void;
  seekRef: React.MutableRefObject<Seek | null>;
};

const THUMB_W = 48;
// Шаг стрелкой — доля темпа монтажа; с Shift — ровно один кадр ролика.
// Частоту берём из настроек обзора: с числом «на глаз» Shift перескакивал бы через кадры
const STEP = 0.5;
const FRAME = 1 / REVIEW_FPS;
export const sec = (v: number) => `${v.toFixed(1).replace('.', ',')} с`;

export const thumbUrl = (source: ReviewSource, time: number) => {
  const t = source.thumbs;
  if (!t?.count) return undefined;
  const i = Math.min(t.count, Math.max(1, Math.floor(time * t.fps) + 1));
  return `${t.base}/${String(i).padStart(4, '0')}.jpg`;
};

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

export const Scrubber: React.FC<Props> = ({source, segments, selected, onSelect, onAdd, onUpdate, seekRef}) => {
  const video = useRef<HTMLVideoElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const stopAt = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const duration = source.duration ?? 0;
  const fps = source.thumbs?.fps ?? 2;
  const pxPerSec = THUMB_W * fps;
  const count = source.thumbs?.count ?? 0;

  // Последний кадр не отдаём: встав ровно на длину записи, <video> показывает чёрное
  const clampTime = useCallback((t: number) => Math.min(Math.max(0, t), Math.max(0, duration - FRAME)), [duration]);

  const seek: Seek = useCallback((t, playFor) => {
    const v = video.current;
    if (!v) return;
    const target = clampTime(t);
    v.currentTime = target;
    setTime(target);
    stopAt.current = playFor ? target + playFor : null;
    if (playFor) v.play().catch(() => {});
  }, [clampTime]);
  seekRef.current = seek;

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    stopAt.current = null;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  // Плавный маркер во время воспроизведения + остановка в конце фрагмента
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        setTime(v.currentTime);
        if (stopAt.current !== null && v.currentTime >= stopAt.current) { v.pause(); stopAt.current = null; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Маркер всегда в поле зрения
  useEffect(() => {
    const s = strip.current;
    if (!s) return;
    const x = time * pxPerSec;
    if (x < s.scrollLeft + 20 || x > s.scrollLeft + s.clientWidth - 20) s.scrollLeft = Math.max(0, x - s.clientWidth / 3);
  }, [time, pxPerSec]);

  // Фрагмент из отметок. Нет отметки начала — берём текущее место; нет конца (или он стоит
  // раньше начала, что бывает при перестановке отметок) — даём две секунды по умолчанию
  const add = useCallback(() => {
    const start = markIn ?? time;
    const end = markOut !== null && markOut > start + 0.2 ? markOut : Math.min(duration, start + 2);
    onAdd(start, Math.max(0.5, end - start));
    setMarkIn(null);
    setMarkOut(null);
  }, [markIn, markOut, time, duration, onAdd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Горячие клавиши не должны срабатывать, пока человек пишет в поле: пробел в названии
      // обзора не обязан запускать видео. Сочетания с Cmd/Ctrl/Alt оставляем браузеру
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); toggle(); }
      else if (k === 'arrowleft') { e.preventDefault(); seek(time - (e.shiftKey ? FRAME : STEP)); }
      else if (k === 'arrowright') { e.preventDefault(); seek(time + (e.shiftKey ? FRAME : STEP)); }
      // Буквы дублируются в русской раскладке: переключать её ради отметки — лишнее движение
      else if (k === 'i' || k === 'ш') setMarkIn(time);
      else if (k === 'o' || k === 'щ') setMarkOut(time);
      else if (k === 'enter') { e.preventDefault(); add(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [time, toggle, seek, add]);

  const onStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const s = strip.current!;
    const x = e.clientX - s.getBoundingClientRect().left + s.scrollLeft;
    seek(x / pxPerSec);
  };

  return (
    <div className="scrubber">
      <div className="scrub-top">
        <video
          ref={video}
          src={source.proxy}
          muted={muted}
          playsInline
          preload="auto"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); setTime(video.current?.currentTime ?? 0); }}
          onSeeked={() => setTime(video.current?.currentTime ?? 0)}
        />
        <div className="scrub-side">
          <div className="scrub-time">{sec(time)} <span className="muted">/ {sec(duration)}</span></div>
          <div className="btn-row">
            <button className="btn" title="−0,5 с (←)" onClick={() => seek(time - STEP)}>−0,5</button>
            <button className="btn primary" title="Пробел" onClick={toggle}>{playing ? 'Пауза' : 'Пуск'}</button>
            <button className="btn" title="+0,5 с (→)" onClick={() => seek(time + STEP)}>+0,5</button>
            <button className="btn ghost" onClick={() => setMuted((m) => !m)}>{muted ? 'Звук выкл' : 'Звук вкл'}</button>
          </div>
          <div className="btn-row">
            <button className="btn" title="I" onClick={() => setMarkIn(time)}>[ Начало{markIn !== null && `: ${sec(markIn)}`}</button>
            <button className="btn" title="O" onClick={() => setMarkOut(time)}>Конец{markOut !== null && `: ${sec(markOut)}`} ]</button>
          </div>
          <button className="btn primary" title="Enter" onClick={add}>+ Фрагмент {markIn !== null ? 'из отметок' : 'отсюда (2 с)'}</button>
          {selected && (
            <div className="scrub-selected">
              <span className="muted">Выбран: {selected.note || selected.caption || 'фрагмент'}</span>
              <div className="btn-row">
                <button className="btn" onClick={() => onUpdate(selected.id, {start: Math.min(time, Math.max(0, duration - selected.duration))})}>Сдвинуть сюда</button>
                <button className="btn" disabled={time <= selected.start + 0.1}
                  onClick={() => onUpdate(selected.id, {duration: Math.round((time - selected.start) * 100) / 100})}>Конец здесь</button>
                <button className="btn ghost" onClick={() => seek(selected.start, selected.duration)}>▶ Фрагмент</button>
              </div>
            </div>
          )}
          <div className="hint">Пробел — пуск · ←/→ — 0,5 с · Shift — кадр · I/O — отметки · Enter — добавить</div>
        </div>
      </div>

      <div className="strip" ref={strip} onClick={onStripClick}>
        <div className="strip-inner" style={{width: Math.max(count * THUMB_W, duration * pxPerSec)}}>
          {Array.from({length: count}, (_, i) => (
            <img key={i} src={`${source.thumbs!.base}/${String(i + 1).padStart(4, '0')}.jpg`} alt="" style={{left: i * THUMB_W, width: THUMB_W}} draggable={false} />
          ))}
          {segments.map((s, i) => (
            <div
              key={s.id}
              className={`strip-seg kind-${s.kind}${s.id === selected?.id ? ' selected' : ''}`}
              style={{left: s.start * pxPerSec, width: Math.max(4, s.duration * pxPerSec)}}
              onClick={(e) => { e.stopPropagation(); onSelect(s.id); seek(s.start); }}
              title={s.note || s.caption}
            >
              <span>{i + 1}</span>
            </div>
          ))}
          {markIn !== null && <div className="strip-mark in" style={{left: markIn * pxPerSec}} />}
          {markOut !== null && <div className="strip-mark out" style={{left: markOut * pxPerSec}} />}
          <div className="strip-head" style={{left: time * pxPerSec}} />
        </div>
      </div>
    </div>
  );
};
