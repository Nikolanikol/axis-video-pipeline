// Пайплайн «Карусели авто»: ссылка на объявление → слайды → скачать.
//
// Экран — как у «Ролика по лоту» (владелец 30.09): сверху строка ссылки, слева собранные
// карусели, по центру слайды с перелистыванием, справа формат и действия. Вставил ссылку —
// карусель собирается сама в выбранном формате. Всё остальное — данные, слайды, брендбук —
// решено на сервере и в композиции.
//
// Отличие от ролика: превью ролика живое, и формат там меняется бесплатно, а карусель надо
// собрать — это кредит. Поэтому клик по формату только выбирает его, пересборка — отдельной
// кнопкой, а ссылка на уже собранную машину открывает готовую карусель, а не собирает заново.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {encarAdUrl, sourceName} from '../../src/shared/encarLink.js';
import {DESIGNS} from '../../src/shared/designs';
import {FAMILIES, FAMILY_FORMAT} from '../../src/carousel/families/registry.js';
import {thumb} from '../thumb';
import {parseCarouselSource} from '../../src/shared/kmotorsLot.js';
import {QuickLink} from '../ads/QuickLot';
import {Check, ChevronLeft, ChevronRight, Download, ExternalLink, Images, List, RefreshCw, Trash2, X} from 'lucide-react';
import {MobileTabs, usePanelSwipes} from '../MobileTabs';
import {toast} from '../Toast';
import {api, CarouselEntry, CarouselFormat, errorText} from '../api';
import {useConfig} from '../config';
import {useCost, useSession} from '../auth';
import {carouselLang} from '../../src/carousel/i18n';
import {TEXT_FIELDS, TEXT_MAX, accentField} from '../../src/carousel/texts';
import {BusyModal} from '../BusyModal';
import {carouselPrice} from '../../src/carousel/price';
import {currencySign} from '../../src/shared/currencies';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {useTodayMarket} from '../rates';
import {canSaveToFolder, canSaveToGallery, saveToFolder, shareFiles, slideName, usePreparedFiles} from '../saveFiles';

const km = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ru-RU')} км`);

