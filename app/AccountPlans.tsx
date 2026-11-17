// Тарифы и докупка в «Моём кабинете» — карточками (макет владельца 12.10).
//
// Нажатие на тариф открывает окно оплаты (12.10): USDT через кассу NOWPayments и карта через AnyPay
// (13.10: сумы и гривны; рубли и СБП — кнопки есть, но касса их пока не принимает) — кредиты приходят сами; всё остальное — менеджер в Telegram (владелец 12.10: обратная связь
// теперь через Telegram и рабочую группу, а не WhatsApp). Готовый текст заявки (тариф, кредиты,
// цена, кабинет) копируется в буфер — Telegram не берёт текст в ссылке. Нет ключей кассы на
// сервере — в окне только менеджер.
//
// «Выгоднее всего», «−N% за кредит» и «экономия» не вписаны руками, а считаются из прайса:
// владелец меняет цены в админке, и плашки обязаны пересчитаться сами.
import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, Send} from 'lucide-react';
import {Offer, Pack, PayMethod, Payment, api, errorText} from './api';
import {usd} from './Account';
import {trackPurchase} from './analytics';
import {day, useSession} from './auth';
import {useConfig} from './config';
import {useRoute} from './router';
import {locale, tNow, useT, type Key, type T} from './i18n';

// Валюты AnyPay: копейки (сумы — целыми, на картах Узбекистана копеек нет); знак и название — в словаре
// (pay.cur.<код>.sign / .name): «сум» по-английски — «UZS»
const CUR: Record<string, {digits: number}> = {rub: {digits: 2}, uah: {digits: 2}, uzs: {digits: 0}, kgs: {digits: 2}};
const curSign = (c: string) => (CUR[c] ? tNow()(`pay.cur.${c}.sign` as Key) : c.toUpperCase());
const inCur = (n: number, c: string) => `${n.toLocaleString(locale(), {minimumFractionDigits: CUR[c]?.digits ?? 2, maximumFractionDigits: CUR[c]?.digits ?? 2})} ${curSign(c)}`;
// Сумма заказа в валюте его кассы: доллары USDT (NOWPayments) или валюта AnyPay
const paid = (p: Payment) => (p.currency === 'usd' ? `${usd(p.amount)} USDT` : inCur(p.amount, p.currency));
// Карта AnyPay в валютах, которые касса принимает (13.10 рубли закрыты): способ клиента → валюта
// country — ключ словаря: страна банка карты на языке интерфейса
const CARD_CURRENCIES: {key: PayMethod; cur: string; country: Key}[] = [
  {key: 'card_uzs', cur: 'uzs', country: 'pay.country.uz'}, {key: 'card_kgs', cur: 'kgs', country: 'pay.country.kg'}, {key: 'card_uah', cur: 'uah', country: 'pay.country.ua'},
];
const perCredit = (p: Pack) => p.price_usd / p.credits;
// Цена за кредит — до цента: в долларах это доли, целыми было бы «$1 за кредит» у всех тарифов
const cents = (n: number) => Math.round(n * 100) / 100;
// «3 кредита» / «3 credits» — формы числа по языку (app/i18n)
const credits = (n: number) => tNow().n('unit.credit', n);

/**
 * Куда писать за тарифом — по убыванию: бот поддержки с ключом кабинета (в рабочей группе тема
 * сразу с компанией и балансом, server/support.mjs), Telegram из контактов, WhatsApp с текстом,
 * письмо. WhatsApp и почта остаются запасом, если Telegram на сервере не настроен
 */
