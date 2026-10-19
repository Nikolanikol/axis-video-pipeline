// Палитра ролика по объявлению на компьютере — мобильная палитра версии 3, перенесённая на ПК
// (владелец 20.10: «возьмём мобильную панель инструментов и адаптируем на ПК»). Прежние
// секции-гармошки «Содержание / Оформление / Анимация» (docs/palette.md, этап 1) заменены ею.
// Две колонки справа от списка объявлений:
//   превью — по кругу; под ним панель плеера (SceneScrubber:
//   ▶, время, перемотка);
//   палитра — машина и статус → вкладки «Оформление | Текст | Фото | Переход | Настройки» → все варианты
//   выбранной вкладки плитками (оформление — миниатюрой этого же ролика, анимация — выбор сразу
//   проигрывает приём в превью) → низ со сборкой и готовыми роликами.
// «Настройки» встают на место плиток: сцены сегментами, «О ролике» и «Оформление» (точная
// настройка, которой на телефоне нет — на компьютере для неё есть место). Поля — те же, что у телефона.
// Данные — editLot / saveLot / beforeRender из LotTool. Вкладка и открытая панель — в localStorage
// по компании и объявлению.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {AdProps, FormatMeta, Market, Theme} from '../../src/shared/types';
import type {FontPair, LotEntry, Palette as PaletteColors} from '../api';
import {useConfig} from '../config';
import {NoteField} from '../LotForm';
import {Preview, type PreviewControl, type SceneSeek} from '../Preview';
import {LookPanel, lotTheme} from './LookPanel';
import {compositionTitle, LookStrip, MobileAbout, MobileContent, motionTitle, MotionStrip, PALETTE_TABS, playMotion, type PaletteTab} from './MobileBodies';
import {SceneScrubber} from './SceneScrubber';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

