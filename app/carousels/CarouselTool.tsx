// Пайплайн «Карусели авто»: ссылка на объявление → слайды → скачать.
//
// Экран — как у «Ролика по лоту» (владелец 30.09): сверху строка ссылки, слева собранные
// карусели, по центру слайды с перелистыванием, справа формат и действия. Вставил ссылку —
// машина подтягивается бесплатно, справа её цена: можно вписать свою, и карусель соберётся
// сразу с ней (владелец 16.11: «править цену до первой генерации» — раньше ссылка собирала
// карусель сразу, и своя цена была доступна только после сборки). Всё остальное — данные,
// слайды, брендбук — решено на сервере и в композиции.
//
// Отличие от ролика: превью ролика живое, и формат там меняется бесплатно, а карусель надо
// собрать — это кредит. Поэтому клик по формату только выбирает его, пересборка — отдельной
// кнопкой, а ссылка на уже собранную машину открывает готовую карусель, а не собирает заново.
import React, {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {encarAdUrl, sourceName} from '../../src/shared/encarLink.js';
import {DESIGNS} from '../../src/shared/designs';
import {FAMILIES, FAMILY_FORMAT, familyFormats} from '../../src/carousel/families/registry.js';
import {thumb} from '../thumb';
import {parseCarouselSource} from '../../src/shared/kmotorsLot.js';
import {QuickLink} from '../ads/QuickLot';
import {Check, ChevronLeft, ChevronRight, Download, ExternalLink, Images, List, RefreshCw, Trash2, X} from 'lucide-react';
import {MobileTabs, useIsPhone, usePanelSwipes} from '../MobileTabs';
import {toast} from '../Toast';
import {api, CarouselEntry, CarouselFormat, errorText} from '../api';
import type {CarouselCar} from '../../src/shared/types';
import {useConfig} from '../config';
import {useCost, useSession} from '../auth';
import {carouselLang} from '../../src/carousel/i18n';
import {TEXT_FIELDS, TEXT_MAX, accentField} from '../../src/carousel/texts';
import {BusyModal} from '../BusyModal';
import {useModalFocus} from '../useModalFocus';
import {PostCaption} from './PostCaption';
import {carouselPrice} from '../../src/carousel/price';
import {currencySign} from '../../src/shared/currencies';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {useTodayMarket} from '../rates';
import {canSaveToFolder, canSaveToGallery, saveToFolder, shareFiles, slideName, usePreparedFiles} from '../saveFiles';
import {locale, tNow, useT} from '../i18n';

const km = (v: number | null) => (v === null ? '—' : tNow()('common.km', {n: v.toLocaleString(locale())}));

/** Сводка по машине: по ней видно, ту ли карточку подтянули, не открывая слайды */
const CarSummary: React.FC<{entry: {id: string; car: CarouselCar}}> = ({entry}) => {
  const c = entry.car;
  const t = useT();
  const n = (v: number) => v.toLocaleString(locale());
  const bits = [
    c.year, km(c.mileageKm), c.transmission, c.fuel,
    c.price?.krw ? t('car.priceOn', {price: `${n(c.price.krw)} ₩`, site: 'Encar'})
      // У японской — иены, как на Carsensor: доллары из них посчитаны нами по курсу дня
      : c.price?.jpy ? t('car.priceOn', {price: `${n(c.price.jpy)} ¥`, site: sourceName(c.id)})
        : c.price?.usd ? t('car.priceOn', {price: `$${n(c.price.usd)}`, site: sourceName(c.id)}) : null,
    // У машин из Китая и Японии истории нет вовсе (в рекламу не идёт) — и строку о ней не пишем
    c.origin === 'CN' || c.origin === 'JP' ? null : c.history ? t.n('car.accidents', c.history.accidentsTotal) : t('car.noHistory'),
    c.history ? t.n('car.owners', c.history.ownerChanges) : null,
  ].filter(Boolean);
  return (
    <div className="job">
      <div className="job-head">
        <b>{[c.brand, c.model, c.grade, c.trim].filter(Boolean).join(' ') || `№ ${entry.id}`}</b>
        <span>№ {entry.id}</span>
      </div>
      <div className="muted">{bits.join(' · ')}</div>
    </div>
  );
};

/**
 * Цена на слайде до сборки (владелец 16.11): у новой машины — до первой сборки, у собранной —
 * перед сборкой в другом стиле или формате. Пусто — расчёт по курсу дня; своё число уйдёт на
 * слайд сразу, без отдельной пересборки
 */
const NextPrice: React.FC<{car: CarouselCar; id: string; value: string; onChange: (v: string) => void}> = ({car, id, value, onChange}) => {
  const {config, profile} = useConfig();
  const t = useT();
  const market = useTodayMarket(useMemo(() => marketFromProfile(profile, config.copy) as Market, [profile, config.copy]));
  const computed = carouselPrice(car, market, null);
  const sign = currencySign(market.currency);
  return (
    <div className="carousel-price">
      <label className="field">
        <span className="label">{t('cprice.label')}, {sign}</span>
        <input inputMode="decimal" value={value} placeholder={computed === null ? '' : String(computed)} onChange={(e) => onChange(e.target.value)} />
        <span className="hint">
          {t('cprice.emptyFrom', {site: sourceName(id)})}{market.currency === 'KRW' && car.price?.krw ? '' : ` ${t('cprice.atRate')}`}{computed === null ? '' : `: ${computed.toLocaleString(locale())} ${sign}`}; {t('cprice.beforeBuild')}
        </span>
      </label>
    </div>
  );
};
/** Что вписано в поле цены: undefined — ошибка ввода, null — пусто (расчёт), число — своя цена */
const typedPrice = (v: string): number | null | undefined => {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.replace(/[\s,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Цена на слайде: в валюте профиля по курсу дня, или своя — и «Пересобрать с этой ценой»
 * бесплатно (владелец 11.10). Своё число — это маржа клиента; пусто — вернуть расчёт.
 * Пересобирается та же машина в том же формате и варианте, меняется только слайд цены
 */
const PriceBox: React.FC<{entry: CarouselEntry; busy: boolean; onReprice: (price: number | null) => void}> = ({entry, busy, onReprice}) => {
  const {config, profile} = useConfig();
  const t = useT();
  const market = useTodayMarket(useMemo(() => marketFromProfile(profile, config.copy) as Market, [profile, config.copy]));
  const computed = carouselPrice(entry.car, market, null);
  const [value, setValue] = useState(entry.priceOverride ? String(entry.priceOverride) : '');
  useEffect(() => setValue(entry.priceOverride ? String(entry.priceOverride) : ''), [entry.id, entry.priceOverride]);
  const sign = currencySign(market.currency);
  const typed = value.trim() === '' ? null : Number(value.replace(/[\s,]/g, ''));
  const bad = typed !== null && (!Number.isFinite(typed) || typed <= 0);
  const same = (typed ?? null) === (entry.priceOverride ?? null);
  return (
    <div className="carousel-price">
      <label className="field">
        <span className="label">{t('cprice.label')}, {sign}</span>
        <input inputMode="decimal" value={value} placeholder={computed === null ? '' : String(computed)} onChange={(e) => setValue(e.target.value)} />
        <span className="hint">
          {entry.priceOverride
            ? <>{t('cprice.own')} · {market.currency === 'KRW' && entry.car.price?.krw ? t('cprice.onSite', {site: sourceName(entry.id)}) : t('cprice.wouldBe')} {computed === null ? '—' : `${computed.toLocaleString(locale())} ${sign}`}</>
            : <>{t('cprice.emptyFrom', {site: sourceName(entry.id)})}{market.currency === 'KRW' && entry.car.price?.krw ? '' : ` ${t('cprice.atRate')}`}{computed === null ? '' : `: ${computed.toLocaleString(locale())} ${sign}`}; {t('cprice.typeOwn')}</>}
        </span>
      </label>
      <button className="btn" disabled={busy || bad || same} onClick={() => onReprice(typed)}>
        {t(typed === null && entry.priceOverride ? 'cprice.reset' : 'cprice.rebuild')} · {t('land.pricing.extrasFree')}
      </button>
    </div>
  );
};

/**
 * Лента слайдов, которую тянут пальцем, — как карусель в ленте Instagram (владелец 01.10:
 * «лента не перетаскивается, а просто меняется фото»). Все слайды стоят в ряд в .slide-track,
 * сдвиг ленты — translateX(-at × 100%). Пока палец на экране, лента идёт за ним и из-за края
 * виден соседний слайд; при отпускании доезжает до него (или возвращается, если потянули
 * слабо). На краях ленты тянется втрое туже — видно, что дальше слайдов нет.
 * Свайп вниз закрывает (если задан onDown), тогда за пальцем едет сам слайд.
 * Слушатели руками: touchmove с passive: false, чтобы под лентой не ехала страница.
 * Кнопки и миниатюры двигают ту же ленту — переход анимирует transition из styles.css
 */
const useSlideTrack = (ref: React.RefObject<HTMLElement | null>, at: number, count: number,
  onMove: (d: number) => void, onDown?: () => void) => {
  const state = useRef({at, count, onMove, onDown});
  state.current = {at, count, onMove, onDown};
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x0 = 0; let y0 = 0; let t0 = 0; let dx = 0; let dy = 0; let axis: 'x' | 'y' | null = null;
    const track = () => el.querySelector<HTMLElement>('.slide-track');
    const current = () => el.querySelectorAll<HTMLElement>('.slide-cell')[state.current.at];
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now(); dx = 0; dy = 0; axis = null;
    };
    const drag = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      dx = e.touches[0].clientX - x0; dy = e.touches[0].clientY - y0;
      if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // Вертикаль без onDown — это прокрутка страницы, её не трогаем
      if (!axis || (axis === 'y' && !state.current.onDown)) return;
      e.preventDefault();
      const {at: i, count: n} = state.current;
      if (axis === 'x') {
        const t = track(); if (!t) return;
        const edge = (i === 0 && dx > 0) || (i === n - 1 && dx < 0);
        t.style.transition = 'none';
        t.style.transform = `translateX(calc(${-i * 100}% + ${edge ? dx / 3 : dx}px))`;
      } else {
        const c = current(); if (!c) return;
        c.style.transition = 'none';
        c.style.transform = `translateY(${Math.max(0, dy)}px)`;
        c.style.opacity = String(Math.max(0.3, 1 - Math.max(0, dy) / 400));
      }
    };
    const end = () => {
      const {at: i, count: n, onMove: move, onDown: down} = state.current;
      if (axis === 'x') {
        const t = track();
        const width = el.clientWidth || 1;
        // Доезжает, если потянули на четверть ширины или быстрым «щелчком»
        const fast = performance.now() - t0 < 250 && Math.abs(dx) > 20;
        const d = Math.abs(dx) > width / 4 || fast ? (dx < 0 ? 1 : -1) : 0;
        const next = Math.min(n - 1, Math.max(0, i + d));
        if (t) { t.style.transition = ''; t.style.transform = `translateX(${-next * 100}%)`; }
        if (next !== i) move(next - i);
      } else if (axis === 'y') {
        const c = current();
        if (down && dy > 90) down();
        else if (c) { c.style.transition = 'transform .2s ease-out, opacity .2s'; c.style.transform = ''; c.style.opacity = ''; }
      }
      axis = null;
    };
    el.addEventListener('touchstart', start, {passive: true});
    el.addEventListener('touchmove', drag, {passive: false});
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', drag);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref]);
};

/**
 * Слайды лентой. Картинки — только у открытого и двух соседних: их и видно при
 * перетаскивании, а грузить сразу все 12 PNG по 1080 px незачем
 */
const SlideTrack: React.FC<{slides: string[]; at: number; v: string; imgProps?: (i: number) => React.ImgHTMLAttributes<HTMLImageElement>}> =
  ({slides, at, v, imgProps}) => (
    <div className="slide-track" style={{transform: `translateX(${-at * 100}%)`}}>
      {slides.map((src, i) => (
        <div key={src} className="slide-cell" aria-hidden={i !== at}>
          {Math.abs(i - at) <= 1 && <img src={`${src}${v}`} alt={tNow()('slides.n', {n: i + 1})} draggable={false} {...imgProps?.(i)} />}
        </div>
      ))}
    </div>
  );

/**
 * Слайд во весь экран. Нужен потому, что в сетке превью размером с ноготь, а решать
 * про дизайн приходится по мелочам — читается ли подпись, не съехала ли цифра.
 */
const Lightbox: React.FC<{entry: CarouselEntry; at: number; onClose: () => void; onMove: (d: number) => void}> =
  ({entry, at, onClose, onMove}) => {
    const dialog = useRef<HTMLDivElement>(null);
    useModalFocus(dialog, true, onClose);
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') onMove(-1);
        if (e.key === 'ArrowRight') onMove(1);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onMove]);
    const stage = useRef<HTMLDivElement>(null);
    const t = useT();
    useSlideTrack(stage, at, entry.slides.length, onMove, onClose);
    const stop = (e: React.MouseEvent) => e.stopPropagation();

    // Нажатие мимо слайда и кнопок (на затемнение) закрывает — владелец 01.10: «логичное
    // поведение». Раньше внутренний блок во весь экран глотал клик, и закрыть можно было
    // только кнопкой. Клик по самой картинке не закрывает: по ней возят курсором и разглядывают
    return (
      <div ref={dialog} tabIndex={-1} className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('slides.nOf', {n: at + 1, total: entry.slides.length})}>
        <button className="lightbox-close" onClick={onClose} aria-label={t('land.auth.close')}><X size={22} /></button>
        <div className="lightbox-inner">
          {/* Картинка — ровно по размеру слайда, а поле вокруг неё — подложка: раньше картинка
              тянулась на всю высоту, и нажатие в чёрную полосу над квадратным слайдом считалось
              нажатием на слайд и ничего не закрывало (рамка при этом обводила пустоту) */}
          <div className="lightbox-stage" ref={stage}>
            <SlideTrack slides={entry.slides} at={at} v={`?v=${encodeURIComponent(entry.updatedAt)}`} imgProps={() => ({onClick: stop})} />
          </div>
          {/* На телефоне подписи «Назад / Вперёд» прячутся — остаются стрелки, иначе строка
              не помещалась в 375 px и «Закрыть» уезжала за край */}
          <div className="lightbox-bar" onClick={stop}>
            <button className="btn ghost" onClick={() => onMove(-1)} disabled={at === 0} aria-label={t('slides.prev')}>
              <ChevronLeft size={18} /><span className="lb-label">{t('land.prev')}</span>
            </button>
            <span className="muted lb-count">{at + 1} / {entry.slides.length}</span>
            <button className="btn ghost" onClick={() => onMove(1)} disabled={at === entry.slides.length - 1} aria-label={t('slides.next')}>
              <span className="lb-label">{t('land.next')}</span><ChevronRight size={18} />
            </button>
            <a className="btn primary" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}><Download size={17} />{t('slides.download')}</a>
          </div>
        </div>
      </div>
    );
  };

