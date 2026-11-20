// Один подбор для превью и файла. Старые снимки используют прежнюю вёрстку;
// новые блоки включаются явно через FitScope и textFitVersion.
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {cancelRender, continueRender, delayRender, getRemotionEnvironment} from 'remotion';
import {fitTextBlock, type TextBox, type TextLayout} from '../../shared/textLayout.js';
import {browserTextMeasure, type TextFont} from './measure';

type Scope = {enabled: boolean; auditOnly?: boolean; scene: string; language?: string};
const Context = createContext<Scope>({enabled: false, scene: ''});
export const FitScope: React.FC<Scope & {children: React.ReactNode}> = ({children, ...value}) => <Context.Provider value={value}>{children}</Context.Provider>;
export const useFitScope = () => useContext(Context);

const cssFonts = new Map<string, Promise<void>>();
const layouts = new Map<string, Promise<TextLayout>>();
const nameOf = (font: string) => font.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
export const loadFitFont = async (font: TextFont, url: string, text: string) => {
  const registered = Array.from(document.fonts).some((face) => nameOf(face.family) === nameOf(font.family));
  if (url && !registered) {
    if (!cssFonts.has(url)) cssFonts.set(url, new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('Не загрузилась таблица шрифта'));
      document.head.append(link);
    }).catch((error) => { cssFonts.delete(url); throw error; }));
    await cssFonts.get(url);
  }
  // fonts.load неизвестного семейства успешно возвращает []: это был бы тихий
  // системный шрифт и ложная проверка размеров вместо выбранного начертания.
  if (url && !Array.from(document.fonts).some((face) => nameOf(face.family) === nameOf(font.family))) {
    throw new Error('Выбранное семейство шрифта не зарегистрировано');
  }
  await document.fonts.load(`${font.style ?? 'normal'} ${font.weight} 80px ${font.family}`, text || ' ');
};

const fit = (key: string, source: string, box: TextBox, font: TextFont, fontUrl: string) => {
  if (!layouts.has(key)) {
    if (layouts.size >= 256) layouts.delete(layouts.keys().next().value!);
    layouts.set(key, (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([loadFitFont(font, fontUrl, source), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Шрифт не загрузился за 8 секунд')), 8000);
        })]);
        return fitTextBlock(source, box, browserTextMeasure(font));
      } finally { clearTimeout(timer); }
    })().catch((error) => { layouts.delete(key); throw error; }));
  }
  return layouts.get(key)!;
};

const words = {
  ru: {short: 'Сократите текст', font: 'Не удалось загрузить шрифт. Повторите проверку.', full: 'Текст не помещается', end: 'Сократите поле или выберите другую компоновку.'},
  en: {short: 'Shorten this text', font: 'Could not load the font. Please retry.', full: 'Text does not fit', end: 'Shorten this field or choose another layout.'},
  sq: {short: 'Shkurtoni tekstin', font: 'Shkronjat nuk u ngarkuan. Provoni përsëri.', full: 'Teksti nuk përshtatet', end: 'Shkurtoni fushën ose zgjidhni një kompozim tjetër.'},
};
const labels: Record<string, Record<string, string>> = {
  title: {ru: 'Заголовок', en: 'Title', sq: 'Titulli'}, section: {ru: 'Рубрика', en: 'Section', sq: 'Rubrika'},
  text: {ru: 'Описание', en: 'Description', sq: 'Përshkrimi'}, contact: {ru: 'Контакт', en: 'Contact', sq: 'Kontakti'},
  price: {ru: 'Цена', en: 'Price', sq: 'Çmimi'}, label: {ru: 'Подпись', en: 'Label', sq: 'Etiketa'},
  name: {ru: 'Название автомобиля', en: 'Vehicle name', sq: 'Emri i makinës'},
  brand: {ru: 'Название компании', en: 'Company name', sq: 'Emri i kompanisë'},
  specs: {ru: 'Характеристики', en: 'Specifications', sq: 'Specifikimet'},
};
export const textFitIssue = (scope: Scope, field: string, fontError = false) => {
  const lang = scope.language === 'en' || scope.language === 'sq' ? scope.language : 'ru';
  const copy = words[lang], label = labels[field]?.[lang] ?? field;
  return {label, short: fontError ? copy.font : copy.short,
    full: fontError ? copy.font : `${copy.full}: ${scope.scene} — ${label}. ${copy.end}`};
};
export const stopBadText = (message: string, fontError = false) => {
  if (!getRemotionEnvironment().isRendering) return false;
  // cancelRender записывает флаг отказа браузеру Remotion и бросает исключение.
  // Флаг остаётся; не превращаем этот отказ в повторную «ошибку шрифта» Promise.catch.
  try { cancelRender(new Error(`${fontError ? 'TEXT_FIT_FONT' : 'TEXT_FIT'}: ${message}`)); } catch { /* отказ прочитает Remotion */ }
  return true;
};
type Props = {text: string; box: TextBox; font: TextFont; fontUrl?: string; field: string; color: string;
  style?: React.CSSProperties; fallback: React.ReactNode; align?: 'start' | 'middle' | 'end'; lastWordColor?: string;
  outline?: {color: string; width: number};
  padding?: number;
  render?: (result: TextLayout) => React.ReactNode};

