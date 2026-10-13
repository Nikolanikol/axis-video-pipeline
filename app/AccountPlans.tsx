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
import {day, useSession} from './auth';
import {useConfig} from './config';
import {useRoute} from './router';

const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const usd = (n: number) => `$${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
// Валюты AnyPay: знак и копейки (сумы — целыми, на картах Узбекистана копеек нет)
const CUR: Record<string, {sign: string; digits: number; name: string}> = {
  rub: {sign: '₽', digits: 2, name: 'рубли'}, uah: {sign: '₴', digits: 2, name: 'гривны'},
  uzs: {sign: 'сум', digits: 0, name: 'сумы'}, kgs: {sign: 'сом', digits: 2, name: 'сомы'},
};
const inCur = (n: number, c: string) => `${n.toLocaleString('ru-RU', {minimumFractionDigits: CUR[c]?.digits ?? 2, maximumFractionDigits: CUR[c]?.digits ?? 2})} ${CUR[c]?.sign ?? c.toUpperCase()}`;
// Сумма заказа в валюте его кассы: доллары USDT (NOWPayments) или валюта AnyPay
const paid = (p: Payment) => (p.currency === 'usd' ? `${usd(p.amount)} USDT` : inCur(p.amount, p.currency));
// Карта AnyPay в валютах, которые касса принимает (13.10 рубли закрыты): способ клиента → валюта
const CARD_CURRENCIES: {key: PayMethod; cur: string; country: string}[] = [
  {key: 'card_uzs', cur: 'uzs', country: 'Узбекистан'}, {key: 'card_kgs', cur: 'kgs', country: 'Киргизия'}, {key: 'card_uah', cur: 'uah', country: 'Украина'},
];
const perCredit = (p: Pack) => p.price_krw / p.credits;
// 1 ролик, 2 ролика, 5 роликов
const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const credits = (n: number) => `${n} ${plural(n, ['кредит', 'кредита', 'кредитов'])}`;

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
  if (c.email) return {kind: 'email', label: 'почту', href: `mailto:${c.email}?subject=${encodeURIComponent('Подписка KOK')}&body=${encodeURIComponent(text)}`};
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

// Что сейчас с оплатой — словами клиента. Статусы — общие для всех касс (cores/PAYMENTS.md, раздел 3)
const STATUS: Record<string, string> = {
  created: 'Ждём оплату', waiting: 'Ждём перевод', confirming: 'Перевод в сети, подтверждается',
  partial: 'Пришло меньше суммы счёта — мы уже разбираемся, напишем вам', failed: 'Оплата не прошла',
  expired: 'Время счёта вышло — оплаты не было', refunded: 'Деньги возвращены', abandoned: 'Счёт не оплачен',
  unknown: 'Проверяем оплату',
};
const statusText = (p: Payment) => (p.credited ? `Оплачено — +${credits(p.credits ?? 0)}`
  : p.status === 'paid' ? 'Оплата пришла, проверяем' : STATUS[p.status] ?? 'Проверяем оплату');
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rate, setRate] = useState<number | null>(null);
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

  useEffect(() => { if (usdt) api.usdKrw().then((r) => setRate(r.krwPerUsd)).catch(() => setRate(null)); }, [usdt]);
  useEffect(() => { if (anypay) api.rates().then((r) => setUsdRates(r.usdRates)).catch(() => setUsdRates(null)); }, [anypay]);
  const approx = (c: string) => {
    const per = usdRates?.KRW && usdRates[c.toUpperCase()] ? usdRates.KRW / usdRates[c.toUpperCase()] : 0;
    return per ? ` · ≈ ${inCur(pack.price_krw / per, c)}` : '';
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
        <h2 id="pay-title">{pack.kind === 'plan' ? `Тариф «${pack.title}»` : `+${credits(pack.credits)}`}</h2>
        <p className="pay-sum">{won(pack.price_krw)}{pack.kind === 'plan' ? <span className="muted"> · {credits(pack.credits)} на месяц</span> : null}</p>
        {rubles && (
          <div className="pay-option">
            {sbp && (
              <button className="btn primary" onClick={() => pay('sbp')} disabled={busy}>
                {busyWith === 'sbp' ? 'Открываю кассу…' : `Оплатить по СБП${approxRub}`}
              </button>
            )}
            {card && (
              <button className={`btn${sbp ? '' : ' primary'}`} onClick={() => pay('card')} disabled={busy}>
                {busyWith === 'card' ? 'Открываю кассу…' : `Оплатить картой${approxRub}`}
              </button>
            )}
            <p className="hint">
              Рубли — {[sbp && 'по СБП', card && 'картой российского банка'].filter(Boolean).join(' или ')}. Кредиты придут сами через несколько минут после оплаты.
            </p>
          </div>
        )}
        {cards.length > 0 && (
          <div className="pay-option">
            {cards.map((c, i) => (
              <button key={c.key} className={`btn${!rubles && i === 0 ? ' primary' : ''}`} onClick={() => pay(c.key)} disabled={busy}>
                {busyWith === c.key ? 'Открываю кассу…' : `Картой · ${CUR[c.cur].name}${approx(c.cur)}`}
              </button>
            ))}
            <p className="hint">
              Карта банка: {cards.map((c) => c.country).join(', ')}. Касса покажет реквизиты для перевода с вашей карты.
              Кредиты придут сами через несколько минут после оплаты.
            </p>
          </div>
        )}
        {usdt && (
          <div className="pay-option">
            <button className={`btn${anypay ? '' : ' primary'}`} onClick={() => pay('usdt')} disabled={busy}>
              {busyWith === 'usdt' ? 'Открываю кассу…' : `Оплатить USDT${rate ? ` · ≈ ${usd(Math.round((pack.price_krw / rate) * 100) / 100)}` : ''}`}
            </button>
            <p className="hint">
              Сеть <b>TRON (TRC20)</b>. Кредиты придут сами через несколько минут после оплаты.
              USDT, отправленные в другой сети, не дойдут.
            </p>
          </div>
        )}
        {manager && (
          <div className="pay-option">
            <button type="button" className={`btn${usdt || anypay ? '' : ' primary'}${telegram ? ' btn-tg' : ''}`} onClick={write}>
              {telegram && <Send size={17} aria-hidden />}
              {rubles ? `Другой способ — написать в ${manager.label}`
                : usdt ? `Рубли или другой способ — написать в ${manager.label}` : `Написать в ${manager.label}`}
            </button>
            <p className="hint">
              {telegram
                ? (copied ? 'Текст заявки скопирован — вставьте его в чат. Пришлём реквизиты и подключим.'
                  : 'Откроется Telegram, текст заявки скопируется сам — останется вставить. Пришлём реквизиты и подключим.')
                : `Откроется ${manager.label} с готовым сообщением: пришлём реквизиты и подключим.`}
            </p>
          </div>
        )}
        {!usdt && !anypay && !manager && <p className="hint">Способы оплаты ещё не настроены — напишите нам на почту из подвала сайта.</p>}
        {/* Модерация кассы и сам клиент: перед оплатой видно условия и возврат */}
        <p className="hint">Оплачивая, вы принимаете <a href="#/offer" target="_blank" rel="noreferrer">оферту</a>: возврат — в течение 3 суток, если кредиты из покупки не тратились.</p>
        {error && <div className="auth-error">{error}</div>}
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Отмена</button>
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
      if (r.credited) refresh();
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
        <b>{p ? `${p.title} · ${paid(p)}` : 'Оплата'}</b>
        <span>{error || (p ? statusText(p) : 'Проверяем оплату…')}</span>
        {p && !settled(p) && <span className="muted">Страницу можно не обновлять — проверяем сами каждые несколько секунд.</span>}
      </div>
      <button className="btn ghost" onClick={close}>{p && settled(p) ? 'Готово' : 'Скрыть'}</button>
    </div>
  );
};

export const PlansSection: React.FC = () => {
  const {workspace, email, balance} = useSession();
  const {config} = useConfig();
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
  const who = `\nКабинет: ${[workspace?.name, email].filter(Boolean).join(', ')}`;
  const current = balance?.subscription;
  // «Выгоднее всего» — самый дешёвый кредит, и только когда есть с чем сравнить
  const best = plans.length > 1 ? plans.reduce((a, b) => (perCredit(b) < perCredit(a) ? b : a)) : null;
  const bestTopup = topups.length > 1 ? topups.reduce((a, b) => (perCredit(b) < perCredit(a) ? b : a)) : null;
  const ads = config.credits?.ads ?? 3;
  const carousels = config.credits?.carousels ?? 1;
  const top = plans.length ? Math.max(...plans.map(perCredit)) : 0;
  const usdt = Boolean(offer.pay?.usdt);
  const rubles = Boolean(offer.pay?.sbp || offer.pay?.card);
  const cardCountries = CARD_CURRENCIES.filter((c) => offer.pay?.[c.key]).map((c) => c.country);
  const cardsOn = cardCountries.length > 0;

  return (
    <section id="plans" className="plans">
      <div className="section-head">
        <h2>Тарифы</h2>
        <span className="muted">Кредиты действуют месяц и сгорают в конце</span>
      </div>
      <div className="plan-grid">
        {plans.map((p) => {
          const mine = current?.planId === p.id;
          const discount = discountOf(p, plans);
          const saving = Math.round(top * p.credits - p.price_krw);
          const text = `Здравствуйте! Хочу ${mine ? 'продлить' : 'подключить'} тариф «${p.title}» — ${p.credits} кредитов за ${won(p.price_krw)} в месяц.${who}`;
          const isBest = best?.id === p.id;
          return (
            <div key={p.id} className={`plan lift${isBest ? ' best' : ''}${mine ? ' mine' : ''}`} {...pressable(() => setPaying({pack: p, text}))}>
              {(mine || isBest) && (
                <span className="plan-flag">{mine ? `Ваш тариф · до ${day(current?.until)}` : `Выгоднее всего · −${discount}% за кредит`}</span>
              )}
              <b className="plan-title">{p.title}</b>
              <div className="plan-credits"><span>{p.credits}</span> {plural(p.credits, ['кредит', 'кредита', 'кредитов'])}/мес</div>
              <div className="plan-price">{won(p.price_krw)} <span className="muted">в месяц</span></div>
              <div className="plan-unit muted">
                {won(Math.round(perCredit(p)))} за кредит
                {discount > 0 && !isBest && <> · −{discount}%</>}
                {isBest && saving > 0 && <> · <span className="plan-save">экономия {won(saving)}</span></>}
              </div>
              <ul className="plan-points">
                <li><Check size={14} aria-hidden /> ≈ {Math.floor(p.credits / ads)} {plural(Math.floor(p.credits / ads), ['ролик', 'ролика', 'роликов'])} или {Math.floor(p.credits / carousels)} {plural(Math.floor(p.credits / carousels), ['карусель', 'карусели', 'каруселей'])}</li>
                {isBest && discount > 0 && <li><Check size={14} aria-hidden /> Кредит на {discount}% дешевле, чем в «{plans.find((x) => perCredit(x) === top)?.title}»</li>}
              </ul>
              <span className={`btn${isBest || mine ? ' primary' : ''}`}>{mine ? 'Продлить' : `Выбрать${isBest ? ` ${p.title}` : ''}`}</span>
            </div>
          );
        })}
      </div>

      {topups.length > 0 && (
        <>
          <div className="section-head"><h2>Не хватило на месяц</h2></div>
          <div className="topup-grid">
            {topups.map((p) => {
              const text = `Здравствуйте! Хочу докупить ${credits(p.credits)} за ${won(p.price_krw)}.${who}`;
              return (
                <div key={p.id} className="topup lift" {...pressable(() => setPaying({pack: p, text}))}>
                  <div>
                    <b>+{credits(p.credits)}</b>
                    <span className="muted">{won(Math.round(perCredit(p)))} за кредит{bestTopup?.id === p.id ? ' · выгоднее' : ''}</span>
                  </div>
                  <span className="btn">{won(p.price_krw)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="hint plans-foot">
        Докупленные кредиты сгорают вместе с подпиской.
        {rubles || cardsOn ? ` Оплата ${[rubles && 'рублями', cardsOn && `картой (${cardCountries.join(', ')})`, usdt && 'в USDT'].filter(Boolean).join(', ')} — кредиты придут сами.`
          : usdt ? ' Оплата в USDT — кредиты придут сами; рублями — через менеджера.'
          : ` Нажмите тариф — напишите нам в ${managerOf(offer, '')?.label ?? 'чат'}: пришлём реквизиты и подключим.`}
      </p>

      {payments.length > 0 && (
        <div className="pay-history">
          <div className="section-head"><h2>История оплат</h2></div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Дата</th><th>Что</th><th>Сумма</th><th>Статус</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{day(p.createdAt)}</td>
                    <td>{p.title}{p.sandbox ? ' · тест' : ''}</td>
                    <td className="nowrap">{paid(p)}</td>
                    <td>{statusText(p)}</td>
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
