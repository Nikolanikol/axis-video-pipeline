// Части мобильной палитры (docs/palette-mobile.md, версия 3 — концепт владельца 20.10). Поля и
// обработчики — общие с компьютером (LotForm, LookPanel, SettingsForms, реестр стиля); здесь только
// мобильный вид: ленты под превью («Оформление» — варианты «композиция · цвет», «Текст / Фото /
// Переход» — приёмы анимации) и тело панели «Настройки» (поля сцены, группа «О ролике»).
import React, {useMemo} from 'react';
import {Thumbnail} from '@remotion/player';
import {applyDesignPreset, DESIGNS} from '../../src/shared/designs';
import {PALETTE_KEYS} from '../../src/shared/contrast.js';
import {pickLook} from '../../src/design/style/look.js';
import {STYLE_CHOICES, resolveStyle} from '../../src/design/style/registry.js';
import {FORMAT_COMPONENTS} from '../../src/formats';
import {withoutMusic} from '../../src/shared/nomusic.js';
import {FORMATS} from '../../src/shared/model';
import type {AdProps, FormatMeta, Lot, Theme} from '../../src/shared/types';
import type {LotEntry} from '../api';
import type {PreviewControl} from '../Preview';
import {CarFields, ContactsEditor, Field, PhotosEditor, PriceEditor, SpecsEditor} from '../LotForm';
import {thumb} from '../thumb';
import {lotTheme} from './LookPanel';
import {MotionUnavailable, seconds, type BodyProps} from './Palette';


const two = (n: number) => String(n).padStart(2, '0');

/**
 * Панель «Настройки» (выезжает справа), выбранная сцена: только её поля. Редактор фото — только в сцене
 * «Галерея» (владелец 20.10: не в каждой сцене); в формате без галереи — в первой сцене. Общее
 * (машина, сценарий, источник, заметка) — отдельной группой «О ролике» рядом со сценами (MobileAbout)
 */
export const MobileContent: React.FC<BodyProps> = ({lot, market, format, onChange, onPhotos, onError, scene, onScene}) => {
  const index = Math.max(0, format.scenes.findIndex((s) => s.id === scene));
  const current = format.scenes[index] ?? format.scenes[0];
  const photoScene = format.scenes.some((s) => s.id === 'gallery') ? 'gallery' : format.scenes[0]?.id;
  return <div className="mle-body-inner form">
    <h2 className="mle-scene-title">Сцена {two(index + 1)} · {current.title}</h2>
    {current.id === photoScene
      ? <section className="mle-photos-edit">
        {current.id === 'hook' && <MobileSceneFields sceneId={current.id} lot={lot} market={market} format={format} onChange={onChange} openPhotos={() => {}} />}
        <PhotosEditor lot={lot} format={format} onChange={onChange} onPhotos={onPhotos} onError={onError} />
      </section>
      : <MobileSceneFields sceneId={current.id} lot={lot} market={market} format={format} onChange={onChange}
        openPhotos={() => onScene(photoScene)} />}
  </div>;
};

/**
 * Группа «О ролике» — на одном уровне со сценами (владелец 20.10: общее не повторять в каждой сцене):
 * сценарий (первым — владелец 20.10), данные автомобиля, источник объявления — разделами, без свёртывания. Заметки на телефоне
 * нет (владелец 20.10: не нужна); сама заметка в объявлении остаётся, на компьютере она видна
 */
export const MobileAbout: React.FC<BodyProps> = ({lot, market, format, onChange, onFormat, photoSource}) => <div className="mle-body-inner form">
  <section className="mle-sec"><h3>Сценарий</h3>
    <Field label="Сценарий ролика">
      <select value={format.id} onChange={(e) => onFormat(e.target.value)}>
        {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.title} · {seconds(f)} с</option>)}
      </select>
    </Field>
  </section>
  <section className="mle-sec"><h3>Данные автомобиля</h3><CarFields lot={lot} market={market} onChange={onChange} /></section>
  {photoSource && <section className="mle-sec"><h3>Источник объявления</h3>{photoSource}</section>}
</div>;

/** Поля сцены на телефоне. Цена — мобильным PriceEditor («Рассчитать / Указать сумму»); у хука — первое фото
 * и переход к «Галерее», где полный редактор фото */
