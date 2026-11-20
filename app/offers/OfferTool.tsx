// Пайплайн «КП для клиентов» → «Сформировать КП» (владелец 16.11: КП — отдельный пайплайн
// в верхнем ряду, рядом с рекламой и каруселями).
// Компьютер: объявления слева, живой документ по центру, расчёт и история справа.
// Телефон: сворачиваемые объявления и виды «Расчёт / Предпросмотр / Собранные КП».
// Объявления общие с «Рекламой авто»: ссылка здесь заводит такое же объявление, и в рекламе
// оно появится тоже — второй копии машины не делаем.
import React, {useEffect, useId, useMemo, useState} from 'react';
import {autoPickPhotos, lotFieldsFromCar} from '../../src/shared/lotFromCar';
import {sourceNote} from '../../src/shared/encarLink.js';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {api, errorText, LotEntry} from '../api';
import {useConfig} from '../config';
import {useTodayMarket} from '../rates';
import {lastLot} from '../router';
import {Loading} from '../Loading';
import {ImportModal, QuickLink, type ImportStage} from '../ads/QuickLot';
import {lotTitle} from '../ads/LotTool';
import {thumb} from '../thumb';
import {useIsPhone} from '../MobileTabs';
import {useT} from '../i18n';
import {OfferActions, OfferFields, OfferHistory, useOfferBuild, useOfferDraft} from './OfferBuilder';
import {OfferSheet} from './OfferSheet';

const Draft: React.FC<{lot: LotEntry}> = ({lot}) => {
  const t = useT();
  const phone = useIsPhone();
  const draft = useOfferDraft(lot);
  const action = useOfferBuild(draft);
  const [view, setView] = useState<'form' | 'preview' | 'results'>('form');
  const active = !phone && view === 'preview' ? 'form' : view;
  const id = useId();
  return <div className="offer-workspace" data-view={active}>
    <section className="panel offer-sheet-col" id={`${id}-preview`} role={phone ? 'tabpanel' : undefined} aria-labelledby={phone ? `${id}-preview-tab` : undefined}>
      <p className="hint">{t('of.previewNote')}</p>
      {draft.preview ? <OfferSheet body={draft.preview} /> : <div className="empty">{t('of.building')}</div>}
    </section>
    <section className="offer-control-panel">
      <header className="offer-workspace-head">
        <h2>{lotTitle(lot)}</h2><a href="#/settings/offer">{t('of.template')}</a>
        <div className="workspace-section-tabs" role="tablist" aria-label={t('of.dialog')}>
          {(['form', 'preview', 'results'] as const).map((v) => <button key={v} type="button" role="tab" id={`${id}-${v}-tab`}
            className={v === 'preview' ? 'offer-preview-tab' : undefined} aria-selected={active === v} tabIndex={active === v ? 0 : -1}
            aria-controls={`${id}-${v === 'preview' ? 'preview' : 'body'}`} onClick={() => setView(v)} onKeyDown={(e) => {
              const items: (typeof v)[] = phone ? ['form', 'preview', 'results'] : ['form', 'results'];
              const at = items.indexOf(v);
              const index = e.key === 'ArrowRight' ? (at + 1) % items.length : e.key === 'ArrowLeft' ? (at + items.length - 1) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
              if (index < 0) return;
              e.preventDefault(); setView(items[index]); document.getElementById(`${id}-${items[index]}-tab`)?.focus();
            }}>
            {t(v === 'form' ? 'workspace.calculation' : v === 'preview' ? 'workspace.preview' : 'of.history')}{v === 'results' && draft.list.length > 0 ? ` · ${draft.list.length}` : ''}
          </button>)}
        </div>
      </header>
      <div className="offer-workspace-body" id={`${id}-body`} role="tabpanel" aria-labelledby={`${id}-${active}-tab`}>
        <div hidden={active !== 'form'}><OfferFields draft={draft} busy={action.busy} context={false} /></div>
        <div hidden={active !== 'results'}><OfferHistory draft={draft} action={action} /></div>
      </div>
      <div className="offer-workspace-actions" hidden={active === 'results'}><OfferActions draft={draft} action={action} /></div>
    </section>
  </div>;
};

