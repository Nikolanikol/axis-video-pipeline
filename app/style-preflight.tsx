/// <reference types="vite/client" />
// Отдельный локальный стенд подготовки, не пункт меню и не вход сборки Vite для прода.
// Проверяет общий каталог и укладку текста; образцы не заменяют композиции семейств.
import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/oswald/700.css';
import {VISUAL_THEMES, visualThemeTokens} from '../src/shared/visualThemes.js';
import {fitTextBlock} from '../src/shared/textLayout.js';
import {browserTextMeasure, type TextFont} from '../src/design/text/measure';
import {familyById} from '../src/carousel/families/registry.js';
import {contrast} from '../src/shared/contrast.js';
import cases from '../design/style-preflight/cases.json';
import './style-preflight.css';

type Kind = 'title' | 'body' | 'single';
type Format = 'carousel' | 'square' | 'portrait' | 'video';
const firstFont = (family: string) => family.split(',')[0].trim().replace(/["']/g, '');
const boxFor = (format: Format, kind: Kind) => {
  const video = format === 'video', square = format === 'square';
  return {x: 64, y: kind === 'title' ? 190 : kind === 'body' ? (video ? 1210 : square ? 710 : 900) : (video ? 1470 : square ? 770 : 1040),
    width: video ? 866 : 952, height: kind === 'title' ? (video ? 360 : square ? 230 : 280) : kind === 'body' ? (video ? 380 : square ? 210 : 300) : 150,
    minSize: kind === 'body' ? 30 : 40, maxSize: kind === 'body' ? 44 : video ? 140 : 120,
    lineHeight: kind === 'body' ? 1.24 : 1.12, maxLines: kind === 'title' ? 3 : kind === 'body' ? 9 : 1,
    wrap: kind !== 'single', breakWords: kind !== 'single'};
};

// Ожидаем конкретное начертание после таблицы стилей, иначе измерили бы запасной шрифт.
const useReadyFont = (id: string, font: TextFont, text: string) => {
  const [state, setState] = useState({ready: false, exact: false, error: ''});
  const family = familyById(id)!;
  useEffect(() => {
    let live = true;
    const link = document.createElement('link');
    let timer: number;
    setState({ready: false, exact: false, error: ''});
    const load = async () => {
      try {
        const wanted = firstFont(font.family).toLowerCase();
        const registered = Array.from(document.fonts).some((face) => firstFont(face.family).toLowerCase() === wanted);
        if (!registered && family.fonts.url) await new Promise<void>((resolve, reject) => {
          link.rel = 'stylesheet'; link.href = family.fonts.url;
          link.onload = () => resolve(); link.onerror = () => reject(new Error('Таблица шрифта недоступна'));
          timer = window.setTimeout(() => reject(new Error('Загрузка шрифта превысила 10 секунд')), 10000);
          document.head.append(link);
        });
        clearTimeout(timer!);
        await Promise.race([document.fonts.load(`${font.style ?? 'normal'} ${font.weight} 80px ${font.family}`, text || ' '),
          new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Начертание не загрузилось')), 10000); })]);
        const exact = Array.from(document.fonts).some((face) => {
          const weights = face.weight.split(/\s+/).map(Number);
          const hasWeight = weights.length === 2 ? font.weight >= weights[0] && font.weight <= weights[1] : Number(face.weight) === font.weight;
          return firstFont(face.family).toLowerCase() === wanted && face.status === 'loaded' && face.style === (font.style ?? 'normal') && hasWeight;
        });
        if (live) setState({ready: true, exact, error: exact ? '' : 'Используется запасной шрифт — проверку выбранного начертания повторить'});
      } catch (e) {
        if (live) setState({ready: true, exact: false, error: e instanceof Error ? e.message : 'Шрифт недоступен'});
      } finally { clearTimeout(timer!); }
    };
    void load();
    return () => { live = false; clearTimeout(timer); link.remove(); };
  }, [id, font.family, font.weight, font.style, family.fonts.url, text]);
  return state;
};

const Card: React.FC<{format: Format; kind: Kind; text: string; id: string; font: TextFont; ready: boolean}> = ({format, kind, text, id, font, ready}) => {
  const c = visualThemeTokens(id), box = boxFor(format, kind);
  const height = format === 'video' ? 1920 : format === 'square' ? 1080 : 1350;
  const outerHeight = format === 'portrait' ? 1920 : height;
  const inset = (outerHeight - height) / 2;
  const result = useMemo(() => ready ? fitTextBlock(text, box, browserTextMeasure(font)) : null,
    [ready, text, format, kind, font]);
  const status = !result ? 'Ждём шрифт…' : !result.fits ? 'Нужно сократить текст' : result.status === 'original' ? 'Текст помещается' : 'Размер подобран';
  const photoY = kind === 'title' ? (format === 'video' ? 630 : format === 'square' ? 440 : 530) : 190;
  const photoH = kind === 'title' ? height - photoY - 210 : box.y - photoY - 80;
  const clipId = `photo-${format}`;
  return <section className="preflight-card" data-format={format} data-ready={ready} data-fits={result?.fits ?? false}
    data-size={result?.fontSize} data-line-count={result?.lineCount}>
    <div className="preflight-card-label"><h2>{format === 'video' ? 'Видео · 9:16' : `Карусель · ${format === 'square' ? '1:1' : format === 'portrait' ? '9:16' : '4:5'}`}</h2><span>{status}</span></div>
    <svg className="preflight-sheet" viewBox={`0 0 1080 ${outerHeight}`} role="img" aria-label={`${format === 'video' ? 'Видео' : 'Карусель'}: ${status}`}
      style={{background: c.background, color: c.foreground}}>
      <defs><clipPath id={clipId}><rect x="64" y={photoY} width="952" height={photoH} rx="28" /></clipPath></defs>
      {inset > 0 && <><rect width="1080" height={inset} fill={c.surface} /><rect y={outerHeight - inset} width="1080" height={inset} fill={c.surface} /></>}
      <g transform={`translate(0 ${inset})`}>
      <text x="64" y="100" fill={c.foreground} fontFamily="Manrope" fontWeight="600" fontSize="44">KOK</text>
      <text x="1016" y="100" textAnchor="end" fill={c.muted} fontFamily="Manrope" fontSize="24">{VISUAL_THEMES.find((t) => t.id === id)?.title}</text>
      <image href="/preview-demo/photo-1.jpg" x="64" y={photoY} width="952" height={photoH} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
      <rect className="preflight-text-bounds" x={box.x} y={box.y} width={box.width} height={box.height} rx="10" fill="none" stroke={c.border} strokeWidth="2" strokeDasharray="8 8" />
      {result?.fits ? <text className="preflight-fitted-text" data-format={format} x={box.x} y={box.y + result.baseline}
        fontSize={result.fontSize} fontFamily={font.family} fontWeight={font.weight} fontStyle={font.style}
        letterSpacing={(font.letterSpacing ?? 0) + result.fontSize * (font.letterSpacingEm ?? 0)} fill={c.foreground}>
        {result.lines.map((line, i) => <tspan key={i} x={box.x + result.lineOffsets[i]} dy={i ? result.lineAdvance : 0}>{line || '\u00a0'}</tspan>)}
      </text> : result ? <g><rect x={box.x} y={box.y} width={box.width} height={box.height} rx="10" fill={c.surface} />
        <text x={box.x + 24} y={box.y + 60} fill={c.foreground} fontFamily="Manrope" fontSize="32">Текст не помещается в этот блок.</text>
        <text x={box.x + 24} y={box.y + 108} fill={c.muted} fontFamily="Manrope" fontSize="28">Сократите описание или измените компоновку.</text></g> : null}
      <rect x="64" y={height - 160} width="410" height="84" rx="14" fill={c.accent} />
      <text x="90" y={height - 106} fill={c.onAccent} fontFamily="Manrope" fontWeight="600" fontSize="32">Подобрать автомобиль</text>
      <text x="1016" y={height - 104} textAnchor="end" fill={c.accentInk} fontFamily="Manrope" fontWeight="600" fontSize="36">37 858 $</text>
      </g>
    </svg>
    <div className="preflight-measure" role="status">{result ? <>{result.fontSize} px · {result.lineCount} стр. · {box.width} × {box.height} px
      {!result.fits && <strong> Минимум {box.minSize} px достигнут; исходный текст сохранён целиком.</strong>}</> : 'Загрузка выбранного начертания'}</div>
  </section>;
};

const App = () => {
  const [theme, setTheme] = useState('cobalt_shift');
  const [kind, setKind] = useState<Kind>('title');
  const [carFormat, setCarFormat] = useState<Exclude<Format, 'video'>>('carousel');
  const [text, setText] = useState(cases[0].text);
  const family = familyById(theme)!;
  const font = useMemo<TextFont>(() => kind === 'body' ? {family: family.fonts.body, weight: 600}
    : {family: family.fonts.head, weight: /Rubik|Unbounded|Exo/.test(family.fonts.head) ? 800 : 700,
      style: theme === 'pulse_grid' ? 'italic' : 'normal', letterSpacingEm: theme === 'wide_form' ? -.02 : 0}, [theme, kind]);
  const loaded = useReadyFont(theme, font, text);
  const c = visualThemeTokens(theme);
  return <main className="preflight">
    <header><a href="/#/ads/lot">← Рабочий инструмент</a><span className="preflight-tag">Подготовка · локальный стенд</span>
      <h1>Цвета и длинный текст</h1><p>Общие цвета для двух форматов. Образцы проверяют палитру и текстовый блок; композиции семейств ещё не перенесены в видео.</p></header>
    <div className="preflight-controls">
      <label>Цветовая тема<select value={theme} onChange={(e) => setTheme(e.target.value)}>{VISUAL_THEMES.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <label>Текстовый блок<select value={kind} onChange={(e) => setKind(e.target.value as Kind)}><option value="title">Заголовок</option><option value="body">Описание</option><option value="single">Цена или контакт · одна строка</option></select></label>
      <label>Формат карусели<select value={carFormat} onChange={(e) => setCarFormat(e.target.value as typeof carFormat)}><option value="carousel">4:5</option><option value="square">1:1</option><option value="portrait">9:16 · безопасная область 4:5</option></select></label>
      <div><span>Начертание</span><b>{firstFont(font.family)} · {font.weight}{font.style === 'italic' ? ' · курсив' : ''}</b><small>{!loaded.ready ? 'Загружается…' : loaded.exact ? 'Шрифт загружен' : 'Запасной шрифт'}</small></div>
    </div>
    <div className="preflight-presets" role="group" aria-label="Примеры длинного текста">{cases.map((sample) => <button key={sample.id} type="button" aria-pressed={text === sample.text && kind === sample.kind}
      onClick={() => { setText(sample.text); setKind(sample.kind as Kind); }}>{sample.title}</button>)}</div>
    <label className="preflight-input">Полный исходный текст<textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /><small>{Array.from(text).length} символов · переносы строк учитываются · автоматического сокращения нет</small></label>
    {loaded.error && <div className="preflight-note" role="alert">{loaded.error}</div>}
    <div className="preflight-colors" aria-label="Роли цветов">{(['background','foreground','accent','onAccent','accentInk'] as const).map((role) => <span key={role}><i style={{background: c[role]}} />
      {{background: 'Фон', foreground: 'Текст', accent: 'Акцентная плашка', onAccent: 'Текст на плашке', accentInk: 'Акцентная надпись'}[role]} <code>{c[role]}</code></span>)}</div>
    <div className="preflight-contrast">Контраст: текст {contrast(c.foreground, c.background).toFixed(1)} · надпись акцентом {contrast(c.accentInk, c.background).toFixed(1)} · текст на плашке {contrast(c.onAccent, c.accent).toFixed(1)}</div>
    <div className="preflight-cards"><Card format={carFormat} kind={kind} text={text} id={theme} font={font} ready={loaded.ready} />
      <Card format="video" kind={kind} text={text} id={theme} font={font} ready={loaded.ready} /></div>
  </main>;
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
// При горячей замене точки входа предыдущий корень должен снять шрифты и эффекты.
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
