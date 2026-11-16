// Пайплайн «КП для клиентов» → «Сформировать КП» (владелец 16.11: КП — отдельный пайплайн
// в верхнем ряду, рядом с рекламой и каруселями).
// Компьютер: ссылка сверху, ниже три колонки — объявления, форма КП (кому, суммы), живой лист
// документа с логотипом и реквизитами компании. Телефон — те же части одной лентой.
// Объявления общие с «Рекламой авто»: ссылка здесь заводит такое же объявление, и в рекламе
// оно появится тоже — второй копии машины не делаем.
import React, {useEffect, useMemo, useState} from 'react';
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
import {OfferBuilder, useOfferDraft} from './OfferBuilder';
import {OfferSheet} from './OfferSheet';

const Draft: React.FC<{lot: LotEntry}> = ({lot}) => {
  const t = useT();
  const draft = useOfferDraft(lot);
  return (
    <>
      <section className="panel offer-form-col">
        <h2>{t('of.dialog')}</h2>
        <OfferBuilder draft={draft} />
      </section>
      <section className="panel offer-sheet-col">
        <p className="hint">{t('of.previewNote')}</p>
        {draft.preview ? <OfferSheet body={draft.preview} /> : <div className="empty">{t('of.building')}</div>}
      </section>
    </>
  );
};

export const OfferTool: React.FC = () => {
  const {config, profile, report} = useConfig();
  const t = useT();
  const phone = useIsPhone();
  const [lots, setLots] = useState<LotEntry[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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

  const open = (id: string) => { setCurrent(id); lastLot.set(id); };

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
      <QuickLink onLink={fromLink} error={linkError} busy={!!stage} />
      <main className={phone ? 'offer-main phone' : 'offer-main'}>
        <section className="panel offer-lots">
          <h2>{t('of.lots')} <span className="muted">{shown.length}</span></h2>
          <input className="offer-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('of.search')} />
          <div className="offer-lot-list">
            {shown.map((l) => (
              <button key={l.id} type="button" className={l.id === current ? 'offer-lot active' : 'offer-lot'} onClick={() => open(l.id)}>
                {l.photos[0] ? <img src={thumb(l.photos[0], 160)} alt="" /> : <span className="offer-lot-ph" />}
                <span>{lotTitle(l)}<small className="muted">{l.note || ''}</small></span>
              </button>
            ))}
            {!shown.length && <p className="hint">{t('of.noLots')}</p>}
          </div>
        </section>
        {lot ? <Draft key={lot.id} lot={lot} /> : <section className="panel"><div className="empty">{t('of.pickLot')}</div></section>}
      </main>
    </div>
  );
};