type Manager = {kind: 'bot' | 'telegram' | 'whatsapp' | 'email'; label: string; href: string | null};
const managerOf = (offer: Offer, text: string): Manager | null => {
  const c = offer.contacts;
  if (offer.support) return {kind: 'bot', label: 'Telegram', href: null};
  if (c.telegram) return {kind: 'telegram', label: 'Telegram', href: `https://t.me/${c.telegram.replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '')}`};
  if (c.whatsapp) return {kind: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`};
  if (c.email) return {kind: 'email', label: tNow()('pay.emailLabel'), href: `mailto:${c.email}?subject=${encodeURIComponent(tNow()('pay.emailSubject'))}&body=${encodeURIComponent(text)}`};
  return null;
};

/**
 * Открыть чат с менеджером. Всё — сразу в обработчике нажатия: Safari не откроет вкладку и не
 * даст писать в буфер, если перед этим был запрос к серверу. Поэтому вкладка открывается пустой,
 * а адрес бота с ключом кабинета подставляется, когда сервер его выдаст
 */
const openManager = async (m: Manager, text: string) => {
  if (m.kind === 'whatsapp' || m.kind === 'email') { window.open(m.href!, '_blank', 'noreferrer'); return; }
  // Не скопировалось (браузер запретил) — не страшно: менеджер спросит сам
  navigator.clipboard?.writeText(text).catch(() => {});
  if (m.kind === 'telegram') { window.open(m.href!, '_blank', 'noreferrer'); return; }
  const tab = window.open('', '_blank');
  try {
    const {url} = await api.account.supportLink();
    if (url && tab) tab.location.href = url;
    else if (url) window.location.href = url;
    else tab?.close();
  } catch (e) {
    tab?.close();
    throw e;
  }
};

/** Скидка за кредит относительно самого дорогого пакета того же вида, в процентах */
const discountOf = (p: Pack, packs: Pack[]) => {
  const top = Math.max(...packs.map(perCredit));
  return Math.round((1 - perCredit(p) / top) * 100);
};

// Что сейчас с оплатой — словами клиента (pay.status.<статус> в словаре). Статусы — общие для всех касс
// (cores/PAYMENTS.md, раздел 3)
const STATUSES = new Set(['created', 'waiting', 'confirming', 'partial', 'failed', 'expired', 'refunded', 'abandoned', 'paid']);
const statusText = (t: T, p: Payment) => (p.credited ? t('pay.status.credited', {credits: t.n('unit.credit', p.credits ?? 0)})
  : t(STATUSES.has(p.status) ? `pay.status.${p.status}` as Key : 'pay.status.unknown'));
// После этих статусов ждать больше нечего — опрос останавливается
const settled = (p: Payment) => p.credited || ['failed', 'expired', 'refunded', 'partial', 'abandoned'].includes(p.status);

// Клавиатура для плашки-кнопки: Enter и пробел, как у настоящей кнопки
const pressable = (onPress: () => void) => ({
  role: 'button', tabIndex: 0, onClick: onPress,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(); } },
});

/**
 * Окно оплаты тарифа. USDT — счёт у кассы и переход на её страницу в этой же вкладке: окно,
 * открытое после ответа сервера, браузер счёл бы всплывающим и заблокировал
 */
const PayDialog: React.FC<{pack: Pack; offer: Offer; text: string; onClose: () => void}> = ({pack, offer, text, onClose}) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manager = managerOf(offer, text);
  const [copied, setCopied] = useState(false);
  const write = async () => {
    if (!manager) return;
    setError('');
    if (manager.kind === 'bot' || manager.kind === 'telegram') setCopied(true);
    try { await openManager(manager, text); } catch (e) { setError(errorText(e)); }
  };
  const telegram = manager?.kind === 'bot' || manager?.kind === 'telegram';
  const usdt = Boolean(offer.pay?.usdt);
  const sbp = Boolean(offer.pay?.sbp);
  const card = Boolean(offer.pay?.card);
  const rubles = sbp || card;
  const cards = CARD_CURRENCIES.filter((c) => offer.pay?.[c.key]);
  const anypay = rubles || cards.length > 0;
  // Курсы для подсказки «≈ сумма»: точную сумму считает сервер по тому же курсу дня
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);

  useEffect(() => { if (anypay) api.rates().then((r) => setUsdRates(r.usdRates)).catch(() => setUsdRates(null)); }, [anypay]);
  const approx = (c: string) => {
    const per = usdRates?.[c.toUpperCase()] ?? 0;
    return per ? ` · ≈ ${inCur(pack.price_usd * per, c)}` : '';
  };
  const approxRub = approx('rub');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Какой способ сейчас открывается — надпись «Открываю кассу…» только на своей кнопке
  const [busyWith, setBusyWith] = useState<PayMethod | null>(null);
  const pay = async (method: PayMethod) => {
    setBusy(true);
    setBusyWith(method);
    setError('');
    try {
      const {url} = await api.pay.checkout(pack.id, method);
      window.location.assign(url);
    } catch (e) { setError(errorText(e)); setBusy(false); setBusyWith(null); }
  };

  // Порталом в body: у предков анимация появления оставляет transform, и fixed внутри них
  // считался бы от блока, а не от экрана
  return createPortal(
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="pay-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <h2 id="pay-title">{pack.kind === 'plan' ? t('pay.plan', {title: pack.title}) : `+${credits(pack.credits)}`}</h2>
        <p className="pay-sum">{usd(pack.price_usd)}{pack.kind === 'plan' ? <span className="muted"> · {t('pay.perMonth', {credits: credits(pack.credits)})}</span> : null}</p>
        {rubles && (
          <div className="pay-option">
            {sbp && (
              <button className="btn primary" onClick={() => pay('sbp')} disabled={busy}>
                {busyWith === 'sbp' ? t('pay.opening') : `${t('pay.sbp')}${approxRub}`}
              </button>
            )}
            {card && (
              <button className={`btn${sbp ? '' : ' primary'}`} onClick={() => pay('card')} disabled={busy}>
                {busyWith === 'card' ? t('pay.opening') : `${t('pay.card')}${approxRub}`}
              </button>
            )}
            <p className="hint">
              {t('pay.rubles', {how: [sbp && t('pay.rubles.sbp'), card && t('pay.rubles.card')].filter(Boolean).join(t('pay.or'))})} {t('pay.creditsArrive')}
            </p>
          </div>
        )}
        {cards.length > 0 && (
          <div className="pay-option">
            {cards.map((c, i) => (
              <button key={c.key} className={`btn${!rubles && i === 0 ? ' primary' : ''}`} onClick={() => pay(c.key)} disabled={busy}>
                {busyWith === c.key ? t('pay.opening') : `${t('pay.byCard')} · ${t(`pay.cur.${c.cur}.name` as Key)}${approx(c.cur)}`}
              </button>
            ))}
            <p className="hint">
              {t('pay.cardBank', {countries: cards.map((c) => t(c.country)).join(', ')})}
              {/* Комиссию кассы платит покупатель (владелец 13.10): без этой строки сумма на странице
                  кассы выглядела бы как ошибка в цене */}
              {' '}{t('pay.fee')} {t('pay.creditsArrive')}
            </p>
          </div>
        )}
        {usdt && (
          <div className="pay-option">
            <button className={`btn${anypay ? '' : ' primary'}`} onClick={() => pay('usdt')} disabled={busy}>
              {busyWith === 'usdt' ? t('pay.opening') : t('pay.usdt', {sum: usd(pack.price_usd)})}
            </button>
            <p className="hint">
              {t('pay.network')}<b>TRON (TRC20)</b>. {t('pay.creditsArrive')} {t('pay.wrongNetwork')}
            </p>
          </div>
        )}
        {manager && (
          <div className="pay-option">
            <button type="button" className={`btn${usdt || anypay ? '' : ' primary'}${telegram ? ' btn-tg' : ''}`} onClick={write}>
              {telegram && <Send size={17} aria-hidden />}
              {t(rubles ? 'pay.mgr.other' : usdt ? 'pay.mgr.rubOther' : 'pay.mgr.write', {channel: manager.label})}
            </button>
            <p className="hint">
              {telegram
                ? t(copied ? 'pay.mgr.copied' : 'pay.mgr.willCopy')
                : t('pay.mgr.opens', {channel: manager.label})}
            </p>
          </div>
        )}
        {!usdt && !anypay && !manager && <p className="hint">{t('pay.none')}</p>}
        {/* Модерация кассы и сам клиент: перед оплатой видно условия и возврат */}
        <p className="hint">{t('pay.accept.a')}<a href="/offer" target="_blank" rel="noreferrer">{t('auth.accept.offer')}</a>{t('pay.accept.b')}</p>
        {error && <div className="auth-error">{error}</div>}
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Возврат из кассы: #/account/pay-…. Опрашиваем заказ, пока кредиты не придут или оплата не
 * закончится ничем; пришли — баланс в шапке перечитываем
 */
export const PaymentReturn: React.FC = () => {
  const route = useRoute();
  const id = route.tool?.startsWith('pay-') ? route.tool : null;
  const {refresh} = useSession();
  const t = useT();
  const [p, setP] = useState<Payment | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let stop = false;
    let timer: number | undefined;
    // Перевод в сети TRON и по СБП подтверждается за минуту-другую; полчаса — с запасом на медленную
    // кассу, дальше человек уже ушёл со страницы
    const until = Date.now() + 30 * 60_000;
    const tick = () => api.pay.get(id).then((r) => {
      if (stop) return;
      setP(r);
      if (r.credited) { refresh(); trackPurchase(r); }
      if (!settled(r) && Date.now() < until) timer = window.setTimeout(tick, 5000);
    }).catch((e) => !stop && setError(errorText(e)));
    tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [id, refresh]);

  if (!id) return null;
  const close = () => { window.location.hash = '#/account'; };
  return (
    <div className={`notice pay-return${p?.credited ? ' ok' : p && settled(p) ? ' warn' : ''}`}>
      <div>
        <b>{p ? `${p.title} · ${paid(p)}` : t('pay.payment')}</b>
        <span>{error || (p ? statusText(t, p) : t('pay.checking'))}</span>
        {p && !settled(p) && <span className="muted">{t('pay.noReload')}</span>}
      </div>
      <button className="btn ghost" onClick={close}>{t(p && settled(p) ? 'pay.done' : 'pay.hide')}</button>
    </div>
  );
};

export const PlansSection: React.FC = () => {
  const {workspace, email, balance} = useSession();
  const {config} = useConfig();
  const t = useT();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paying, setPaying] = useState<{pack: Pack; text: string} | null>(null);
  useEffect(() => { api.offer().then(setOffer).catch(() => setOffer(null)); }, []);
  // История перечитывается вместе с балансом: после начисления строка сменит статус
  useEffect(() => { api.pay.list().then(setPayments).catch(() => setPayments([])); }, [balance?.credits]);
  if (!offer) return null;

  const plans = offer.packs.filter((p) => p.kind === 'plan');
  const topups = offer.packs.filter((p) => p.kind === 'topup');
  // Подпись кабинета в сообщении: по ней менеджер находит клиента в админке
  const who = `\n${t('pay.req.account')}: ${[workspace?.name, email].filter(Boolean).join(', ')}`;
  const current = balance?.subscription;
  // «Выгоднее всего» — самый дешёвый кредит, и только когда есть с чем сравнить
  const best = plans.length > 1 ? plans.reduce((a, b) => (perCredit(b) < perCredit(a) ? b : a)) : null;
  const bestTopup = topups.length > 1 ? topups.reduce((a, b) => (perCredit(b) < perCredit(a) ? b : a)) : null;
  const ads = config.credits?.ads ?? 3;
  const carousels = config.credits?.carousels ?? 1;
  const top = plans.length ? Math.max(...plans.map(perCredit)) : 0;
  const usdt = Boolean(offer.pay?.usdt);
  const rubles = Boolean(offer.pay?.sbp || offer.pay?.card);
  const cardCountries = CARD_CURRENCIES.filter((c) => offer.pay?.[c.key]).map((c) => t(c.country));
  const cardsOn = cardCountries.length > 0;

  return (
    <section id="plans" className="plans">
      <div className="section-head">
        <h2>{t('shell.plans')}</h2>
        <span className="muted">{t('plans.lead')}</span>
      </div>
      <div className="plan-grid">
        {plans.map((p) => {
          const mine = current?.planId === p.id;
          const discount = discountOf(p, plans);
          const saving = Math.round(top * p.credits - p.price_usd);
          const text = `${t(mine ? 'pay.req.renew' : 'pay.req.plan', {title: p.title, credits: credits(p.credits), price: usd(p.price_usd)})}${who}`;
          const isBest = best?.id === p.id;
          return (
            <div key={p.id} className={`plan lift${isBest ? ' best' : ''}${mine ? ' mine' : ''}`} {...pressable(() => setPaying({pack: p, text}))}>
              {(mine || isBest) && (
                <span className="plan-flag">{mine ? t('plans.mine', {date: day(current?.until)}) : t('plans.best', {n: discount})}</span>
              )}
              <b className="plan-title">{p.title}</b>
              <div className="plan-credits"><span>{p.credits}</span> {t.n('plans.creditsMonth', p.credits)}</div>
              <div className="plan-price">{usd(p.price_usd)} <span className="muted">{t('land.tariffs.month')}</span></div>
              <div className="plan-unit muted">
                {t('land.tariffs.perCredit', {price: usd(cents(perCredit(p)))})}
                {discount > 0 && !isBest && <> · −{discount}%</>}
                {isBest && saving > 0 && <> · <span className="plan-save">{t('plans.save', {sum: usd(saving)})}</span></>}
              </div>
              <ul className="plan-points">
                <li><Check size={14} aria-hidden /> {t('plans.approx', {videos: t.n('unit.video', Math.floor(p.credits / ads)), carousels: t.n('unit.carousel', Math.floor(p.credits / carousels))})}</li>
                {isBest && discount > 0 && <li><Check size={14} aria-hidden /> {t('plans.cheaper', {n: discount, title: plans.find((x) => perCredit(x) === top)?.title ?? ''})}</li>}
              </ul>
              <span className={`btn${isBest || mine ? ' primary' : ''}`}>{mine ? t('shell.renewLink') : `${t('plans.choose')}${isBest ? ` ${p.title}` : ''}`}</span>
            </div>
          );
        })}
      </div>

      {topups.length > 0 && (
        <>
          <div className="section-head"><h2>{t('land.tariffs.topup')}</h2></div>
          <div className="topup-grid">
            {topups.map((p) => {
              const text = `${t('pay.req.topup', {credits: credits(p.credits), price: usd(p.price_usd)})}${who}`;
              return (
                <div key={p.id} className="topup lift" {...pressable(() => setPaying({pack: p, text}))}>
                  <div>
                    <b>+{credits(p.credits)}</b>
                    <span className="muted">{t('land.tariffs.perCredit', {price: usd(cents(perCredit(p)))})}{bestTopup?.id === p.id ? ` · ${t('plans.better')}` : ''}</span>
                  </div>
                  <span className="btn">{usd(p.price_usd)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="hint plans-foot">
        {t('plans.foot')}
        {rubles || cardsOn ? ` ${t('plans.footPay', {how: [rubles && t('plans.byRubles'), cardsOn && t('plans.byCard', {countries: cardCountries.join(', ')}), usdt && t('plans.byUsdt')].filter(Boolean).join(', ')})}`
          : usdt ? ` ${t('plans.footUsdt')}`
          : ` ${t('plans.footManager', {channel: managerOf(offer, '')?.label ?? t('plans.chat')})}`}
      </p>

      {payments.length > 0 && (
        <div className="pay-history">
          <div className="section-head"><h2>{t('plans.history')}</h2></div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>{t('plans.h.date')}</th><th>{t('acc.l.what')}</th><th>{t('plans.h.sum')}</th><th>{t('plans.h.status')}</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{day(p.createdAt)}</td>
                    <td>{p.title}{p.sandbox ? ` · ${t('plans.test')}` : ''}</td>
                    <td className="nowrap">{paid(p)}</td>
                    <td>{statusText(t, p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {paying && <PayDialog pack={paying.pack} offer={offer} text={paying.text} onClose={() => setPaying(null)} />}
    </section>
  );
};