type Props = {
  lot: LotEntry; input: AdProps; market: Market; format: FormatMeta; brand: Theme;
  pairs: FontPair[]; palettes: PaletteColors[];
  save: SaveState; onRetrySave: () => void;
  onChange: (patch: Partial<LotEntry>) => void; onPhotos: (lot: LotEntry) => void; onError: (e: unknown) => void;
  onFormat: (id: string) => void;
  /** Сцена, выбранная для правки; seek — команда превью перейти к её показательному кадру */
  scene: string; onScene: (id: string) => void; seek: SceneSeek | null;
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

export type BodyProps = Pick<Props, 'lot' | 'market' | 'format' | 'brand' | 'pairs' | 'palettes' | 'onChange' | 'onPhotos' | 'onError' | 'onFormat' | 'scene' | 'onScene' | 'photoSource'>;

export const MotionUnavailable: React.FC = () => <p className="hint">Движение есть у пресетов «Кино», «Редакционный», «Каталог» —
  выберите стиль во вкладке «Оформление». «Исходный» — прежние форматы со своей анимацией.</p>;

// ——— Состояние интерфейса: вкладка, открыта ли «Настройки» и что в ней (сцена, «О ролике»,
// «Оформление»). Своё у компьютера, ключ — компания + объявление. Хранилище недоступно — по умолчанию
type Group = 'scene' | 'about' | 'look';
type UI = {tab: PaletteTab; settings: boolean; group: Group};
const FRESH: UI = {tab: 'look', settings: false, group: 'scene'};
const keyOf = (ws: string, lotId: string) => `kok.palette.desk.v2:${ws}:${lotId}`;
const load = (key: string): UI => {
  try { return {...FRESH, ...(JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<UI> | null)}; } catch { return FRESH; }
};
const store = (key: string, ui: UI) => { try { localStorage.setItem(key, JSON.stringify(ui)); } catch { /* не запомнится */ } };

export const Palette: React.FC<Props> = (props) => {
  const {lot, input, format, brand, save, onRetrySave, scene, onScene, seek, render} = props;
  const {config} = useConfig();
  const key = keyOf(config.workspace?.id ?? 'local', lot.id);
  const [ui, setUi] = useState<UI>(() => load(key));
  useEffect(() => { setUi(load(key)); }, [key]);
  const commit = (patch: Partial<UI>) => setUi((u) => { const next = {...u, ...patch}; store(key, next); return next; });

  const player = useRef<PreviewControl | null>(null);
  const [playing, setPlaying] = useState(false);
  // Кадр плеера — подпиской для панели плеера: каждый кадр не перерисовывает всю палитру
  const frameFn = useRef<((frame: number) => void) | null>(null);
  const listenFrame = useCallback((fn: (frame: number) => void) => { frameFn.current = fn; return () => { frameFn.current = null; }; }, []);

  const theme = lotTheme(brand, lot);
  const sceneIndex = Math.max(0, format.scenes.findIndex((s) => s.id === scene));
  const current = format.scenes[sceneIndex];
  const pickScene = (id: string) => { commit({group: 'scene'}); onScene(id); };
  const title = [lot.brand, lot.model].filter(Boolean).join(' ') || 'Без названия';

  return <>
    <section className="quick-preview pd-stage">
      {/* Пока открыто это объявление, превью играет по кругу — идёт монтаж (владелец 20.10).
          key по объявлению: другое объявление начинает с начала. Своя панель плеера ниже */}
      <Preview key={lot.id} input={input} format={format} autoPlay loop showScenes={false} controls={false} control={player}
        onPlaying={setPlaying} onFrame={(f) => frameFn.current?.(f)} seek={seek} />
      <SceneScrubber format={format} listen={listenFrame} seekFrame={(f) => player.current?.seekFrame(f)}
        playing={playing} onToggle={() => player.current?.toggle()} />
    </section>

    <section className="quick-side palette-side">
      <div className="palette pd">
        <header className="palette-head">
          <h1>{title} <span className="muted">{lot.year || ''}</span></h1>
          <div className="palette-scope">Только этот ролик · <SaveStatus save={save} onRetry={onRetrySave} /></div>
        </header>

        {/* Вкладки подчёркиванием — те же, что на телефоне: оформление и три группы анимации */}
        <div className="mle-tabs pd-tabs" role="tablist" aria-label="Оформление и анимация">
          <div className="mle-tabs-list">
            {PALETTE_TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={!ui.settings && ui.tab === t.id}
              className={`mle-tab${!ui.settings && ui.tab === t.id ? ' on' : ''}`} onClick={() => commit({tab: t.id, settings: false})}>{t.title}</button>)}
            {/* «Настройки» — на одном уровне с вкладками (владелец 20.10, только ПК; на телефоне — на превью) */}
            <button type="button" role="tab" aria-selected={ui.settings} className={`mle-tab pd-settings-tab${ui.settings ? ' on' : ''}`}
              onClick={() => commit({settings: true})}>Настройки</button>
          </div>
        </div>
        {/* Все варианты сразу плитками; выбранное — рамкой, полное название — в подсказке */}
        {!ui.settings && <div className="palette-body pd-tiles" role="tabpanel" title={ui.tab === 'look' ? compositionTitle(theme) : motionTitle(brand, lot, ui.tab)}>
          {ui.tab === 'look'
            ? <LookStrip {...props} frame={current?.preview ?? 0} />
            : <MotionStrip {...props} tab={ui.tab} onPicked={(field) => playMotion(player.current, format, scene, field)} />}
        </div>}

        {/* «Настройки» — на месте плиток; другая вкладка возвращает плитки */}
        {ui.settings && <section className="mle-side pd-side" role="dialog" aria-label="Настройки ролика">
          <nav className="mle-side-scenes" aria-label="Что править">
            {format.scenes.map((s, i) => <button key={s.id} type="button" aria-pressed={ui.group === 'scene' && i === sceneIndex}
              className={`mle-scene${ui.group === 'scene' && i === sceneIndex ? ' edit' : ''}`} onClick={() => pickScene(s.id)}>{s.title}</button>)}
            <button type="button" aria-pressed={ui.group === 'about'} className={`mle-scene${ui.group === 'about' ? ' edit' : ''}`}
              onClick={() => commit({group: 'about'})}>О ролике</button>
            <button type="button" aria-pressed={ui.group === 'look'} className={`mle-scene${ui.group === 'look' ? ' edit' : ''}`}
              onClick={() => commit({group: 'look'})}>Оформление</button>
          </nav>
          <div className="mle-body">
            {ui.group === 'scene' && <MobileContent {...props} />}
            {ui.group === 'about' && <>
              <MobileAbout {...props} />
              {/* Заметка — только на компьютере (на телефоне её убрали, владелец 20.10) */}
              <section className="mle-sec pd-note"><h3>Заметка <span>в ролик не попадает</span></h3>
                <NoteField lot={lot} onChange={props.onChange} /></section>
            </>}
            {ui.group === 'look' && <LookPanel lot={lot} brand={brand} pairs={props.pairs} palettes={props.palettes} onChange={props.onChange} embedded />}
          </div>
        </section>}

        <footer className="palette-foot">
          <div className="palette-foot-line"><span>{compositionTitle(theme)}</span><span>{seconds(format)} с · {scenesWord(format.scenes.length)}</span></div>
          {render}
        </footer>
      </div>
    </section>
  </>;
};

/** Статус сохранения; при ошибке — кнопка повтора (раздел 8). Общий у компьютера и телефона */
export const SaveStatus: React.FC<{save: SaveState; onRetry: () => void}> = ({save, onRetry}) => save === 'error'
  ? <button type="button" className={`save save-${save} link`} onClick={onRetry}>{SAVE_TEXT[save]} — повторить</button>
  : <span className={`save save-${save}`}>{SAVE_TEXT[save]}</span>;