/** Формат столбцом справа: пропорция нарисована («1:1» и «4:5» словами различают не все),
 *  число слайдов и одна строка, зачем этот формат */
// built — формат, в котором открытая карусель уже собрана (у машины карусель одна, так что
// «собранный» формат всегда один): помечаем его, чтобы было видно, что готово, ещё до клика
// only — при выбранном семействе доступны только его форматы: остальные видны, но неактивны.
// Раньше выбор формата сбрасывал стиль, а выбор стиля менял формат — списки «боролись за клик»
// (владелец 21.10), теперь стиль задаёт рамку, формат её не ломает
const FormatList: React.FC<{formats: CarouselFormat[]; value: string; built?: string; only?: string[]; onChange: (id: string) => void}> =
  ({formats, value, built, only, onChange}) => {
    const t = useT();
    return (
    <div className="format-list format-grid" role="radiogroup" aria-label={t('car.format')}>
      {formats.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={f.id === value} disabled={!!only && !only.includes(f.id)}
          title={only && !only.includes(f.id) ? t('car.formatOnlyBrand') : t.cfg(f.note)}
          className={`format-item${f.id === value ? ' on' : ''}${f.id === built ? ' built' : ''}`} onClick={() => onChange(f.id)}>
          <span className="format-item-head">
            <span className="format-item-name">
              <span className="format-shape-mini" style={{aspectRatio: `${f.width} / ${f.height}`}} />
              <b>{t.cfg(f.title)}</b>
              {f.id === built && <Check className="format-built-icon" size={15} aria-hidden />}
            </span>
            <span className="muted">
              {t.n('unit.slide', f.slides.length)}
              {f.id === built && <span className="format-built-label"> · {t('car.built')}</span>}
            </span>
          </span>
          <span className="format-item-sub">{t.cfg(f.note)}</span>
        </button>
      ))}
    </div>
    );
  };