export const OfferTool: React.FC = () => {
  const {config, profile, report} = useConfig();
  const t = useT();
  const phone = useIsPhone();
  const [lots, setLots] = useState<LotEntry[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lotsOpen, setLotsOpen] = useState(false);
  const [stage, setStage] = useState<ImportStage>(null);
  const [linkError, setLinkError] = useState('');
  const market = useTodayMarket(useMemo(() => marketFromProfile(profile, config.copy) as Market, [profile, config.copy]));

  useEffect(() => {
    api.lots().then((list) => {
      const sorted = list.slice().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      setLots(sorted);
      // Последнее открытое объявление (общее с рекламой), иначе самое свежее
      setCurrent((sorted.find((l) => l.id === lastLot.get()) ?? sorted.find((l) => l.brand))?.id ?? null);
    }).catch((e) => { report(e); setLots([]); });
  }, [report]);

  const open = (id: string) => { setCurrent(id); lastLot.set(id); setLotsOpen(false); };

  // Ссылка → объявление: те же шаги, что в «Рекламе авто» (LotTool.quickFromLink), без ролика
  const fromLink = async (link: string) => {
    setLinkError('');
    try {
      setStage({step: 0});
      const car = await api.lookupCar(link);
      const known = lots?.find((l) => l.note?.trim() === sourceNote(car.id));
      if (known) { open(known.id); return; }
      const {hookTagline, ...fields} = lotFieldsFromCar(car, profile.language);
      const rate = await api.usdKrw().catch(() => null);
      setStage({step: 1});
      const created = await api.createLot({market: config.defaultMarket});
      let lot = await api.saveLot({...created, ...fields, note: sourceNote(car.id), krwPerUsd: rate?.krwPerUsd ?? null,
        ...(market.krwPerUnitToday ? {krwPerUnit: market.krwPerUnitToday, fxCurrency: market.currency} : {}),
        ...(hookTagline ? {texts: {hookTagline}} : {})});
      const urls = autoPickPhotos(car);
      if (urls.length) {
        setStage({step: 2, photos: urls.length});
        lot = await api.importPhotos(lot.id, urls);
      }
      setLots((ls) => [lot, ...(ls ?? [])]);
      open(lot.id);
    } catch (e) {
      setLinkError(errorText(e));
    } finally { setStage(null); }
  };

  if (!lots) return <Loading text={t('lot.loading')} />;
  const lot = lots.find((l) => l.id === current) ?? null;
  const q = query.trim().toLowerCase();
  const shown = lots.filter((l) => l.brand && (!q || [l.brand, l.model, String(l.year ?? '')].join(' ').toLowerCase().includes(q)));

  return (
    <div className="page offer-tool">
      <ImportModal stage={stage} />
      <QuickLink onLink={fromLink} error={linkError} onClearError={() => setLinkError('')} busy={!!stage} />
      <main className={phone ? 'offer-main phone' : 'offer-main'}>
        <aside className="panel offer-lots">
          {phone ? <button type="button" className="offer-lots-toggle" aria-expanded={lotsOpen || !lot} onClick={() => setLotsOpen(!lotsOpen)}>
            {t('of.lots')} · {shown.length} ▾{lot && <span className="offer-selected-lot">{lotTitle(lot)}</span>}
          </button> : <h2>{t('of.lots')} <span className="muted">{shown.length}</span></h2>}
          <div className="offer-lots-content" hidden={phone && !lotsOpen && !!lot}>
          <input className="offer-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('of.search')} aria-label={t('of.search')} />
          <div className="offer-lot-list">
            {shown.map((l) => (
              <button key={l.id} type="button" className={l.id === current ? 'offer-lot active' : 'offer-lot'} onClick={() => open(l.id)}>
                {l.photos[0] ? <img src={thumb(l.photos[0], 160)} alt="" /> : <span className="offer-lot-ph" />}
                <span>{lotTitle(l)}<small className="muted">{l.note || ''}</small></span>
              </button>
            ))}
            {!shown.length && <p className="hint">{t('of.noLots')}</p>}
          </div>
          </div>
        </aside>
        {lot ? <Draft key={lot.id} lot={lot} /> : <section className="panel"><div className="empty">{t('of.pickLot')}</div></section>}
      </main>
    </div>
  );
};
