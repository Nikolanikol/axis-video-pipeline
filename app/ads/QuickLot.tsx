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

// Короткие названия форматов на кнопках: полные описания остаются подсказкой
export const FormatChips: React.FC<{value: string; onChange: (id: string) => void}> = ({value, onChange}) => (
  <div className="format-chips" role="radiogroup" aria-label="Формат ролика">
    {FORMATS.map((f: FormatMeta) => (
      <button key={f.id} role="radio" aria-checked={f.id === value} title={f.description}
        className={f.id === value ? 'chip on' : 'chip'} onClick={() => onChange(f.id)}>
        {f.title}
        <span className="chip-sub">{Math.round(f.durationInFrames / f.fps)} с</span>
      </button>
    ))}
  </div>
);

/** Недавние лоты карточками: открыть старую машину — один клик, а не поиск в выпадающем списке */
export const RecentLots: React.FC<{lots: LotEntry[]; current?: string; onOpen: (id: string) => void; onBlank: () => void; price: (l: LotEntry) => string}> = (
  {lots, current, onOpen, onBlank, price},
) => (
  <section className="recent">
    <div className="recent-head">
      <h2>Лоты <span className="muted">{lots.length}</span></h2>
      <button className="link" onClick={onBlank}>+ пустой лот без ссылки</button>
    </div>
    <div className="recent-list">
      {lots.map((l) => (
        <button key={l.id} className={l.id === current ? 'recent-card on' : 'recent-card'} onClick={() => onOpen(l.id)}>
          {l.photos[0] ? <img src={l.photos[0]} alt="" loading="lazy" /> : <div className="recent-empty">нет фото</div>}
          <b>{[l.brand, l.model].filter(Boolean).join(' ') || 'Новый лот'}</b>
          <span className="muted">{[l.year, price(l)].filter(Boolean).join(' · ')}</span>
        </button>
      ))}
    </div>
  </section>
);
