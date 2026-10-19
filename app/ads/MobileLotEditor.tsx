// Мобильная палитра ролика, версия 3 — концепт и правки владельца 20.10 (docs/palette-mobile.md).
// Сверху вниз:
//   шапка приложения со строкой ролика (headerSlot): значок списка объявлений · машина и статус с
//   точкой · «Собрать» · бургер Shell
//   → большое превью, поверх справа сверху — «Настройки» → панель плеера (SceneScrubber: ▶, время,
//   полоса перемотки, «Смотреть целиком») → вкладки «Оформление | Текст | Фото | Переход» → одна
//   лента квадратных плиток выбранной вкладки (постоянной высоты — превью не прыгает).
// «Настройки» — панель справа на 90 % ширины: сцены сегментами и группа «О ролике»; в сцене — только
// её поля (цена — «Рассчитать / Указать сумму», фото — только в «Галерее»).
// Список объявлений и готовые ролики (открываются сами после сборки) — листы на весь экран.
// Данные ролика — те же, что у компьютера: editLot / saveLot / beforeRender из LotTool, второй копии нет.
// Состояние интерфейса (вкладка, лист, сцена, прокрутка листа, раскрытые группы) — в localStorage по
// компании и объявлению; навигация ролик не меняет и сборку не запускает.
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ChevronRight, List, X} from 'lucide-react';
import type {AdProps, FormatMeta, Market, Theme} from '../../src/shared/types';
import type {FontPair, LotEntry, Palette as PaletteColors} from '../api';
import {useConfig} from '../config';
import {useHeaderSlot} from '../headerSlot';
import {Preview, type PreviewControl, type SceneSeek} from '../Preview';
import {compositionTitle, LookStrip, MobileAbout, MobileContent, motionTitle, MotionStrip, type MotionTab} from './MobileBodies';
import {lotTheme} from './LookPanel';
import {SceneScrubber} from './SceneScrubber';
import {SaveStatus, type SaveState} from './Palette';

type Props = {
  lot: LotEntry | null; input: AdProps | null; market: Market; format: FormatMeta; brand: Theme;
  pairs: FontPair[]; palettes: PaletteColors[];
  save: SaveState; onRetrySave: () => void;
  onChange: (patch: Partial<LotEntry>) => void; onPhotos: (lot: LotEntry) => void; onError: (e: unknown) => void;
  onFormat: (id: string) => void;
  /** Сцена, выбранная человеком (её поля в «Содержании»); seek — команда превью перейти к ней */
  scene: string; onScene: (id: string) => void; seek: SceneSeek | null;
  /** Список открыт — LotTool закрывает его сам, когда объявление выбрано или создано */
  listOpen: boolean; onList: (open: boolean) => void;
  /** Новое пустое объявление — сразу панель «Настройки» на группе «О ролике» (данные автомобиля) */
  openContent: boolean; onContentOpened: () => void;
  /** Ссылка, «Добавить вручную» и список — из LotTool, тот же путь импорта, что на компьютере */
  list: React.ReactNode;
  /** Готовые ролики (RenderPanel без своей кнопки); запуск — buildRef, его же вызывает «Собрать» */
  render: React.ReactNode; buildRef: React.MutableRefObject<(() => void) | null>; building: {starting: boolean; running: boolean};
  photoSource?: React.ReactNode;
};

// ——— Состояние интерфейса, версия 3 ———
// Вкладка ленты, открытый лист, сцена, вкладка анимации; своя позиция прокрутки у каждого листа
// («Текст» — по сцене). Ключ — компания + объявление; из версии 2 берём сцену и раздел
// Вкладки ленты: оформление и три группы анимации на одном уровне (владелец 20.10)
type Tab = 'look' | MotionTab;
type Sheet = 'text';
// about — в панели открыта группа «О ролике», а не сцена
type UI = {version: 3; tab: Tab; sheet: Sheet | null; about?: boolean; sceneId?: string; scrollByView: Record<string, number>; expandedGroups: Record<string, boolean>; motionTab?: MotionTab};
// Прежняя вкладка «Анимация» — та группа, что была открыта внутри неё
const tabOf = (tab: string | undefined, motionTab?: MotionTab): Tab =>
  tab === 'motion' ? motionTab ?? 'textMotion' : (['textMotion', 'photoMotion', 'sceneTransition'] as string[]).includes(tab ?? '') ? tab as Tab : 'look';
