// Формы настроек: рынок (порт, фрахт, контакты, тексты форматов) и цвета бренда.
import React, {useState} from 'react';
import {FORMATS} from '../src/shared/model';
import type {Market, Theme} from '../src/shared/types';
import {api, MarketEntry} from './api';
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

type BrandProps = {theme: Theme; saved: Theme; onChange: (t: Theme) => void; onSaved: (t: Theme) => void; onError: (e: unknown) => void};

export const BrandForm: React.FC<BrandProps> = ({theme, saved, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const dirty = theme !== saved;
  const persist = async () => {
    setBusy(true);
    try { onSaved(await api.saveBrand(theme)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="form">
      <h2>Цвета бренда</h2>
      <p className="note">Из брендбука AXIS. Логотипы и иконки — в <code>public/brand</code> (пересборка: <code>tools/brand_assets.py</code>).</p>
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
