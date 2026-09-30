// Основной путь «Ролика по лоту» в три действия: вставил ссылку → «Собрать» → «Скачать»
// (решение владельца 30.09: «человек должен делать это в 2–3 клика максимум»).
//
// Всё, что можно решить за человека, решается само: поиск машины, лот, поля, курс,
// подзаголовок, фото (autoPickPhotos), формат — последний использованный. Ручное
// управление не убрано, а спрятано под «Изменить» и нигде не обязательно.
import React, {useRef, useState} from 'react';
import {parseCarLink} from '../../src/shared/encarLink.js';
import {FORMATS} from '../../src/shared/model';
import type {FormatMeta} from '../../src/shared/types';
import type {LotEntry} from '../api';

/**
 * Строка ссылки. Вставка ссылки Encar — это и есть первое действие: поиск запускается
 * сам, без кнопки «Подтянуть». Набранную руками ссылку запускает Enter или кнопка.
 */
export const QuickLink: React.FC<{onLink: (link: string) => void; stage: string; error: string; busy: boolean}> = (
  {onLink, stage, error, busy},
) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const go = (link: string) => {
    try { parseCarLink(link); } catch { return false; }
    onLink(link);
    setValue('');
    return true;
  };
  return (
    <div className="quick-link">
      <form onSubmit={(e) => { e.preventDefault(); go(value); }}>
        <input ref={ref} value={value} disabled={busy} autoFocus
          placeholder="Вставьте ссылку на объявление Encar — остальное сделается само"
          onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => {
            // Вставили ссылку — сразу в работу; не ссылку — пусть ляжет в поле как текст
            if (go(e.clipboardData.getData('text'))) e.preventDefault();
          }} />
        <button className="btn" disabled={busy || !value.trim()}>Найти</button>
      </form>
      {busy && <div className="quick-stage"><div className="bar wait"><div /></div><span>{stage}</span></div>}
      {!busy && error && <div className="error" style={{margin: '8px 0 0'}}>{error}</div>}
    </div>
  );
};

// Выбор формата — справа, столбцом: название, длительность и одна строка, чем отличается.
// Выпадающий список прятал форматы, а три кнопки в строку не вмещали объяснения
export const FormatChips: React.FC<{value: string; onChange: (id: string) => void}> = ({value, onChange}) => (
  <div className="format-list" role="radiogroup" aria-label="Формат ролика">
    {FORMATS.map((f: FormatMeta) => (
      <button key={f.id} role="radio" aria-checked={f.id === value} title={f.description}
        className={f.id === value ? 'format-item on' : 'format-item'} onClick={() => onChange(f.id)}>
        <span className="format-item-head"><b>{f.title}</b><span className="muted">{Math.round(f.durationInFrames / f.fps)} с</span></span>
        {f.short && <span className="format-item-sub">{f.short}</span>}
      </button>
    ))}
  </div>
);

/**
 * Лоты — колонка слева: сверху заметная «+ Новый лот», под ней поиск и список машин, над
 * которыми работали. Раньше это была лента карточек внизу страницы с мелкой ссылкой «пустой
 * лот» — владелец (30.09): непонятно, что даёт, кнопку не видно.
 */
export const LotsPanel: React.FC<{lots: LotEntry[]; current?: string; onOpen: (id: string) => void; onBlank: () => void; price: (l: LotEntry) => string}> = (
  {lots, current, onOpen, onBlank, price},
) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? lots.filter((l) => [l.brand, l.model, String(l.year ?? '')].join(' ').toLowerCase().includes(q)) : lots;
  return (
    <aside className="lots-panel">
      <button className="btn primary lots-new" onClick={onBlank}>+ Новый лот</button>
      {lots.length > 6 && <input className="lots-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: марка, модель, год" />}
      <div className="lots-title">Лоты <span className="muted">{lots.length}</span></div>
      <div className="lots-list">
        {shown.map((l) => (
          <button key={l.id} className={l.id === current ? 'lot-row on' : 'lot-row'} onClick={() => onOpen(l.id)}>
            {l.photos[0] ? <img src={l.photos[0]} alt="" loading="lazy" /> : <span className="lot-row-empty">нет фото</span>}
            <span className="lot-row-text">
              <b>{[l.brand, l.model].filter(Boolean).join(' ') || 'Новый лот'}</b>
              <span className="muted">{[l.year, price(l)].filter(Boolean).join(' · ') || 'пустой'}</span>
            </span>
          </button>
        ))}
        {!shown.length && <div className="empty small">{q ? 'Ничего не нашлось' : 'Лотов пока нет — вставьте ссылку сверху'}</div>}
      </div>
    </aside>
  );
};