// Дата сборки на карточке: по ней видно, какая карусель свежая, а какую пора пересобрать
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(locale(), {day: '2-digit', month: '2-digit'});

/**
 * Собранные карусели — колонка слева во всю высоту. Карточка: обложка в своей пропорции
 * (раньше — обрезанная полоса 16:9, где надпись на обложке не читалась), машина, год, формат,
 * число слайдов, дата. На карточке — свои кнопки: пересобрать, на Encar, удалить (владелец
 * 30.09: «верни кнопки управления, плашка куцая и бедная»). Клик по карточке — открыть.
 * У открытой кнопки видны всегда, у остальных — при наведении, чтобы список не рябил.
 */
const CarouselsPanel: React.FC<{
  items: CarouselEntry[]; current?: string; formats: CarouselFormat[]; busy: boolean; cost: string; pending: Set<string>;
  onOpen: (e: CarouselEntry) => void; onRebuild: (e: CarouselEntry) => void; onDelete: (e: CarouselEntry) => void;
}> = ({items, current, formats, busy, cost, pending, onOpen, onRebuild, onDelete}) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((c) => [c.car.brand, c.car.model, c.id].join(' ').toLowerCase().includes(q)) : items;
  return (
    <aside className="lots-panel carousels-panel" data-mpanel="list">
      <div className="lots-title">{t('car.title')} <span className="muted">{items.length}</span></div>
      {items.length > 4 && <input className="lots-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('car.search')} />}
      <div className="lots-list">
        {shown.map((c) => {
          const f = formats.find((x) => x.id === (c.format ?? 'classic'));
          const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
          return (
            // div, а не button: внутри свои кнопки, а кнопка в кнопке — недопустимая разметка
            <div key={c.id} role="button" tabIndex={0} className={`car-card${c.id === current ? ' on' : ''}${pending.has(c.id) ? ' pending' : ''}`}
              onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c); }}>
              {/* Миниатюра слайда: PNG 1080×1920 весит 1–3 МБ — на плашку это лишнее */}
              <img src={thumb(`${c.slides[0]}?v=${encodeURIComponent(c.updatedAt)}`, 160)} alt=""
                style={{aspectRatio: f ? `${f.width} / ${f.height}` : '9 / 16'}} loading="lazy" />
              <div className="car-card-body">
                <b>{[c.car.brand, c.car.model].filter(Boolean).join(' ') || `№ ${c.id}`}</b>
                <span className="muted">{[c.car.year, f?.title && t.cfg(f.title)].filter(Boolean).join(' · ')}</span>
                <span className="muted small">{t.n('unit.slide', c.slides.length)} · {shortDate(c.updatedAt)}</span>
                {pending.has(c.id) ? <span className="car-card-status">{t('del.deleting')}</span> : <div className="car-card-actions">
                  <button className="icon-btn" title={`${t('car.rebuildIn', {format: t.cfg(f?.title ?? '')})}${cost}`} aria-label={t('jobs.rebuild')}
                    disabled={busy} onClick={stop(() => onRebuild(c))}><RefreshCw size={16} /></button>
                  <a className="icon-btn" href={c.lot?.url ?? encarAdUrl(c.id)} target="_blank" rel="noreferrer"
                    title={c.lot ? t('car.openLotKm') : t('lots.openOn', {site: sourceName(c.id)})}
                    aria-label={c.lot ? t('car.openLot') : t('lots.openOn', {site: sourceName(c.id)})} onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
                  <button className="icon-btn danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={busy}
                    onClick={stop(() => onDelete(c))}><Trash2 size={16} /></button>
                </div>}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="empty small">{t(q ? 'lots.notFound' : 'car.none')}</div>}
      </div>
    </aside>
  );
};

