// Форма лота: авто, характеристики, цена, фото. Автосохранение — в LotTool.
// Поле Field отсюда переиспользуют остальные формы.
import React, {useCallback, useRef, useState} from 'react';
import {fmt, priceUsd} from '../src/shared/model';
import type {FormatMeta, Market} from '../src/shared/types';
import {api, LotEntry} from './api';
import {BlurEditor} from './BlurEditor';

type Props = {
  lot: LotEntry;
  market: Market;
  format: FormatMeta;
  onChange: (patch: Partial<LotEntry>) => void;
  onPhotos: (lot: LotEntry) => void;
  onError: (e: unknown) => void;
};

const SPEC_MAX = 26; // длиннее — строка упрётся в правую безопасную зону

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[\s,]/g, '')));

export const Field: React.FC<{label: string; hint?: React.ReactNode; children: React.ReactNode; wide?: boolean}> = ({label, hint, children, wide}) => (
  <label className={wide ? 'field wide' : 'field'}>
    <span className="label">{label}</span>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </label>
);

export const LotForm: React.FC<Props> = ({lot, market, format, onChange, onPhotos, onError}) => {
  const car = priceUsd(lot);
  const freight = lot.freightUsd ?? market.freightUsd;
  const port = lot.port ?? market.port;
  const setSpec = (i: number, value: string) => onChange({specs: lot.specs.map((s, j) => (j === i ? value : s))});

  return (
    <div className="form">
      <h2>Авто</h2>
      <div className="row">
        <Field label="Марка"><input value={lot.brand} placeholder="Audi" onChange={(e) => onChange({brand: e.target.value})} /></Field>
        <Field label="Модель"><input value={lot.model} placeholder="A6" onChange={(e) => onChange({model: e.target.value})} /></Field>
      </div>
      <div className="row">
        <Field label="Версия"><input value={lot.trim ?? ''} placeholder="35 TDI" onChange={(e) => onChange({trim: e.target.value})} /></Field>
        <Field label="Год"><input type="number" value={lot.year ?? ''} onChange={(e) => onChange({year: Number(e.target.value)})} /></Field>
      </div>

      <h2>Характеристики <span className="muted">на языке постов</span></h2>
      {lot.specs.map((s, i) => (
        <div className="spec" key={i}>
          <input value={s} placeholder={['78 498 км', 'Дизел · автоматик', 'Кожен ентериер', 'Шибер · навигација'][i] ?? ''}
            onChange={(e) => setSpec(i, e.target.value)} />
          <span className={s.length > SPEC_MAX ? 'count over' : 'count'}>{s.length}</span>
          <button className="icon" title="Убрать строку" onClick={() => onChange({specs: lot.specs.filter((_, j) => j !== i)})}>×</button>
        </div>
      ))}
      {lot.specs.length < 5 && <button className="btn ghost" onClick={() => onChange({specs: [...lot.specs, '']})}>+ строка</button>}

      <h2>Цена</h2>
      <div className="row">
        <Field label="Цена авто, 만원" hint={lot.carPriceKrw ? `${fmt(lot.carPriceKrw)} ₩` : 'как на Encar и в аукционном листе'}>
          <input inputMode="decimal" value={lot.carPriceKrw ? String(lot.carPriceKrw / 10000) : ''}
            onChange={(e) => { const v = num(e.target.value); onChange({carPriceKrw: v === null || Number.isNaN(v) ? null : Math.round(v * 10000)}); }} />
        </Field>
        <Field label="Курс, ₩ за $1">
          <input inputMode="decimal" value={lot.krwPerUsd ?? ''} placeholder="спросить"
            onChange={(e) => { const v = num(e.target.value); onChange({krwPerUsd: v === null || Number.isNaN(v) ? null : v}); }} />
        </Field>
        <Field label="или сразу, $" hint="если заполнено — главнее ₩">
          <input inputMode="decimal" value={lot.carPriceUsd ?? ''}
            onChange={(e) => { const v = num(e.target.value); onChange({carPriceUsd: v === null || Number.isNaN(v) ? null : v}); }} />
        </Field>
      </div>
      <div className={car === null ? 'total warn' : 'total'}>
        {car === null
          ? 'Цены нет — в ролике будет заглушка «XX XXX $»'
          : <>Авто ${fmt(car)} + фрахт ${fmt(freight)} = <b>{fmt(car + freight)} $</b> до {port}</>}
      </div>

      <h2>Фото <span className="muted">перетаскивай, чтобы поменять порядок</span></h2>
      <Photos lot={lot} roles={format.photoRoles} onChange={onChange} onPhotos={onPhotos} onError={onError} />

      <Field label="Заметка" hint="в ролик не попадает" wide>
        <textarea rows={2} value={lot.note ?? ''} placeholder="источник, пометки: аукцион, номер лота, «демо»…"
          onChange={(e) => onChange({note: e.target.value})} />
      </Field>

      <details className="overrides">
        <summary>Переопределить для этого лота</summary>
        <div className="row">
          <Field label="Фрахт, $" hint={`по профилю: ${fmt(market.freightUsd)}`}>
            <input inputMode="decimal" value={lot.freightUsd ?? ''} placeholder={String(market.freightUsd)}
              onChange={(e) => { const v = num(e.target.value); onChange({freightUsd: v === null || Number.isNaN(v) ? undefined : v}); }} />
          </Field>
          <Field label="WhatsApp" hint={lot.whatsapp === null ? 'номер скрыт' : `по профилю: ${market.whatsapp ?? '—'}`}>
            <input value={lot.whatsapp ?? ''} placeholder={market.whatsapp ?? ''} disabled={lot.whatsapp === null}
              onChange={(e) => onChange({whatsapp: e.target.value || undefined})} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={lot.whatsapp === null} onChange={(e) => onChange({whatsapp: e.target.checked ? null : undefined})} />
          Не показывать WhatsApp в этом ролике
        </label>
      </details>
    </div>
  );
};

