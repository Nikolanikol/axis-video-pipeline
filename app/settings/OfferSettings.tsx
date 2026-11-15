// Настройки → «Коммерческое предложение»: реквизиты компании для шапки и шаблон КП в PDF.
// Всё здесь — данные дилера (SaaS: у каждого своё), вёрстка документа их только раскладывает.
// Название, логотип, WhatsApp, сайт, валюта и язык берутся из «Профиля» и «Бренда» — второй
// раз их не спрашиваем. Справа — образец PDF на последнем объявлении (бесплатно, с «ОБРАЗЕЦ»).
import React, {useEffect, useMemo, useState} from 'react';
import {ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react';
import {COST_TYPES, calcOffer, carPriceIn, docNumber, offerSettings, sampleAmounts} from '../../src/shared/offer.js';
import {offerBody, sampleClient, sampleCompany, sampleDealer} from '../../src/shared/offerHtml.js';
import {OfferSheet} from '../offers/OfferSheet';
import {currencySign} from '../../src/shared/currencies.js';
import type {Lot, OfferCostLine, OfferCostType, OfferSettings} from '../../src/shared/types';
import {api, errorText} from '../api';
import {useConfig} from '../config';
import {Field} from '../LotForm';
import {href} from '../router';
import {useT, type Key} from '../i18n';
import {SettingsLayout} from './SettingsTool';

const TYPE_KEY = (x: OfferCostType) => `of.type.${x}` as Key;

const move = <T,>(list: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export const OfferForm: React.FC<{settings: OfferSettings; currency: string; onChange: (s: OfferSettings) => void}> = ({settings, currency, onChange}) => {
  const t = useT();
  const {dealer, template} = settings;
  const setDealer = (patch: Partial<OfferSettings['dealer']>) => onChange({...settings, dealer: {...dealer, ...patch}});
  const setTpl = (patch: Partial<OfferSettings['template']>) => onChange({...settings, template: {...template, ...patch}});
  const setLine = (i: number, patch: Partial<OfferCostLine>) =>
    setTpl({costLines: template.costLines.map((l, k) => (k === i ? {...l, ...patch} : l))});
  const sign = currencySign(currency);

  return (
    <>
      <h2>{t('of.dealer')}</h2>
      <p className="note">{t('of.dealerNote')}</p>
      <label className="check of-req-toggle">
        <input type="checkbox" data-f="show:requisites" checked={template.show.requisites}
          onChange={(e) => setTpl({show: {...template.show, requisites: e.target.checked}})} /> {t('of.withReq')}
      </label>
      {/* Выключили — поля прячем, но не чистим: включат обратно — всё на месте */}
      {template.show.requisites ? <>
      <Field label={t('of.legalName')} hint={t('of.legalNameHint')}>
        <input data-f="legalName" value={dealer.legalName} onChange={(e) => setDealer({legalName: e.target.value})} />
      </Field>
      <div className="of-list">
        <span className="label">{t('of.requisites')}</span>
        {dealer.requisites.map((r, i) => (
          <div className="of-req" key={i}>
            <input placeholder={t('of.reqLabel')} value={r.label}
              onChange={(e) => setDealer({requisites: dealer.requisites.map((x, k) => (k === i ? {...x, label: e.target.value} : x))})} />
            <input data-f={`req:${i}`} placeholder={t('of.reqValue')} value={r.value}
              onChange={(e) => setDealer({requisites: dealer.requisites.map((x, k) => (k === i ? {...x, value: e.target.value} : x))})} />
            <button type="button" className="icon" aria-label={t('of.remove')}
              onClick={() => setDealer({requisites: dealer.requisites.filter((_, k) => k !== i)})}><Trash2 size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn ghost" onClick={() => setDealer({requisites: [...dealer.requisites, {label: '', value: ''}]})}>
          <Plus size={16} /> {t('of.addReq')}
        </button>
        <span className="hint">{t('of.reqHint')}</span>
      </div>
      <Field label={t('of.address')}><input data-f="address" value={dealer.address} onChange={(e) => setDealer({address: e.target.value})} /></Field>
      </> : <p className="hint">{t('of.noReqHint')}</p>}
      <div className="row">
        <Field label={t('of.phone')}><input data-f="phone" value={dealer.phone} onChange={(e) => setDealer({phone: e.target.value})} /></Field>
        <Field label={t('of.email')}><input value={dealer.email} onChange={(e) => setDealer({email: e.target.value})} /></Field>
      </div>
      <div className="row">
        <Field label={t('of.signer')}><input data-f="signer" value={dealer.signer.name} onChange={(e) => setDealer({signer: {...dealer.signer, name: e.target.value}})} /></Field>
        <Field label={t('of.position')}><input value={dealer.signer.position} onChange={(e) => setDealer({signer: {...dealer.signer, position: e.target.value}})} /></Field>
      </div>
      <Field label={t('of.accent')} hint={t('of.accentHint')}>
        <div className="of-accent">
          <input type="color" value={dealer.accent || '#8e0d2c'} onChange={(e) => setDealer({accent: e.target.value})} />
          {dealer.accent && <button type="button" className="btn ghost" onClick={() => setDealer({accent: undefined})}>{t('of.accentBrand')}</button>}
        </div>
      </Field>

      <h2>{t('of.doc')}</h2>
      <div className="row">
        <Field label={t('of.prefix')} hint={t('of.prefixHint', {n: `${template.numbering.prefix ? `${template.numbering.prefix}-` : ''}${new Date().getFullYear()}-${String(template.numbering.next).padStart(4, '0')}`})}>
          <input data-f="prefix" value={template.numbering.prefix} onChange={(e) => setTpl({numbering: {...template.numbering, prefix: e.target.value.slice(0, 12)}})} />
        </Field>
        <Field label={t('of.next')}>
          <input inputMode="numeric" value={template.numbering.next}
            onChange={(e) => setTpl({numbering: {...template.numbering, next: Math.max(1, Math.floor(Number(e.target.value) || 1))}})} />
        </Field>
        <Field label={t('of.valid')}>
          <input data-f="valid" inputMode="numeric" value={template.validityDays}
            onChange={(e) => setTpl({validityDays: Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0)))})} />
        </Field>
      </div>
      <Field label={t('of.title')} hint={t('of.vars')}>
        <textarea data-f="title" rows={2} value={template.title} onChange={(e) => setTpl({title: e.target.value})} />
      </Field>
      <Field label={t('of.intro')} hint={t('of.vars')}>
        <textarea data-f="intro" rows={3} value={template.intro} onChange={(e) => setTpl({intro: e.target.value})} />
      </Field>

      <h2>{t('of.calc')}</h2>
      <p className="note">{t('of.calcNote', {sign})}</p>
      <div className="of-lines">
        {template.costLines.map((l, i) => (
          <div className="of-line" key={l.id}>
            <div className="of-line-top">
              <input className="of-line-label" data-f={`line:${l.id}`} placeholder={t('of.lineLabel')} value={l.label} onChange={(e) => setLine(i, {label: e.target.value})} />
              <select value={l.type} onChange={(e) => setLine(i, {type: e.target.value as OfferCostType})}>
                {COST_TYPES.map((x) => <option key={x} value={x}>{t(TYPE_KEY(x))}</option>)}
              </select>
              {l.type === 'fixed' && <input className="of-amount" inputMode="decimal" placeholder={sign} value={l.amount ?? ''}
                onChange={(e) => setLine(i, {amount: num(e.target.value)})} />}
              {l.type === 'percent' && <input className="of-amount" inputMode="decimal" placeholder="%" value={l.percent ?? ''}
                onChange={(e) => setLine(i, {percent: num(e.target.value)})} />}
            </div>
            <div className="of-line-bottom">
              <input placeholder={t('of.lineNote')} value={l.note ?? ''} onChange={(e) => setLine(i, {note: e.target.value})} />
              {l.type !== 'car' && (
                <label className="check" title={t('of.hiddenHint')}>
                  <input type="checkbox" checked={Boolean(l.hidden)} onChange={(e) => setLine(i, {hidden: e.target.checked})} /> {t('of.hidden')}
                </label>
              )}
              <button type="button" className="icon" aria-label="↑" onClick={() => setTpl({costLines: move(template.costLines, i, -1)})}><ArrowUp size={16} /></button>
              <button type="button" className="icon" aria-label="↓" onClick={() => setTpl({costLines: move(template.costLines, i, 1)})}><ArrowDown size={16} /></button>
              <button type="button" className="icon" aria-label={t('of.remove')} onClick={() => setTpl({costLines: template.costLines.filter((_, k) => k !== i)})}><Trash2 size={16} /></button>
            </div>
            <span className="hint">{t(`of.typeHint.${l.type}` as Key)}</span>
          </div>
        ))}
        <button type="button" className="btn ghost"
          onClick={() => setTpl({costLines: [...template.costLines, {id: `l${Date.now().toString(36)}`, type: 'fixed', label: '', note: '', amount: 0}]})}>
          <Plus size={16} /> {t('of.addLine')}
        </button>
      </div>
      <div className="row">
        <Field label={t('of.totalLabel')}><input data-f="totalLabel" value={template.totalLabel} onChange={(e) => setTpl({totalLabel: e.target.value})} /></Field>
        <Field label={t('of.totalNote')}><input data-f="totalNote" value={template.totalNote} onChange={(e) => setTpl({totalNote: e.target.value})} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={template.showBreakdown} onChange={(e) => setTpl({showBreakdown: e.target.checked})} /> {t('of.breakdown')}</label>
      <label className="check"><input type="checkbox" checked={template.showPurchasePrice} onChange={(e) => setTpl({showPurchasePrice: e.target.checked})} /> {t('of.purchase')}</label>
      <Field label={t('of.disclaimer')}><textarea data-f="disclaimer" rows={2} value={template.disclaimer} onChange={(e) => setTpl({disclaimer: e.target.value})} /></Field>

      <h2>{t('of.sections')}</h2>
      <p className="note">{t('of.sectionsNote')}</p>
      {template.sections.map((s, i) => (
        <div className="of-section" key={i}>
          <div className="of-line-top">
            <input data-f={`section:${i}`} placeholder={t('of.sectionTitle')} value={s.title}
              onChange={(e) => setTpl({sections: template.sections.map((x, k) => (k === i ? {...x, title: e.target.value} : x))})} />
            <button type="button" className="icon" aria-label={t('of.remove')}
              onClick={() => setTpl({sections: template.sections.filter((_, k) => k !== i)})}><Trash2 size={16} /></button>
          </div>
          <textarea rows={3} placeholder={t('of.sectionItems')} value={s.items.join('\n')}
            onChange={(e) => setTpl({sections: template.sections.map((x, k) => (k === i ? {...x, items: e.target.value.split('\n')} : x))})} />
        </div>
      ))}
      {template.sections.length < 4 && (
        <button type="button" className="btn ghost" onClick={() => setTpl({sections: [...template.sections, {title: '', items: []}]})}>
          <Plus size={16} /> {t('of.addSection')}
        </button>
      )}

      <h2>{t('of.show')}</h2>
      <div className="of-checks">
        {(['recipient', 'specs', 'signature', 'stamp'] as const).map((k) => (
          <label className="check" key={k}>
            <input type="checkbox" data-f={`show:${k}`} checked={template.show[k]} onChange={(e) => setTpl({show: {...template.show, [k]: e.target.checked}})} /> {t(`of.show.${k}` as Key)}
          </label>
        ))}
      </div>
      <Field label={t('of.photos')}>
        <select data-f="photos" value={template.show.photos} onChange={(e) => setTpl({show: {...template.show, photos: Number(e.target.value)}})}>
          {[0, 3, 6, 9].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label={t('of.gallery')} hint={t('of.galleryHint')}>
        <select data-f="gallery" value={template.show.gallery} onChange={(e) => setTpl({show: {...template.show, gallery: Number(e.target.value)}})}>
          {[0, 2, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
    </>
  );
};

// Демо-машина образца — та же, что у превью роликов в настройках (public/preview-demo, Ford F-150,
// выбор владельца 12.10): образец не зависит от объявлений клиента и одинаков у всех
const DEMO_LOT_URL = '/preview-demo/lot.json';
type DemoLot = Pick<Lot, 'brand' | 'model' | 'trim' | 'year' | 'specs' | 'carPriceKrw' | 'carPriceUsd' | 'krwPerUsd' | 'photos'> & {note?: string};
/** Поле формы по метке из образца: прокрутить к нему, поставить курсор, коротко подсветить */
const focusField = (key: string) => {
  window.dispatchEvent(new Event('kok:settings-edit'));
  // Пауза — чтобы на телефоне раздел «Настройки» успел показаться, иначе прокручивать некуда.
  // Таймер, а не requestAnimationFrame: во фоновой вкладке кадры не идут, и переход терялся через раз
  setTimeout(() => {
    const form = document.querySelector('.offer-form');
    const field = form?.querySelector<HTMLElement>(`[data-f="${CSS.escape(key)}"]`)
      ?? (key.startsWith('req:') ? form?.querySelector<HTMLElement>('.of-list > .btn') : null);
    if (!field) return;
    field.scrollIntoView({block: 'center', behavior: 'smooth'});
    field.focus({preventScroll: true});
    field.classList.remove('of-flash');
    void field.offsetWidth;
    field.classList.add('of-flash');
  }, 40);
};

/**
 * Живой образец КП: та же вёрстка, что у PDF (src/shared/offerHtml.js), рисуется в браузере на
 * каждую правку формы — без сервера и Chromium (владелец 16.11: «интерактивное превью»).
 * Shadow DOM — чтобы стили документа и интерфейса не задевали друг друга. Шрифт Manrope уже
 * загружен страницей (app/main.tsx), @font-face действует и внутри shadow DOM.
 * Компания — типовая («Ваша компания», без логотипа); что дилер вписал в форму — сразу его.
 */
const LivePreview: React.FC<{settings: OfferSettings; language: string; currency: string}> = ({settings, language, currency}) => {
  const t = useT();
  const [lot, setLot] = useState<DemoLot | null>(null);
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(DEMO_LOT_URL).then((r) => r.json()).then(setLot).catch((e) => setError(errorText(e)));
    api.rates().then((r) => setUsdRates(r.usdRates)).catch(() => setUsdRates({}));
  }, []);
  const body = useMemo(() => {
    if (!lot || !usdRates) return '';
    const dealer = sampleDealer(settings.dealer, language);
    const s = {...settings, dealer};
    const carPrice = carPriceIn(lot, currency, usdRates);
    const calc = calcOffer({carPrice, template: s.template, amounts: sampleAmounts(s.template, carPrice)});
    const count = Math.min(9, Math.max(0, Number(s.template.show?.photos) || 0));
    const date = new Date();
    return offerBody({language, currency, company: sampleCompany(dealer, language), settings: s, lot, calc,
      number: docNumber(s.template.numbering, date), date, client: sampleClient(language),
      images: {hero: lot.photos[0] ?? null, grid: lot.photos.slice(1, 1 + count),
        gallery: lot.photos.slice(1, 1 + (Number(s.template.show?.gallery) || 0))}, sample: true, accent: '#8E0D2C'});
  }, [lot, usdRates, settings, language, currency]);

  // PDF образца — тот же документ с сервера (печать Chromium), бесплатно
  const download = async () => {
    setBusy(true); setError('');
    try { window.open(api.offers.pdfUrl(await api.offers.sample(settings), true), '_self'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="of-sample">
      <div className="format-bar">
        <span className="muted">{t('of.sampleNote')}</span>
        <button className="btn" onClick={download} disabled={busy || !body}>{busy ? t('of.building') : t('of.samplePdf')}</button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">{t('of.sampleHint')}</p>
      {/* Клик по части документа — курсор в её поле формы (владелец 16.11): метки data-f ставит вёрстка */}
      {body ? <OfferSheet body={body} onMark={focusField} /> : <div className="empty">{t('of.building')}</div>}
    </div>
  );
};

export const OfferTool: React.FC = () => {
  const {config, profile, setProfile, profileSaved, report} = useConfig();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const savedProfile = config.profiles.find((p) => p.id === profile.id);
  const settings = useMemo(() => offerSettings(profile) as OfferSettings, [profile]);
  const dirty = profile !== savedProfile;
  const persist = async () => {
    setBusy(true);
    const {id, ...data} = profile;
    try { profileSaved(await api.saveProfile(id, data)); } catch (e) { report(e); } finally { setBusy(false); }
  };
  return (
    <SettingsLayout
      editor={
        <div className="form offer-form">
          <h2>{t.cfg('Коммерческое предложение')} <span className="muted">{t('of.sub')}</span></h2>
          <p className="note">{t('of.fromProfile')} <a href={href('settings', 'profile')}>{t.cfg('Профиль')}</a> · <a href={href('settings', 'brand')}>{t.cfg('Бренд')}</a></p>
          <OfferForm settings={settings} currency={profile.pricing.currency} onChange={(s) => setProfile({...profile, offer: s})} />
          <div className="actions">
            <button className="btn primary" disabled={!dirty || busy} onClick={persist}>{t('common.save')}</button>
            <button className="btn" disabled={!dirty || busy || !savedProfile} onClick={() => savedProfile && setProfile(savedProfile)}>{t('set.revert')}</button>
          </div>
        </div>
      }
      preview={<LivePreview settings={settings} language={profile.language} currency={profile.pricing.currency} />} />
  );
};