/** Сводка по машине: по ней видно, ту ли карточку подтянули, не открывая слайды */
const CarSummary: React.FC<{entry: CarouselEntry}> = ({entry}) => {
  const c = entry.car;
  const bits = [
    c.year, km(c.mileageKm), c.transmission, c.fuel,
    c.price?.krw ? `${c.price.krw.toLocaleString('ru-RU')} ₩ на Encar`
      // У японской — иены, как на Carsensor: доллары из них посчитаны нами по курсу дня
      : c.price?.jpy ? `${c.price.jpy.toLocaleString('ru-RU')} ¥ на ${sourceName(c.id)}`
        : c.price?.usd ? `$${c.price.usd.toLocaleString('ru-RU')} на ${sourceName(c.id)}` : null,
    // У машин из Китая и Японии истории нет вовсе (в рекламу не идёт) — и строку о ней не пишем
    c.origin === 'CN' || c.origin === 'JP' ? null : c.history ? `${c.history.accidentsTotal} ДТП` : 'история недоступна',
    c.history ? `${c.history.ownerChanges} смен владельца` : null,
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
 * Цена на слайде: в валюте профиля по курсу дня, или своя — и «Пересобрать с этой ценой»
 * бесплатно (владелец 11.10). Своё число — это маржа клиента; пусто — вернуть расчёт.
 * Пересобирается та же машина в том же формате и варианте, меняется только слайд цены
 */
const PriceBox: React.FC<{entry: CarouselEntry; busy: boolean; onReprice: (price: number | null) => void}> = ({entry, busy, onReprice}) => {
  const {config, profile} = useConfig();
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
        <span className="label">Цена на слайде, {sign}</span>
        <input inputMode="decimal" value={value} placeholder={computed === null ? '' : String(computed)} onChange={(e) => setValue(e.target.value)} />
        <span className="hint">
          {entry.priceOverride
            ? <>своя цена · {market.currency === 'KRW' && entry.car.price?.krw ? `на ${sourceName(entry.id)}` : 'расчёт по курсу дал бы'} {computed === null ? '—' : `${computed.toLocaleString('ru-RU')} ${sign}`}</>
            : <>пусто — цена с {sourceName(entry.id)}{market.currency === 'KRW' && entry.car.price?.krw ? '' : ' по курсу дня'}{computed === null ? '' : `: ${computed.toLocaleString('ru-RU')} ${sign}`}; впишите свою — она и будет на слайде</>}
        </span>
      </label>
      <button className="btn" disabled={busy || bad || same} onClick={() => onReprice(typed)}>
        {typed === null && entry.priceOverride ? 'Вернуть расчёт и пересобрать' : 'Пересобрать с этой ценой'} · бесплатно
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
          {Math.abs(i - at) <= 1 && <img src={`${src}${v}`} alt={`Слайд ${i + 1}`} draggable={false} {...imgProps?.(i)} />}
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
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') onMove(-1);
        if (e.key === 'ArrowRight') onMove(1);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onMove]);
    const stage = useRef<HTMLDivElement>(null);
    useSlideTrack(stage, at, entry.slides.length, onMove, onClose);
    const stop = (e: React.MouseEvent) => e.stopPropagation();

    // Нажатие мимо слайда и кнопок (на затемнение) закрывает — владелец 01.10: «логичное
    // поведение». Раньше внутренний блок во весь экран глотал клик, и закрыть можно было
    // только кнопкой. Клик по самой картинке не закрывает: по ней возят курсором и разглядывают
    return (
      <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Слайд ${at + 1} из ${entry.slides.length}`}>
        <button className="lightbox-close" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
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
            <button className="btn ghost" onClick={() => onMove(-1)} disabled={at === 0} aria-label="Предыдущий слайд">
              <ChevronLeft size={18} /><span className="lb-label">Назад</span>
            </button>
            <span className="muted lb-count">{at + 1} / {entry.slides.length}</span>
            <button className="btn ghost" onClick={() => onMove(1)} disabled={at === entry.slides.length - 1} aria-label="Следующий слайд">
              <span className="lb-label">Вперёд</span><ChevronRight size={18} />
            </button>
            <a className="btn primary" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}><Download size={17} />Скачать</a>
          </div>
        </div>
      </div>
    );
  };

/** Формат столбцом справа: пропорция нарисована («1:1» и «4:5» словами различают не все),
 *  число слайдов и одна строка, зачем этот формат */
// built — формат, в котором открытая карусель уже собрана (у машины карусель одна, так что
// «собранный» формат всегда один): помечаем его, чтобы было видно, что готово, ещё до клика
// only — при выбранном семействе доступен один формат (его): остальные видны, но неактивны.
// Раньше выбор формата сбрасывал стиль, а выбор стиля менял формат — списки «боролись за клик»
// (владелец 21.10), теперь стиль задаёт рамку, формат её не ломает
const FormatList: React.FC<{formats: CarouselFormat[]; value: string; built?: string; only?: string; onChange: (id: string) => void}> =
  ({formats, value, built, only, onChange}) => (
    <div className="format-list format-grid" role="radiogroup" aria-label="Формат карусели">
      {formats.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={f.id === value} disabled={!!only && f.id !== only}
          title={only && f.id !== only ? 'Этот формат — только в стиле «Как в бренде»' : undefined}
          className={`format-item${f.id === value ? ' on' : ''}${f.id === built ? ' built' : ''}`} onClick={() => onChange(f.id)}>
          <span className="format-item-head">
            <span className="format-item-name">
              <span className="format-shape-mini" style={{aspectRatio: `${f.width} / ${f.height}`}} />
              <b>{f.title}</b>
              {f.id === built && <Check className="format-built-icon" size={15} aria-hidden />}
            </span>
            <span className="muted">
              {f.slides.length} слайдов
              {f.id === built && <span className="format-built-label"> · собрана</span>}
            </span>
          </span>
          <span className="format-item-sub">{f.note}</span>
        </button>
      ))}
    </div>
  );

// Дата сборки на карточке: по ней видно, какая карусель свежая, а какую пора пересобрать
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'});

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
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((c) => [c.car.brand, c.car.model, c.id].join(' ').toLowerCase().includes(q)) : items;
  return (
    <aside className="lots-panel carousels-panel" data-mpanel="list">
      <div className="lots-title">Карусели <span className="muted">{items.length}</span></div>
      {items.length > 4 && <input className="lots-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: марка, модель, номер" />}
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
                <span className="muted">{[c.car.year, f?.title].filter(Boolean).join(' · ')}</span>
                <span className="muted small">{c.slides.length} слайдов · {shortDate(c.updatedAt)}</span>
                {pending.has(c.id) ? <span className="car-card-status">Удаляю…</span> : <div className="car-card-actions">
                  <button className="icon-btn" title={`Пересобрать в формате «${f?.title ?? ''}»${cost}`} aria-label="Пересобрать"
                    disabled={busy} onClick={stop(() => onRebuild(c))}><RefreshCw size={16} /></button>
                  <a className="icon-btn" href={c.lot?.url ?? encarAdUrl(c.id)} target="_blank" rel="noreferrer"
                    title={c.lot ? 'Открыть лот на kmotors' : `Открыть объявление на ${sourceName(c.id)}`}
                    aria-label={c.lot ? 'Открыть лот' : `Открыть на ${sourceName(c.id)}`} onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
                  <button className="icon-btn danger" title="Удалить" aria-label="Удалить" disabled={busy}
                    onClick={stop(() => onDelete(c))}><Trash2 size={16} /></button>
                </div>}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="empty small">{q ? 'Ничего не нашлось' : 'Каруселей пока нет — вставьте ссылку сверху'}</div>}
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
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => setDraft(own ? {...own.fields} : {}), [own]);
  if (!entry.texts) {
    return <div className="slide-texts"><span className="hint">Эту карусель собрали до правки текста — нажмите «Пересобрать», и текст можно будет менять.</span></div>;
  }
  if (!own) return null;
  const fields = TEXT_FIELDS.filter((f) => f.key in own.fields);
  if (!fields.length) return <div className="slide-texts"><span className="hint">На этом слайде только данные машины — текста для правки нет.</span></div>;
  const edited = entry.textOverrides?.[own.slide] ?? {};
  const changed = fields.filter((f) => (draft[f.key] ?? '') !== own.fields[f.key]);
  const save = (out: Record<string, string>) => onSave(own.slide, out);
  return (
    <div className="slide-texts">
      {fields.map((f) => (
        <label key={f.key} className="field">
          <span className="label">{f.label}{edited[f.key] ? ' · свой текст' : ''}</span>
          <textarea rows={Math.min(4, Math.max(1, (draft[f.key] ?? '').split('\n').length))} maxLength={TEXT_MAX}
            value={draft[f.key] ?? ''} onChange={(e) => setDraft((d) => ({...d, [f.key]: e.target.value}))} />
          {accentField(entry.format, f.key) && <span className="hint">Слово в {'{фигурных скобках}'} — цветом акцента; новая строка — Enter</span>}
        </label>
      ))}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !changed.length}
          onClick={() => save(Object.fromEntries(changed.map((f) => [f.key, draft[f.key] ?? ''])))}>Сохранить и пересобрать · бесплатно</button>
        {Object.keys(edited).length > 0 && (
          <button className="btn ghost" disabled={busy} title="Вернуть фразы, которые подобрала карусель"
            onClick={() => save(Object.fromEntries(Object.keys(edited).map((k) => [k, ''])))}>Вернуть исходный текст</button>
        )}
      </div>
      <span className="hint">Пустое поле — вернуть исходную фразу. Пересобирается та же карусель: формат, фразы других слайдов и цена остаются.</span>
    </div>
  );
};

/**
 * Слайды по центру: один большой, как в ленте Instagram, стрелки и полоса миниатюр.
 * Раньше — сетка по два в ряд, где слайд был «размером с ноготь». Клик по большому —
 * во весь экран (решения по дизайну принимаются по мелочам).
 */
const SlideViewer: React.FC<{entry: CarouselEntry; ratio: string; busy: boolean; onZoom: (i: number) => void;
  onEditTexts: (slide: string, fields: Record<string, string>) => Promise<void>}> = ({entry, ratio, busy, onZoom, onEditTexts}) => {
  const [at, setAt] = useState(0);
  const [editing, setEditing] = useState(false);
  // Другая машина — с первого слайда; пересборка той же (своя цена, свой текст) — на том же
  // слайде: человек только что правил его и хочет увидеть результат, а не обложку
  useEffect(() => { setAt(0); setEditing(false); }, [entry.id]);
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
          imgProps={(i) => ({onClick: () => onZoom(i), title: 'Открыть во весь экран'})} />
        {at > 0 && <button className="slide-arrow left" onClick={() => go(-1)} aria-label="Предыдущий слайд">‹</button>}
        {at < n - 1 && <button className="slide-arrow right" onClick={() => go(1)} aria-label="Следующий слайд">›</button>}
      </div>
      <div className="slide-bar">
        <span className="muted">{at + 1} / {n}</span>
        <a className="link" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}>скачать этот слайд</a>
        <button type="button" className="link" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? 'скрыть правку текста' : 'редактировать текст'}
        </button>
      </div>
      {editing && <SlideTextEditor entry={entry} at={at} busy={busy} onSave={onEditTexts} />}
      <div className="slide-thumbs">
        {entry.slides.map((src, i) => (
          <button key={src} className={i === at ? 'slide-thumb on' : 'slide-thumb'} onClick={() => setAt(i)} style={{aspectRatio: ratio}}>
            <img src={thumb(`${src}${v}`, 160)} alt={`Слайд ${i + 1}`} loading="lazy" />
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
const StyleList: React.FC<{value: string | null; built?: string | null; onChange: (id: string | null) => void}> = ({value, built, onChange}) => {
  const ready = FAMILIES.filter((f) => f.ready);
  // Плитки сеткой: кружки цветов и название, описание — в подсказке. Длинный список с описаниями
  // рядом со списком форматов читался как второй такой же выбор (владелец 21.10)
  const tile = (id: string | null, title: string, note: string, swatch?: string[]) =>
    <button key={id ?? 'brand'} type="button" role="radio" aria-checked={value === id} title={note}
      className={`style-tile${value === id ? ' on' : ''}${built !== undefined && built === id ? ' built' : ''}`} onClick={() => onChange(id)}>
      <span className="style-swatch">{(swatch ?? []).map((c) => <i key={c} style={{background: c}} />)}</span>
      <span className="style-tile-name">{title}</span>
      {built !== undefined && built === id && <Check className="format-built-icon" size={14} aria-hidden />}
    </button>;
  return <div className="style-grid" role="radiogroup" aria-label="Стиль карусели">
    {tile(null, 'Как в бренде', 'Оформление из настроек бренда, любой формат')}
    {ready.map((f) => tile(f.id, f.title, `${f.note} · только 4:5`, [f.colors.bg, f.colors.accent, f.colors.light]))}
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
  // Язык слайдов — из профиля: виден здесь, чтобы не удивляться английской карусели
  const slidesLang = carouselLang(profile.language) === 'ru' ? 'русском' : 'английском';
  const {refresh: refreshAccess} = useSession();
  const cost = useCost('carousels', config.credits);
  const formats = config.carouselFormats ?? [];
  // Сохранён стиль-семейство — формат его («Разворот»), иначе выбор открылся бы с неактивным форматом
  const [format, setFormatState] = useState<string>(() => (savedFamily() ? FAMILY_FORMAT : savedFormat() ?? 'showcase'));
  const setFormat = (id: string) => {
    setFormatState(id);
    try { localStorage.setItem(FORMAT_KEY, id); } catch { /* приватный режим */ }
  };
  const [family, setFamilyState] = useState<string | null>(() => savedFamily());
  const setFamily = (id: string | null) => {
    setFamilyState(id);
    try { if (id) localStorage.setItem(FAMILY_KEY, id); else localStorage.removeItem(FAMILY_KEY); } catch { /* приватный режим */ }
    if (id) { setFormatState(FAMILY_FORMAT); try { localStorage.setItem(FORMAT_KEY, FAMILY_FORMAT); } catch { /* приватный режим */ } }
  };
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [linkError, setLinkError] = useState('');
  const [entry, setEntry] = useState<CarouselEntry | null>(null);
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
  const run = async (link: string, seed?: number, fmt: string = format, fam: string | null = fmt === FAMILY_FORMAT ? family : null) => {
    setBusy(true);
    setLinkError('');
    try {
      const made = await api.buildCarousel(link, fmt, seed, fam);
      setEntry(made);
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
    try { ({id} = parseCarouselSource(link)); } catch (e) { setLinkError(e instanceof Error ? e.message : String(e)); return; }
    const known = history.find((h) => h.id === id);
    if (known) { setEntry(known); setLinkError(''); setMtab('main'); return; }
    run(link);
  };

  // Своя цена — пересборка без кредита: та же машина, формат и вариант (server/carousel.mjs)
  const reprice = async (price: number | null) => {
    if (!entry) return;
    setBusy(true);
    try {
      const made = await api.repriceCarousel(entry.id, price);
      setEntry(made);
      setHistory((h) => h.map((x) => (x.id === made.id ? made : x)));
      toast(price === null ? 'Цена — снова по курсу, слайды пересобраны' : 'Слайды пересобраны с вашей ценой');
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
      toast(Object.values(fields).every((v) => !v.trim()) ? 'Вернули исходный текст, слайды пересобраны' : 'Слайды пересобраны с вашим текстом');
    } catch (e) { report(e); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    const c = history.find((h) => h.id === id);
    const name = c ? [c.car.brand, c.car.model].filter(Boolean).join(' ') || `№ ${id}` : `№ ${id}`;
    if (!window.confirm(`Удалить карусель «${name}» со всеми слайдами?`)) return;
    // Пока сервер отвечает — карточка тусклая с «Удаляю…», второй раз не нажать; после — плашка
    setPending((p) => new Set(p).add(id));
    try {
      await api.deleteCarousel(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      setEntry((e) => (e?.id === id ? null : e));
      toast(`Удалено: ${name}`);
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

  return (
    <>
    <div className="quick" data-mtab={mtab} ref={quickRef}>
      {/* quick-screen — один экран, как у «Ролика по лоту»: колонки прокручиваются внутри */}
      <div className="quick-screen">
      <QuickLink onLink={fromLink} error={linkError} busy={busy} parse={parseCarouselSource}
        placeholder={`Вставьте ссылку на объявление Encar, che168 или Carsensor — карусель соберётся сама (слайды на ${slidesLang})`} />
      {/* Сборка — 10–20 секунд (замер 30.09: 13 с на 9 слайдов); экран закрыт окном, как у лота по ссылке */}
      <BusyModal step={busy ? 0 : null} steps={['Собираю карусель: данные и слайды']} label="Сборка карусели"
        note="Обычно 10–20 секунд. Не закрывайте страницу" />

      <main className="quick-main">
        <CarouselsPanel items={history} current={entry?.id} formats={formats} busy={busy} cost={cost} pending={pending}
          onOpen={(e) => { setEntry(e); setLinkError(''); setMtab('main'); }}
          onRebuild={(e) => run(e.id, e.seed, e.format ?? 'classic', e.family ?? null)}
          onDelete={(e) => remove(e.id)} />

        <section className="quick-preview">
          {entry
            ? <SlideViewer entry={entry} ratio={ratio} busy={busy} onZoom={setOpen} onEditTexts={editTexts} />
            : <div className="empty">Вставьте ссылку на объявление Encar, che168 или Carsensor — слайды появятся здесь.</div>}
        </section>

        <section className="quick-side">
          {entry && (
            <div className="quick-title">
              <h1>{[entry.car.brand, entry.car.model].filter(Boolean).join(' ') || `№ ${entry.id}`} <span className="muted">{entry.car.year ?? ''}</span></h1>
              <CarSummary entry={entry} />
            </div>
          )}
          {/* Сначала стиль, потом формат: семейство задаёт формат (только 4:5), и выбор формата
              больше не сбрасывает стиль */}
          <div className="quick-label">Стиль</div>
          <StyleList value={family} built={entry ? (entry.family ?? null) : undefined} onChange={setFamily} />
          <div className="quick-label">Формат карусели{family ? ' · в этом стиле — «Разворот» 4:5' : ''}</div>
          <FormatList formats={formats} value={format} built={entry ? (entry.format ?? 'classic') : undefined}
            only={family ? FAMILY_FORMAT : undefined} onChange={setFormat} />
          {/* Пресет меняет вёрстку всех форматов — видно здесь, чтобы не искать причину «чужого» вида в настройках */}
          {!family && <div className="design-summary">Пресет: {DESIGNS.find((d) => d.id === brand.design)?.title ?? 'Исходный'} · <a href="#/settings/brand">Настроить</a></div>}

          {entry && (
            <div className="carousel-actions">
              {otherFormat ? (
                <button className="btn primary big" onClick={() => run(entry.id)} disabled={busy}>
                  {chosenFamily && (entry.family ?? null) !== family ? `Собрать в стиле «${chosenFamily.title}»` : !family && entry.family && (entry.format ?? 'classic') === format
                    ? 'Собрать в стиле бренда' : `Собрать в формате «${chosen?.title}»`}{cost}
                </button>
              ) : canSaveToGallery ? (
                <button className="btn primary big" disabled={busy || !slideFiles}
                  onClick={() => slideFiles && shareFiles(slideFiles).catch(report)}>
                  {slideFiles ? `В галерею: все ${entry.slides.length}` : 'Готовлю слайды…'}
                </button>
              ) : canSaveToFolder ? (
                <button className="btn primary big" onClick={saveAll} disabled={busy || saving !== null}>
                  {saving !== null ? `Сохраняю ${saving} из ${entry.slides.length}…` : `Скачать все ${entry.slides.length} в папку`}
                </button>
              ) : (
                <a className="btn primary big" href={`/api/carousels/${entry.id}/zip`}>Скачать все {entry.slides.length} · ZIP</a>
              )}
              {otherFormat && <span className="hint">Сейчас открыта «{entryFormat?.title}»{entry.family ? ` в стиле «${FAMILIES.find((f) => f.id === entry.family)?.title ?? entry.family}»` : ''} — выбрано другое. Карусель у машины одна: новая заменит прежнюю.</span>}
              {/* Запасной путь рядом с папкой: архив работает в любом браузере */}
              {!otherFormat && canSaveToFolder && !canSaveToGallery && (
                <a className="hint" href={`/api/carousels/${entry.id}/zip`}>или одним архивом · ZIP</a>
              )}
              {!otherFormat && savedTo?.id === entry.id && saving === null && (
                <span className="hint" style={{color: 'var(--ok)'}}>Сохранено {entry.slides.length} слайдов в папку «{savedTo.folder}»</span>
              )}
              {!otherFormat && canSaveToGallery && <span className="hint">В меню выберите «Сохранить изображения» — слайды попадут в «Фото». Там же можно сразу в Instagram.</span>}
              {!otherFormat && <PriceBox entry={entry} busy={busy} onReprice={reprice} />}
              <div className="btn-row">
                {!otherFormat && (entry.format !== 'classic' || brand.design || entry.family) && (
                  <button className="btn" onClick={() => run(entry.id)} disabled={busy}
                    title="Та же машина, другие компоновка и фразы">Другой вариант{cost}</button>
                )}
                {!otherFormat && (
                  <button className="btn ghost" onClick={() => run(entry.id, entry.seed)} disabled={busy}
                    title="Те же компоновка и фразы, свежие данные и текущий бренд">Пересобрать{cost}</button>
                )}
                <a className="btn ghost" href={entry.lot?.url ?? encarAdUrl(entry.id)} target="_blank" rel="noreferrer">{entry.lot ? 'Открыть лот' : `На ${sourceName(entry.id)}`}</a>
                <button className="btn ghost" onClick={() => remove(entry.id)} disabled={busy}>Удалить</button>
              </div>
            </div>
          )}
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
      {id: 'list', label: 'Собранные', icon: <List size={20} />, badge: history.length},
      {id: 'main', label: 'Карусель', icon: <Images size={20} />},
    ]} />
    </>
  );
};
