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
import React, {useCallback, useEffect, useState} from 'react';
import {parseCarLink} from '../../src/shared/encarLink.js';
import {QuickLink} from '../ads/QuickLot';
import {ExternalLink, RefreshCw, Trash2} from 'lucide-react';
import {toast} from '../Toast';
import {api, CarouselEntry, CarouselFormat} from '../api';
import {useConfig} from '../config';
import {useCost, useSession} from '../auth';
import {carouselLang} from '../../src/carousel/i18n';
import {BusyModal} from '../BusyModal';
import {canSaveToFolder, canSaveToGallery, saveToFolder, shareFiles, slideName, usePreparedFiles} from '../saveFiles';

const km = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ru-RU')} км`);

/** Сводка по машине: по ней видно, ту ли карточку подтянули, не открывая слайды */
const CarSummary: React.FC<{entry: CarouselEntry}> = ({entry}) => {
  const c = entry.car;
  const bits = [
    c.year, km(c.mileageKm), c.transmission, c.fuel,
    c.price?.usd ? `$${c.price.usd.toLocaleString('ru-RU')}` : null,
    c.history ? `${c.history.accidentsTotal} ДТП` : 'история недоступна',
    c.history ? `${c.history.ownerChanges} смен владельца` : null,
  ].filter(Boolean);
  return (
    <div className="job">
      <div className="job-head">
        <b>{[c.brand, c.model, c.grade, c.trim].filter(Boolean).join(' ') || `№ ${entry.id}`}</b>
        <span>№ {entry.id}</span>
      </div>
      <div className="muted">{bits.join(' · ')}</div>
      {c.price && (
        <div className="muted">
          курс {Math.round(1 / c.price.krwToUsd).toLocaleString('ru-RU')} ₩ за $1, котировка {c.price.quotedAt}
        </div>
      )}
    </div>
  );
};

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

    return (
      <div className="lightbox" onClick={onClose}>
        {/* Клик по самой картинке не закрывает: по ней хочется возить курсором и разглядывать */}
        <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
          <img src={`${entry.slides[at]}?v=${encodeURIComponent(entry.updatedAt)}`} alt={`Слайд ${at + 1}`} />
          <div className="lightbox-bar">
            <button className="btn ghost" onClick={() => onMove(-1)} disabled={at === 0}>← Назад</button>
            <span className="muted">{at + 1} / {entry.slides.length}</span>
            <button className="btn ghost" onClick={() => onMove(1)} disabled={at === entry.slides.length - 1}>Вперёд →</button>
            <a className="btn primary" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}>Скачать</a>
            <button className="btn ghost" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    );
  };

/** Формат столбцом справа: пропорция нарисована («1:1» и «4:5» словами различают не все),
 *  число слайдов и одна строка, зачем этот формат */
