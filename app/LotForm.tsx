// Форма лота по сценам ролика (Хук, Галерея, Стопка, Цена, CTA) и фото. Автосохранение — в LotTool.
// Поле Field отсюда переиспользуют остальные формы.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {GALLERY_CUTS} from '../src/formats/gallery-ad/GalleryAd';
import {currencySign} from '../src/shared/blocks';
import {isDirect} from '../src/shared/currencies';
import {fmt, lotTotal, priceUsd} from '../src/shared/model';
import {SLOT_TITLES, photoKey, photoLayout, type Slot} from '../src/shared/photoSlots';
import type {FormatMeta, Market} from '../src/shared/types';
import {api, LotEntry, UsdKrw} from './api';
import {ENCAR_PHOTO_DRAG} from './ads/EncarImport';
import {BlurEditor} from './BlurEditor';
import {useConfig} from './config';
import {locale, tNow, useT, type Key} from './i18n';

type Props = {
  lot: LotEntry;
  market: Market;
  format: FormatMeta;
  onChange: (patch: Partial<LotEntry>) => void;
  onPhotos: (lot: LotEntry) => void;
  onError: (e: unknown) => void;
};

// Палец вместо мыши: там HTML5-перетаскивание не работает (владелец 01.10: «на мобильной
// версии драг-энд-дроп не работает»), фото переставляются касаниями — см. Photos
const COARSE = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
// Сколько держать палец, чтобы фото «взялось». Меньше — пальцем задевают фото при прокрутке
// страницы, больше — кажется, что не работает. 300 мс — как долгое нажатие в iOS и Android
const HOLD_MS = 300;

const SPEC_MAX = 26; // длиннее — строка упрётся в правую безопасную зону

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[\s,]/g, '')));

export const Field: React.FC<{label: string; hint?: React.ReactNode; children: React.ReactNode; wide?: boolean}> = ({label, hint, children, wide}) => (
  <label className={wide ? 'field wide' : 'field'}>
    <span className="label">{label}</span>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </label>
);

// Курс на сегодня (сервер обновляет раз в сутки) — один запрос на страницу, а не на каждый лот
let todayRate: Promise<UsdKrw | null> | null = null;
// Курс в подсказке у поля «Курс»: один запрос на страницу — промис общий на все лоты
const useTodayRate = () => {
  const [rate, setRate] = useState<UsdKrw | null>(null);
  useEffect(() => {
    todayRate ??= api.usdKrw().catch(() => null);
    todayRate.then(setRate);
  }, []);
  return rate;
};

type Block = Pick<Props, 'lot' | 'market' | 'onChange'>;

/** Машина: марка, модель, версия, год и подзаголовок первого кадра — общие для всех сцен */
export const CarFields: React.FC<Block> = ({lot, market, onChange}) => {
  const t = useT();
  return <>
  <div className="row">
    <Field label={t('form.brand')}><input value={lot.brand} placeholder="Audi" onChange={(e) => onChange({brand: e.target.value})} /></Field>
    <Field label={t('form.model')}><input value={lot.model} placeholder="A6" onChange={(e) => onChange({model: e.target.value})} /></Field>
  </div>
  <div className="row">
    <Field label={t('form.trim')}><input value={lot.trim ?? ''} placeholder="35 TDI" onChange={(e) => onChange({trim: e.target.value})} /></Field>
    <Field label={t('form.year')}><input type="number" value={lot.year ?? ''} onChange={(e) => onChange({year: Number(e.target.value)})} /></Field>
  </div>
  {/* Подзаголовок под годом в первом кадре. Пусто — фраза из настроек («Из Кореи»);
      из Encar подставляется по фактам: без страховых случаев, один владелец, малый пробег */}
  <Field label={t('form.tagline')} hint={t('form.taglineHint')}>
    <input value={lot.texts?.hookTagline ?? ''} placeholder={market.texts.hookTagline ?? ''} maxLength={40}
      onChange={(e) => onChange({texts: {...lot.texts, hookTagline: e.target.value || undefined}})} />
  </Field>
</>;
};