/**
 * Свой текст на слайде (владелец 19.10): под слайдом — «Редактировать текст», поля этого слайда
 * с текущими словами, «Сохранить» пересобирает карусель бесплатно — как своя цена. Пустое поле —
 * вернуть фразу варианта. Править можно слова, а не данные: опции, цифры и цену здесь не меняют
 */
const SlideTextEditor: React.FC<{entry: CarouselEntry; at: number; busy: boolean;
  onSave: (slide: string, fields: Record<string, string>) => Promise<void>}> = ({entry, at, busy, onSave}) => {
  const own = entry.texts?.[at];
  const t = useT();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => setDraft(own ? {...own.fields} : {}), [own]);
  if (!entry.texts) {
    return <div className="slide-texts"><span className="hint">{t('ctext.old')}</span></div>;
  }
  if (!own) return null;
  const fields = TEXT_FIELDS.filter((f) => f.key in own.fields);
  if (!fields.length) return <div className="slide-texts"><span className="hint">{t('ctext.none')}</span></div>;
  const edited = entry.textOverrides?.[own.slide] ?? {};
  const changed = fields.filter((f) => (draft[f.key] ?? '') !== own.fields[f.key]);
  const save = (out: Record<string, string>) => onSave(own.slide, out);
  return (
    <div className="slide-texts">
      {fields.map((f) => (
        <label key={f.key} className="field">
          <span className="label">{t.cfg(f.label)}{edited[f.key] ? ` · ${t('ctext.own')}` : ''}</span>
          <textarea rows={Math.min(4, Math.max(1, (draft[f.key] ?? '').split('\n').length))} maxLength={TEXT_MAX}
            value={draft[f.key] ?? ''} onChange={(e) => setDraft((d) => ({...d, [f.key]: e.target.value}))} />
          {accentField(entry.format, f.key) && <span className="hint">{t('ctext.accent')}</span>}
        </label>
      ))}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !changed.length}
          onClick={() => save(Object.fromEntries(changed.map((f) => [f.key, draft[f.key] ?? ''])))}>{t('ctext.save')} · {t('land.pricing.extrasFree')}</button>
        {Object.keys(edited).length > 0 && (
          <button className="btn ghost" disabled={busy} title={t('ctext.resetTitle')}
            onClick={() => save(Object.fromEntries(Object.keys(edited).map((k) => [k, ''])))}>{t('ctext.reset')}</button>
        )}
      </div>
      <span className="hint">{t('ctext.hint')}</span>
    </div>
  );
};

/**
 * Слайды по центру: один большой, как в ленте Instagram, стрелки и полоса миниатюр.
 * Раньше — сетка по два в ряд, где слайд был «размером с ноготь». Клик по большому —
 * во весь экран (решения по дизайну принимаются по мелочам).
 */