const FormatList: React.FC<{formats: CarouselFormat[]; value: string; onChange: (id: string) => void}> =
  ({formats, value, onChange}) => (
    <div className="format-list" role="radiogroup" aria-label="Формат карусели">
      {formats.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={f.id === value}
          className={f.id === value ? 'format-item on' : 'format-item'} onClick={() => onChange(f.id)}>
          <span className="format-item-head">
            <span className="format-item-name">
              <span className="format-shape-mini" style={{aspectRatio: `${f.width} / ${f.height}`}} />
              <b>{f.title}</b>
            </span>
            <span className="muted">{f.slides.length} слайдов</span>
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
 * число слайдов, дата. На карточке — свои кнопки: пересобрать, в каталоге, удалить (владелец
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
    <aside className="lots-panel carousels-panel">
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
              <img src={`${c.slides[0]}?v=${encodeURIComponent(c.updatedAt)}`} alt=""
                style={{aspectRatio: f ? `${f.width} / ${f.height}` : '9 / 16'}} loading="lazy" />
              <div className="car-card-body">
                <b>{[c.car.brand, c.car.model].filter(Boolean).join(' ') || `№ ${c.id}`}</b>
                <span className="muted">{[c.car.year, f?.title].filter(Boolean).join(' · ')}</span>
                <span className="muted small">{c.slides.length} слайдов · {shortDate(c.updatedAt)}</span>
                {pending.has(c.id) ? <span className="car-card-status">Удаляю…</span> : <div className="car-card-actions">
                  <button className="icon-btn" title={`Пересобрать в формате «${f?.title ?? ''}»${cost}`} aria-label="Пересобрать"
                    disabled={busy} onClick={stop(() => onRebuild(c))}><RefreshCw size={16} /></button>
                  <a className="icon-btn" href={c.car.source} target="_blank" rel="noreferrer" title="Открыть в каталоге"
                    aria-label="Открыть в каталоге" onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
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
 * Слайды по центру: один большой, как в ленте Instagram, стрелки и полоса миниатюр.
 * Раньше — сетка по два в ряд, где слайд был «размером с ноготь». Клик по большому —
 * во весь экран (решения по дизайну принимаются по мелочам).
 */
const SlideViewer: React.FC<{entry: CarouselEntry; ratio: string; onZoom: (i: number) => void}> = ({entry, ratio, onZoom}) => {
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [entry.id, entry.updatedAt]);
  const n = entry.slides.length;
  const go = (d: number) => setAt((i) => Math.min(n - 1, Math.max(0, i + d)));
  const v = `?v=${encodeURIComponent(entry.updatedAt)}`;
  return (
    <div className="slide-viewer">
      <div className="slide-stage" style={{aspectRatio: ratio}}>
        {/* Ключ по времени сборки: иначе браузер покажет прежнюю картинку из кэша */}
        <img src={`${entry.slides[at]}${v}`} alt={`Слайд ${at + 1}`} onClick={() => onZoom(at)} title="Открыть во весь экран" />
        {at > 0 && <button className="slide-arrow left" onClick={() => go(-1)} aria-label="Предыдущий слайд">‹</button>}
        {at < n - 1 && <button className="slide-arrow right" onClick={() => go(1)} aria-label="Следующий слайд">›</button>}
      </div>
      <div className="slide-bar">
        <span className="muted">{at + 1} / {n}</span>
        <a className="link" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}>скачать этот слайд</a>
      </div>
      <div className="slide-thumbs">
        {entry.slides.map((src, i) => (
          <button key={src} className={i === at ? 'slide-thumb on' : 'slide-thumb'} onClick={() => setAt(i)} style={{aspectRatio: ratio}}>
            <img src={`${src}${v}`} alt={`Слайд ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
};

// Последний выбранный формат — удобство этого браузера, не настройка
const FORMAT_KEY = 'axis-video:carousel-format';
const savedFormat = () => { try { return localStorage.getItem(FORMAT_KEY); } catch { return null; } };

export const CarouselTool: React.FC = () => {
  const {config, profile, report} = useConfig();
  // Язык слайдов — из профиля: виден здесь, чтобы не удивляться английской карусели
  const slidesLang = carouselLang(profile.language) === 'ru' ? 'русском' : 'английском';
  const {refresh: refreshAccess} = useSession();
  const cost = useCost('carousels', config.credits);
  const formats = config.carouselFormats ?? [];
  const [format, setFormatState] = useState<string>(() => savedFormat() ?? 'showcase');
  const setFormat = (id: string) => { setFormatState(id); try { localStorage.setItem(FORMAT_KEY, id); } catch { /* приватный режим */ } };
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [linkError, setLinkError] = useState('');
  const [entry, setEntry] = useState<CarouselEntry | null>(null);
  const [history, setHistory] = useState<CarouselEntry[]>([]);
  // Какой слайд открыт во весь экран; null — нет
  const [open, setOpen] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.carousels().then((list) => {
      setHistory(list);
      setEntry((e) => e ?? list[0] ?? null);
    }).catch(report);
  }, [report]);
  useEffect(refresh, [refresh]);

  // fmt — в каком формате собрать: по умолчанию выбранный справа; «Пересобрать» из списка
  // передаёт формат самой карусели, иначе пересборка молча меняла бы её формат
  const run = async (link: string, seed?: number, fmt: string = format) => {
    setBusy(true);
    setLinkError('');
    try {
      const made = await api.buildCarousel(link, fmt, seed);
      setEntry(made);
      setHistory((h) => [made, ...h.filter((x) => x.id !== made.id)]);
    } catch (e) {
      // Ошибку сборки по ссылке — под строкой ссылки: человек смотрит туда
      setLinkError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); refreshAccess(); }
  };

  // Ссылка сверху: эта машина уже собрана — открываем готовую (пересборка стоит кредит и
  // затёрла бы прежнюю: карусель у машины одна). Нет — собираем в выбранном формате
  const fromLink = (link: string) => {
    let id: string;
    try { ({id} = parseCarLink(link)); } catch (e) { setLinkError(e instanceof Error ? e.message : String(e)); return; }
    const known = history.find((h) => h.id === id);
    if (known) { setEntry(known); setLinkError(''); return; }
    run(link);
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
    } catch (e) { report(e); } finally { setSaving(null); }
  };
  const slideFiles = usePreparedFiles(entry?.id ?? null, (entry?.slides ?? []).map((_, i) => ({
    url: `/api/carousels/${entry!.id}/slide/${i + 1}/download`,
    name: `${entry!.id}-${i + 1}.png`, type: 'image/png',
  })));

  const entryFormat = formats.find((f) => f.id === (entry?.format ?? 'classic'));
  const chosen = formats.find((f) => f.id === format);
  // Выбран другой формат, чем у открытой карусели, — главное действие справа: собрать в нём
  const otherFormat = !!entry && (entry.format ?? 'classic') !== format;
  const ratio = entryFormat ? `${entryFormat.width} / ${entryFormat.height}` : '9 / 16';

  return (
    <div className="quick">
      <QuickLink onLink={fromLink} error={linkError} busy={busy}
        placeholder={`Вставьте ссылку на объявление Encar — карусель соберётся сама (слайды на ${slidesLang})`} />
      {/* Сборка — 10–20 секунд (замер 30.09: 13 с на 9 слайдов); экран закрыт окном, как у лота по ссылке */}
      <BusyModal step={busy ? 0 : null} steps={['Собираю карусель: данные и слайды']} label="Сборка карусели"
        note="Обычно 10–20 секунд. Не закрывайте страницу" />

      <main className="quick-main">
        <CarouselsPanel items={history} current={entry?.id} formats={formats} busy={busy} cost={cost} pending={pending}
          onOpen={(e) => { setEntry(e); setLinkError(''); }}
          onRebuild={(e) => run(e.id, e.seed, e.format ?? 'classic')}
          onDelete={(e) => remove(e.id)} />

        <section className="quick-preview">
          {entry
            ? <SlideViewer entry={entry} ratio={ratio} onZoom={setOpen} />
            : <div className="empty">Вставьте ссылку на объявление Encar — слайды появятся здесь.</div>}
        </section>

        <section className="quick-side">
          {entry && (
            <div className="quick-title">
              <h1>{[entry.car.brand, entry.car.model].filter(Boolean).join(' ') || `№ ${entry.id}`} <span className="muted">{entry.car.year ?? ''}</span></h1>
              <CarSummary entry={entry} />
            </div>
          )}
          <div className="quick-label">Формат карусели</div>
          <FormatList formats={formats} value={format} onChange={setFormat} />

          {entry && (
            <div className="carousel-actions">
              {otherFormat ? (
                <button className="btn primary big" onClick={() => run(entry.id)} disabled={busy}>
                  Собрать в формате «{chosen?.title}»{cost}
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
              {otherFormat && <span className="hint">Сейчас открыта «{entryFormat?.title}» — выбран другой формат. Карусель у машины одна: новая заменит прежнюю.</span>}
              {!otherFormat && savedTo?.id === entry.id && saving === null && (
                <span className="hint" style={{color: 'var(--ok)'}}>Сохранено {entry.slides.length} слайдов в папку «{savedTo.folder}»</span>
              )}
              {!otherFormat && canSaveToGallery && <span className="hint">В меню выберите «Сохранить изображения» — слайды попадут в «Фото». Там же можно сразу в Instagram.</span>}
              <div className="btn-row">
                {!otherFormat && entry.format !== 'classic' && (
                  <button className="btn" onClick={() => run(entry.id)} disabled={busy}
                    title="Та же машина, другие компоновка и фразы">Другой вариант{cost}</button>
                )}
                {!otherFormat && (
                  <button className="btn ghost" onClick={() => run(entry.id, entry.seed)} disabled={busy}
                    title="Те же компоновка и фразы, свежие данные и текущий бренд">Пересобрать{cost}</button>
                )}
                <a className="btn ghost" href={entry.car.source} target="_blank" rel="noreferrer">В каталоге</a>
                <button className="btn ghost" onClick={() => remove(entry.id)} disabled={busy}>Удалить</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {entry && open !== null && (
        <Lightbox
          entry={entry}
          at={open}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen((n) => Math.min(entry.slides.length - 1, Math.max(0, (n ?? 0) + d)))}
        />
      )}
    </div>
  );
};
