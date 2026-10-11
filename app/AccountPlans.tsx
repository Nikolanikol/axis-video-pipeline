// Тарифы и докупка в «Моём кабинете» — карточками (макет владельца 12.10).
//
// Оплаты в системе пока нет: «Выбрать» открывает WhatsApp продаж с готовым текстом — тариф,
// кредиты, цена и кабинет, — чтобы менеджеру не переспрашивать. Когда появится онлайн-оплата,
// эта же кнопка поведёт в кассу.
//
// «Выгоднее всего», «−N% за кредит» и «экономия» не вписаны руками, а считаются из прайса:
// владелец меняет цены в админке, и плашки обязаны пересчитаться сами.
import React, {useEffect, useState} from 'react';
import {Check} from 'lucide-react';
import {Offer, Pack, api} from './api';
import {day, useSession} from './auth';
import {useConfig} from './config';

const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const perCredit = (p: Pack) => p.price_krw / p.credits;
// 1 ролик, 2 ролика, 5 роликов
const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

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

export const PlansSection: React.FC = () => {
  const {workspace, email, balance} = useSession();
  const {config} = useConfig();
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => { api.offer().then(setOffer).catch(() => setOffer(null)); }, []);
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
          const href = contactLink(offer.contacts, text);
          const isBest = best?.id === p.id;
          const Tag = href ? 'a' : 'div';
          return (
            <Tag key={p.id} className={`plan lift${isBest ? ' best' : ''}${mine ? ' mine' : ''}`}
              {...(href ? {href, target: '_blank', rel: 'noreferrer'} : {})}>
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
              {href && <span className={`btn${isBest || mine ? ' primary' : ''}`}>{mine ? 'Продлить' : `Выбрать${isBest ? ` ${p.title}` : ''}`}</span>}
            </Tag>
          );
        })}
      </div>

      {topups.length > 0 && (
        <>
          <div className="section-head"><h2>Не хватило на месяц</h2></div>
          <div className="topup-grid">
            {topups.map((p) => {
              const href = contactLink(offer.contacts, `Здравствуйте! Хочу докупить ${p.credits} ${plural(p.credits, ['кредит', 'кредита', 'кредитов'])} за ${won(p.price_krw)}.${who}`);
              const Tag = href ? 'a' : 'div';
              return (
                <Tag key={p.id} className="topup lift" {...(href ? {href, target: '_blank', rel: 'noreferrer'} : {})}>
                  <div>
                    <b>+{p.credits} {plural(p.credits, ['кредит', 'кредита', 'кредитов'])}</b>
                    <span className="muted">{won(Math.round(perCredit(p)))} за кредит{bestTopup?.id === p.id ? ' · выгоднее' : ''}</span>
                  </div>
                  <span className="btn">{won(p.price_krw)}</span>
                </Tag>
              );
            })}
          </div>
        </>
      )}
      <p className="hint plans-foot">
        Докупленные кредиты сгорают вместе с подпиской. Нажмите тариф — откроется {offer.contacts.whatsapp ? 'WhatsApp' : 'чат'} с готовым
        сообщением; пришлём реквизиты и подключим.
      </p>
    </section>
  );
};