const MobileSceneFields: React.FC<{sceneId: string; lot: LotEntry; market: BodyProps['market']; format: BodyProps['format'];
  onChange: BodyProps['onChange']; openPhotos: () => void}> = ({sceneId, lot, market, format, onChange, openPhotos}) => {
  // Фото сцены без перестановок: смотреть и перейти к полному редактору. Глобальный порядок
  // и места снимков здесь не меняются (раздел 4)
  const photos = (list: string[], note: string) => <div className="mle-scene-photos">
    <div className="mle-thumbs">{list.map((url, i) => <img key={`${url}-${i}`} src={thumb(url, 160)} alt="" loading="lazy" />)}</div>
    <p className="hint">{note} <button type="button" className="motion-reset" onClick={openPhotos}>Править фото — в «Галерее»</button></p>
  </div>;
  if (sceneId === 'price' || (sceneId === 'hook' && format.id === 'price-first')) return <PriceEditor lot={lot} market={market} format={format} onChange={onChange} mobile />;
  // Хук с галереей в формате: первое фото и переход к редактору; без галереи редактор фото — здесь же (выше)
  if (sceneId === 'hook') return format.scenes.some((s) => s.id === 'gallery')
    ? photos(lot.photos.slice(0, 1), 'Фото первого кадра — первое в списке (или отмеченное «Хук»). Название и год — в «Данных автомобиля».')
    : <p className="hint">Фото первого кадра — первое в списке (или отмеченное «Хук»). Название и год — в «Данных автомобиля».</p>;
  if (sceneId === 'specs' || sceneId === 'stack') return <SpecsEditor lot={lot} onChange={onChange} />;
  if (sceneId === 'history') return <>
    <p className="hint">История Encar (страховые случаи, владельцы) показывается сама, если она есть.</p>
    <SpecsEditor lot={lot} onChange={onChange} />
  </>;
  if (sceneId === 'cta') return <ContactsEditor lot={lot} market={market} format={format} onChange={onChange} />;
  return null;
};

/** Выбор оформления: правка — только снимок ролика (lot.look), бренд компании не трогается */
const useLook = (brand: Theme, lot: LotEntry, onChange: BodyProps['onChange']) => {
  const theme = lotTheme(brand, lot);
  const set = (next: Theme) => onChange({look: pickLook(next) as Lot['look']});
  return {theme, set};
};
// Варианты оформления одной лентой (владелец 20.10: «Кино · Медь», «Кино · Лёд» и т. д. вместо
// композиций и отдельного ряда цветов). Порядок — как в концепте: Каталог, Кино, Редакционный,
// затем «Исходный». preset = null — «Исходный»
type Variant = {design: string | null; preset: string | null; title: string; color?: string};
const VARIANTS: Variant[] = [
  ...['catalog', 'cinema', 'editorial'].flatMap((id) => DESIGNS.filter((d) => d.id === id)
    .flatMap((d) => d.presets.map((p) => ({design: d.id as string, preset: p.id, title: d.title, color: p.title})))),
  {design: null, preset: null, title: 'Исходный'},
];
const sameColors = (theme: Theme, colors: Record<string, string>) => PALETTE_KEYS.every((k) => theme[k]?.toUpperCase() === colors[k]?.toUpperCase());
const presetOf = (v: Variant) => DESIGNS.find((d) => d.id === v.design)?.presets.find((p) => p.id === v.preset);
// Тема варианта: «Исходный» снимает только компоновку; та же композиция — меняются только восемь
// цветов (шрифты, углы, движение остаются); другая — готовым пресетом (как на компьютере)
const candidate = (theme: Theme, v: Variant): Theme => {
  if (!v.design) { const {design: _d, designVariant: _v, ...rest} = theme; return rest as Theme; }
  const p = presetOf(v);
  if (!p) return theme;
  return theme.design === v.design ? {...theme, ...p.colors} as Theme : applyDesignPreset(theme, p.id);
};
const isCurrent = (theme: Theme, v: Variant) => !v.design ? !theme.design
  : theme.design === v.design && sameColors(theme, presetOf(v)?.colors ?? {});
/** Подпись выбранного варианта над лентой: «Кино · Медь», «Кино · свои цвета», «Исходный» */
export const compositionTitle = (theme: Theme) => {
  if (!theme.design) return 'Исходный';
  const v = VARIANTS.find((x) => isCurrent(theme, x));
  return v ? `${v.title} · ${v.color}` : `${DESIGNS.find((d) => d.id === theme.design)?.title ?? ''} · свои цвета`;
};

/**
 * Лента «Оформление»: каждый вариант «композиция · цвет» — миниатюрой этого же ролика на кадре
 * выбранной сцены (настоящая машина и текст). Второго ряда и «Всего оформления» нет (владелец 20.10)
 */