/** Строки характеристик (сцены «Характеристики», «Стопка», «История») */
export const SpecsEditor: React.FC<Pick<Props, 'lot' | 'onChange'>> = ({lot, onChange}) => {
  const setSpec = (i: number, value: string) => onChange({specs: lot.specs.map((s, j) => (j === i ? value : s))});
  const t = useT();
  return <>
    <div className="label scene-label">{t.cfg('Характеристики')} <span className="muted">{t('form.postLang')}</span></div>
    {lot.specs.map((s, i) => (
      <div className="spec" key={i}>
        <input value={s} placeholder={['78 498 км', 'Дизел · автоматик', 'Кожен ентериер', 'Шибер · навигација'][i] ?? ''}
          onChange={(e) => setSpec(i, e.target.value)} />
        <span className={s.length > SPEC_MAX ? 'count over' : 'count'}>{s.length}</span>
        <button className="icon" title={t('form.removeLine')} onClick={() => onChange({specs: lot.specs.filter((_, j) => j !== i)})}>×</button>
      </div>
    ))}
    {lot.specs.length < 5 && <button className="btn ghost" onClick={() => onChange({specs: [...lot.specs, '']})}>+ {t('form.line')}</button>}
  </>;
};

/** Цена: справка с Encar, фрахт, «Цена в ролике» (вручную / вернуть расчёт), итог и подписи сцены */
export const PriceEditor: React.FC<Block & Pick<Props, 'format'> & {mobile?: boolean}> = ({lot, market, format, onChange, mobile = false}) => {
  const t = useT();
  const car = priceUsd(lot);
  const total = lotTotal(lot, market);
  // Расчёт без ручной цены — подсказка у поля «Цена в ролике»: видно, от чего человек уходит
  const computed = lotTotal(lot, market, {priceOverride: null});
  const manual = !!lot.priceOverride;
  // Валюта компании не ₩ и не $ (₽, ₸, €…): цена считается из вон по курсу валюты. Курс в
  // объявлении клиент правит свободно — так закладывается маржа (11.10); пусто — сегодняшний
  const fx = !isDirect(market.currency);
  const fxToday = market.krwPerUnitToday ?? null;
  const fxOwn = lot.krwPerUnit && lot.fxCurrency === market.currency ? lot.krwPerUnit : null;
  const fxOff = fxToday && fxOwn && Math.abs(fxOwn - fxToday) / fxToday > 0.005;
  const sign = currencySign(market.currency);
  const rate = useTodayRate();
  // Курс в лоте отличается от сегодняшнего больше чем на полпроцента — предлагаем обновить.
  // Мелкие колебания не дёргаем: подсказка на каждой копейке приучила бы её не замечать
  const rateOff = rate && lot.krwPerUsd && Math.abs(lot.krwPerUsd - rate.krwPerUsd) / rate.krwPerUsd > 0.005;
  // ₩/$ нужен цене, только когда она в долларах или к ней едет фрахт в долларах
  const usdMatters = market.currency === 'USD' || (market.pricingMode !== 'domestic' && (lot.freightUsd ?? market.freightUsd) > 0) || (!lot.carPriceKrw && !!lot.carPriceUsd);
  // Курс в объявлении ушёл от сегодняшнего больше чем на полпроцента — предлагаем обновить
  const stale = Boolean((usdMatters && (rateOff || (!lot.krwPerUsd && rate))) || (fx && fxOwn && fxOff));
  const refreshRates = () => onChange({
    ...(rate ? {krwPerUsd: rate.krwPerUsd} : {}),
    ...(fx && fxToday ? {krwPerUnit: fxToday, fxCurrency: market.currency} : {}),
  });
  const freight = lot.freightUsd ?? market.freightUsd;
  const port = lot.port ?? market.port;
  // Телефон: «Рассчитать» / «Указать сумму» (владелец 20.10). Режим — своё состояние: «Указать сумму»
  // можно открыть и до того, как вписано число; «Рассчитать» сразу снимает ручную цену
  const [mode, setMode] = useState<'calc' | 'manual'>(manual ? 'manual' : 'calc');
  useEffect(() => { setMode(lot.priceOverride ? 'manual' : 'calc'); }, [lot.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const source = <>
      {/* Цена авто и курс — не поля, а справка (владелец 11.10: «эту плашку убери»): цена
          приходит с Encar, курс — сам, по валюте из профиля. Свою цену человек вписывает
          в «Цену в ролике» — так он и закладывает маржу. Курс фиксируется в объявлении на день
          создания (цена ролика не плывёт вместе с биржей), обновить — кнопкой */}
      <div className="price-source">
        {lot.carPriceKrw || lot.carPriceUsd
          ? <>
            {lot.carPriceKrw ? <>{t('price.encar')} <b>{fmt(lot.carPriceKrw)} ₩</b></> : <>{t('price.car')} <b>{fmt(lot.carPriceUsd!)} $</b></>}
            {usdMatters && lot.krwPerUsd ? <span className="muted"> · 1 $ = {lot.krwPerUsd.toLocaleString(locale())} ₩</span> : null}
            {fx && (fxOwn ?? fxToday) ? <span className="muted"> · 1 {sign} = {(fxOwn ?? fxToday)!.toLocaleString(locale(), {maximumFractionDigits: 2})} ₩{fxOwn ? '' : ` (${t('price.today')})`}</span> : null}
            {stale && <> · <button type="button" className="link" onClick={refreshRates}>{t('price.refreshRate')}</button></>}
          </>
          : <>{t('price.noEncar')}</>}
      </div>
  </>;
  const freightField = <>
      {/* Фрахт — к цене: он и есть разница между ценой авто и итогом. Раньше прятался в
          «Переопределить для этого объявления» вместе с WhatsApp */}
      {market.pricingMode !== 'domestic' && (
        <Field label={t('price.freight')} hint={t('form.fromProfile', {v: `${fmt(market.freightUsd)} $`})}>
          <input inputMode="decimal" value={lot.freightUsd ?? ''} placeholder={String(market.freightUsd)}
            onChange={(e) => { const v = num(e.target.value); onChange({freightUsd: v === null || Number.isNaN(v) ? undefined : v}); }} />
        </Field>
      )}
  </>;
  const override = <>
      {/* Своя цена — итог как есть, в валюте профиля. Клиенты продают со своей наценкой, и
          закупочная с Encar + фрахт им не годится (11.10). Пусто — считаем, как раньше */}
      <Field label={`${t('price.inVideo')}, ${sign}`} wide
        hint={manual
          ? <>{t('price.manualSet')} · {t('price.wouldBe', {v: computed === null ? '—' : `${fmt(computed)} ${sign}`})} · <button type="button" className="link" onClick={() => onChange({priceOverride: null})}>{t('price.backToCalc')}</button></>
          : t('price.overrideHint')}>
        <input inputMode="decimal" value={lot.priceOverride ?? ''} placeholder={computed === null ? '' : fmt(computed)}
          onChange={(e) => { const v = num(e.target.value); onChange({priceOverride: v === null || Number.isNaN(v) ? null : v}); }} />
      </Field>
  </>;
  const totalLine = <>
      {/* Итог — ровно то число и та валюта, что будут в ролике (totalInCurrency). Раньше здесь
          всегда были доллары, а ролик при валюте профиля KRW показывал воны — экран и ролик
          говорили разное (30.09) */}
      <div className={total === null ? 'total warn' : 'total'}>
        {total === null
          ? (fx && !fxOwn && !fxToday && car !== null
            ? t('price.noRate', {sign})
            : t('price.none', {sign}))
          : manual
            ? <>{t('price.inVideoColon')} <b>{fmt(total)} {sign}</b><span className="muted"> · {t('price.manual')}</span>{port ? <span className="muted"> · {t('price.to', {port})}</span> : null}</>
            : <>{t('price.inVideoColon')} <b>{fmt(total)} {sign}</b>{freight > 0 && car !== null ? <span className="muted"> · {t('price.withFreight', {v: `${fmt(freight)} $`})}</span> : null}{port ? <span className="muted"> · {t('price.to', {port})}</span> : null}</>}
      </div>
  </>;
  const labels = <>
      <TextsHint />
      <LotText k="priceLabel" lot={lot} market={market} format={format} onChange={onChange} />
      {/* В «Цене сразу» строк под ценой нет — не даём править то, чего в ролике не будет */}
      {format.id !== 'price-first' && <>
        <LotText k="priceNoteIncluded" lot={lot} market={market} format={format} onChange={onChange} />
        <LotText k="priceNoteExcluded" lot={lot} market={market} format={format} onChange={onChange} />
      </>}
  </>;
  // Телефон (docs/palette-mobile.md, раздел 4): первой — сама цена в ролике и её состояние, затем
  // подписи сцены; справка с Encar, курсы и фрахт — в раскрытии «Расчёт цены». Ошибки (цены нет,
  // курса нет) видны сразу — в строке итога, она стоит над раскрытием. Расчёт тот же, одна формула
  // Телефон (образец владельца 20.10): переключатель «Рассчитать | Указать сумму» → карточка «Цена в
  // ролике» с итогом крупно → подписи сцены → раскрытие «Расчёт цены» (Encar, курс, фрахт). Ручная
  // сумма — поле над карточкой. Расчёт тот же, одна формула (lotTotal)
  if (mobile) {
    const pick = (m: 'calc' | 'manual') => { setMode(m); if (m === 'calc' && manual) onChange({priceOverride: null}); };
    const what = mode === 'manual' && !manual ? t('price.enterSum')
      : mode === 'manual'
      ? (computed === null ? t('price.manualCap') : `${t('price.manualCap')} · ${t('price.wouldBe', {v: `${fmt(computed)} ${sign}`})}`)
      : freight > 0 && car !== null && market.pricingMode !== 'domestic' ? `${t('price.carDelivery')}${port ? ` ${t('price.to', {port})}` : ''}` : t('price.carPrice');
    return <>
      <div className="mprice-mode" role="radiogroup" aria-label={t('price.inVideo')}>
        {([['calc', 'price.calc'], ['manual', 'price.setSum']] as const).map(([id, title]) => <button key={id} type="button" role="radio"
          aria-checked={mode === id} className={mode === id ? 'on' : ''} onClick={() => pick(id)}>{t(title)}</button>)}
      </div>
      {mode === 'manual' && <Field label={`${t('price.sumInVideo')}, ${sign}`} wide>
        {/* Число — с разрядами («30 542 155»), и в подсказке, и во вписанном: сплошные цифры не читались */}
        <input inputMode="decimal" value={lot.priceOverride != null ? fmt(lot.priceOverride) : ''} placeholder={computed === null ? '' : fmt(computed)} autoFocus={!manual}
          onChange={(e) => { const v = num(e.target.value); onChange({priceOverride: v === null || Number.isNaN(v) ? null : v}); }} />
      </Field>}
      <div className={`mprice-card${total === null ? ' warn' : ''}`}>
        <span className="mprice-label">{t('price.inVideo')}</span>
        {total === null
          ? <span className="mprice-warn">{fx && !fxOwn && !fxToday && car !== null
            ? t('price.noRateMobile', {sign})
            : t('price.none', {sign})}</span>
          : <b className="mprice-total">{fmt(total)} {sign}</b>}
        <span className="mprice-what">{what}</span>
      </div>
      <LotText k="priceLabel" lot={lot} market={market} format={format} onChange={onChange} mobile />
      {format.id !== 'price-first' && <>
        <LotText k="priceNoteIncluded" lot={lot} market={market} format={format} onChange={onChange} mobile />
        <LotText k="priceNoteExcluded" lot={lot} market={market} format={format} onChange={onChange} mobile />
      </>}
      {mode === 'calc' && <details className="mprice-calc">
        <summary>{t('price.calcTitle')}</summary>
        <div className="mprice-calc-body">{source}{freightField}</div>
      </details>}
    </>;
  }
  return <>{source}{freightField}{override}{totalLine}{labels}</>;
};

/** Контакты (финальная сцена): заголовок, акцент, преимущество, подпись и WhatsApp этого ролика */
export const ContactsEditor: React.FC<Block & Pick<Props, 'format'>> = ({lot, market, format, onChange}) => {
  const t = useT();
  return <>
  <TextsHint />
  <LotText k="ctaTitle" lot={lot} market={market} format={format} onChange={onChange} />
  <LotText k="ctaAccent" lot={lot} market={market} format={format} onChange={onChange} />
  <LotText k="ctaBenefit" lot={lot} market={market} format={format} onChange={onChange} />
  <LotText k="whatsappLabel" lot={lot} market={market} format={format} onChange={onChange} />
  <Field label="WhatsApp" hint={lot.whatsapp === null ? t('form.waHidden') : t('form.fromProfile', {v: market.whatsapp ?? '—'})}>
    <input value={lot.whatsapp ?? ''} placeholder={market.whatsapp ?? ''} disabled={lot.whatsapp === null}
      onChange={(e) => onChange({whatsapp: e.target.value || undefined})} />
  </Field>
  <label className="check scene-check">
    <input type="checkbox" checked={lot.whatsapp === null} onChange={(e) => onChange({whatsapp: e.target.checked ? null : undefined})} />
    {t('form.waHide')}
  </label>
</>;
};

/** Заметка для себя — в ролик не попадает */
export const NoteField: React.FC<Pick<Props, 'lot' | 'onChange'>> = ({lot, onChange}) =>
  <textarea rows={2} value={lot.note ?? ''} placeholder={useT()('form.notePlaceholder')}
    onChange={(e) => onChange({note: e.target.value})} />;

/** Фото ролика: порядок, места по сценам, размытие номера */
export const PhotosEditor: React.FC<Pick<Props, 'lot' | 'format' | 'onChange' | 'onPhotos' | 'onError'>> = ({lot, format, onChange, onPhotos, onError}) => {
  const t = useT();
  return <>
  <h2>{t('palette.tab.photo')} <span className="muted">{t(COARSE ? 'form.dragTouch' : 'form.dragMouse')}</span></h2>
  <Photos lot={lot} roles={format.photoRoles} rest={format.photoRest ?? 'запас'} slots={!!format.photoSlots} onChange={onChange} onPhotos={onPhotos} onError={onError} />
</>;
};

/**
 * Прежняя форма по сценам — на телефоне (раздел «Правка»). На компьютере те же блоки собирает
 * палитра (app/ads/Palette.tsx): по выбранной сцене, рядом с превью
 */
export const LotForm: React.FC<Props> = ({lot, market, format, onChange, onPhotos, onError}) => {
  const t = useT();
  return (
  // Два столбца (владелец 01.10): слева всё, что набирают руками, — авто, характеристики,
  // цена, заметка; справа фото. В один столбец до фото приходилось листать через всю
  // форму, а цену и фото нельзя было видеть разом
  <div className="form lot-form">
    <div className="lot-form-fields">
    {/* Разделы — по сценам ролика, как кнопки под превью и как в Настройках → «Реклама
        авто» (владелец 11.10: «чтобы сразу было понятно, без путаницы»). Своя надпись у
        сцены — поле прямо в ней; пусто — текст из настроек, он виден серым */}
    <SceneHead title="Хук" note={sceneNote(format.id, 'hook')} />
    <CarFields lot={lot} market={market} onChange={onChange} />
    <PhotoHint />

    <SceneHead title="Галерея" note={sceneNote(format.id, 'gallery')} />
    <p className="hint scene-hint">{t(COARSE ? 'form.galleryHintTouch' : 'form.galleryHintMouse')}</p>

    <SceneHead title="Стопка" note={sceneNote(format.id, 'stack')} />
    <SpecsEditor lot={lot} onChange={onChange} />

    <SceneHead title="Цена" note={sceneNote(format.id, 'price')} />
    <PriceEditor lot={lot} market={market} format={format} onChange={onChange} />

    <SceneHead title="Контакты" note={sceneNote(format.id, 'cta')} />
    <ContactsEditor lot={lot} market={market} format={format} onChange={onChange} />

    <SceneHead title={t('palette.note')} note={t('palette.noteHint')} />
    <NoteField lot={lot} onChange={onChange} />
    </div>

    <div className="lot-form-photos">
    <PhotosEditor lot={lot} format={format} onChange={onChange} onPhotos={onPhotos} onError={onError} />
    </div>
  </div>
  );
};

// Заголовок сцены в форме объявления; note — чем сцена отличается в выбранном формате
// title — русское название сцены (переводится через t.cfg) или уже переведённый текст; note — ключ или текст
const SceneHead: React.FC<{title: string; note?: string}> = ({title, note}) => {
  const t = useT();
  return <h2 className="scene-head">{t.cfg(title)}{note && <span className="muted">{note}</span>}</h2>;
};

// Сцены у форматов разные: в «Авто с ценой» нет галереи, а третья сцена — «Характеристики»;
// в «Цене сразу» цена — первая сцена вместе с хуком, а третья — «История». Говорим об этом
// у раздела, иначе человек правит то, чего в его ролике нет, и не понимает, почему не видно
// Тексты — scene.note.<формат>.<сцена> в словаре
const SCENE_NOTES: Record<string, string[]> = {'price-ad': ['gallery', 'stack'], 'price-first': ['hook', 'stack', 'price']};
const sceneNote = (format: string, scene: string) =>
  (SCENE_NOTES[format]?.includes(scene) ? tNow()(`scene.note.${format}.${scene}` as Key) : undefined);

// Подсказка про фото в «Хуке»: первое фото — его, места остальных подписаны в галерее
const PhotoHint: React.FC = () => <p className="hint scene-hint">{useT()(COARSE ? 'form.hookPhotoTouch' : 'form.hookPhotoMouse')}</p>;

// Одна строка на сцену вместо подсказки под каждой надписью: повторённая шесть раз, она шумела
const TextsHint: React.FC = () => <p className="hint scene-hint">{useT()('form.textsHint')}</p>;

/**
 * Надпись этого ролика поверх текстов компании (Настройки → «Реклама авто»). Пусто — берём
 * оттуда, она видна серым. Подпись и подсказка — из описания формата (config/formats.json)
 */
const LotText: React.FC<Pick<Props, 'lot' | 'market' | 'format' | 'onChange'> & {k: string; mobile?: boolean}> = ({k, lot, market, format, onChange, mobile = false}) => {
  const tr = useT();
  const t = format.texts.find((x) => x.key === k);
  if (!t) return null;
  const value = lot.texts?.[k] ?? '';
  // Надпись из настроек — как в ролике: «{port}» сразу заменён портом объявления («до DURRES»)
  const fallback = (market.texts[k] ?? '').replace('{port}', lot.port ?? market.port ?? '');
  const set = (v: string) => onChange({texts: {...lot.texts, [k]: v === '' ? undefined : v}});
  // Телефон: откуда надпись — меткой справа от подписи («Из настроек» / «Своя»), без общей подсказки
  if (mobile) return <label className="field mfield">
    <span className="mfield-head"><span className="label">{tr.cfg(t.label)}</span><span className="mfield-tag">{tr(value ? 'form.own' : 'form.fromSettings')}</span></span>
    {t.multiline
      ? <textarea rows={2} value={value} placeholder={fallback} onChange={(e) => set(e.target.value)} />
      : <input value={value} placeholder={fallback} onChange={(e) => set(e.target.value)} />}
  </label>;
  return (
    <Field label={tr.cfg(t.label)} hint={value ? tr('form.ownHint') : undefined} wide>
      {t.multiline
        ? <textarea rows={2} value={value} placeholder={fallback} onChange={(e) => set(e.target.value)} />
        : <input value={value} placeholder={fallback} onChange={(e) => set(e.target.value)} />}
    </Field>
  );
};

const Photos: React.FC<Pick<Props, 'lot' | 'onChange' | 'onPhotos' | 'onError'> & {roles: string[]; rest: string; slots: boolean}> = ({lot, roles, rest, slots, onChange, onPhotos, onError}) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  // Над каким фото сейчас держат перетаскиваемое: место подсвечивается, чтобы было видно,
  // куда оно встанет, ещё до того как отпустили (владелец 01.10)
  const [target, setTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const {config} = useConfig();
  const own = `${config.workspace.url}/lots/${lot.id}/photos/`;
  const blurCount = (p: string) => lot.blur?.[p.slice(own.length).replace(/(~\d+)?\.jpg$/, '')]?.length ?? 0;

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setBusy(true);
    try { onPhotos(await api.uploadPhotos(lot.id, images)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  // Снимки, перетащенные из палитры объявления (EncarImport). Бросили на фото — встают на
  // его место, бросили мимо — в конец. Сервер всегда дописывает в конец, поэтому место
  // выставляем следом обычной перестановкой
  const fromEncar = (e: React.DragEvent) => e.dataTransfer.types.includes(ENCAR_PHOTO_DRAG);
  const importFromEncar = async (e: React.DragEvent, at?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    setTarget(null);
    let urls: string[] = [];
    try { urls = JSON.parse(e.dataTransfer.getData(ENCAR_PHOTO_DRAG)); } catch { return; }
    if (!urls.length) return;
    setBusy(true);
    try {
      const server = await api.importPhotos(lot.id, urls);
      onPhotos(server);
      const added = server.photos.length - lot.photos.length;
      if (at !== undefined && added > 0) {
        const photos = [...server.photos];
        photos.splice(at, 0, ...photos.splice(photos.length - added, added));
        onChange({photos});
      }
    } catch (err) { onError(err); } finally { setBusy(false); }
  };
  const remove = async (path: string) => {
    try { onPhotos(await api.deletePhoto(lot.id, path)); } catch (e) { onError(e); }
  };
  // Места в «Галерее»: подпись под фото — из той же раскладки, что рендер, поэтому
  // «Стопка 2» здесь и есть второе фото стопки в ролике
  // Число склеек — то же, что у ролика: подпись считалась по 8, а в ролик шло 5 (30.09)
  const layout = slots ? photoLayout(lot.photos, lot.slots, GALLERY_CUTS) : null;
  const placeOf = (p: string) => {
    const at = layout?.placed[p];
    if (!layout) return null;
    if (at === 'stack') return t.cfg(`Стопка ${layout.stack.indexOf(p) + 1}`);
    return at ? t.cfg(SLOT_TITLES[at]) : t('form.notInVideo');
  };
  const setSlot = (p: string, value: Slot) => {
    const next = {...lot.slots};
    // «Авто» не храним: нет ключа — место по порядку
    if (value === 'auto') delete next[photoKey(p)]; else next[photoKey(p)] = value;
    onChange({slots: next});
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    const photos = [...lot.photos];
    const [p] = photos.splice(from, 1);
    photos.splice(to, 0, p);
    onChange({photos});
  };

  // Перестановка касанием: подержал палец на фото — оно «взялось» (лёгкая вибрация, плитка
  // тускнеет), ведёшь к нужному месту — оно подсвечивается, отпустил — фото встало туда.
  // До «взялось» палец двигать можно: это обычная прокрутка страницы. Слушатели — руками с
  // passive: false: React вешает touchmove пассивным, а без preventDefault страница ехала бы
  // под пальцем, пока тянешь фото. Актуальные photos/move берём через ref — эффект один
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !COARSE) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let from = -1; let to = -1; let active = false; let x0 = 0; let y0 = 0;
    // «Призрак» — копия фото под пальцем, как у мыши (там его рисует сам браузер). Живёт вне
    // React и двигается напрямую через transform: перерисовывать компонент на каждый сдвиг
    // пальца дорого, а призрак обязан идти без задержки
    let ghost: HTMLElement | null = null; let gw = 0; let gh = 0;
    const place = (x: number, y: number) => { if (ghost) ghost.style.transform = `translate3d(${x - gw / 2}px, ${y - gh / 2}px, 0) scale(1.06) rotate(2.5deg)`; };
    const lift = (thumb: HTMLElement, x: number, y: number) => {
      const b = thumb.getBoundingClientRect(); gw = b.width; gh = b.height;
      ghost = document.createElement('div');
      ghost.className = 'touch-ghost';
      ghost.style.cssText = `width:${gw}px;height:${gh}px;background-image:url("${thumb.querySelector('img')?.getAttribute('src') ?? ''}")`;
      document.body.appendChild(ghost);
      place(x, y);
      // Кадром позже — чтобы появление (opacity, тень) проиграло, а не включилось сразу
      requestAnimationFrame(() => ghost?.classList.add('lifted'));
    };
    // Отпустили: призрак плавно «садится» на выбранное место и гаснет
    const drop = (thumb: HTMLElement | undefined) => {
      const g = ghost; ghost = null;
      if (!g) return;
      if (thumb) {
        const b = thumb.getBoundingClientRect();
        g.style.transition = 'transform .18s ease-out, opacity .18s';
        g.style.transform = `translate3d(${b.left}px, ${b.top}px, 0)`;
      }
      g.classList.remove('lifted');
      setTimeout(() => g.remove(), 200);
    };
    const reset = () => { clearTimeout(timer); timer = undefined; active = false; from = -1; to = -1; setDrag(null); setTarget(null); drop(undefined); };
    const start = (e: TouchEvent) => {
      const handle = (e.target as Element).closest('.thumb .drag');
      const thumb = handle?.closest<HTMLElement>('.thumb[data-i]');
      if (!thumb || e.touches.length !== 1) return;
      from = Number(thumb.dataset.i); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      timer = setTimeout(() => { active = true; to = from; setDrag(from); navigator.vibrate?.(15); lift(thumb, x0, y0); }, HOLD_MS);
    };
    const moveTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!active) {
        // Сдвинулся до «взялось» — значит листает страницу, фото не трогаем
        if (timer && Math.hypot(t.clientX - x0, t.clientY - y0) > 10) { clearTimeout(timer); timer = undefined; from = -1; }
        return;
      }
      e.preventDefault();
      place(t.clientX, t.clientY);
      const over = document.elementFromPoint(t.clientX, t.clientY)?.closest<HTMLElement>('.thumb[data-i]');
      to = over ? Number(over.dataset.i) : to;
      setTarget(to);
      // У края экрана подкручиваем страницу — иначе до нижних фото не дотянуться
      const box = grid.closest<HTMLElement>('.quick');
      if (box) {
        if (t.clientY < 180) box.scrollTop -= 12;
        else if (t.clientY > window.innerHeight - 150) box.scrollTop += 12;
      }
    };
    const end = () => {
      if (active && from >= 0 && to >= 0 && from !== to) {
        // Место, куда садится призрак, берём до перестановки: после неё плитки поменяются
        drop(grid.querySelector<HTMLElement>(`.thumb[data-i="${to}"]`) ?? undefined);
        moveRef.current(from, to);
      }
      reset();
    };
    grid.addEventListener('touchstart', start, {passive: true});
    grid.addEventListener('touchmove', moveTouch, {passive: false});
    grid.addEventListener('touchend', end);
    grid.addEventListener('touchcancel', reset);
    return () => {
      clearTimeout(timer);
      ghost?.remove();
      grid.removeEventListener('touchstart', start);
      grid.removeEventListener('touchmove', moveTouch);
      grid.removeEventListener('touchend', end);
      grid.removeEventListener('touchcancel', reset);
    };
  }, []);

  return (
    <div
      ref={gridRef}
      className={over ? 'photos over' : 'photos'}
      onDragOver={(e) => {
        if (fromEncar(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }
        else if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); }
      }}
      // Только когда ушли из галереи совсем: dragleave всплывает и с каждой плитки внутри,
      // и без проверки подсветка мигала бы на каждой границе
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOver(false); setTarget(null); } }}
      onDrop={(e) => {
        setTarget(null);
        if (fromEncar(e)) importFromEncar(e);
        else if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }
      }}
    >
      {lot.photos.map((p, i) => (
        <div
          key={p}
          data-i={i}
          // Полоса — с той стороны, куда встанет фото: своё, которое тянут вправо, встаёт
          // после этого (остальные сдвигаются влево), во всех прочих случаях — перед ним
          className={`thumb${drag === i ? ' dragging' : ''}${target === i && drag !== i ? (drag !== null && drag < i ? ' drop-after' : ' drop-before') : ''}`}
          onDragOver={(e) => {
            if (drag !== null) e.preventDefault();
            if (drag !== null || fromEncar(e)) setTarget(i);
          }}
          onDrop={(e) => {
            setTarget(null);
            if (fromEncar(e)) importFromEncar(e, i);
            else if (drag !== null) { e.preventDefault(); e.stopPropagation(); move(drag, i); setDrag(null); }
          }}
        >
          {/* Тянется только фото: кнопки вне перетаскиваемого блока, иначе браузер съедает их клики */}
          <div className="drag" draggable={!COARSE} onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setTarget(null); }}>
            <img src={p.startsWith('http') || p.startsWith('/') ? p : `/${p}`} alt="" />
            <span className="role">{i + 1}. {layout ? placeOf(p) : t.cfg(roles[i] ?? rest)}</span>
          </div>
          {layout && (
            // Вне перетаскиваемого блока — иначе браузер съедает клик по списку
            <select className="slot" value={lot.slots?.[photoKey(p)] ?? 'auto'} title={t('form.slotTitle')}
              onChange={(e) => setSlot(p, e.target.value as Slot)}>
              {(Object.keys(SLOT_TITLES) as Slot[]).map((s) => <option key={s} value={s}>{t.cfg(SLOT_TITLES[s])}</option>)}
            </select>
          )}
          <button className="icon del" title={t('form.deletePhoto')} onClick={() => remove(p)}>×</button>
          {p.startsWith(own) && (
            <button className={blurCount(p) ? 'blur-btn on' : 'blur-btn'} title={t('form.blurTitle')} onClick={() => setEditing(p)}>
              {blurCount(p) ? t('form.blurred', {n: blurCount(p)}) : t('form.blur')}
            </button>
          )}
        </div>
      ))}
      <button className="thumb add" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <>{t('encar.loading')}<div className="bar wait"><div /></div></> : <>+ {t('palette.tab.photo')}<br /><span className="muted">{t('form.orDrop')}</span></>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {editing && <BlurEditor lotId={lot.id} path={editing} onClose={closeEditor} onSaved={onPhotos} onError={onError} />}
    </div>
  );
};
