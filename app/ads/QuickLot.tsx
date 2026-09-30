// Основной путь «Ролика по лоту» в три действия: вставил ссылку → «Собрать» → «Скачать»
// (решение владельца 30.09: «человек должен делать это в 2–3 клика максимум»).
//
// Всё, что можно решить за человека, решается само: поиск машины, лот, поля, курс,
// подзаголовок, фото (autoPickPhotos), формат — последний использованный. Ручное
// управление не убрано, а спрятано под «Изменить» и нигде не обязательно.
import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {parseCarLink} from '../../src/shared/encarLink.js';
import {FORMATS} from '../../src/shared/model';
import type {FormatMeta} from '../../src/shared/types';
import type {LotEntry} from '../api';
import {RecMark} from '../Loading';

/** Где сейчас загрузка лота по ссылке: шаг 0 — поиск машины, 1 — лот, 2 — фото */
export type ImportStage = {step: 0 | 1 | 2; photos?: number} | null;

/**
 * Окно загрузки поверх всего экрана. Экран под ним не нажимается (владелец 30.09: «чтобы
 * человек не мог в это время нажимать какую-то другую ерунду»): переключение лота или
 * формата посреди загрузки записало бы фото и поля не туда. Шаги с отметками — видно, что
 * дело идёт, а не зависло: самый долгий шаг, фото, ~10 секунд.
 * Отмены нет намеренно: лот к этому моменту уже создаётся, и прерванная загрузка оставила
 * бы его наполовину пустым.
 */
export const ImportModal: React.FC<{stage: ImportStage}> = ({stage}) => {
  const open = !!stage;
  // Страница под окном — inert: иначе мышь закрыта затемнением, а Tab с клавиатуры всё равно
  // доходит до кнопок под ним. Окно — в body через портал, поэтому само под inert не попадает
  useEffect(() => {
    const root = document.getElementById('root');
    if (!open || !root) return;
    root.inert = true;
    return () => { root.inert = false; };
  }, [open]);
  if (!stage) return null;
  const steps = ['Ищу машину на Encar', 'Создаю лот', stage.photos ? `Загружаю ${stage.photos} фото` : 'Загружаю фото'];
  return createPortal(
    <div className="modal-backdrop import-backdrop" role="dialog" aria-modal="true" aria-label="Загрузка машины из Encar">
      <div className="import-modal" role="status">
        <RecMark />
        <ol className="import-steps">
          {steps.map((s, i) => (
            <li key={s} className={i < stage.step ? 'done' : i === stage.step ? 'now' : ''}>
              <span className="import-mark" aria-hidden="true">{i < stage.step ? '✓' : i + 1}</span>{s}{i === stage.step ? '…' : ''}
            </li>
          ))}
        </ol>
        <div className="muted import-note">Обычно 10–15 секунд. Не закрывайте страницу.</div>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Строка ссылки. Вставка ссылки Encar — это и есть первое действие: поиск запускается
 * сам, без кнопки «Подтянуть». Набранную руками ссылку запускает Enter или кнопка.
 */
export const QuickLink: React.FC<{onLink: (link: string) => void; error: string; busy: boolean}> = (
  {onLink, error, busy},
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
