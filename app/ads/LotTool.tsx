// Пайплайн «Реклама авто» → инструмент «Ролик по лоту».
// Основной путь — три действия (QuickLot.tsx): вставил ссылку Encar → «Собрать» → «Скачать».
// Ручное управление (форма лота, выбор фото из объявления, тексты) — под «Изменить».
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Loading} from '../Loading';
import {currencySign} from '../../src/shared/blocks';
import {autoPickPhotos, lotFieldsFromCar} from '../../src/shared/lotFromCar';
import {FORMATS, fmt, getFormat, totalInCurrency} from '../../src/shared/model';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {api, LotEntry} from '../api';
import {useConfig} from '../config';
import {LotForm} from '../LotForm';
import {EncarImport} from './EncarImport';
import {Preview} from '../Preview';
import {RenderPanel} from '../RenderPanel';
import {lastFormat, lastLot} from '../router';
import {FormatChips, LotsPanel, QuickLink} from './QuickLot';

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

  // Лот по ссылке Encar: создать и сразу заполнить, потом скачать выбранные фото.
  // Создание принимает только рынок — поля докладываем вторым запросом
  // Возвращает созданный лот: вызывающему он нужен сразу, а состояние React к этому
  // моменту может ещё не обновиться
  const createFromCar = async (fields: Partial<LotEntry>, urls: string[]): Promise<LotEntry> => {
    if (save === 'dirty') await saveLot();
    const created = await api.createLot({market: lot?.market ?? config.defaultMarket});
    let next = await api.saveLot({...created, ...fields});
    setLots((ls) => [next, ...ls]);
    setLot(next);
    setSave('saved');
    if (urls.length) {
      next = await api.importPhotos(next.id, urls);
      setPhotos(next);
    }
    return next;
  };
  // В текущий лот: поля — обычной правкой формы (уйдут автосохранением), фото — в конец
  const applyFromCar = async (fields: Partial<LotEntry>, urls: string[]) => {
    if (!lot) return;
    if (Object.keys(fields).length) editLot(fields);
    if (urls.length) setPhotos(await api.importPhotos(lot.id, urls));
  };

  // ——— Основной путь: вставил ссылку, и всё сделалось само ———
  const [stage, setStage] = useState('');
  const [quickError, setQuickError] = useState('');
  const [editing, setEditing] = useState(false);
  const quickFromLink = async (link: string) => {
    setQuickError('');
    try {
      setStage('Ищу машину на Encar…');
      const car = await api.lookupCar(link);
      // Эта машина уже есть — открываем её, а не плодим второй лот с теми же фото
      const known = lots.find((l) => l.note?.trim() === `Encar ${car.id}`);
      if (known) { await selectLot(known.id); setStage(''); return; }
      const {hookTagline, ...fields} = lotFieldsFromCar(car, profile.language);
      const rate = await api.usdKrw().catch(() => null);
      setStage('Создаю лот…');
      const urls = autoPickPhotos(car);
      const format = FORMATS.find((f) => f.id === lastFormat.get())?.id ?? FORMATS[0].id;
      // Лот появляется сразу с полями, фото догружаются следом: превью и название видны,
      // пока фото качаются, — человек видит, что дело идёт
      const created = await createFromCar({
        ...fields, format, note: `Encar ${car.id}`, carPriceUsd: null, krwPerUsd: rate?.krwPerUsd ?? null,
        ...(hookTagline ? {texts: {hookTagline}} : {}),
      }, []);
      if (urls.length) {
        setStage(`Загружаю ${urls.length} фото…`);
        setPhotos(await api.importPhotos(created.id, urls));
      }
    } catch (e) {
      // Ошибку показываем здесь же, под ссылкой: человек смотрит сюда, а не в шапку
      setQuickError(e instanceof Error ? e.message : String(e));
    } finally { setStage(''); }
  };
  const chooseFormat = (id: string) => { lastFormat.set(id); editLot({format: id}); };

  // Данные для превью — из профиля клиента (тот же мост, что и рендер), а не из рынка лота
  const market = useMemo(() => marketFromProfile(profile, config.copy) as Market, [profile, config.copy]);
  const format = getFormat(lot?.format);
  const input = useMemo(() => (lot ? {lot, market, theme: brand} : null), [lot, market, brand]);
  const savedProfile = config.profiles.find((p) => p.id === profile.id);
  const unsavedSettings = profile !== savedProfile || brand !== config.brand;

  // Цена в карточке — та же, что в ролике: валюта профиля, фрахт
  const priceOf = (l: LotEntry) => {
    const total = totalInCurrency({...l, freightUsd: l.freightUsd ?? market.freightUsd, currency: market.currency});
    return total === null ? '' : `${fmt(total)} ${currencySign(market.currency)}`;
  };

  if (!loaded) return <Loading text="Загрузка лотов…" />;

  return (
    <div className="quick">
      <QuickLink onLink={quickFromLink} stage={stage} error={quickError} busy={!!stage} />

      {/* Три колонки: лоты — превью — формат и сборка (владелец, 30.09). Ссылка — над ними:
          это первое действие, и новый лот из неё появляется в колонке лотов */}
      <main className="quick-main">
        <LotsPanel lots={lots} current={lot?.id} onOpen={selectLot} onBlank={newLot} price={priceOf} />

        <section className="quick-preview">
          {input
            ? <Preview input={input} format={format} autoPlay />
            : <div className="empty">Вставьте ссылку на объявление Encar — лот, фото и превью появятся сами.</div>}
        </section>

        {lot && (
          <section className="quick-side">
            <div className="quick-title">
              <h1>{[lot.brand, lot.model].filter(Boolean).join(' ') || 'Новый лот'} <span className="muted">{lot.year || ''}</span></h1>
              <div className="quick-price">{priceOf(lot) || <span className="warn-inline">цены нет — впишите в «Изменить вручную»</span>}</div>
              {lot.texts?.hookTagline && <div className="muted">{lot.texts.hookTagline}</div>}
              <div className="quick-edit">
                <button className="btn ghost" onClick={() => setEditing(!editing)} aria-expanded={editing}>
                  {editing ? 'Скрыть ручные настройки' : 'Изменить вручную'}
                </button>
                <span className={`save save-${save}`}>{SAVE_LABEL[save]}</span>
              </div>
            </div>
            <div className="quick-label">Формат ролика</div>
            <FormatChips value={format.id} onChange={chooseFormat} />
            <RenderPanel
              lot={lot}
              format={format}
              unsavedSettings={unsavedSettings}
              beforeRender={async () => { if (save !== 'saved') await saveLot(); }}
              onError={report}
            />
          </section>
        )}
      </main>

      {lot && editing && (
        <section className="panel quick-editor">
          <EncarImport lot={lot} onCreate={createFromCar} onApply={applyFromCar} onError={report} />
          <LotForm lot={lot} market={market} format={format} onChange={editLot} onPhotos={setPhotos} onError={report} />
        </section>
      )}
    </div>
  );
};
