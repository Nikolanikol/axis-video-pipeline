// Тарифы и докупка в «Моём кабинете» — карточками (макет владельца 12.10).
//
// Нажатие на тариф открывает окно оплаты (12.10): USDT через кассу NOWPayments — кредиты
// приходят сами; рубли и всё остальное — WhatsApp продаж с готовым текстом (тариф, кредиты,
// цена и кабинет), чтобы менеджеру не переспрашивать. Нет ключей кассы на сервере — в окне
// только менеджер.
//
// «Выгоднее всего», «−N% за кредит» и «экономия» не вписаны руками, а считаются из прайса:
// владелец меняет цены в админке, и плашки обязаны пересчитаться сами.
import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check} from 'lucide-react';
import {Offer, Pack, Payment, api} from './api';
import {day, useSession} from './auth';
import {useConfig} from './config';
import {useRoute} from './router';

const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const usd = (n: number) => `$${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const perCredit = (p: Pack) => p.price_krw / p.credits;
// 1 ролик, 2 ролика, 5 роликов
const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const credits = (n: number) => `${n} ${plural(n, ['кредит', 'кредита', 'кредитов'])}`;

/**
 * Куда писать за тарифом: WhatsApp с текстом, нет его — Telegram (текст туда ссылкой не
 * передать), нет и его — письмо с темой и текстом
 */
const contactLink = (contacts: Offer['contacts'], text: string) => {
  if (contacts.whatsapp) return `https://wa.me/${contacts.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  if (contacts.telegram) return `https://t.me/${contacts.telegram.replace(/^@/, '')}`;
  if (contacts.email) return `mailto:${contacts.email}?subject=${encodeURIComponent('Подписка KOK')}&body=${encodeURIComponent(text)}`;
  return null;
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
  const manager = contactLink(offer.contacts, text);
  const usdt = Boolean(offer.pay?.usdt);

  useEffect(() => { if (usdt) api.usdKrw().then((r) => setRate(r.krwPerUsd)).catch(() => setRate(null)); }, [usdt]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const {url} = await api.pay.checkout(pack.id);
      window.location.assign(url);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  // Порталом в body: у предков анимация появления оставляет transform, и fixed внутри них
  // считался бы от блока, а не от экрана
  return createPortal(
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="pay-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <h2 id="pay-title">{pack.kind === 'plan' ? `Тариф «${pack.title}»` : `+${credits(pack.credits)}`}</h2>
        <p className="pay-sum">{won(pack.price_krw)}{pack.kind === 'plan' ? <span className="muted"> · {credits(pack.credits)} на месяц</span> : null}</p>
        {usdt && (
          <div className="pay-option">
            <button className="btn primary" onClick={pay} disabled={busy}>
              {busy ? 'Открываю кассу…' : `Оплатить USDT${rate ? ` · ≈ ${usd(Math.round((pack.price_krw / rate) * 100) / 100)}` : ''}`}
            </button>
            <p className="hint">
              Сеть <b>TRON (TRC20)</b>. Кредиты придут сами через несколько минут после оплаты.
              USDT, отправленные в другой сети, не дойдут.
            </p>
          </div>
        )}
        {manager && (
          <div className="pay-option">
            <a className={`btn${usdt ? '' : ' primary'}`} href={manager} target="_blank" rel="noreferrer">
              {usdt ? 'Рубли или другой способ — написать нам' : `Написать в ${offer.contacts.whatsapp ? 'WhatsApp' : 'чат'}`}
            </a>
            <p className="hint">Откроется {offer.contacts.whatsapp ? 'WhatsApp' : 'чат'} с готовым сообщением: пришлём реквизиты и подключим.</p>
          </div>
        )}
        {!usdt && !manager && <p className="hint">Способы оплаты ещё не настроены — напишите нам на почту из подвала сайта.</p>}
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
    // Перевод в сети TRON подтверждается за минуту-другую; полчаса — с запасом на медленную
    // кассу, дальше человек уже ушёл со страницы
    const until = Date.now() + 30 * 60_000;
    const tick = () => api.pay.get(id).then((r) => {
      if (stop) return;
      setP(r);
      if (r.credited) refresh();
      if (!settled(r) && Date.now() < until) timer = window.setTimeout(tick, 5000);
    }).catch((e) => !stop && setError(e.message));
    tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [id, refresh]);

  if (!id) return null;
  const close = () => { window.location.hash = '#/account'; };
  return (
    <div className={`notice pay-return${p?.credited ? ' ok' : p && settled(p) ? ' warn' : ''}`}>
      <div>
        <b>{p ? `${p.title} · ${usd(p.amount)}` : 'Оплата'}</b>
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
        {usdt ? ' Оплата в USDT — кредиты придут сами; рублями — через менеджера.'
          : ` Нажмите тариф — откроется ${offer.contacts.whatsapp ? 'WhatsApp' : 'чат'} с готовым сообщением; пришлём реквизиты и подключим.`}
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
                    <td className="nowrap">{usd(p.amount)} USDT</td>
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
