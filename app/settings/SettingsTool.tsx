// Раздел «Настройки»: рынки и бренд. Справа — живое превью последнего открытого лота.
import React, {useEffect, useState} from 'react';
import {getFormat} from '../../src/shared/model';
import type {Market} from '../../src/shared/types';
import {lotTitle} from '../ads/LotTool';
import {api, LotEntry, MarketEntry} from '../api';
import {useConfig} from '../config';
import {Preview} from '../Preview';
import {href, lastLot} from '../router';
import {BrandForm, MarketForm} from '../SettingsForms';

const usePreviewLot = () => {
  const {report} = useConfig();
  const [lot, setLot] = useState<LotEntry | null | undefined>(undefined);
  useEffect(() => {
    api.lots().then((list) => setLot(list.find((l) => l.id === lastLot.get()) ?? list[0] ?? null)).catch(report);
  }, [report]);
  return lot;
};

const PreviewPanel: React.FC<{lot: LotEntry | null | undefined; market: MarketEntry}> = ({lot, market}) => {
  const {brand} = useConfig();
  if (lot === undefined) return <div className="empty">Загрузка превью…</div>;
  if (lot === null) return <div className="empty">Превью появится, когда будет хотя бы один лот</div>;
  const format = getFormat(lot.format);
  return (
    <>
      <div className="format-bar">
        <span className="muted">Превью: <a href={href('ads', 'lot')}>{lotTitle(lot)}</a> · {format.title} · рынок «{market.id}»</span>
      </div>
      <Preview input={{lot: {...lot, market: market.id}, market: market as Market, theme: brand}} format={format} />
    </>
  );
};

export const MarketsTool: React.FC = () => {
  const {config, markets, setMarket, marketSaved, savedMarket, report} = useConfig();
  const lot = usePreviewLot();
  const [selected, setSelected] = useState<string | null>(null);
  const id = selected ?? lot?.market ?? config.defaultMarket;
  const market = markets.find((m) => m.id === id) ?? markets[0];

  return (
    <>
      <div className="toolbar">
        <span className="label">Рынок</span>
        <select value={market.id} onChange={(e) => setSelected(e.target.value)}>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id}){m !== savedMarket(m.id) ? ' — есть правки' : ''}</option>)}
        </select>
      </div>
      <main className="grid grid-settings">
        <section className="panel editor">
          <MarketForm
            market={market}
            saved={savedMarket(market.id)}
            markets={markets}
            onChange={setMarket}
            onSaved={marketSaved}
            onCreated={setSelected}
            onError={report}
          />
        </section>
        <section className="panel preview"><PreviewPanel lot={lot} market={market} /></section>
      </main>
    </>
  );
};

export const BrandTool: React.FC = () => {
  const {config, markets, brand, setBrand, brandSaved, report} = useConfig();
  const lot = usePreviewLot();
  const market = markets.find((m) => m.id === (lot?.market ?? config.defaultMarket)) ?? markets[0];
  return (
    <main className="grid grid-settings">
      <section className="panel editor">
        <BrandForm theme={brand} saved={config.brand} onChange={setBrand} onSaved={brandSaved} onError={report} />
      </section>
      <section className="panel preview"><PreviewPanel lot={lot} market={market} /></section>
    </main>
  );
};