export const FitText: React.FC<Props> = (props) => useFitScope().enabled ? <MeasuredText {...props} /> : <>{props.fallback}</>;
const MeasuredText: React.FC<Props> = ({text, box, font, fontUrl = '', field, color, style, align = 'start', lastWordColor, outline, padding = 0, render}) => {
  const scope = useFitScope();
  const language = scope.language === 'en' || scope.language === 'sq' ? scope.language : 'ru';
  const copy = words[language], label = labels[field]?.[language] ?? field;
  const pad = Math.max(padding, outline ? Math.ceil(outline.width / 2) + 1 : 0);
  const measuredBox = {...box, width: Math.max(1, box.width - pad * 2), height: Math.max(1, box.height - pad * 2)};
  const key = JSON.stringify([text, measuredBox, font, fontUrl]);
  const handle = useMemo(() => delayRender(`Текст: ${scope.scene} / ${field}`), [key]);
  const [state, setState] = useState<{key: string; layout?: TextLayout; error?: string}>({key});
  useEffect(() => {
    let live = true, failedRender = false;
    const fail = (fontError: boolean) => {
      const message = fontError ? copy.font : `${copy.full}: ${scope.scene} — ${label}. ${copy.end}`;
      if (live) setState({key, error: fontError ? copy.font : copy.short});
      failedRender = stopBadText(message, fontError);
    };
    fit(key, text, measuredBox, font, fontUrl).then((layout) => {
      if (!live) return;
      if (!layout.fits) fail(false); else setState({key, layout});
    }).catch(() => { if (live) fail(true); }).finally(() => { if (!failedRender) continueRender(handle); });
    // Remotion проверяет ready раньше cancelled. При отказе держим handle: иначе
    // быстрый кэшированный шрифт мог объявить кадр готовым раньше чтения ошибки.
    return () => { live = false; if (!failedRender) continueRender(handle); };
  }, [key, handle]);
  const result = state.key === key ? state.layout : undefined;
  const error = state.key === key ? state.error : undefined;
  return <div data-fit-field={field} data-fit-ready={!!(result || error)} data-fit-ok={!!result}
    style={{...style, width: box.width, height: box.height, flex: 'none', position: style?.position ?? 'relative', color, overflow: 'hidden'}}>
    {error ? <div role="alert" style={{padding: 10, fontFamily: 'sans-serif', fontSize: 24, lineHeight: 1.15, color: '#fff', background: '#7F1530'}}>
      <b>{label}</b><br />{error}</div> : result ? render ? <div style={{position: 'absolute', left: pad, top: pad}}>{render(result)}</div> : <svg width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`} style={{display: 'block', overflow: 'visible'}}>
      <text y={result.baseline + pad} fill={color} stroke={outline?.color} strokeWidth={outline?.width} paintOrder="stroke"
        fontFamily={font.family} fontWeight={font.weight} fontStyle={font.style}
        fontSize={result.fontSize} letterSpacing={(font.letterSpacing ?? 0) + result.fontSize * (font.letterSpacingEm ?? 0)}>
        {result.lines.map((line, i) => {
          const x = pad + (align === 'middle' ? (measuredBox.width - result.lineWidths[i]) / 2 : align === 'end' ? measuredBox.width - result.lineWidths[i] : 0) + result.lineOffsets[i];
          const last = lastWordColor && i === result.lines.length - 1 ? line.lastIndexOf(' ') + 1 : -1;
          return <tspan key={i} x={x} dy={i ? result.lineAdvance : 0}>{last >= 0 ? <>{line.slice(0, last)}<tspan fill={lastWordColor}>{line.slice(last)}</tspan></> : line || '\u200b'}</tspan>;
        })}
      </text>
    </svg> : null}
  </div>;
};
