// Палитра ролика по объявлению на компьютере — описание владельца: docs/palette.md.
// Шапка (машина, «Только этот ролик», статус сохранения), три секции-гармошки со сводками
// («Содержание», «Оформление», «Анимация») и закреплённый низ: стиль, длительность, сцены и сборка.
// Прокручивается середина; шапка и низ стоят, превью — рядом в своей колонке.
// Телефон — отдельный формат (своё описание владельца), там пока прежняя раскладка LotTool.
import React, {useEffect, useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import {DESIGNS, matchDesignPreset} from '../../src/shared/designs';
import {MOTION_FIELDS, optionTitle, resolveStyle} from '../../src/design/style/registry.js';
import {pickLook} from '../../src/design/style/look.js';
import {FORMATS} from '../../src/shared/model';
import type {FormatMeta, Lot, Market, Theme} from '../../src/shared/types';
import type {FontPair, LotEntry, Palette as PaletteColors} from '../api';
import {CarFields, ContactsEditor, Field, NoteField, PhotosEditor, PriceEditor, SpecsEditor} from '../LotForm';
import {StyleChoices, type StyleField} from '../StyleChoices';
import {LookPanel, lotTheme} from './LookPanel';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type Section = 'content' | 'look' | 'motion';

type Props = {
  lot: LotEntry; market: Market; format: FormatMeta; brand: Theme;
  pairs: FontPair[]; palettes: PaletteColors[];
  save: SaveState; onRetrySave: () => void;
  onChange: (patch: Partial<LotEntry>) => void; onPhotos: (lot: LotEntry) => void; onError: (e: unknown) => void;
  onFormat: (id: string) => void;
  /** Выбранная сцена: общая с превью — выбор в любом месте меняет оба */
  scene: string; onScene: (id: string) => void;
  /** Кнопка сборки со свёрнутым списком роликов — её собирает LotTool (знает про сохранение) */
  render: React.ReactNode;
  /** Фото с самого объявления (Encar, che168, Carsensor) — добрать снимки в ролик (EncarImport) */
  photoSource?: React.ReactNode;
};

// Статусы сохранения словами описания (раздел 8)
const SAVE_TEXT: Record<SaveState, string> = {saved: 'Сохранено', dirty: 'Есть изменения', saving: 'Сохраняем…', error: 'Не удалось сохранить'};

// «4 сцены», «5 сцен»: число сцен у форматов — от 4 до 5, но склоняем честно
export const scenesWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'сцена' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'сцены' : 'сцен'}`;
export const seconds = (f: FormatMeta) => Math.round(f.durationInFrames / f.fps);

// Последняя открытая секция — своя у каждого ролика (раздел 2: «при возвращении восстанавливается»).
// Это состояние интерфейса, не настройка видео, поэтому в браузере, а не в объявлении. Хранилище
// может быть недоступно (приватное окно) — тогда просто «Содержание»
const OPEN_KEY = 'kok.palette.open';
const readOpen = (lotId: string): Section | null => {
  try {
    const all = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, Section | null>;
    return lotId in all ? all[lotId] : 'content';
  } catch { return 'content'; }
};
const writeOpen = (lotId: string, section: Section | null) => {
  try {
    const all = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, Section | null>;
    all[lotId] = section;
    localStorage.setItem(OPEN_KEY, JSON.stringify(all));
  } catch { /* недоступно — раскрытие просто не запомнится */ }
};

/** Сводка оформления: «Каталог · Графит», при ручных правках цвета или шрифта — «· изменён» */
export const lookSummary = (theme: Theme) => {
  const design = DESIGNS.find((d) => d.id === theme.design);
  if (!design) return 'Исходный';
  const preset = matchDesignPreset(theme);
  return preset ? `${design.title} · ${preset.title}` : `${design.title} · изменён`;
};

export type BodyProps = Pick<Props, 'lot' | 'market' | 'format' | 'brand' | 'pairs' | 'palettes' | 'onChange' | 'onPhotos' | 'onError' | 'onFormat' | 'scene' | 'onScene' | 'photoSource'>;
type SectionsProps = BodyProps & {open: Section | null; onToggle: (section: Section) => void};

const two = (n: number) => String(n).padStart(2, '0');

/** Сводки разделов — общие у компьютера и телефона */
export const sectionSummaries = (lot: LotEntry, brand: Theme, format: FormatMeta) => {
  const theme = lotTheme(brand, lot);
  const style = theme.design ? resolveStyle(theme, theme.design) : null;
  return {
    content: `${format.title} · ${scenesWord(format.scenes.length)}`,
    look: lookSummary(theme),
    motion: style ? (MOTION_FIELDS as readonly StyleField[]).map((f) => optionTitle(f, style[f])).join(' · ') : 'в пресетах',
  };
};

/** «Содержание» компьютера: сценарий, машина, сцены с полями выбранной, фото, заметка */
export const ContentBody: React.FC<BodyProps> = ({lot, market, format, onChange, onPhotos, onError, onFormat, scene, onScene, photoSource}) => {
  const current = format.scenes.find((s) => s.id === scene) ?? format.scenes[0];
  return <div className="palette-section-body form">
    <Field label="Сценарий ролика">
      <select value={format.id} onChange={(e) => onFormat(e.target.value)}>
        {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.title} · {seconds(f)} с</option>)}
      </select>
    </Field>
    {/* Общие данные машины — меняют все сцены, где используются (раздел 3) */}
    <h2>Машина</h2>
    <CarFields lot={lot} market={market} onChange={onChange} />
    {/* Сцены — по сценарию, связаны с превью в обе стороны: выбор здесь перематывает плеер,
        плеер дошёл до сцены — она подсвечивается здесь */}
    <div className="palette-scenes" role="tablist" aria-label="Сцены ролика">
      {format.scenes.map((s, i) => <button key={s.id} type="button" role="tab" aria-selected={s.id === current.id}
        className={`palette-scene${s.id === current.id ? ' on' : ''}`} onClick={() => onScene(s.id)}>{i + 1} · {s.title}</button>)}
    </div>
    <div className="palette-scene-body">
      <h2>{current.title}</h2>
      <SceneFields sceneId={current.id} lot={lot} market={market} format={format} onChange={onChange} />
    </div>
    <PhotosEditor lot={lot} format={format} onChange={onChange} onPhotos={onPhotos} onError={onError} />
    {photoSource}
    <h2>Заметка <span className="muted">в ролик не попадает</span></h2>
    <NoteField lot={lot} onChange={onChange} />
  </div>;
};

/** «Оформление» компьютера — полная панель оформления ролика */
export const LookBody: React.FC<BodyProps> = ({lot, brand, pairs, palettes, onChange}) =>
  <div className="palette-section-body">
    <LookPanel lot={lot} brand={brand} pairs={pairs} palettes={palettes} onChange={onChange} embedded />
  </div>;

/** «Анимация» — все варианты трёх групп сразу (компьютер); у телефона своя подача — MobileLotEditor */
export const MotionBody: React.FC<BodyProps> = ({lot, brand, onChange}) => {
  const theme = lotTheme(brand, lot);
  return <div className="palette-section-body">
    {theme.design
      // Все варианты сразу, без «Ещё приёмов» (владелец 20.10: «пусть видит, сколько у нас вариаций»)
      ? <StyleChoices theme={theme} fields={[...MOTION_FIELDS as readonly StyleField[]]} look="side"
        onChange={(field, id) => onChange({look: pickLook({...theme, [field]: id}) as Lot['look']})} />
      : <MotionUnavailable />}
  </div>;
};

export const MotionUnavailable: React.FC = () => <p className="hint">Движение есть у пресетов «Кино», «Редакционный», «Каталог» —
  выберите стиль в «Оформлении». «Исходный» — прежние форматы со своей анимацией.</p>;

/** Три секции-гармошки компьютера: заголовок со сводкой, под ним — тело открытой */
export const PaletteSections: React.FC<SectionsProps> = (props) => {
  const {lot, brand, format, open, onToggle} = props;
  const summary = sectionSummaries(lot, brand, format);
  const head = (id: Section, title: string) => (
    <button type="button" className="palette-section-head" aria-expanded={open === id} onClick={() => onToggle(id)} title={summary[id]}>
      {open === id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      <span className="palette-section-title">{title}</span>
      <span className="palette-section-summary">{summary[id]}</span>
    </button>
  );
  return <>
    <section className="palette-section">{head('content', 'Содержание')}{open === 'content' && <ContentBody {...props} />}</section>
    <section className="palette-section">{head('look', 'Оформление')}{open === 'look' && <LookBody {...props} />}</section>
    <section className="palette-section">{head('motion', 'Анимация')}{open === 'motion' && <MotionBody {...props} />}</section>
  </>;
};

export const Palette: React.FC<Props> = (props) => {
  const {lot, format, brand, save, onRetrySave, render} = props;
  const [open, setOpen] = useState<Section | null>(() => readOpen(lot.id));
  useEffect(() => { setOpen(readOpen(lot.id)); }, [lot.id]);
  // Открытие одной секции закрывает другую, повторное нажатие закрывает (раздел 2)
  const toggle = (section: Section) => {
    const next = open === section ? null : section;
    setOpen(next);
    writeOpen(lot.id, next);
  };
  const theme = lotTheme(brand, lot);

  return <div className="palette">
    <header className="palette-head">
      <h1>{[lot.brand, lot.model].filter(Boolean).join(' ') || 'Без названия'} <span className="muted">{lot.year || ''}</span></h1>
      <div className="palette-scope">
        Только этот ролик · <SaveStatus save={save} onRetry={onRetrySave} />
      </div>
    </header>

    <div className="palette-body">
      <PaletteSections {...props} open={open} onToggle={toggle} />
    </div>

    <footer className="palette-foot">
      <div className="palette-foot-line"><span>{lookSummary(theme)}</span><span>{seconds(format)} с · {scenesWord(format.scenes.length)}</span></div>
      {render}
    </footer>
  </div>;
};

/** Статус сохранения; при ошибке — кнопка повтора (раздел 8). Общий у компьютера и телефона */
export const SaveStatus: React.FC<{save: SaveState; onRetry: () => void}> = ({save, onRetry}) => save === 'error'
  ? <button type="button" className={`save save-${save} link`} onClick={onRetry}>{SAVE_TEXT[save]} — повторить</button>
  : <span className={`save save-${save}`}>{SAVE_TEXT[save]}</span>;

/**
 * Поля выбранной сцены. Сцены у сценариев разные (config/formats.json): «Хук» с названием,
 * «Характеристики» / «Стопка» / «История» со строками характеристик, «Галерея» из фото, «Цена»,
 * «Контакты». В «Цене сразу» первая сцена — «Цена»: цена вместе с названием
 */
export const SceneFields: React.FC<{sceneId: string; lot: LotEntry; market: Market; format: FormatMeta; onChange: (patch: Partial<LotEntry>) => void}> =
  ({sceneId, lot, market, format, onChange}) => {
    if (sceneId === 'hook' && format.id === 'price-first') return <PriceEditor lot={lot} market={market} format={format} onChange={onChange} />;
    if (sceneId === 'hook') return <p className="hint">Название, год и подзаголовок — в общих данных выше. Фото первого кадра — первое в «Фото» ниже (или отмеченное «Хук»).</p>;
    if (sceneId === 'specs' || sceneId === 'stack') return <SpecsEditor lot={lot} onChange={onChange} />;
    if (sceneId === 'history') return <>
      <p className="hint">История Encar (страховые случаи, владельцы) показывается сама, если она есть. Ниже — строки характеристик этой сцены.</p>
      <SpecsEditor lot={lot} onChange={onChange} />
    </>;
    if (sceneId === 'gallery') return <p className="hint">Сцена из фото объявления: порядок и места — в «Фото» ниже.</p>;
    if (sceneId === 'price') return <PriceEditor lot={lot} market={market} format={format} onChange={onChange} />;
    if (sceneId === 'cta') return <ContactsEditor lot={lot} market={market} format={format} onChange={onChange} />;
    return null;
  };
