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
import {useSession} from '../auth';
import {href} from '../router';
import {toast} from '../Toast';
import {useT} from '../i18n';
import {useDeviceDraft} from '../deviceDraft';
import {validOfferValues, type OfferValues} from './draft';
import {SettingsSaveNotice} from '../SettingsSaveNotice';
import {ActionError} from '../ActionError';

type Extra = {label: string; amount: string};
const hasAmounts = (d: OfferValues) => Object.values(d.amounts).some(Boolean) || d.extra.some((x) => Boolean(x.amount));

/** Черновик КП объявления. Общие правки видны в превью; до сборки их нужно сохранить. */
export const useOfferDraft = (lot: LotEntry) => {
  const {config, profile, brand} = useConfig();
  const settings = useMemo(() => offerSettings(profile) as OfferSettings, [profile]);
  const currency = profile.pricing.currency;
  const fresh = useMemo<OfferValues>(() => ({client: '', amounts: {}, extra: [], currency}), [currency]);
  const key = `kok.offer-draft.v1:${config.workspace.id}:${profile.id}:${lot.id}`;
  const {value, setValue, persisted} = useDeviceDraft(key, fresh, validOfferValues);
  const {client, amounts, extra} = value;
  const setClient = (client: string) => setValue((d) => ({...d, client}));
  const setAmounts = (amounts: Record<string, string>) => setValue((d) => ({...d, amounts, currency: hasAmounts(d) ? d.currency : currency}));
  const setExtra = (extra: Extra[]) => setValue((d) => ({...d, extra, currency: hasAmounts(d) ? d.currency : currency}));
  const reset = () => setValue(fresh);
  const acceptCurrency = () => setValue((d) => ({...d, currency}));
  const currencyChanged = value.currency !== currency && hasAmounts(value);
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);
  const [list, setList] = useState<OfferMeta[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyAttempt, setHistoryAttempt] = useState(0);

  useEffect(() => { api.rates().then((r) => setUsdRates(r.usdRates)).catch(() => setUsdRates({})); }, []);
  // История приходит отдельно от черновика. Поздний ответ прежней машины не меняет новую.
  useEffect(() => {
    let current = true;
    setList([]);
    setHistoryError(''); setHistoryLoading(true);
    api.offers.list(lot.id).then((loaded) => {
      if (current) setList((list) => [...list, ...loaded.filter((m) => !list.some((x) => x.id === m.id))]);
    }).catch((e) => { if (current) setHistoryError(errorText(e)); })
      .finally(() => { if (current) setHistoryLoading(false); });
    return () => { current = false; };
  }, [key, historyAttempt]);

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
    return offerBody({language: profile.language, currency, settings, lot, calc, date, client,
      company: {name: profile.company || brand?.name || '', contacts: companyContacts(settings.dealer, profile.contacts), logo},
      number: docNumber(t.numbering, date), accent: brand?.copper,
      images: {hero: photos[0] ?? null, grid: photos.slice(1, 1 + (Number(t.show?.photos) || 0)),
        gallery: photos.slice(1, 1 + (Number(t.show?.gallery) || 0))}});
  }, [usdRates, settings, profile, brand, lot, calc, client, currency]);

  return {lot, settings, currency, carPrice, calc, client, setClient, amounts, setAmounts, extra, setExtra, list, setList, preview,
    persisted, reset, currencyChanged, previousCurrency: value.currency, acceptCurrency,
    historyError, historyLoading, reloadHistory: () => setHistoryAttempt((n) => n + 1)};
};
export type OfferDraft = ReturnType<typeof useOfferDraft>;

