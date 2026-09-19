// Размытие на фото: выделяешь области мышкой, сервер накладывает их на оригинал.
// Области живут в лоте — их можно поправить или убрать в любой момент.
import React, {useEffect, useRef, useState} from 'react';
import {api, LotEntry, PhotoInfo, Region} from './api';

type Props = {
  lotId: string;
  path: string;
  onClose: () => void;
  onSaved: (lot: LotEntry) => void;
  onError: (e: unknown) => void;
};

type Point = {x: number; y: number};
const MIN = 0.01; // меньше 1% кадра — считаем случайным кликом
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toRegion = (a: Point, b: Point): Region =>
  [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)];
const boxStyle = ([x, y, w, h]: Region): React.CSSProperties =>
  ({left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`});

// Окно размытия: выделяешь мышкой номер или лишнее, размытие видно сразу, применяется к оригиналу на сервере
export const BlurEditor: React.FC<Props> = ({lotId, path, onClose, onSaved, onError}) => {
  const [info, setInfo] = useState<PhotoInfo | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.photoInfo(lotId, path).then((i) => { setInfo(i); setRegions(i.regions); }).catch((e) => { onError(e); onClose(); });
  }, [lotId, path, onError, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const point = (e: React.PointerEvent): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return {x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height)};
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart(point(e)); setEnd(point(e));
  };
  const move = (e: React.PointerEvent) => { if (start) setEnd(point(e)); };
  const up = () => {
    if (start && end) {
      const r = toRegion(start, end);
      if (r[2] >= MIN && r[3] >= MIN) setRegions((rs) => [...rs, r]);
    }
    setStart(null); setEnd(null);
  };

  const dirty = info !== null && JSON.stringify(regions) !== JSON.stringify(info.regions);
  const save = async () => {
    setBusy(true);
    try { onSaved(await api.blurPhoto(lotId, path, regions)); onClose(); } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal">
        <h2>Размытие <span className="muted">выдели мышкой номер или всё лишнее; × на рамке — убрать</span></h2>
        <div className="blur-stage">
          {!info ? <div className="empty">Загрузка…</div> : (
            <div ref={canvas} className="blur-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <img src={info.source} alt="" draggable={false} />
              {regions.map((r, i) => (
                <div key={i} className="blur-box" style={boxStyle(r)}>
                  <button className="icon" title="Убрать размытие" onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setRegions((rs) => rs.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {start && end && <div className="blur-box drawing" style={boxStyle(toRegion(start, end))} />}
            </div>
          )}
        </div>
        <div className="actions">
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Применяю…' : 'Применить'}</button>
          {busy && <div className="bar wait" style={{flex: 1, alignSelf: 'center'}}><div /></div>}
          <button className="btn" disabled={!regions.length || busy} onClick={() => setRegions([])}>Убрать все</button>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Отмена</button>
          <span className="muted">Областей: {regions.length}</span>
        </div>
      </div>
    </div>
  );
};