const fresh = (): UI => ({version: 3, tab: 'look', sheet: null, scrollByView: {}, expandedGroups: {}});
const keyOf = (ws: string, lotId: string) => `kok.palette.mobile.v3:${ws}:${lotId}`;
const load = (key: string): UI => {
  try {
    const v3 = JSON.parse(localStorage.getItem(key) ?? 'null') as UI | null;
    // Ранняя версия 3 знала вкладку и лист «Фото» — теперь фото в панели «Текст»
    if (v3?.version === 3) return {...fresh(), ...v3, tab: tabOf(v3.tab as string, v3.motionTab), sheet: (v3.sheet as string) === 'look' ? null : (v3.sheet as string) === 'photos' ? 'text' : v3.sheet};
    const v2 = JSON.parse(localStorage.getItem(key.replace('.v3:', '.v2:')) ?? 'null') as {section?: string | null; sceneId?: string; motionTab?: MotionTab; expandedGroups?: Record<string, boolean>} | null;
    if (!v2) return fresh();
    return {...fresh(), sceneId: v2.sceneId, motionTab: v2.motionTab, expandedGroups: v2.expandedGroups ?? {},
      tab: tabOf(v2.section === 'motion' ? 'motion' : 'look', v2.motionTab), sheet: v2.section === 'content' ? 'text' : null};
  } catch { return fresh(); }
};
const store = (key: string, ui: UI) => { try { localStorage.setItem(key, JSON.stringify(ui)); } catch { /* хранилище недоступно — не запомнится */ } };

const noFocusZoom = () => {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!ios || !meta) return undefined;
  const before = meta.content;
  if (!/maximum-scale/.test(before)) meta.content = `${before}, maximum-scale=1`;
  return () => { meta.content = before; };
};

const editable = (el: Element | null) => !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(el.type)));

const TABS: {id: Tab; title: string}[] = [{id: 'look', title: 'Оформление'}, {id: 'textMotion', title: 'Текст'},
  {id: 'photoMotion', title: 'Фото'}, {id: 'sceneTransition', title: 'Переход'}];

