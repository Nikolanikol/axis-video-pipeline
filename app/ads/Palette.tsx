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
type Section = 'content' | 'look' | 'motion';

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
};

// Статусы сохранения словами описания (раздел 8)
const SAVE_TEXT: Record<SaveState, string> = {saved: 'Сохранено', dirty: 'Есть изменения', saving: 'Сохраняем…', error: 'Не удалось сохранить'};

// «4 сцены», «5 сцен»: число сцен у форматов — от 4 до 5, но склоняем честно
const scenesWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'сцена' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'сцены' : 'сцен'}`;
const seconds = (f: FormatMeta) => Math.round(f.durationInFrames / f.fps);

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

export const Palette: React.FC<Props> = ({lot, market, format, brand, pairs, palettes, save, onRetrySave, onChange, onPhotos, onError,
  onFormat, scene, onScene, render}) => {
  const [open, setOpen] = useState<Section | null>(() => readOpen(lot.id));
  useEffect(() => { setOpen(readOpen(lot.id)); }, [lot.id]);
  // Открытие одной секции закрывает другую, повторное нажатие закрывает (раздел 2)
  const toggle = (section: Section) => {
    const next = open === section ? null : section;
    setOpen(next);
    writeOpen(lot.id, next);
  };
  const theme = lotTheme(brand, lot);
  const style = theme.design ? resolveStyle(theme, theme.design) : null;
  const motionSummary = style ? (MOTION_FIELDS as readonly StyleField[]).map((f) => optionTitle(f, style[f])).join(' · ') : 'в пресетах';
  const current = format.scenes.find((s) => s.id === scene) ?? format.scenes[0];

  const head = (id: Section, title: string, summary: string) => (
    <button type="button" className="palette-section-head" aria-expanded={open === id} onClick={() => toggle(id)}>
      {open === id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      <span className="palette-section-title">{title}</span>
      <span className="palette-section-summary">{summary}</span>
    </button>
  );

  return <div className="palette">
    <header className="palette-head">
      <h1>{[lot.brand, lot.model].filter(Boolean).join(' ') || 'Без названия'} <span className="muted">{lot.year || ''}</span></h1>
      <div className="palette-scope">
        Только этот ролик ·{' '}
        {save === 'error'
          ? <button type="button" className={`save save-${save} link`} onClick={onRetrySave}>{SAVE_TEXT[save]} — повторить</button>
          : <span className={`save save-${save}`}>{SAVE_TEXT[save]}</span>}
      </div>
    </header>

    <div className="palette-body">
      <section className="palette-section">
        {head('content', 'Содержание', `${format.title} · ${scenesWord(format.scenes.length)}`)}
        {open === 'content' && <div className="palette-section-body form">
          <Field label="Сценарий ролика">
            <select value={format.id} onChange={(e) => onFormat(e.target.value)}>
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.title} · {seconds(f)} с</option>)}
            </select>
          </Field>
          {/* Общие данные машины — меняют все сцены, где используются (раздел 3) */}
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
          <h2>Заметка <span className="muted">в ролик не попадает</span></h2>
          <NoteField lot={lot} onChange={onChange} />
        </div>}
      </section>

      <section className="palette-section">
        {head('look', 'Оформление', lookSummary(theme))}
        {open === 'look' && <div className="palette-section-body">
          <LookPanel lot={lot} brand={brand} pairs={pairs} palettes={palettes} onChange={onChange} embedded />
        </div>}
      </section>

      <section className="palette-section">
        {head('motion', 'Анимация', motionSummary)}
        {open === 'motion' && <div className="palette-section-body">
          {style
            // Все варианты сразу, без «Ещё приёмов» (владелец 20.10: «пусть видит, сколько у нас вариаций»)
            ? <StyleChoices theme={theme} fields={[...MOTION_FIELDS as readonly StyleField[]]} look="side"
              onChange={(field, id) => onChange({look: pickLook({...theme, [field]: id}) as Lot['look']})} />
            : <p className="hint">Движение есть у пресетов «Кино», «Редакционный», «Каталог» — выберите стиль в «Оформлении».
              «Исходный» — прежние форматы со своей анимацией.</p>}
        </div>}
      </section>
    </div>

    <footer className="palette-foot">
      <div className="palette-foot-line"><span>{lookSummary(theme)}</span><span>{seconds(format)} с · {scenesWord(format.scenes.length)}</span></div>
      {render}
    </footer>
  </div>;
};

/**
 * Поля выбранной сцены. Сцены у сценариев разные (config/formats.json): «Хук» с названием,
 * «Характеристики» / «Стопка» / «История» со строками характеристик, «Галерея» из фото, «Цена»,
 * «Контакты». В «Цене сразу» первая сцена — «Цена»: цена вместе с названием
 */
const SceneFields: React.FC<{sceneId: string; lot: LotEntry; market: Market; format: FormatMeta; onChange: (patch: Partial<LotEntry>) => void}> =
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
