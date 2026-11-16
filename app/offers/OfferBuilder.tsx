// Сборка КП по объявлению: черновик (кому, суммы этого раза, разовые строки), форма и список
// собранных. Одна на окно «КП в PDF» у объявления (app/ads/OfferButton.tsx) и экран
// «КП для клиентов → Сформировать КП» (app/offers/OfferTool.tsx).
// Итог считается здесь же тем же расчётом, что у сервера (src/shared/offer.js), — до списания кредита.
import React, {useEffect, useMemo, useState} from 'react';
import {Plus, Trash2} from 'lucide-react';
import {calcOffer, carPriceIn, docNumber, offerSettings} from '../../src/shared/offer.js';
import {companyContacts, offerBody} from '../../src/shared/offerHtml.js';
import {currencySign} from '../../src/shared/currencies.js';
import {inkContrast} from '../../src/shared/logoPlate.js';
import {fmt} from '../../src/shared/model';
import type {OfferMeta, OfferSettings} from '../../src/shared/types';
import {api, errorText, LotEntry} from '../api';
import {useConfig} from '../config';
import {href} from '../router';
import {toast} from '../Toast';
import {useT} from '../i18n';

type Extra = {label: string; amount: string};

/** Черновик КП объявления: шаблон — сохранённый (документ собирает сервер по сохранённому профилю) */
export const useOfferDraft = (lot: LotEntry) => {
  const {config, profile, brand} = useConfig();
  const saved = config.profiles.find((p) => p.id === profile.id) ?? profile;
  const settings = useMemo(() => offerSettings(saved) as OfferSettings, [saved]);
  const currency = saved.pricing.currency;
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);
  const [client, setClient] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Extra[]>([]);
  const [list, setList] = useState<OfferMeta[]>([]);

  useEffect(() => { api.rates().then((r) => setUsdRates(r.usdRates)).catch(() => setUsdRates({})); }, []);
  // Другое объявление — чистый черновик: суммы прошлой машины к новой не относятся
  useEffect(() => {
    setClient(''); setAmounts({}); setExtra([]); setList([]);
    api.offers.list(lot.id).then(setList).catch(() => {});
  }, [lot.id]);

  const carPrice = usdRates ? carPriceIn(lot, currency, usdRates) : null;
  const calc = calcOffer({carPrice, template: settings.template, amounts, extraLines: extra});

  /** Как будет выглядеть документ — та же вёрстка, что у PDF, с логотипом и реквизитами компании */
  const preview = useMemo(() => {
    if (!usdRates) return '';
    const t = settings.template;
    const url = brand?.assets?.logoHorizontal || brand?.assets?.logoStacked || '';
    const ink = url ? brand?.logoInk?.[url] : undefined;
    // Белый логотип на бумаге пропал бы — на плашку цвета фона бренда, как в PDF (server/offers.mjs)
    const logo = url ? {src: url.startsWith('/') || url.startsWith('http') ? url : `/${url}`,
      plate: ink && inkContrast(ink, '#ffffff') < 3 ? brand?.bg || '#111111' : null} : null;
    const photos = lot.photos || [];
    const date = new Date();
    return offerBody({language: saved.language, currency, settings, lot, calc, date, client,
      company: {name: saved.company || brand?.name || '', contacts: companyContacts(settings.dealer, saved.contacts), logo},
      number: docNumber(t.numbering, date), accent: brand?.copper,
      images: {hero: photos[0] ?? null, grid: photos.slice(1, 1 + (Number(t.show?.photos) || 0)),
        gallery: photos.slice(1, 1 + (Number(t.show?.gallery) || 0))}});
  }, [usdRates, settings, saved, brand, lot, calc, client, currency]);

  return {lot, settings, currency, carPrice, calc, client, setClient, amounts, setAmounts, extra, setExtra, list, setList, preview};
};
export type OfferDraft = ReturnType<typeof useOfferDraft>;

