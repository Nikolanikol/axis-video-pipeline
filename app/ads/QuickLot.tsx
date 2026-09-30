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
import {BusyModal} from '../BusyModal';
import {Copy, ExternalLink, Trash2} from 'lucide-react';
import {lotIsBlank} from '../../src/shared/lotFromCar';

/** Где сейчас загрузка лота по ссылке: шаг 0 — поиск машины, 1 — лот, 2 — фото */
export type ImportStage = {step: 0 | 1 | 2; photos?: number} | null;

/** Окно загрузки машины из Encar — общее окно BusyModal с тремя шагами */
export const ImportModal: React.FC<{stage: ImportStage}> = ({stage}) => (
  <BusyModal step={stage?.step ?? null} label="Загрузка машины из Encar" note="Обычно 10–15 секунд. Не закрывайте страницу"
    steps={['Ищу машину на Encar', 'Создаю лот', stage?.photos ? `Загружаю ${stage.photos} фото` : 'Загружаю фото']} />
);

/**
 * Строка ссылки. Вставка ссылки Encar — это и есть первое действие: поиск запускается
 * сам, без кнопки «Подтянуть». Набранную руками ссылку запускает Enter или кнопка.
 */
export const QuickLink: React.FC<{onLink: (link: string) => void; error: string; busy: boolean; placeholder?: string}> = (
  {onLink, error, busy, placeholder = 'Вставьте ссылку на объявление Encar — остальное сделается само'},
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
          placeholder={placeholder}
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

// Сортировка списка лотов — только на экране (в этом браузере), лоты на сервере не трогаем
type Sort = 'new' | 'old' | 'name';
const SORTS: Record<Sort, string> = {new: 'Сначала новые', old: 'Сначала старые', name: 'По названию'};
const titleOf = (l: LotEntry) => [l.brand, l.model].filter(Boolean).join(' ') || 'Новый лот';
// Ссылка на объявление по пометке лота «Encar 12345» (и «копия Encar 12345»)
const encarUrl = (l: LotEntry) => {
  const m = l.note?.match(/Encar (\d+)/);
  return m ? `https://fem.encar.com/cars/detail/${m[1]}` : null;
};
/** Пустой лот: без фото и без машины — копятся от «+ Новый лот», их удаляют пачкой */
export const isEmptyLot = (l: LotEntry) => !l.photos.length && lotIsBlank(l);

/**
 * Лоты — колонка слева: «+ Новый лот», сортировка, «удалить пустые», поиск и карточки.
 * На карточке — «Дублировать», «На Encar» (если лот из Encar), «Удалить» (владелец 30.09:
 * «плашка будет засоряться, их надо удалять, сортировать, перерабатывать»). Кнопки у
 * открытого видны всегда, у остальных — при наведении, на касании — всегда. Удаляемая
 * карточка тускнеет с «Удаляю…», пока сервер отвечает, — повторное нажатие невозможно.
 */
export const LotsPanel: React.FC<{
  lots: LotEntry[]; current?: string; pending: Set<string>;
  onOpen: (id: string) => void; onBlank: () => void; price: (l: LotEntry) => string;
  onCopy: (l: LotEntry) => void; onDelete: (l: LotEntry) => void; onDeleteEmpty: (list: LotEntry[]) => void;
}> = ({lots, current, pending, onOpen, onBlank, price, onCopy, onDelete, onDeleteEmpty}) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const q = query.trim().toLowerCase();
  const empty = lots.filter(isEmptyLot);
  const shown = (q ? lots.filter((l) => [l.brand, l.model, String(l.year ?? '')].join(' ').toLowerCase().includes(q)) : lots)
    .slice().sort((a, b) => sort === 'name' ? titleOf(a).localeCompare(titleOf(b), 'ru')
      : sort === 'old' ? (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <aside className="lots-panel carousels-panel">
      <button className="btn primary lots-new" onClick={onBlank}>+ Новый лот</button>
      <div className="lots-tools">
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Сортировка лотов">
          {(Object.keys(SORTS) as Sort[]).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}
        </select>
        {empty.length > 0 && (
          <button className="btn ghost" title="Лоты без фото и без машины" onClick={() => onDeleteEmpty(empty)}>
            Удалить пустые ({empty.length})
          </button>
        )}
      </div>
      {lots.length > 4 && <input className="lots-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: марка, модель, год" />}
      <div className="lots-title">Лоты <span className="muted">{lots.length}</span></div>
      <div className="lots-list">
        {shown.map((l) => {
          const busy = pending.has(l.id);
          const url = encarUrl(l);
          return (
            // div, а не button: внутри свои кнопки, а кнопка в кнопке — недопустимая разметка
            <div key={l.id} role="button" tabIndex={0} className={`car-card${l.id === current ? ' on' : ''}${busy ? ' pending' : ''}`}
              onClick={() => onOpen(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(l.id); }}>
              {l.photos[0]
                ? <img src={l.photos[0]} alt="" loading="lazy" style={{aspectRatio: '16 / 9', width: 96}} />
                : <span className="lot-row-empty" style={{width: 96}}>нет фото</span>}
              <div className="car-card-body">
                <b>{titleOf(l)}</b>
                <span className="muted">{[l.year, price(l)].filter(Boolean).join(' · ') || 'пустой'}</span>
                {busy ? <span className="car-card-status">Удаляю…</span> : (
                  <div className="car-card-actions">
                    <button className="icon-btn" title="Дублировать — копия с теми же фото и полями" aria-label="Дублировать"
                      onClick={stop(() => onCopy(l))}><Copy size={16} /></button>
                    {url && (
                      <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="Открыть объявление на Encar"
                        aria-label="Открыть на Encar" onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
                    )}
                    <button className="icon-btn danger" title="Удалить лот вместе с его роликами" aria-label="Удалить"
                      onClick={stop(() => onDelete(l))}><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="empty small">{q ? 'Ничего не нашлось' : 'Лотов пока нет — вставьте ссылку сверху'}</div>}
      </div>
    </aside>
  );
};