const SlideViewer: React.FC<{entry: CarouselEntry; ratio: string; busy: boolean; onZoom: (i: number) => void;
  at: number; setAt: React.Dispatch<React.SetStateAction<number>>; onEdit: () => void}> = ({entry, ratio, busy, onZoom, at, setAt, onEdit}) => {
  const t = useT();
  // Другая машина — с первого слайда; пересборка той же (своя цена, свой текст) — на том же
  // слайде: человек только что правил его и хочет увидеть результат, а не обложку
  useEffect(() => { setAt(0); }, [entry.id]);
  useEffect(() => setAt((i) => Math.min(i, entry.slides.length - 1)), [entry.updatedAt, entry.slides.length]);
  const n = entry.slides.length;
  const go = (d: number) => setAt((i) => Math.min(n - 1, Math.max(0, i + d)));
  const v = `?v=${encodeURIComponent(entry.updatedAt)}`;
  // Слайды листаются и пальцем — лентой, как карусель в ленте (только вбок, вертикаль — прокрутка)
  const stage = useRef<HTMLDivElement>(null);
  useSlideTrack(stage, at, n, go);
  return (
    <div className="slide-viewer">
      <div className="slide-stage" style={{aspectRatio: ratio}} ref={stage}>
        {/* ?v= — время сборки: иначе браузер покажет прежнюю картинку из кэша */}
        <SlideTrack slides={entry.slides} at={at} v={v}
          imgProps={(i) => ({onClick: () => onZoom(i), title: t('slides.zoom'), role: 'button', tabIndex: i === at ? 0 : -1,
            'aria-label': `${t('slides.zoom')}: ${t('slides.n', {n: i + 1})}`,
            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZoom(i); } }})} />
        {at > 0 && <button className="slide-arrow left" onClick={() => go(-1)} aria-label={t('slides.prev')}>‹</button>}
        {at < n - 1 && <button className="slide-arrow right" onClick={() => go(1)} aria-label={t('slides.next')}>›</button>}
      </div>
      <div className="slide-bar">
        <span className="muted">{at + 1} / {n}</span>
        <a className="link" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}>{t('slides.downloadThis')}</a>
        <button type="button" className="link" onClick={onEdit}>
          {t('slides.edit')}
        </button>
      </div>
      <div className="slide-thumbs">
        {entry.slides.map((src, i) => (
          <button key={src} className={i === at ? 'slide-thumb on' : 'slide-thumb'} aria-pressed={i === at} onClick={() => setAt(i)} style={{aspectRatio: ratio}}>
            <img src={thumb(`${src}${v}`, 160)} alt={t('slides.n', {n: i + 1})} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Стиль карусели: «Как в бренде» или семейство из пакета KOK_handoff_v1 (согласовано 19.10). Плитка
 * семейства — три его цвета, по ним стиль узнаётся раньше, чем по названию. Семейство живёт только
 * в «Развороте» 4:5 — выбор сам переключает формат (CarouselTool)
 */
// На виду — «Как в бренде» и первые три семейства; остальные — под «Ещё стили» (владелец 21.10:
// временная мера — колонка не помещалась по высоте и прокручивалась). Выбранный или собранный стиль
// из скрытых виден всегда: список открывается сам
const MAIN_STYLES = 3;
const StyleList: React.FC<{value: string | null; built?: string | null; onChange: (id: string | null) => void}> = ({value, built, onChange}) => {
  const t = useT();
  const ready = FAMILIES.filter((f) => f.ready);
  const more = ready.slice(MAIN_STYLES);
  const pinned = more.some((f) => f.id === value || f.id === built);
  const [open, setOpen] = useState(false);
  const shown = open || pinned;
  // Плитки сеткой: кружки цветов и название, описание — в подсказке. Длинный список с описаниями
  // рядом со списком форматов читался как второй такой же выбор (владелец 21.10)
  const tile = (id: string | null, title: string, note: string, swatch?: string[]) =>
    <button key={id ?? 'brand'} type="button" role="radio" aria-checked={value === id} title={note}
      className={`style-tile${value === id ? ' on' : ''}${built !== undefined && built === id ? ' built' : ''}`} onClick={() => onChange(id)}>
      <span className="style-swatch">{(swatch ?? []).map((c, i) => <i key={i} style={{background: c}} />)}</span>
      <span className="style-tile-name">{title}</span>
      {built !== undefined && built === id && <Check className="format-built-icon" size={14} aria-hidden />}
    </button>;
  const famTile = (f: typeof ready[number]) => tile(f.id, f.title, t.cfg(f.note), [f.colors.bg, f.colors.accent, f.colors.light]);
  return <div className="style-grid" role="radiogroup" aria-label={t('car.styleAria')}>
    {tile(null, t('car.asBrand'), t('car.asBrandNote'))}
    {ready.slice(0, MAIN_STYLES).map(famTile)}
    {more.length > 0 && !pinned && <button type="button" className="style-more" aria-expanded={shown} onClick={() => setOpen(!open)}>
      {shown ? t('pay.hide') : t('car.moreStyles', {n: more.length})} <span aria-hidden>{shown ? '▴' : '▾'}</span></button>}
    {shown && more.map(famTile)}
  </div>;
};

// Последний выбранный формат — удобство этого браузера, не настройка
const FORMAT_KEY = 'axis-video:carousel-format';
const savedFormat = () => { try { return localStorage.getItem(FORMAT_KEY); } catch { return null; } };
// Последний выбранный стиль — так же, удобство браузера
const FAMILY_KEY = 'kok:carousel-family';
const savedFamily = () => { try { const v = localStorage.getItem(FAMILY_KEY); return FAMILIES.some((f) => f.ready && f.id === v) ? v : null; } catch { return null; } };

// Панель «Собранные» выезжает слева; объект вне компонента — чтобы не менять ссылку на каждый кадр
const CAROUSEL_PANELS = {list: 'left'} as const;

export const CarouselTool: React.FC = () => {
  const {config, profile, brand, report} = useConfig();
  const t = useT();
  const phone = useIsPhone();
  const settingsId = useId();
  const [section, setSection] = useState<'look' | 'content'>('look');
  const [slideAt, setSlideAt] = useState(0);
  // Язык слайдов — из профиля: виден здесь, чтобы не удивляться английской карусели
  const slidesLang = t(({ru: 'car.langRu', en: 'car.langEn', sq: 'car.langSq'} as const)[carouselLang(profile.language)]);
  const {refresh: refreshAccess} = useSession();
  const cost = useCost('carousels', config.credits);
  const formats = config.carouselFormats ?? [];
  // Сохранён стиль-семейство — формат его («Разворот»), иначе выбор открылся бы с неактивным форматом
  const [format, setFormatState] = useState<string>(() => {
    const saved = savedFormat() ?? 'showcase';
    const fam = savedFamily();
    return fam && !familyFormats(fam).includes(saved) ? FAMILY_FORMAT : saved;
  });
  const setFormat = (id: string) => {
    setFormatState(id);
    try { localStorage.setItem(FORMAT_KEY, id); } catch { /* приватный режим */ }
  };
  const [family, setFamilyState] = useState<string | null>(() => savedFamily());
  const setFamily = (id: string | null) => {
    setFamilyState(id);
    try { if (id) localStorage.setItem(FAMILY_KEY, id); else localStorage.removeItem(FAMILY_KEY); } catch { /* приватный режим */ }
    // Формат не из числа форматов семейства — на «Разворот»; «Классика» остаётся как есть
    if (id && !familyFormats(id).includes(format)) { setFormatState(FAMILY_FORMAT); try { localStorage.setItem(FORMAT_KEY, FAMILY_FORMAT); } catch { /* приватный режим */ } }
  };
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [linkError, setLinkError] = useState('');
  const [entry, setEntry] = useState<CarouselEntry | null>(null);
  // Машина по ссылке, ещё не собранная: показана с ценой, собирается кнопкой (NextPrice)
  const [draft, setDraft] = useState<{link: string; car: CarouselCar} | null>(null);
  const [looking, setLooking] = useState(false);
  // Своя цена для ближайшей сборки — новой машины или собранной в другом стиле/формате
  const [nextPrice, setNextPrice] = useState('');
  const [history, setHistory] = useState<CarouselEntry[]>([]);
  // Какой слайд открыт во весь экран; null — нет
  const [open, setOpen] = useState<number | null>(null);
  // Телефон: на экране либо открытая карусель, либо список собранных (MobileTabs.tsx)
  const [mtab, setMtab] = useState<'main' | 'list'>('main');
  const quickRef = useRef<HTMLDivElement>(null);
  usePanelSwipes(quickRef, mtab, 'main', setMtab, CAROUSEL_PANELS);

  const refresh = useCallback(() => {
    api.carousels().then((list) => {
      setHistory(list);
      setEntry((e) => e ?? list[0] ?? null);
    }).catch(report);
  }, [report]);
  useEffect(refresh, [refresh]);

  // fmt — в каком формате собрать: по умолчанию выбранный справа; «Пересобрать» из списка
  // передаёт формат самой карусели, иначе пересборка молча меняла бы её формат
  const run = async (link: string, seed?: number, fmt: string = format, fam: string | null = family && familyFormats(family).includes(fmt) ? family : null,
    price?: number | null) => {
    setBusy(true);
    setLinkError('');
    try {
      const made = await api.buildCarousel(link, fmt, seed, fam, price);
      setEntry(made);
      setDraft(null);
      setNextPrice('');
      setMtab('main');
      setHistory((h) => [made, ...h.filter((x) => x.id !== made.id)]);
    } catch (e) {
      // Ошибку сборки по ссылке — под строкой ссылки: человек смотрит туда
      setLinkError(errorText(e));
    } finally { setBusy(false); refreshAccess(); }
  };

  // Ссылка сверху: эта машина уже собрана — открываем готовую (пересборка стоит кредит и
  // затёрла бы прежнюю: карусель у машины одна). Нет — собираем в выбранном формате
  const fromLink = (link: string) => {
    let id: string;
    let source: string;
    try { ({id, source} = parseCarouselSource(link)); } catch (e) { setLinkError(e instanceof Error ? e.message : String(e)); return; }
    const known = history.find((h) => h.id === id);
    if (known) { setEntry(known); setDraft(null); setLinkError(''); setMtab('main'); return; }
    // Лоты аукционов (только сотрудникам) — как раньше, сразу в сборку: у них цена не главное
    if (!['encar', 'che168', 'carsensor'].includes(source)) { run(link); return; }
    void lookup(link);
  };
  // Машина по ссылке — бесплатно (тот же вход, что у лота в «Рекламе авто»): видно цену и можно
  // вписать свою до сборки. Кредит — только по кнопке «Собрать»
  const lookup = async (link: string) => {
    setLooking(true);
    setLinkError('');
    try {
      const car = await api.lookupCar(link);
      setDraft({link, car});
      setSection('content');
      setNextPrice('');
      setMtab('main');
    } catch (e) { setLinkError(errorText(e)); } finally { setLooking(false); }
  };

  // Своя цена — пересборка без кредита: та же машина, формат и вариант (server/carousel.mjs)
  const reprice = async (price: number | null) => {
    if (!entry) return;
    setBusy(true);
    try {
      const made = await api.repriceCarousel(entry.id, price);
      setEntry(made);
      setHistory((h) => h.map((x) => (x.id === made.id ? made : x)));
      toast(t(price === null ? 'car.toastRate' : 'car.toastPrice'));
    } catch (e) { report(e); } finally { setBusy(false); }
  };

  // Свой текст на слайде — тоже пересборка без кредита (server/carousel.mjs, editCarouselTexts)
  const editTexts = async (slide: string, fields: Record<string, string>) => {
    if (!entry) return;
    setBusy(true);
    try {
      const made = await api.editCarouselTexts(entry.id, slide, fields);
      setEntry(made);
      setHistory((h) => h.map((x) => (x.id === made.id ? made : x)));
      toast(t(Object.values(fields).every((v) => !v.trim()) ? 'car.toastTextReset' : 'car.toastText'));
    } catch (e) { report(e); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    const c = history.find((h) => h.id === id);
    const name = c ? [c.car.brand, c.car.model].filter(Boolean).join(' ') || `№ ${id}` : `№ ${id}`;
    if (!window.confirm(t('car.confirmDelete', {name}))) return;
    // Пока сервер отвечает — карточка тусклая с «Удаляю…», второй раз не нажать; после — плашка
    setPending((p) => new Set(p).add(id));
    try {
      await api.deleteCarousel(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      setEntry((e) => (e?.id === id ? null : e));
      toast(t('lot.deleted', {title: name}));
    } catch (e) { report(e); } finally {
      setPending((p) => { const next = new Set(p); next.delete(id); return next; });
    }
  };

  // Удалили открытую карусель — показываем следующую из истории, а не пустой экран
  useEffect(() => { if (!entry && history.length) setEntry(history[0]); }, [entry, history]);

  // Скачать все: на компьютере — в папку (Chrome, Edge) или одним архивом; на телефоне —
  // «В галерею» через «Поделиться» (saveFiles.ts)
  const [saving, setSaving] = useState<number | null>(null);
  const [savedTo, setSavedTo] = useState<{id: string; folder: string} | null>(null);
  const saveAll = async () => {
    if (!entry) return;
    const files = entry.slides.map((_, i) => ({url: `/api/carousels/${entry.id}/slide/${i + 1}/download`, name: slideName(entry.car, i + 1)}));
    setSaving(0);
    try {
      const folder = await saveToFolder(files, setSaving);
      if (folder) setSavedTo({id: entry.id, folder});
    } catch {
      // Выбор папки запрещён (облачный браузер, политика компании, системная папка) — не пугаем
      // технической ошибкой, а отдаём тот же комплект архивом (тест Дмитрия, PR 13)
      window.location.href = `/api/carousels/${entry.id}/zip`;
    } finally { setSaving(null); }
  };
  const slideFiles = usePreparedFiles(entry?.id ?? null, (entry?.slides ?? []).map((_, i) => ({
    url: `/api/carousels/${entry!.id}/slide/${i + 1}/download`,
    name: `${entry!.id}-${i + 1}.png`, type: 'image/png',
  })));

  const entryFormat = formats.find((f) => f.id === (entry?.format ?? 'classic'));
  const chosen = formats.find((f) => f.id === format);
  // Выбран другой формат, чем у открытой карусели, — главное действие справа: собрать в нём
  // Стиль — тоже: другое семейство (или «как в бренде») собирается заново, как другой формат
  const otherFormat = !!entry && ((entry.format ?? 'classic') !== format || (entry.family ?? null) !== family);
  const chosenFamily = FAMILIES.find((f) => f.id === family);
  const ratio = entryFormat ? `${entryFormat.width} / ${entryFormat.height}` : '9 / 16';
  // Собранную машину собирают в другом стиле или формате — в поле её нынешняя цена, её и пошлём
  useEffect(() => {
    if (otherFormat && entry) setNextPrice(entry.priceOverride ? String(entry.priceOverride) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherFormat, entry?.id]);
  const price = typedPrice(nextPrice);
  const famFor = (fmt: string) => (family && familyFormats(family).includes(fmt) ? family : null);
  const primaryAction = () => draft ? (
    <button className="btn primary big" onClick={() => run(draft.link, undefined, format, famFor(format), price)} disabled={busy || price === undefined}>
      {chosenFamily ? t('car.buildStyle', {style: chosenFamily.title}) : t('car.buildFormat', {format: t.cfg(chosen?.title ?? '')})}{cost}
    </button>
  ) : entry ? otherFormat ? (
    <button className="btn primary big" onClick={() => run(entry.id, undefined, format, famFor(format), price)} disabled={busy || price === undefined}>
      {chosenFamily && (entry.family ?? null) !== family ? t('car.buildStyle', {style: chosenFamily.title}) : !family && entry.family && (entry.format ?? 'classic') === format ? t('car.buildBrand') : t('car.buildFormat', {format: t.cfg(chosen?.title ?? '')})}{cost}
    </button>
  ) : canSaveToGallery ? (
    <button className="btn primary big" disabled={busy || !slideFiles} onClick={() => slideFiles && shareFiles(slideFiles).catch(report)}>{slideFiles ? t('car.toGallery', {n: entry.slides.length}) : t('car.preparing')}</button>
  ) : canSaveToFolder ? (
    <button className="btn primary big" onClick={saveAll} disabled={busy || saving !== null}>{saving !== null ? t('car.saving', {a: saving, b: entry.slides.length}) : t('car.toFolder', {n: entry.slides.length})}</button>
  ) : <a className="btn primary big" href={`/api/carousels/${entry.id}/zip`}>{t('car.zipAll', {n: entry.slides.length})}</a>
    : <button className="btn primary big" disabled>{t('mle.build')}{cost}</button>;
  const shownCar = draft?.car ?? entry?.car;
  const draftPhoto = draft ? draft.car.photos.hero ?? draft.car.photos.exterior[0] ?? null : null;

  return (
    <>
    <div className="quick carousel-workspace" data-mtab={mtab} ref={quickRef}>
      {/* quick-screen — один экран, как у «Ролика по лоту»: колонки прокручиваются внутри */}
      <div className="quick-screen">
      <QuickLink onLink={fromLink} error={linkError} onClearError={() => setLinkError('')} busy={busy || looking} parse={parseCarouselSource}
        placeholder={t('car.placeholder', {lang: slidesLang})} />
      {/* Сборка — 10–20 секунд (замер 30.09: 13 с на 9 слайдов); экран закрыт окном, как у лота по ссылке */}
      <BusyModal step={busy ? 0 : null} steps={[t('car.busyStep')]} label={t('car.busyLabel')}
        note={t('car.busyNote')} />
      <BusyModal step={looking ? 0 : null} steps={[t('car.lookupStep')]} label={t('car.lookupLabel')} note={t('car.lookupNote')} />

      <main className="quick-main">
        <CarouselsPanel items={history} current={entry?.id} formats={formats} busy={busy} cost={cost} pending={pending}
          onOpen={(e) => { setEntry(e); setDraft(null); setLinkError(''); setMtab('main'); }}
          onRebuild={(e) => run(e.id, e.seed, e.format ?? 'classic', e.family ?? null)}
          onDelete={(e) => remove(e.id)} />

        <section className="quick-preview carousel-center">
          {draft
            ? <div className="carousel-draft">
              {draftPhoto ? <img src={draftPhoto} alt="" /> : null}
              <p className="hint">{t('car.draftNote')}</p>
            </div>
            : entry
              ? <>
                <SlideViewer entry={entry} ratio={ratio} busy={busy} onZoom={setOpen} at={slideAt} setAt={setSlideAt} onEdit={() => {
                  setSection('content');
                  const tab = document.getElementById(`${settingsId}-content`);
                  if (phone) tab?.closest('.carousel-settings')?.scrollIntoView({block: 'start'});
                  tab?.focus({preventScroll: true});
                }} />
                {/* Подпись к публикации — под превью, независимо от вкладки параметров. */}
                <PostCaption entry={entry} onSaved={(made) => { setEntry(made); setHistory((h) => h.map((x) => x.id === made.id ? made : x)); }} />
              </>
              : <div className="empty">{t('car.empty')}</div>}
        </section>

        <section className="quick-side carousel-settings">
          <header className="carousel-settings-head">
            <h1>{draft || entry ? [shownCar?.brand, shownCar?.model, shownCar?.year].filter(Boolean).join(' ') : t('workspace.carousels')}</h1>
            <div className="carousel-mobile-action">{primaryAction()}</div>
            <div className="workspace-section-tabs" role="tablist" aria-label={t('workspace.parameters')}>
              {(['look', 'content'] as const).map((id) => <button key={id} type="button" role="tab" id={`${settingsId}-${id}`}
                aria-selected={section === id} tabIndex={section === id ? 0 : -1} aria-controls={`${settingsId}-body`} onClick={() => setSection(id)}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  const next = e.key === 'Home' ? 'look' : e.key === 'End' ? 'content' : id === 'look' ? 'content' : 'look';
                  setSection(next); document.getElementById(`${settingsId}-${next}`)?.focus();
                }}>{t(id === 'look' ? 'look.style' : 'workspace.content')}</button>)}
            </div>
          </header>
          <div className="carousel-settings-body" id={`${settingsId}-body`} role="tabpanel" aria-labelledby={`${settingsId}-${section}`}>
            <div className="carousel-settings-section" hidden={section !== 'look'}>
              <div className="quick-label">{t('car.style')}</div>
              <StyleList value={family} built={!draft && entry ? (entry.family ?? null) : undefined} onChange={setFamily} />
              <div className="quick-label">{t('car.format')}</div>
              <FormatList formats={formats} value={format} built={!draft && entry ? (entry.format ?? 'classic') : undefined}
                only={family ? familyFormats(family) : undefined} onChange={setFormat} />
              {!family && <div className="design-summary">{t('car.preset')}: {brand.design ? t.cfg(DESIGNS.find((d) => d.id === brand.design)?.title ?? '') : t('design.original')} · <a href="#/settings/brand">{t('car.setup')}</a></div>}
            </div>
            <div className="carousel-settings-section" hidden={section !== 'content'}>
              {draft && <NextPrice car={draft.car} id={draft.car.id} value={nextPrice} onChange={setNextPrice} />}
              {!draft && entry && <>
                {otherFormat ? <NextPrice car={entry.car} id={entry.id} value={nextPrice} onChange={setNextPrice} /> : <PriceBox entry={entry} busy={busy} onReprice={reprice} />}
                <h3>{t('slides.nOf', {n: slideAt + 1, total: entry.slides.length})}</h3>
                <SlideTextEditor entry={entry} at={slideAt} busy={busy} onSave={editTexts} />
              </>}
              {draft || entry ? <details className="car-summary-detail"><summary>{t('palette.carData')}</summary>
                <CarSummary entry={draft ? {id: draft.car.id, car: draft.car} : entry!} />
              </details> : <p className="hint">{t('car.empty')}</p>}
            </div>
          </div>
          <footer className="carousel-actions">
            {draft ? <>
              <div className="carousel-desktop-action">{primaryAction()}</div>
              <button className="btn ghost" onClick={() => { setDraft(null); setNextPrice(''); }} disabled={busy}>{t('common.cancel')}</button>
            </> : entry ? <>
              {otherFormat ? <>
                <div className="carousel-desktop-action">{primaryAction()}</div>
                <span className="hint">{t('car.openNow', {format: t.cfg(entryFormat?.title ?? '')})}{entry.family ? ` ${t('car.inStyle', {style: FAMILIES.find((f) => f.id === entry.family)?.title ?? entry.family})}` : ''} — {t('car.otherChosen')}</span>
                <a className="hint" href={`/api/carousels/${entry.id}/zip`}>{t('car.orZip')}</a>
              </> : <>
                <div className="carousel-desktop-action">{primaryAction()}</div>
                {canSaveToFolder && !canSaveToGallery && <a className="hint" href={`/api/carousels/${entry.id}/zip`}>{t('car.orZip')}</a>}
                {savedTo?.id === entry.id && saving === null && <span className="hint" style={{color: 'var(--ok)'}}>{t('car.saved', {slides: t.n('unit.slide', entry.slides.length), folder: savedTo.folder})}</span>}
                {canSaveToGallery && <span className="hint">{t('car.iosHint')}</span>}
              </>}
              <details><summary>{t('workspace.moreActions')}</summary><div className="btn-row">
                {!otherFormat && (entry.format !== 'classic' || brand.design || entry.family) && <button className="btn" onClick={() => run(entry.id)} disabled={busy} title={t('car.variantTitle')}>{t('car.variant')}{cost}</button>}
                {!otherFormat && <button className="btn ghost" onClick={() => run(entry.id, entry.seed)} disabled={busy} title={t('car.rebuildTitle')}>{t('jobs.rebuild')}{cost}</button>}
                <a className="btn ghost" href={entry.lot?.url ?? encarAdUrl(entry.id)} target="_blank" rel="noreferrer">{entry.lot ? t('car.openLot') : t('car.onSite', {site: sourceName(entry.id)})}</a>
                <button className="btn ghost" onClick={() => remove(entry.id)} disabled={busy}>{t('common.delete')}</button>
              </div></details>
            </> : <div className="carousel-desktop-action">{primaryAction()}</div>}
          </footer>
        </section>
      </main>
      </div>

      {entry && open !== null && (
        <Lightbox
          entry={entry}
          at={open}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen((n) => Math.min(entry.slides.length - 1, Math.max(0, (n ?? 0) + d)))}
        />
      )}
    </div>
    <MobileTabs value={mtab} onChange={setMtab} tabs={[
      {id: 'list', label: t('car.tabList'), icon: <List size={20} />, badge: history.length},
      {id: 'main', label: t('car.tabMain'), icon: <Images size={20} />},
    ]} />
    </>
  );
};
