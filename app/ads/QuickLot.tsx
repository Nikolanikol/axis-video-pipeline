// Основной путь «Ролика по лоту» в три действия: вставил ссылку → «Собрать» → «Скачать»
// (решение владельца 30.09: «человек должен делать это в 2–3 клика максимум»).
//
// Всё, что можно решить за человека, решается само: поиск машины, лот, поля, курс,
// подзаголовок, фото (autoPickPhotos), формат — последний использованный. Ручное
// управление не убрано, а спрятано под «Изменить» и нигде не обязательно.
import React, {useRef, useState} from 'react';
import {encarAdUrl, idFromNote, parseCarLink, sourceName} from '../../src/shared/encarLink.js';
import {FORMATS} from '../../src/shared/model';
import type {FormatMeta} from '../../src/shared/types';
import type {LotEntry} from '../api';
import {BusyModal} from '../BusyModal';
import {Copy, ExternalLink, Link2, Search, Trash2} from 'lucide-react';
import {lotIsBlank} from '../../src/shared/lotFromCar';
import {thumb} from '../thumb';
import {SourcesStrip} from '../Sources';
import {useT} from '../i18n';

/** Где сейчас загрузка лота по ссылке: шаг 0 — поиск машины, 1 — лот, 2 — фото */
export type ImportStage = {step: 0 | 1 | 2; photos?: number} | null;

/** Окно загрузки машины по ссылке (Encar, che168, Carsensor) — общее окно BusyModal с тремя шагами */
export const ImportModal: React.FC<{stage: ImportStage}> = ({stage}) => {
  const t = useT();
  return (
    <BusyModal step={stage?.step ?? null} label={t('import.label')} note={t('import.note')}
      steps={[t('import.s1'), t('import.s2'), stage?.photos ? t('import.s3n', {n: stage.photos}) : t('import.s3')]} />
  );
};

/**
 * Строка ссылки. Вставка ссылки Encar — это и есть первое действие: поиск запускается
 * сам, без кнопки «Подтянуть». Набранную руками ссылку запускает Enter или кнопка.
 */
export const QuickLink: React.FC<{
  onLink: (link: string) => void; error: string; busy: boolean; placeholder?: string;
  // Какие ссылки принимает экран: по умолчанию — Encar; карусели добавляют лоты аукционов
  parse?: (link: string) => unknown;
}> = (
  {onLink, error, busy, placeholder, parse = parseCarLink},
) => {
  const t = useT();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const go = (link: string) => {
    try { parse(link); } catch { return false; }
    onLink(link);
    setValue('');
    return true;
  };
  return (
    <div className="quick-link">
      {/* Пустое поле кнопку не гасит: погашенная винная кнопка выглядит сломанной, а строка —
          первое действие на экране. Нажали с пустым полем — ставим курсор в поле */}
      <form className="link-bar" onSubmit={(e) => { e.preventDefault(); if (!value.trim()) ref.current?.focus(); else go(value); }}>
        <Link2 className="link-bar-icon" size={20} aria-hidden />
        <input ref={ref} value={value} disabled={busy} autoFocus
          placeholder={placeholder ?? t('link.placeholder')} aria-label={t('link.aria')}
          onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => {
            // Вставили ссылку — сразу в работу; не ссылку — пусть ляжет в поле как текст
            if (go(e.clipboardData.getData('text'))) e.preventDefault();
          }} />
        <button className="btn primary link-go" disabled={busy}><Search size={17} aria-hidden />{t('link.find')}</button>
      </form>
      {!busy && error && <div className="error" style={{margin: '8px 0 0'}}>{error}</div>}
      {/* Откуда брать ссылки — логотипы площадок со ссылками на их сайты (владелец 13.10). На широком
          экране их показывает шапка (.top-sources), здесь — только на узких: см. .quick-sources. Без подписи
          «Площадки:» — на телефоне место дороже, а логотипы узнают и так (владелец 13.10) */}
      <SourcesStrip compact title="" countries={false} className="quick-sources" />
    </div>
  );
};

// Выбор формата — справа, столбцом: название, длительность и одна строка, чем отличается.
// Выпадающий список прятал форматы, а три кнопки в строку не вмещали объяснения
export const FormatChips: React.FC<{value: string; onChange: (id: string) => void}> = ({value, onChange}) => {
  const t = useT();
  return (
  <div className="format-list" role="radiogroup" aria-label={t('land.demo.format')}>
    {FORMATS.map((f: FormatMeta) => (
      <button key={f.id} role="radio" aria-checked={f.id === value} title={f.description && t.cfg(f.description)}
        className={f.id === value ? 'format-item on' : 'format-item'} onClick={() => onChange(f.id)}>
        <span className="format-item-head"><b>{t.cfg(f.title)}</b><span className="muted">{t('common.sec', {n: Math.round(f.durationInFrames / f.fps)})}</span></span>
        {f.short && <span className="format-item-sub">{t.cfg(f.short)}</span>}
      </button>
    ))}
  </div>
  );
};

