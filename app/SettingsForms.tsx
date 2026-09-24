// Формы настроек: рынок (порт, фрахт, контакты, тексты форматов) и цвета бренда.
import React, {useEffect, useRef, useState} from 'react';
import {FORMATS} from '../src/shared/model';
import type {Market, Theme} from '../src/shared/types';
import {api, FontPair, MarketEntry} from './api';
import {Field} from './LotForm';
import {MusicFields} from './MusicFields';


type MarketProps = {
  market: MarketEntry;
  saved?: MarketEntry;
  markets: MarketEntry[];
  onChange: (m: MarketEntry) => void;
  onSaved: (m: MarketEntry) => void;
  // Создан новый рынок (копией) — открыть его
  onCreated: (id: string) => void;
  onError: (e: unknown) => void;
};

export const MarketForm: React.FC<MarketProps> = ({market, saved, markets, onChange, onSaved, onCreated, onError}) => {
  const [busy, setBusy] = useState(false);
  const dirty = market !== saved;
  const set = (patch: Partial<Market>) => onChange({...market, ...patch});
  const setText = (key: string, value: string) => set({texts: {...market.texts, [key]: value}});
  const {id, ...data} = market;

  const persist = async (targetId: string) => {
    setBusy(true);
    try {
      const result = await api.saveMarket(targetId, data);
      onSaved(result);
      return result;
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const copy = async () => {
    const newId = prompt('id нового рынка латиницей (например kz, ge, kg, am):')?.trim().toLowerCase();
    if (!newId) return;
    if (markets.some((m) => m.id === newId)) return onError(new Error(`Рынок «${newId}» уже есть`));
    const created = await persist(newId);
    if (created) {
      if (saved) onChange(saved); // исходный рынок возвращаем к сохранённому виду
      onCreated(created.id);
    }
  };

  return (
    <div className="form">
      <h2>Рынок «{id}» <span className="muted">настройки для всех лотов этого рынка</span></h2>
      <p className="note">Превью меняется сразу; в файл <code>config/markets/{id}.json</code> — по кнопке «Сохранить». Рендер берёт сохранённое.</p>
      <div className="row">
        <Field label="Название"><input value={market.name} onChange={(e) => set({name: e.target.value})} /></Field>
        <Field label="Фрахт, $"><input inputMode="decimal" value={market.freightUsd} onChange={(e) => set({freightUsd: Number(e.target.value) || 0})} /></Field>
      </div>
      <div className="row">
        <Field label="Откуда"><input value={market.origin} onChange={(e) => set({origin: e.target.value})} /></Field>
        <Field label="Страна отправки"><input value={market.originCountry} onChange={(e) => set({originCountry: e.target.value})} /></Field>
      </div>
      <div className="row">
        <Field label="Порт назначения"><input value={market.port} onChange={(e) => set({port: e.target.value})} /></Field>
        <Field label="Страна порта"><input value={market.portCountry} onChange={(e) => set({portCountry: e.target.value})} /></Field>
      </div>
      <div className="row">
        <Field label="WhatsApp" hint="пусто — не показывать">
          <input value={market.whatsapp ?? ''} onChange={(e) => set({whatsapp: e.target.value || null})} />
        </Field>
        <Field label="Сайт"><input value={market.site} onChange={(e) => set({site: e.target.value})} /></Field>
      </div>

      <h2>Музыка по умолчанию</h2>
      <MusicFields value={market.music ?? {track: null}} onChange={(music) => set({music: music ?? {track: null}})} />

      {FORMATS.map((f) => (
        <React.Fragment key={f.id}>
          <h2>Тексты: {f.title} <span className="muted">{f.id}</span></h2>
          {f.texts.map(({key, label, hint, multiline}) => (
            <Field key={key} label={label} hint={hint} wide>
              {multiline
                ? <textarea rows={2} value={market.texts[key] ?? ''} onChange={(e) => setText(key, e.target.value)} />
                : <input value={market.texts[key] ?? ''} onChange={(e) => setText(key, e.target.value)} />}
            </Field>
          ))}
        </React.Fragment>
      ))}

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={() => persist(id)}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>Отменить правки</button>
        <button className="btn ghost" disabled={busy} onClick={copy}>Копировать как новый рынок…</button>
      </div>
    </div>
  );
};

// Только цветовые поля темы: в ней теперь есть ещё имя, шрифты и файлы бренда,
// и без сужения форма пыталась бы засунуть объект в поле ввода
type ColorKey = {[K in keyof Theme]: Theme[K] extends string ? K : never}[keyof Theme];

const COLOR_FIELDS: [ColorKey, string][] = [
  ['bg', 'Фон'], ['panel', 'Плашки'], ['line', 'Линии, пунктир'], ['grey', 'Второстепенный текст'],
  ['white', 'Основной текст'], ['copper', 'Медь'], ['copperLight', 'Медь светлая'], ['copperDark', 'Медь тёмная'],
];

/**
 * Загрузка логотипа. Условия написаны рядом с кнопкой намеренно: приёмник, который берёт
 * что угодно, а потом отказывает, заставляет человека гадать. Числа берутся с сервера —
 * так они не разойдутся с проверкой.
 */
const LogoField: React.FC<{theme: Theme; onSaved: (t: Theme) => void; onError: (e: unknown) => void}> =
  ({theme, onSaved, onError}) => {
    const [busy, setBusy] = useState(false);
    const [info, setInfo] = useState('');
    const ref = useRef<HTMLInputElement>(null);
    const send = async (file?: File) => {
      if (!file) return;
      setBusy(true);
      setInfo('');
      try {
        const res = await api.uploadLogo(file);
        onSaved(res.brand);
        setInfo(`Загружен: ${res.width}×${res.height}, ${Math.round(res.bytes / 1024)} КБ`);
      } catch (e) { onError(e); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
    };
    const logo = theme.assets?.logoStacked ?? '';
    // Путь внутри public/ в браузере доступен с корня, полный адрес оставляем как есть
    const shown = logo.startsWith('http') || logo.startsWith('/') ? logo : `/${logo}`;
    return (
      <div className="logo-field">
        <div className="logo-shot"><img src={shown} alt="Логотип" /></div>
        <div>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>
              {busy ? 'Проверяю…' : 'Загрузить логотип'}
            </button>
          </div>
          <input ref={ref} type="file" accept="image/png" hidden
            onChange={(e) => send(e.target.files?.[0])} />
          <ul className="rules">
            <li>формат <b>PNG</b>, другие не принимаются</li>
            <li><b>прозрачный фон</b> — иначе ляжет белым прямоугольником на тёмный слайд</li>
            <li>от <b>400</b> до <b>2000</b> точек по длинной стороне</li>
            <li>не больше <b>2 МБ</b></li>
          </ul>
          <p className="hint">Ставится везде, где виден логотип: крупно на финале и полосой вверху кадра.</p>
          {info && <p className="hint">{info}</p>}
        </div>
      </div>
    );
  };

/**
 * Таблицы стилей всех пар сразу.
 *
 * Иначе список нечем показать: пара, шрифт которой не загружен, нарисуется системным,
 * и выбирать пришлось бы по названию вслепую. Встроенная пара своей таблицы не имеет —
 * она приходит пакетами вместе со сборкой.
 */
const useFontSheets = (pairs: FontPair[]) => {
  useEffect(() => {
    const links = pairs.filter((p) => p.url).map((p) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = p.url;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [pairs]);
};

/**
 * Выбор пары шрифтов. Каждая нарисована своими шрифтами — по названию их не отличить.
 *
 * В образце намеренно есть кириллица: все пары реестра её умеют (проверено запросом
 * к Google Fonts), и видеть это надо сразу, а не после первого ролика на македонском.
 */
const FontField: React.FC<{theme: Theme; pairs: FontPair[]; onChange: (t: Theme) => void}> = ({theme, pairs, onChange}) => {
  useFontSheets(pairs);
  // Выбранную пару узнаём по самим шрифтам, а не по отдельному полю id: лишнее поле
  // разошлось бы с fonts, стоит один раз поправить brand.json руками
  const current = pairs.find((p) => p.head === theme.fonts?.head && p.body === theme.fonts?.body);
  return (
    <>
      <div className="pairs">
        {pairs.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pair${p.id === current?.id ? ' on' : ''}`}
            onClick={() => onChange({...theme, fonts: {head: p.head, body: p.body, url: p.url}})}
          >
            <span className="pair-head" style={{fontFamily: p.head}}>Hyundai Equus</span>
            <span className="pair-body" style={{fontFamily: p.body}}>2015 · Бензин · Автомат · 239 601 км</span>
            <span className="pair-note">{p.note}</span>
          </button>
        ))}
      </div>
      {!current && (
        <p className="hint">
          Сейчас стоит свой шрифт из <code>config/brand.json</code> — ни одна пара с ним не совпадает.
        </p>
      )}
    </>
  );
};

type BrandProps = {
  theme: Theme; saved: Theme; pairs: FontPair[];
  onChange: (t: Theme) => void; onSaved: (t: Theme) => void; onError: (e: unknown) => void;
};

export const BrandForm: React.FC<BrandProps> = ({theme, saved, pairs, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const dirty = theme !== saved;
  const persist = async () => {
    setBusy(true);
    try { onSaved(await api.saveBrand(theme)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="form">
      <h2>Логотип</h2>
      <LogoField theme={theme} onSaved={onSaved} onError={onError} />

      <h2>Шрифты</h2>
      <p className="note">
        Пары со стороны грузятся по сети при рендере. Не догрузился — кадр рисуется системным
        шрифтом, а не ждёт: первая пара встроена в проект и работает всегда.
      </p>
      <FontField theme={theme} pairs={pairs} onChange={onChange} />

      <h2>Цвета бренда</h2>
      <p className="note">Встроенные иконки — в <code>public/brand</code> (пересборка: <code>tools/brand_assets.py</code>).</p>
      {COLOR_FIELDS.map(([key, label]) => (
        <div className="color" key={key}>
          <input type="color" value={theme[key]} onChange={(e) => onChange({...theme, [key]: e.target.value.toUpperCase()})} />
          <input value={theme[key]} maxLength={7} onChange={(e) => onChange({...theme, [key]: e.target.value})} />
          <span>{label}</span>
        </div>
      ))}
      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy} onClick={() => onChange(saved)}>Отменить правки</button>
      </div>
    </div>
  );
};