// Состояние сборки общее у компактного окна и рабочего экрана; переключение вида его не сбрасывает.
export const useOfferBuild = (draft: OfferDraft) => {
  const {config, unsaved, savingSettings} = useConfig();
  const {isStaff} = useSession();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<OfferMeta | null>(null);
  useEffect(() => { setError(''); setReady(null); }, [draft.lot.id, draft.client, draft.amounts, draft.extra, draft.settings, draft.currency]);
  const cost = config.credits?.offers ?? 2;
  const canBuild = !busy && !unsaved && !savingSettings && !draft.currencyChanged && !draft.calc.missing.length;
  const build = async () => {
    if (!canBuild) return;
    setBusy(true); setError(''); setReady(null);
    try {
      const meta = await api.offers.build(draft.lot.id, {client: draft.client, amounts: draft.amounts, extraLines: draft.extra});
      draft.setList((list) => [meta, ...list]);
      setReady(meta);
      toast(t('of.ready', {n: meta.number}));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async (meta: OfferMeta) => {
    try {
      await api.offers.remove(meta.id); draft.setList((list) => list.filter((x) => x.id !== meta.id));
      setReady((r) => r?.id === meta.id ? null : r);
    }
    catch (e) { setError(errorText(e)); }
  };
  return {busy, error, clearError: () => setError(''), ready: ready?.lotId === draft.lot.id ? ready : null,
    canBuild, build, remove, label: isStaff ? t('workspace.buildPdf') : t('of.build', {cost: t.n('unit.credit', cost)})};
};
export type OfferBuild = ReturnType<typeof useOfferBuild>;

export const OfferFields: React.FC<{draft: OfferDraft; busy: boolean; context?: boolean}> = ({draft, busy, context = true}) => {
  const t = useT();
  const {lot, settings, currency, carPrice, client, setClient, amounts, setAmounts, extra, setExtra} = draft;
  const sign = currencySign(currency);
  const placeholder = (id: string) => {
    const line = settings.template.costLines.find((l) => l.id === id);
    if (!line) return '';
    if (line.type === 'car') return carPrice === null ? '' : String(carPrice);
    if (line.type === 'fixed') return String(line.amount ?? '');
    if (line.type === 'percent' && carPrice !== null) return String(Math.round((carPrice * (line.percent ?? 0)) / 100));
    return '';
  };
  return <div className="offer-fields">
      {context && <p className="hint">{[lot.brand, lot.model, lot.year].filter(Boolean).join(' ')} · <a href={href('settings', 'offer')}>{t('of.template')}</a></p>}
      <SettingsSaveNotice />
      <div className="draft-status" role="status">
        <span>{t(draft.persisted ? 'draft.deviceSaved' : 'draft.memoryOnly')}</span>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => window.confirm(t('of.resetDraftConfirm')) && draft.reset()}>{t('of.resetDraft')}</button>
      </div>
      {draft.currencyChanged && <div className="note" role="alert">
        <p>{t('of.draftCurrency', {from: draft.previousCurrency, to: currency})}</p>
        <button type="button" className="btn" onClick={draft.acceptCurrency}>{t('of.acceptCurrency', {currency})}</button>
      </div>}

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
  </div>;
};
export const OfferActions: React.FC<{draft: OfferDraft; action: OfferBuild}> = ({draft, action}) => {
  const t = useT();
  return <div className="offer-build-actions">
    <div className="offer-total"><span>{draft.settings.template.totalLabel}</span><b>{fmt(draft.calc.total)} {currencySign(draft.currency)}</b></div>
    {draft.calc.missing.length > 0 && <p className="hint">{t('of.missing', {what: draft.calc.missing.join(', ')})}</p>}
    {action.error && <ActionError message={action.error} onDismiss={action.clearError} />}
    {action.ready && <div className="offer-ready" role="status">
      <b>{t('of.ready', {n: action.ready.number})}</b>
      <p className="hint">{t('of.readyHint')}</p>
      <div className="btn-row">
        <a className="btn primary" href={api.offers.pdfUrl(action.ready)} target="_blank" rel="noreferrer">{t('of.openPdf')}</a>
        <a className="btn" href={api.offers.pdfUrl(action.ready, true)}>{t('of.download')}</a>
      </div>
    </div>}
    <button type="button" className="btn primary" disabled={!action.canBuild} onClick={action.build}>{action.busy ? t('of.building') : action.label}</button>
  </div>;
};
export const OfferHistory: React.FC<{draft: OfferDraft; action: OfferBuild}> = ({draft, action}) => {
  const t = useT();
  return <div className="offer-list">
    <span className="label">{t('of.history')}</span>
    {draft.historyLoading && <p className="hint" role="status">{t('of.historyLoading')}</p>}
    {draft.historyError && <div className="notice warn" role="alert"><p>{draft.historyError}</p>
      <button type="button" className="btn" onClick={draft.reloadHistory}>{t('common.retry')}</button></div>}
    {draft.list.length ? draft.list.map((m) => <div className="offer-item" key={m.id}>
      <a href={api.offers.pdfUrl(m)} target="_blank" rel="noreferrer">{m.number}</a>
      <span className="muted">{[m.client, `${fmt(m.total)} ${currencySign(m.currency)}`, new Date(m.createdAt).toLocaleDateString()].filter(Boolean).join(' · ')}</span>
      <a className="icon" href={api.offers.pdfUrl(m, true)} aria-label={t('of.download')}>↓</a>
      <button type="button" className="icon" disabled={action.busy} aria-label={t('of.remove')} onClick={() => action.remove(m)}><Trash2 size={14} /></button>
    </div>) : !draft.historyLoading && !draft.historyError && <p className="hint">{t('workspace.noOffers')}</p>}
  </div>;
};
export const OfferBuilder: React.FC<{draft: OfferDraft; action: OfferBuild}> = ({draft, action}) => {
  return <div className="offer-builder"><OfferFields draft={draft} busy={action.busy} /><OfferActions draft={draft} action={action} />
    {draft.list.length > 0 && <OfferHistory draft={draft} action={action} />}
  </div>;
};