// Сортировка списка лотов — только на экране (в этом браузере), лоты на сервере не трогаем
type Sort = 'new' | 'old' | 'name';
const SORTS: Sort[] = ['new', 'old', 'name'];
const titleOf = (l: LotEntry) => [l.brand, l.model].filter(Boolean).join(' ');
// Ссылка на объявление по пометке лота «Encar 12345» (и «копия Encar 12345»). Она же —
// «сохранённая ссылка» лота: номер машины уже лежит в пометке, отдельное поле не нужно,
// и работает это для лотов, созданных до 01.10
export const encarUrl = (l: LotEntry) => {
  // «Encar 41630924», «che168 60154824» (Китай) или «carsensor AU7375484964» (Япония)
  const id = idFromNote(l.note);
  return id ? encarAdUrl(id) : null;
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
  const t = useT();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const q = query.trim().toLowerCase();
  const empty = lots.filter(isEmptyLot);
  const shown = (q ? lots.filter((l) => [l.brand, l.model, String(l.year ?? '')].join(' ').toLowerCase().includes(q)) : lots)
    .slice().sort((a, b) => sort === 'name' ? titleOf(a).localeCompare(titleOf(b), 'ru')
      : sort === 'old' ? (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <aside className="lots-panel carousels-panel" data-mpanel="list">
      {/* «Добавить вручную», а не «Новое объявление»: главный вход — строка ссылки сверху,
          эта кнопка создаёт пустую карточку под ручное заполнение */}
      <button className="btn primary lots-new" onClick={onBlank}>+ {t('lots.addManual')}</button>
      <div className="lots-tools">
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('lots.sortAria')}>
          {SORTS.map((k) => <option key={k} value={k}>{t(`lots.sort.${k}`)}</option>)}
        </select>
        {empty.length > 0 && (
          <button className="btn ghost" title={t('lots.emptyTitle')} onClick={() => onDeleteEmpty(empty)}>
            {t('lots.deleteEmpty', {n: empty.length})}
          </button>
        )}
      </div>
      {lots.length > 4 && <input className="lots-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lots.search')} />}
      <div className="lots-title">{t('lots.title')} <span className="muted">{lots.length}</span></div>
      <div className="lots-list">
        {shown.map((l) => {
          const busy = pending.has(l.id);
          const url = encarUrl(l);
          return (
            // div, а не button: внутри свои кнопки, а кнопка в кнопке — недопустимая разметка
            <div key={l.id} role="button" tabIndex={0} className={`car-card${l.id === current ? ' on' : ''}${busy ? ' pending' : ''}`}
              onClick={() => onOpen(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(l.id); }}>
              {l.photos[0]
                // Миниатюра, а не фото целиком: полное — до 2000 px и сотни КБ на значок в 96 px
                ? <img src={thumb(l.photos[0])} alt="" loading="lazy" style={{aspectRatio: '16 / 9', width: 96}} />
                : <span className="lot-row-empty" style={{width: 96}}>{t('render.missing.photos')}</span>}
              <div className="car-card-body">
                <b>{titleOf(l) || t('lots.untitled')}</b>
                <span className="muted">{[l.year, price(l)].filter(Boolean).join(' · ') || t('lots.blank')}</span>
                {busy ? <span className="car-card-status">{t('del.deleting')}</span> : (
                  <div className="car-card-actions">
                    <button className="icon-btn" title={t('lots.copyTitle')} aria-label={t('lots.copy')}
                      onClick={stop(() => onCopy(l))}><Copy size={16} /></button>
                    {url && (
                      <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title={t('lots.openOn', {site: sourceName(idFromNote(l.note))})}
                        aria-label={t('lots.openOn', {site: sourceName(idFromNote(l.note))})} onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
                    )}
                    <button className="icon-btn danger" title={t('lots.deleteTitle')} aria-label={t('common.delete')}
                      onClick={stop(() => onDelete(l))}><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="empty small">{t(q ? 'lots.notFound' : 'lots.none')}</div>}
      </div>
    </aside>
  );
};
