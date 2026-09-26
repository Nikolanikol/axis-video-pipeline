// Пайплайн «Реклама авто» → инструмент «Ролик по лоту»: лот, превью в выбранном формате, рендер
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FORMATS, getFormat} from '../../src/shared/model';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {api, LotEntry} from '../api';
import {useConfig} from '../config';
import {LotForm} from '../LotForm';
import {Preview} from '../Preview';
import {RenderPanel} from '../RenderPanel';
import {lastLot} from '../router';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {saved: 'Сохранено', dirty: 'Есть правки', saving: 'Сохраняю…', error: 'Не сохранено'};

export const lotTitle = (l: LotEntry) => [l.brand, l.model, l.year].filter(Boolean).join(' ') || 'Новый лот';

export const LotTool: React.FC = () => {
  const {config, profile, brand, report} = useConfig();
  const [lots, setLots] = useState<LotEntry[]>([]);
  const [lot, setLot] = useState<LotEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>('saved');

  useEffect(() => {
    api.lots().then((list) => {
      setLots(list);
      setLot(list.find((l) => l.id === lastLot.get()) ?? list[0] ?? null);
      setLoaded(true);
    }).catch(report);
  }, [report]);

  useEffect(() => { if (lot) lastLot.set(lot.id); }, [lot?.id]);

  // Автосохранение лота через полсекунды после правки
  const lotRef = useRef(lot);
  lotRef.current = lot;
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveLot = useCallback(async () => {
    const current = lotRef.current;
    if (!current) return;
    setSave('saving');
    try {
      const saved = await api.saveLot(current);
      setLots((ls) => [saved, ...ls.filter((l) => l.id !== saved.id)]);
      setSave(lotRef.current === current ? 'saved' : 'dirty');
    } catch (e) { setSave('error'); report(e); }
  }, [report]);
  useEffect(() => {
    if (save !== 'dirty') return;
    const t = setTimeout(saveLot, 500);
    return () => clearTimeout(t);
  }, [lot, save, saveLot]);
  // Ушли на другой экран с несохранёнными правками — сохраняем сразу
  useEffect(() => () => {
    if (saveRef.current === 'dirty' && lotRef.current) api.saveLot(lotRef.current).catch(report);
  }, [report]);

  const editLot = useCallback((patch: Partial<LotEntry>) => {
    setLot((l) => (l ? {...l, ...patch} : l));
    setSave('dirty');
  }, []);
  // Ответ сервера после операций с фото: берём только фото и размытие, текстовые правки не трогаем
  const setPhotos = useCallback((server: LotEntry) => {
    const patch = {photos: server.photos, blur: server.blur};
    setLot((l) => (l && l.id === server.id ? {...l, ...patch} : l));
    setLots((ls) => ls.map((l) => (l.id === server.id ? {...l, ...patch} : l)));
  }, []);

  const selectLot = async (id: string) => {
    if (save === 'dirty') await saveLot();
    const next = lots.find((l) => l.id === id);
    if (next) { setLot(next); setSave('saved'); }
  };
  const newLot = async () => {
    try {
      if (save === 'dirty') await saveLot();
      const created = await api.createLot({market: lot?.market ?? config.defaultMarket});
      setLots((ls) => [created, ...ls]);
      setLot(created);
      setSave('saved');
    } catch (e) { report(e); }
  };

  // Данные для превью — из профиля клиента (тот же мост, что и рендер), а не из рынка лота
  const market = useMemo(() => marketFromProfile(profile, config.copy) as Market, [profile, config.copy]);
  const format = getFormat(lot?.format);
  const input = useMemo(() => (lot ? {lot, market, theme: brand} : null), [lot, market, brand]);
  const savedProfile = config.profiles.find((p) => p.id === profile.id);
  const unsavedSettings = profile !== savedProfile || brand !== config.brand;

  if (!loaded) return <div className="boot">Загрузка лотов…</div>;

  return (
    <>
      <div className="toolbar">
        <select value={lot?.id ?? ''} onChange={(e) => selectLot(e.target.value)} disabled={!lots.length}>
          {!lots.length && <option value="">Лотов пока нет</option>}
          {lots.map((l) => <option key={l.id} value={l.id}>{lotTitle(l)}</option>)}
        </select>
        <button className="btn" onClick={newLot}>+ Новый лот</button>
        {lot && <span className={`save save-${save}`}>{SAVE_LABEL[save]}</span>}
      </div>

      <main className="grid">
        <section className="panel editor">
          {lot
            ? <LotForm lot={lot} market={market} format={format} onChange={editLot} onPhotos={setPhotos} onError={report} />
            : <div className="empty">Создай первый лот кнопкой «+ Новый лот».</div>}
        </section>

        <section className="panel preview">
          <div className="format-bar">
            <label className="format-select">
              <span className="label">Формат</span>
              <select value={format.id} disabled={!lot} onChange={(e) => editLot({format: e.target.value})}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </label>
            <span className="muted">{format.description}</span>
          </div>
          {input ? <Preview input={input} format={format} /> : <div className="empty">Здесь будет превью ролика</div>}
        </section>

        <section className="panel renders">
          {lot && (
            <RenderPanel
              lot={lot}
              format={format}
              unsavedSettings={unsavedSettings}
              beforeRender={async () => { if (save !== 'saved') await saveLot(); }}
              onError={report}
            />
          )}
        </section>
      </main>
    </>
  );
};