const Photos: React.FC<Pick<Props, 'lot' | 'onChange' | 'onPhotos' | 'onError'> & {roles: string[]}> = ({lot, roles, onChange, onPhotos, onError}) => {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const own = `/data/lots/${lot.id}/photos/`;
  const blurCount = (p: string) => lot.blur?.[p.slice(own.length).replace(/(~\d+)?\.jpg$/, '')]?.length ?? 0;

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setBusy(true);
    try { onPhotos(await api.uploadPhotos(lot.id, images)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const remove = async (path: string) => {
    try { onPhotos(await api.deletePhoto(lot.id, path)); } catch (e) { onError(e); }
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    const photos = [...lot.photos];
    const [p] = photos.splice(from, 1);
    photos.splice(to, 0, p);
    onChange({photos});
  };

  return (
    <div
      className={over ? 'photos over' : 'photos'}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); } }}
    >
      {lot.photos.map((p, i) => (
        <div
          key={p}
          className={drag === i ? 'thumb dragging' : 'thumb'}
          onDragOver={(e) => { if (drag !== null) e.preventDefault(); }}
          onDrop={(e) => { if (drag !== null) { e.preventDefault(); e.stopPropagation(); move(drag, i); setDrag(null); } }}
        >
          {/* Тянется только фото: кнопки вне перетаскиваемого блока, иначе браузер съедает их клики */}
          <div className="drag" draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}>
            <img src={p.startsWith('http') || p.startsWith('/') ? p : `/${p}`} alt="" />
            <span className="role">{i + 1}. {roles[i] ?? 'запас'}</span>
          </div>
          <button className="icon del" title="Удалить фото" onClick={() => remove(p)}>×</button>
          {p.startsWith(own) && (
            <button className={blurCount(p) ? 'blur-btn on' : 'blur-btn'} title="Размыть номер или лишнее" onClick={() => setEditing(p)}>
              {blurCount(p) ? `Размыто: ${blurCount(p)}` : 'Размыть'}
            </button>
          )}
        </div>
      ))}
      <button className="thumb add" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <>Загружаю…<div className="bar wait"><div /></div></> : <>+ Фото<br /><span className="muted">или перетащи сюда</span></>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {editing && <BlurEditor lotId={lot.id} path={editing} onClose={closeEditor} onSaved={onPhotos} onError={onError} />}
    </div>
  );
};
