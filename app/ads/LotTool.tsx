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
import {FormatChips, ImportModal, LotsPanel, QuickLink, type ImportStage} from './QuickLot';
import {toast} from '../Toast';
import {Clapperboard, List, SlidersHorizontal} from 'lucide-react';
import {MobileTabs, useIsPhone, usePanelSwipes} from '../MobileTabs';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {saved: 'Сохранено', dirty: 'Есть правки', saving: 'Сохраняю…', error: 'Не сохранено'};

// В интерфейсе лот называется «объявление» (владелец 01.10: «лот» — аукционное слово, клиенту
// непонятное); в коде, данных и адресах остаётся lot. Без марки и модели — «Без названия»:
// «Новый…» врало бы про карточку, которая висит неделю
// Какие разделы телефона — выдвижные панели и с какой стороны (MobileTabs.tsx)
const LOT_PANELS = {list: 'left', edit: 'right'} as const;

export const lotTitle = (l: LotEntry) => [l.brand, l.model, l.year].filter(Boolean).join(' ') || 'Без названия';

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
  // Ответ сервера после операций с фото: берём только фото, размытие и источники фото,
  // текстовые правки не трогаем
  const setPhotos = useCallback((server: LotEntry) => {
    const patch = {photos: server.photos, blur: server.blur, sources: server.sources};
    setLot((l) => (l && l.id === server.id ? {...l, ...patch} : l));
    setLots((ls) => ls.map((l) => (l.id === server.id ? {...l, ...patch} : l)));
  }, []);

  // Телефон: на экране один раздел — список объявлений, ролик (ссылка, превью, формат,
  // сборка) или ручная правка (MobileTabs.tsx); порядок в панели — как колонки на компьютере. Выбрали или создали объявление — сразу
  // показываем его ролик: остаться в списке значило бы гадать, открылось ли оно
  const phone = useIsPhone();
  const [mtab, setMtab] = useState<'main' | 'list' | 'edit'>('main');

  const selectLot = async (id: string) => {
    if (save === 'dirty') await saveLot();
    const next = lots.find((l) => l.id === id);
    if (next) { setLot(next); setSave('saved'); setMtab('main'); }
  };
  const newLot = async () => {
    try {
      if (save === 'dirty') await saveLot();
      const created = await api.createLot({market: lot?.market ?? config.defaultMarket});
      setLots((ls) => [created, ...ls]);
      setLot(created);
      setSave('saved');
      // Пустую карточку создают, чтобы заполнить руками, — на телефоне сразу ведём к форме
      setMtab('edit');
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
    setMtab('main');
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
  const [stage, setStage] = useState<ImportStage>(null);
  const [quickError, setQuickError] = useState('');
  const [editing, setEditing] = useState(false);
  // Ручные настройки открываются под первым экраном — подводим к ним, иначе кнопка
  // «Изменить вручную» выглядит так, будто ничего не сделала. Едем сами, за 0,6 с с
  // замедлением к концу: мгновенный прыжок сбивал с толку (владелец 01.10). Своя анимация,
  // а не scrollIntoView({behavior: 'smooth'}): у той скорость выбирает браузер, и её не
  // остановить, когда человек сам берётся за колесо
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const editor = editorRef.current;
    const box = editor?.parentElement;
    // На телефоне ручные настройки — отдельный раздел, ехать некуда
    if (phone || !editing || !editor || !box) return;
    const from = box.scrollTop;
    // 12 px воздуха над панелью; дальше конца прокрутки не уехать
    const to = Math.min(from + editor.getBoundingClientRect().top - box.getBoundingClientRect().top - 12, box.scrollHeight - box.clientHeight);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { box.scrollTop = to; return; }
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min((now - started) / 600, 1);
      box.scrollTop = from + (to - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    // Человек сам взялся за колесо или тачпад — не тянем страницу против его руки
    const stop = () => cancelAnimationFrame(frame);
    box.addEventListener('wheel', stop, {passive: true});
    box.addEventListener('touchstart', stop, {passive: true});
    return () => { stop(); box.removeEventListener('wheel', stop); box.removeEventListener('touchstart', stop); };
  }, [editing, phone]);
  // «Ролик» — дом; «Объявления» выезжает слева, «Правка» справа, свайпами и кнопками панели.
  // Прокрутку разделов не сбрасываем: панели прокручиваются сами, а ролик под ними стоит
  const quickRef = useRef<HTMLDivElement>(null);
  usePanelSwipes(quickRef, mtab, 'main', setMtab, LOT_PANELS, loaded);
  // Плеер живёт, пока открыт «Ролик», и ещё 350 мс после ухода — пока панель наезжает и
  // картинка под ней не должна пропасть. Потом его нет совсем: играющий под панелью он
  // рисует кадры 1080×1920 впустую, и прокрутка подлагивает (владелец 01.10)
  const [previewLive, setPreviewLive] = useState(true);
  useEffect(() => {
    if (!phone || mtab === 'main') { setPreviewLive(true); return; }
    const t = setTimeout(() => setPreviewLive(false), 350);
    return () => clearTimeout(t);
  }, [phone, mtab]);
  // На телефоне правка смонтирована всегда, пока есть объявление: выезжающей панели нужно
  // что двигать, а размонтирование на закрытии съедало бы анимацию. На компьютере — как раньше
  const showEditor = phone || editing;
  const quickFromLink = async (link: string) => {
    setQuickError('');
    try {
      setStage({step: 0});
      const car = await api.lookupCar(link);
      // Эта машина уже есть — открываем её, а не плодим второй лот с теми же фото
      const known = lots.find((l) => l.note?.trim() === `Encar ${car.id}`);
      if (known) { await selectLot(known.id); setStage(null); return; }
      const {hookTagline, ...fields} = lotFieldsFromCar(car, profile.language);
      const rate = await api.usdKrw().catch(() => null);
      setStage({step: 1});
      const urls = autoPickPhotos(car);
      const format = FORMATS.find((f) => f.id === lastFormat.get())?.id ?? FORMATS[0].id;
      // Лот появляется сразу с полями, фото догружаются следом: превью и название видны,
      // пока фото качаются, — человек видит, что дело идёт
      const created = await createFromCar({
        ...fields, format, note: `Encar ${car.id}`, carPriceUsd: null, krwPerUsd: rate?.krwPerUsd ?? null,
        ...(hookTagline ? {texts: {hookTagline}} : {}),
      }, []);
      if (urls.length) {
        setStage({step: 2, photos: urls.length});
        setPhotos(await api.importPhotos(created.id, urls));
      }
    } catch (e) {
      // Ошибку показываем здесь же, под ссылкой: человек смотрит сюда, а не в шапку
      setQuickError(e instanceof Error ? e.message : String(e));
    } finally { setStage(null); }
  };
  const chooseFormat = (id: string) => { lastFormat.set(id); editLot({format: id}); };

  // ——— Управление лотами из колонки: удалить, удалить пустые, дублировать ———
  // pending — какие карточки сейчас удаляются: тускнеют с «Удаляю…», второй раз не нажать
  const [pending, setPending] = useState<Set<string>>(new Set());
  const mark = (ids: string[], on: boolean) => setPending((p) => {
    const next = new Set(p);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const dropFromList = (ids: string[]) => {
    const rest = lots.filter((l) => !ids.includes(l.id));
    setLots(rest);
    // Удалили открытый — открываем следующий, а не пустой экран
    if (lot && ids.includes(lot.id)) { setLot(rest[0] ?? null); setSave('saved'); }
  };
  const deleteLot = async (l: LotEntry) => {
    if (!window.confirm(`Удалить объявление «${lotTitle(l)}» вместе с его фото и готовыми роликами?`)) return;
    mark([l.id], true);
    try {
      await api.deleteLot(l.id);
      dropFromList([l.id]);
      toast(`Удалено: ${lotTitle(l)}`);
    } catch (e) { report(e); } finally { mark([l.id], false); }
  };
  const deleteEmpty = async (list: LotEntry[]) => {
    if (!window.confirm(`Удалить пустые объявления (${list.length}) — без фото и без машины?`)) return;
    const ids = list.map((l) => l.id);
    mark(ids, true);
    const done: string[] = [];
    try {
      for (const id of ids) { await api.deleteLot(id); done.push(id); }
    } catch (e) { report(e); } finally {
      dropFromList(done);
      mark(ids, false);
      if (done.length) toast(`Удалено пустых объявлений: ${done.length}`);
    }
  };
  const copyLot = async (l: LotEntry) => {
    try {
      if (save === 'dirty') await saveLot();
      const copy = await api.copyLot(l.id);
      setLots((ls) => [copy, ...ls]);
      setLot(copy);
      setSave('saved');
      setMtab('main');
      toast(`Создана копия: ${lotTitle(copy)}`);
    } catch (e) { report(e); }
  };

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

  if (!loaded) return <Loading text="Загрузка объявлений…" />;

  return (
    <>
    <div className="quick" data-mtab={mtab} ref={quickRef}>
      <ImportModal stage={stage} />
      {/* quick-screen — ровно один экран: ссылка и три колонки. Колонки не растут вместе с
          содержимым, длинные списки (лоты, ролики) прокручиваются внутри себя */}
      <div className="quick-screen">
      <QuickLink onLink={quickFromLink} error={quickError} busy={!!stage} />

      {/* Три колонки: лоты — превью — формат и сборка (владелец, 30.09). Ссылка — над ними:
          это первое действие, и новый лот из неё появляется в колонке лотов */}
      <main className="quick-main">
        <LotsPanel lots={lots} current={lot?.id} pending={pending} onOpen={selectLot} onBlank={newLot} price={priceOf}
          onCopy={copyLot} onDelete={deleteLot} onDeleteEmpty={deleteEmpty} />

        <section className="quick-preview">
          {/* На телефоне плеер живёт только в разделе «Ролик»: скрытый стилями, он продолжал
              играть и рисовать кадры 1080×1920, и прокрутка «Правки» подлагивала (владелец
              01.10); каждая перестановка фото ещё и перерисовывала его */}
          {input && previewLive
            ? <Preview input={input} format={format} autoPlay />
            : <div className="empty">Вставьте ссылку на объявление Encar — машина, фото и превью появятся сами.</div>}
        </section>

        {lot && (
          <section className="quick-side">
            <div className="quick-title">
              <h1>{[lot.brand, lot.model].filter(Boolean).join(' ') || 'Без названия'} <span className="muted">{lot.year || ''}</span></h1>
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
      </div>

      {lot && showEditor && (
        <section className="panel quick-editor" ref={editorRef} data-mpanel="edit">
          {/* На телефоне раздел правки открыт без превью и названия — подписываем, что правим */}
          <div className="quick-editor-title">
            <b>{lotTitle(lot)}</b>
            <span className={`save save-${save}`}>{SAVE_LABEL[save]}</span>
          </div>
          <EncarImport lot={lot} onApply={applyFromCar} onError={report} />
          <LotForm lot={lot} market={market} format={format} onChange={editLot} onPhotos={setPhotos} onError={report} />
        </section>
      )}
      {!lot && <div className="empty mtab-empty">Объявления пока нет — вставьте ссылку в разделе «Ролик».</div>}
    </div>
    <MobileTabs value={mtab} onChange={setMtab} tabs={[
      {id: 'list', label: 'Объявления', icon: <List size={20} />, badge: lots.length},
      {id: 'main', label: 'Ролик', icon: <Clapperboard size={20} />},
      {id: 'edit', label: 'Правка', icon: <SlidersHorizontal size={20} />},
    ]} />
    </>
  );
};