export const LookStrip: React.FC<BodyProps & {input: AdProps; frame: number}> = ({lot, brand, format, onChange, input, frame}) => {
  const {theme, set} = useLook(brand, lot, onChange);
  return <div className="mle-strip" role="radiogroup" aria-label="Оформление ролика">
    {VARIANTS.map((v) => {
      const on = isCurrent(theme, v);
      return <button key={v.preset ?? 'original'} type="button" role="radio" aria-checked={on} className={`mle-comp${on ? ' on' : ''}`}
        onClick={() => { if (!on) set(candidate(theme, v)); }}>
        {/* Квадрат — середина кадра 9:16 (машина, название, цена), как в концепте владельца */}
        <span className="mle-comp-frame"><span className="mle-comp-crop"><CompositionThumb input={input} format={format} theme={candidate(theme, v)} frame={frame} /></span></span>
        <span className="mle-comp-title">{v.title}</span>
        {v.color && <span className="mle-comp-color">{v.color}</span>}
      </button>;
    })}
  </div>;
};

/** Миниатюра композиции: кадр ролика с другим оформлением, тем же механизмом, что превью и сборка */
const CompositionThumb: React.FC<{input: AdProps; format: FormatMeta; theme: Theme; frame: number}> = ({input, format, theme, frame}) => {
  const look = JSON.stringify(pickLook(theme));
  const props = useMemo(() => ({...input, lot: {...withoutMusic(input.lot), look: JSON.parse(look)}}), [input, look]);
  return <Thumbnail component={FORMAT_COMPONENTS[format.id]} inputProps={props} frameToDisplay={Math.min(frame, format.durationInFrames - 1)}
    durationInFrames={format.durationInFrames} fps={format.fps} compositionWidth={format.width} compositionHeight={format.height}
    style={{width: '100%', height: '100%'}} />;
};

export type MotionTab = 'textMotion' | 'photoMotion' | 'sceneTransition';
/** Вкладки ленты — оформление и три группы анимации на одном уровне (владелец 20.10). Общие у телефона и компьютера */
export type PaletteTab = 'look' | MotionTab;
export const PALETTE_TABS: {id: PaletteTab; title: string}[] = [{id: 'look', title: 'Оформление'}, {id: 'textMotion', title: 'Текст'},
  {id: 'photoMotion', title: 'Фото'}, {id: 'sceneTransition', title: 'Переход'}];
/**
 * Показать выбранный приём анимации фрагментом: текст и фото — начало текущей сцены, переход — стык
 * с соседней сценой; около 2,5 с и пауза. Общий у телефона и компьютера
 */
export const playMotion = (player: PreviewControl | null, format: FormatMeta, sceneId: string, field: MotionTab) => {
  const i = Math.max(0, format.scenes.findIndex((s) => s.id === sceneId));
  const s = format.scenes[i];
  if (field === 'sceneTransition') {
    const next = format.scenes[i + 1] ?? format.scenes[1] ?? s;
    player?.playFragment(next.from - Math.round(format.fps * .8), 2.4);
  } else player?.playFragment(s.from, 2.6);
};
/** Подпись над лентой анимации: группа и выбранный приём («Появление текста · Из-под строки») */
export const motionTitle = (brand: Theme, lot: LotEntry, tab: MotionTab) => {
  const theme = lotTheme(brand, lot);
  if (!theme.design) return STYLE_CHOICES[tab].title;
  const id = resolveStyle(theme, theme.design)[tab];
  return `${STYLE_CHOICES[tab].title} · ${STYLE_CHOICES[tab].options.find((o) => o.id === id)?.title ?? ''}`;
};

/**
 * Лента одной группы анимации — «Текст», «Фото» или «Переход» (владелец 20.10: группы — вкладками
 * рядом с «Оформлением», а не спрятаны внутри «Анимации»). Все варианты квадратными плитками с фото
 * машины (потом заменим на анимированные превью). Выбор сразу показывает приём фрагментом в превью
 */
export const MotionStrip: React.FC<BodyProps & {tab: MotionTab; onPicked: (field: MotionTab) => void}> =
  ({lot, brand, onChange, tab, onPicked}) => {
    const {theme, set} = useLook(brand, lot, onChange);
    if (!theme.design) return <div className="mle-strip-note"><MotionUnavailable /></div>;
    const current = resolveStyle(theme, theme.design);
    return <div className="mle-strip" role="radiogroup" aria-label={STYLE_CHOICES[tab].title}>
        {STYLE_CHOICES[tab].options.map((o, i) => {
          const photo = lot.photos.length ? lot.photos[i % lot.photos.length] : '';
          return <button key={o.id} type="button" role="radio" aria-checked={current[tab] === o.id}
            className={`mle-comp mle-motion${current[tab] === o.id ? ' on' : ''}`} onClick={() => { set({...theme, [tab]: o.id}); onPicked(tab); }}>
            <span className="mle-comp-frame">{photo && <img src={thumb(photo, 160)} alt="" loading="lazy" />}</span>
            <span className="mle-motion-title">{o.title}</span>
          </button>;
        })}
      </div>;
  };