export const OfferBuilder: React.FC<{draft: OfferDraft}> = ({draft}) => {
  const {config} = useConfig();
  const t = useT();
  const {lot, settings, currency, carPrice, calc, client, setClient, amounts, setAmounts, extra, setExtra, list, setList} = draft;
  const sign = currencySign(currency);
  const cost = config.credits?.offers ?? 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const money = (n: number | null) => (n === null ? '—' : `${fmt(n)} ${sign}`);
  const placeholder = (id: string) => {
    const line = settings.template.costLines.find((l) => l.id === id);
    if (!line) return '';
    if (line.type === 'car') return carPrice === null ? '' : String(carPrice);
    if (line.type === 'fixed') return String(line.amount ?? '');
    if (line.type === 'percent' && carPrice !== null) return String(Math.round((carPrice * (line.percent ?? 0)) / 100));
    return '';
  };

  const build = async () => {
    setBusy(true); setError('');
    try {
      const meta = await api.offers.build(lot.id, {client, amounts, extraLines: extra});
      setList((l) => [meta, ...l]);
      window.open(api.offers.pdfUrl(meta), '_blank', 'noopener');
      toast(t('of.ready', {n: meta.number}));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async (m: OfferMeta) => {
    try { await api.offers.remove(m.id); setList((l) => l.filter((x) => x.id !== m.id)); } catch (e) { setError(errorText(e)); }
  };

  return (
    <div className="offer-builder">
      <p className="hint">{[lot.brand, lot.model, lot.year].filter(Boolean).join(' ')} · <a href={href('settings', 'offer')}>{t('of.template')}</a></p>

      {settings.template.show.recipient && (
        <label className="field"><span className="label">{t('of.client')}</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder={t('of.clientHint')} />
        </label>
      )}

      <div className="offer-rows">
        {settings.template.costLines.map((l) => (
          <label className="offer-row" key={l.id}>
            <span>{l.label || '—'}{l.hidden && <em className="muted"> · {t('of.hiddenShort')}</em>}</span>
            <input inputMode="decimal" value={amounts[l.id] ?? ''} placeholder={placeholder(l.id) || (l.type === 'manual' ? t('of.fill') : '')}
              className={l.type === 'manual' && !amounts[l.id] ? 'need' : ''}
              onChange={(e) => setAmounts({...amounts, [l.id]: e.target.value})} />
            <span className="muted">{sign}</span>
          </label>
        ))}
        {extra.map((x, i) => (
          <div className="offer-row" key={i}>
            <input value={x.label} placeholder={t('of.extraLabel')} onChange={(e) => setExtra(extra.map((y, k) => (k === i ? {...y, label: e.target.value} : y)))} />
            <input inputMode="decimal" value={x.amount} onChange={(e) => setExtra(extra.map((y, k) => (k === i ? {...y, amount: e.target.value} : y)))} />
            <button type="button" className="icon" aria-label={t('of.remove')} onClick={() => setExtra(extra.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
          </div>
        ))}
        {extra.length < 10 && <button type="button" className="btn ghost" onClick={() => setExtra([...extra, {label: '', amount: ''}])}><Plus size={16} /> {t('of.addExtra')}</button>}
      </div>
      <p className="hint">{t('of.amountsHint')}</p>

      <div className="offer-total"><span>{settings.template.totalLabel}</span><b>{money(calc.total)}</b></div>
      {calc.missing.length > 0 && <p className="hint">{t('of.missing', {what: calc.missing.join(', ')})}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || calc.missing.length > 0} onClick={build}>
        {busy ? t('of.building') : t('of.build', {cost: t.n('unit.credit', cost)})}
      </button>

      {list.length > 0 && (
        <div className="offer-list">
          <span className="label">{t('of.history')}</span>
          {list.map((m) => (
            <div className="offer-item" key={m.id}>
              <a href={api.offers.pdfUrl(m)} target="_blank" rel="noreferrer">{m.number}</a>
              <span className="muted">{[m.client, money(m.total), new Date(m.createdAt).toLocaleDateString()].filter(Boolean).join(' · ')}</span>
              <a className="icon" href={api.offers.pdfUrl(m, true)} aria-label={t('of.download')}>↓</a>
              <button type="button" className="icon" aria-label={t('of.remove')} onClick={() => remove(m)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