export const MobileLotEditor: React.FC<Props> = (props) => {
  const {lot, input, format, brand, save, onRetrySave, scene, onScene, seek, listOpen, onList, openContent, onContentOpened,
    list, render, buildRef, building} = props;
  const {config} = useConfig();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const player = useRef<PreviewControl | null>(null);
  const storageKey = lot ? keyOf(config.workspace?.id ?? 'local', lot.id) : '';
  const [ui, setUi] = useState<UI>(() => (lot ? load(storageKey) : fresh()));
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [view, setView] = useState<'edit' | 'watch'>('edit');
  const [jobsOpen, setJobsOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Кадр плеера — подпиской для полосы прокрутки: каждый кадр не перерисовывает весь редактор
  const frameFn = useRef<((frame: number) => void) | null>(null);
  const listenFrame = useCallback((fn: (frame: number) => void) => { frameFn.current = fn; return () => { frameFn.current = null; }; }, []);
  const {sheet} = ui;
  // Через tabOf и здесь: в памяти может остаться прежняя «motion» (до обновления страницы)
  const tab = tabOf(ui.tab, ui.motionTab);
  const viewKey = sheet === 'text' ? (ui.about ? `about:${format.id}` : `content:${format.id}:${scene}`) : sheet ? `${sheet}:${format.id}` : '';

  // Запись в хранилище — с задержкой, не на каждый пиксель прокрутки; перед сменой контекста — сразу
  const timer = useRef<number | undefined>(undefined);
  const commit = useCallback((next: UI, now = false) => {
    setUi(next);
    uiRef.current = next;
    if (!storageKey) return;
    clearTimeout(timer.current);
    if (now) store(storageKey, next); else timer.current = window.setTimeout(() => store(storageKey, uiRef.current), 300);
  }, [storageKey]);
  // Запоминаем позицию текущего вида — перед любым переключением (раздел, сцена, объявление, просмотр)
  const remember = () => {
    const el = body.current;
    if (!el || !viewKey || restoring.current) return uiRef.current;
    return {...uiRef.current, scrollByView: {...uiRef.current.scrollByView, [viewKey]: el.scrollTop}};
  };

  // Другое объявление — его собственное состояние; данные и позиции прежнего не переносятся (раздел 9)
  const prevKey = useRef(storageKey);
  useEffect(() => {
    if (prevKey.current && prevKey.current !== storageKey) store(prevKey.current, remember());
    prevKey.current = storageKey;
    if (!lot) return;
    const next = load(storageKey);
    commit(next, true);
    setView('edit');
    if (next.sceneId && format.scenes.some((s) => s.id === next.sceneId)) onScene(next.sceneId);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (lot && scene !== uiRef.current.sceneId) commit({...uiRef.current, sceneId: scene}); }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (storageKey) store(storageKey, remember()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Восстановление позиции вида — после того как его содержимое отрисовано; браузер сам ограничит
  // фактической высотой. Пока ставим, своё же событие прокрутки позицию не перезаписывает
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !viewKey) return;
    restoring.current = true;
    el.scrollTop = uiRef.current.scrollByView[viewKey] ?? 0;
    // Таймер, а не requestAnimationFrame: на скрытой вкладке кадров нет, и флаг остался бы навсегда —
    // позиции перестали бы запоминаться. 80 мс хватает, чтобы своё событие прокрутки прошло
    const t = window.setTimeout(() => { restoring.current = false; }, 80);
    return () => clearTimeout(t);
  }, [viewKey]);
  const onScroll = () => {
    const el = body.current;
    if (!el || !viewKey || restoring.current) return;
    commit({...uiRef.current, scrollByView: {...uiRef.current.scrollByView, [viewKey]: el.scrollTop}});
  };

  // Вкладка ленты закрывает лист; лист: нажали — открыть, нажали снова — закрыть
  const pickTab = (id: Tab) => commit({...remember(), tab: id, sheet: null}, true);
  const openSheet = (id: Sheet | null) => commit({...remember(), sheet: sheet === id ? null : id}, true);
  // Явный выбор сцены: плеер на её показательный кадр, а в «Тексте» — начало её полей
  const pickScene = (id: string) => {
    const saved = remember();
    commit({...saved, sceneId: id, about: false, scrollByView: {...saved.scrollByView, [`content:${format.id}:${id}`]: 0}}, true);
    onScene(id);
  };

  // Новое пустое объявление — панель «Настройки» на группе «О ролике» (данные автомобиля)
  useEffect(() => {
    if (!openContent || !lot) return;
    commit({...uiRef.current, sheet: 'text', about: true}, true);
    onContentOpened();
  }, [openContent, lot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Сборка закончилась — лист «Ролики» открывается сам: результат и скачивание сразу под рукой
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !building.running) setJobsOpen(true);
    wasRunning.current = building.running;
  }, [building.running]);
  // Список или ролики закрывают превью — плеер на паузе (раздел 8)
  useEffect(() => { if (listOpen || jobsOpen) player.current?.pause(); }, [listOpen, jobsOpen]);

  // «Смотреть целиком» и возврат: тот же плеер, меняется раскладка; кадр, раздел и прокрутка — те же
  const snapshot = useRef<{frame: number} | null>(null);
  const watch = () => {
    commit(remember(), true);
    snapshot.current = {frame: player.current?.frame() ?? 0};
    setView('watch');
    requestAnimationFrame(() => player.current?.playFromStart());
  };
  const back = () => {
    setView('edit');
    const snap = snapshot.current;
    requestAnimationFrame(() => {
      if (snap) player.current?.seekFrame(snap.frame);
      const el = body.current;
      if (el && viewKey) el.scrollTop = uiRef.current.scrollByView[viewKey] ?? 0;
    });
  };

  // Показать выбранный приём анимации фрагментом: текст и фото — начало текущей сцены, переход —
  // стык с соседней сценой; около 2,5 с и пауза (раздел 8)
  const showMotion = (field: MotionTab) => {
    const i = Math.max(0, format.scenes.findIndex((s) => s.id === scene));
    const s = format.scenes[i];
    if (field === 'sceneTransition') {
      const next = format.scenes[i + 1] ?? format.scenes[1] ?? s;
      player.current?.playFragment(next.from - Math.round(format.fps * .8), 2.4);
    } else player.current?.playFragment(s.from, 2.6);
  };

  // Клавиатура (раздел 7, раздел 11): не одно условие «видимая область < окна − 120» — на части
  // браузеров уменьшаются оба размера. Сравниваем с наибольшей высотой, виденной при этой
  // ориентации; поворот экрана сбрасывает её и клавиатурой не считается
  useEffect(() => {
    const vv = window.visualViewport;
    const el = root.current;
    if (!el) return;
    let tallest = vv?.height ?? window.innerHeight;
    let portrait = window.innerHeight > window.innerWidth;
    const update = () => {
      const h = vv?.height ?? window.innerHeight;
      const nowPortrait = window.innerHeight > window.innerWidth;
      if (nowPortrait !== portrait) { portrait = nowPortrait; tallest = h; }
      tallest = Math.max(tallest, h);
      const inBody = !!body.current?.contains(document.activeElement);
      setKeyboard(inBody && editable(document.activeElement) && h < tallest - 120);
      el.style.setProperty('--mle-vvh', `${Math.round(h)}px`);
      el.style.setProperty('--mle-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    };
    // Поле — в видимую часть формы, прокруткой самой формы, а не всей оболочки
    const focus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!editable(target) || !body.current?.contains(target)) return;
      player.current?.pause();
      update();
      setTimeout(() => {
        const box = body.current;
        if (!box) return;
        const r = target.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (r.top < b.top + 8 || r.bottom > b.bottom - 8) box.scrollTop += r.top - b.top - b.height / 3;
      }, 280);
    };
    update();
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    el.addEventListener('focusin', focus);
    el.addEventListener('focusout', () => setTimeout(update, 50));
    return () => { vv?.removeEventListener('resize', update); window.removeEventListener('resize', update); el.removeEventListener('focusin', focus); };
  }, []);

  // Компактные поля панели «Текст» — 14 px, а iPhone приближает страницу при касании поля мельче
  // 16 px. maximum-scale=1 на iOS убирает только это приближение (масштаб пальцами Safari оставляет
  // с iOS 10); ставим только на iPhone/iPad и только пока открыт редактор — Android его не трогаем
  useEffect(() => noFocusZoom(), []);

  const buildLabel = building.starting ? 'Запуск…' : building.running ? 'Собирается…' : 'Собрать';
  // ——— Шапка: одна строка вместо логотипа (по образцу владельца 20.10): слева значок списка
  // объявлений, машина и статус с точкой, справа компактное «Собрать» и бургер Shell. Меню — общее, плюс «Ролики» ———
  const title = lot ? [lot.model || lot.brand, lot.year].filter(Boolean).join(' ') || 'Без названия' : 'Объявлений нет';
  const fullTitle = lot ? [lot.brand, lot.model, lot.trim, lot.year].filter(Boolean).join(' ') : '';
  useHeaderSlot({
    content: <div className="mle-top">
      {/* Слева — список объявлений (владелец 20.10) */}
      <button type="button" className={`mle-head-btn${listOpen ? ' on' : ''}`} aria-label="Объявления" aria-expanded={listOpen}
        onClick={() => { setJobsOpen(false); onList(!listOpen); }}><List size={20} /></button>
      <div className="mle-title" title={fullTitle}>
        <b>{title}</b>
        {lot && <span><SaveStatus save={save} onRetry={onRetrySave} /> · Этот ролик</span>}
      </div>
      {lot && <button type="button" className="btn primary mle-build" disabled={building.starting || building.running || !lot.photos.length}
        onClick={() => buildRef.current?.()}>{buildLabel}</button>}
    </div>,
    // Своих пунктов в меню нет (владелец 20.10: «Ролики» в бургере не нужны); лист с готовыми роликами
    // открывается сам после сборки
    menu: [],
  }, [title, fullTitle, save, lot?.id, lot?.photos.length, listOpen, jobsOpen, building.starting, building.running]);

  const sceneIndex = format.scenes.findIndex((s) => s.id === scene);
  const current = format.scenes[Math.max(0, sceneIndex)];
  const theme = lot ? lotTheme(brand, lot) : brand;

  return <div ref={root} className={`mle${view === 'watch' ? ' watch' : ''}${sheet ? ' sheet-open' : ''}${keyboard ? ' kb' : ''}`}>
    {lot && input ? <>
      <div className="mle-stage">
        {/* key — по объявлению: другое начинает свой ролик заново. Смена листа или просмотра плеер не
            пересоздаёт — меняется только раскладка вокруг. Полосы управления у плеера нет — своя панель ниже */}
        <Preview key={lot.id} input={input} format={format} autoPlay showScenes={false} controls={false} control={player}
          onPlaying={setIsPlaying} onFrame={(f) => frameFn.current?.(f)} seek={seek} />
        {view === 'watch' && <button type="button" className="btn primary mle-back" onClick={back}>Вернуть настройки</button>}
        {/* «Настройки» — правка надписей, цены и фото (панель справа): серая плашка в правом верхнем
            углу превью, по образцу владельца 20.10 */}
        {view === 'edit' && <button type="button" className={`mle-text-btn${sheet === 'text' ? ' on' : ''}`} aria-expanded={sheet === 'text'}
          onClick={() => openSheet('text')}>Настройки</button>}
      </div>
      {/* Панель плеера по образцу владельца: ▶, время, полоса перемотки, «Смотреть целиком» */}
      <SceneScrubber format={format} listen={listenFrame} seekFrame={(f) => player.current?.seekFrame(f)}
        playing={isPlaying} onToggle={() => player.current?.toggle()} onExpand={view === 'edit' ? watch : undefined} />

        {/* Вкладки — подчёркиванием: оформление и три группы анимации на одном уровне (владелец 20.10) */}
        <div className="mle-tabs">
          <div className="mle-tabs-list" role="tablist" aria-label="Настройки ролика">
            {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`mle-tab${tab === t.id ? ' on' : ''}`} onClick={() => pickTab(t.id)}>{t.title}</button>)}
          </div>
        </div>
        <div className="mle-panel" role="tabpanel" title={tab === 'look' ? compositionTitle(theme) : motionTitle(brand, lot, tab)}>
          {/* Строки «Появление текста · …» и «Весь ролик» над лентой нет (владелец 20.10: места мало) —
              выбранное видно по рамке плитки; полное название — в подсказке на ленте */}
          {tab === 'look' && <LookStrip {...props} lot={lot} input={input} frame={current?.preview ?? 0} />}
          {tab !== 'look' && <MotionStrip {...props} lot={lot} tab={tab} onPicked={showMotion} />}
        </div>

      {/* Панель «Текст» справа (владелец 20.10: «как было у нас ранее»): 90 % ширины, слева видна
          полоска ролика — нажатие по ней закрывает. Сцену можно сменить прямо в панели */}
      {sheet === 'text' && <>
        <button type="button" className="mle-scrim" aria-label="Закрыть текст" onClick={() => openSheet(null)} />
        <section className="mle-side" role="dialog" aria-label="Текст ролика">
          <div className="mle-side-head">
            <button type="button" className="mle-icon" aria-label="Закрыть текст" onClick={() => openSheet(null)}><ChevronRight size={20} /></button>
            <b>Настройки</b>
          </div>
          <nav className="mle-side-scenes" aria-label="Сцена для правки">
            {format.scenes.map((s, i) => <button key={s.id} type="button" aria-pressed={!ui.about && i === sceneIndex}
              className={`mle-scene${!ui.about && i === sceneIndex ? ' edit' : ''}`} onClick={() => pickScene(s.id)}>
              <span>{String(i + 1).padStart(2, '0')}</span>{s.title}</button>)}
            {/* Общее для всего ролика — отдельной группой рядом со сценами (владелец 20.10) */}
            <button type="button" aria-pressed={!!ui.about} className={`mle-scene${ui.about ? ' edit' : ''}`}
              onClick={() => commit({...remember(), about: true}, true)}>О ролике</button>
          </nav>
          <div className="mle-body" ref={body} onScroll={onScroll}>
            {ui.about ? <MobileAbout {...props} lot={lot} /> : <MobileContent {...props} lot={lot} />}
          </div>
        </section>
      </>}
    </> : <div className="mle-empty">
      {/* Объявлений нет — вместо пустого плеера понятное действие добавления */}
      <p>Вставьте ссылку на объявление Encar, che168 или Carsensor — машина, фото и превью появятся сами. Или добавьте объявление вручную.</p>
      {list}
    </div>}

    {listOpen && lot && <div className="mle-sheet" role="dialog" aria-label="Объявления">
      <div className="mle-sheet-head">
        <b>Объявления</b>
        <button type="button" className="mle-icon" aria-label="Вернуться к ролику" onClick={() => onList(false)}><X size={20} /></button>
      </div>
      <div className="mle-sheet-body">{list}</div>
    </div>}

    {/* Готовые ролики и прежние версии — лист из меню. Смонтирован всегда: его сборку вызывает
        «Собрать», а после сборки лист открывается сам */}
    {lot && <div className={`mle-sheet${jobsOpen ? '' : ' hidden'}`} role="dialog" aria-label="Ролики" aria-hidden={!jobsOpen}>
      <div className="mle-sheet-head">
        <b>Ролики · {fullTitle}</b>
        <button type="button" className="mle-icon" aria-label="Вернуться к ролику" onClick={() => setJobsOpen(false)}><X size={20} /></button>
      </div>
      <div className="mle-sheet-body">{render}</div>
    </div>}
  </div>;
};
