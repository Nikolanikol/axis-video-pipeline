// Кабинет компании. Админка платформы — app/admin/.
//
// Кредиты покупаются вне системы: клиент пишет нам, платит, менеджер начисляет подписку на
// месяц или докупку. Поэтому кабинет — это остаток, подписка, прайс и кнопка «написать»,
// а админка — лиды, кому пора продлевать, и начисление.
import React, {useEffect, useRef, useState} from 'react';
import {Balance, LedgerPage, CreditLot, LedgerRow, api} from './api';
import {day, daysLeft, useSession} from './auth';
import {DangerZone, ProfileCard, SecurityCard} from './AccountProfile';
import {SetupCard} from './Onboarding';
import {PaymentReturn, PlansSection} from './AccountPlans';
import {useConfig} from './config';

// Цены тарифов — в долларах (миграция 020, 23.10): целые — без центов ($19), иначе до цента ($0.76)
export const usd = (n: number) => `$${n.toLocaleString('en-US', Number.isInteger(n) ? {maximumFractionDigits: 0} : {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
export const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
// Откуда партия кредитов — подпись в кабинете. «pack» с 29.09 — докупка: пакеты на год
// стали докупкой к подписке (миграция 006)
const SOURCE: Record<CreditLot['source'], string> = {
  signup: 'подарок за регистрацию', subscription: 'подписка', pack: 'докупка', bonus: 'бонус', legacy: 'перенесено',
};
// За сколько дней до конца подписки предупреждать — клиента плашкой, менеджера списком.
// Пять дней: успеть написать, оплатить переводом и получить начисление до сгорания
export const RENEW_DAYS = 5;

// ——— Мой кабинет ———
// Раскладка по макету владельца 12.10: шапка с главной кнопкой → «Настройка кабинета» →
// баланс и профиль → безопасность и последние движения кредитов → тарифы карточками.
// Живые наведения (подъём кликабельных плашек) — только здесь, класс .account-page в styles.css

export const AccountPage: React.FC = () => {
  const {workspace, balance, enabled, isStaff} = useSession();

  if (!enabled) {
    return (
      <div className="page"><div className="card">
        <h1>Кабинет</h1>
        <p className="muted">Кабинеты работают только с базой. Здесь база не подключена — инструмент работает на одного владельца.</p>
      </div></div>
    );
  }

  const toPlans = () => document.getElementById('plans')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  return (
    <div className="page account-page">
      <header className="account-head">
        <div>
          <h1 className="page-title">Мой кабинет</h1>
          <p className="muted">{workspace?.name}{!isStaff && balance ? ` · ${balance.credits} кр.` : ''}</p>
        </div>
        {!isStaff && (
          <div className="account-head-actions">
            <SupportButton />
            <button className="btn primary" onClick={toPlans}>{balance?.subscription ? 'Продлить подписку' : 'Оформить подписку'}</button>
          </div>
        )}
      </header>
      {/* Вернулись из кассы (#/account/pay-…) — сверху, а не у тарифов: человек ждёт ответа сразу */}
      <PaymentReturn />
      <SetupCard />
      {/* Две колонки, а не сетка рядами: в ряду короткий баланс тянул за собой пустоту до низа
          профиля. На телефоне колонки растворяются (display: contents), порядок задаёт order */}
      <div className="account-grid">
        <div className="account-col">
          <section className="card acc-balance">
            <h2>{workspace?.name}</h2>
            {isStaff ? <p className="note">Сотрудники платформы генерируют без кредитов.</p> : <BalanceFacts balance={balance} />}
          </section>
          <div className="acc-security"><SecurityCard /></div>
        </div>
        <div className="account-col">
          <div className="acc-profile"><ProfileCard /></div>
        </div>
      </div>
      {!isStaff && <PlansSection />}
      <LedgerSection credits={balance?.credits} />
      {/* В самом низу и на всю ширину (владелец 12.10). Сотрудникам платформы не показываем:
          сервер их удаление и так не примет — платформа осталась бы без админа */}
      {!isStaff && <DangerZone />}
    </div>
  );
};

/**
 * «Написать в поддержку» — бот в Telegram с ключом кабинета (server/support.mjs): в рабочей группе
 * тема сразу с компанией, контактами и балансом. Кнопки нет, пока поддержка не включена на сервере.
 * Окно открываем сразу по нажатию и потом ведём на ссылку: Safari не откроет новую вкладку, если
 * между нажатием и открытием был запрос к серверу
 */
const SupportButton: React.FC = () => {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.offer().then((o) => setOn(Boolean(o.support))).catch(() => setOn(false)); }, []);
  if (!on) return null;
  const open = async () => {
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const {url} = await api.account.supportLink();
      if (url && tab) tab.location.href = url;
      else if (url) window.location.href = url;
      else tab?.close();
    } catch {
      tab?.close();
    } finally {
      setBusy(false);
    }
  };
  return <button className="btn" onClick={open} disabled={busy}>{busy ? 'Открываю…' : 'Написать в поддержку'}</button>;
};

/** Кредиты, подписка и ближайшее сгорание строками; партии — таблицей, если их несколько */
const BalanceFacts: React.FC<{balance: Balance | null}> = ({balance}) => {
  const {emailVerified} = useSession();
  const {config} = useConfig();
  if (!balance) return null;
  const sub = balance.subscription;
  return (
    <>
      <dl className="rows">
        <dt>Кредиты</dt>
        <dd><b>{balance.credits}</b> <span className="muted">· карусель {config.credits?.carousels ?? 1}, ролик {config.credits?.ads ?? 3}</span></dd>
        <dt>Подписка</dt>
        <dd>{sub ? <>«{sub.title}» до {day(sub.until)} <span className="muted">· {daysLeft(sub.until)} дн.</span></> : <span className="muted">нет</span>}</dd>
        {balance.nextExpiry && (
          <><dt>Ближайшее сгорание</dt><dd>{balance.nextExpiry.credits} кр. — {day(balance.nextExpiry.at)}</dd></>
        )}
      </dl>
      {/* Партии показываем, только когда их несколько: одна строка повторила бы факты выше */}
      {balance.lots.length > 1 && (
        <table className="table">
          <thead><tr><th>Откуда</th><th>Осталось</th><th>Действует до</th></tr></thead>
          <tbody>
            {balance.lots.map((l) => (
              <tr key={l.id}><td>{SOURCE[l.source]}</td><td>{l.remaining} из {l.credits}</td><td>{day(l.expiresAt)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {/* До подтверждения почты про это уже говорят полоса сверху и шаг «Почта» — здесь молчим.
          «Закончились» — только тому, кому кредиты уже дарили */}
      {balance.credits <= 0 && emailVerified && (
        <p className="notice warn">Кредиты закончились. Готовое можно смотреть и скачивать; новое — после подписки или докупки ниже.</p>
      )}
    </>
  );
};

/**
 * История кредитов внизу кабинета на всю ширину (владелец 12.10), страницами по 20 строк —
 * считает сервер. Остаток изменился (списание, возврат, пакет) — перечитываем текущую страницу
 */
const LedgerSection: React.FC<{credits?: number}> = ({credits}) => {
  const [data, setData] = useState<LedgerPage | null>(null);
  const [page, setPage] = useState(1);
  const top = useRef<HTMLElement>(null);
  useEffect(() => { api.ledger(page).then(setData).catch(() => setData(null)); }, [page, credits]);
  if (!data) return null;
  const go = (p: number) => { setPage(p); top.current?.scrollIntoView({behavior: 'smooth', block: 'start'}); };
  const from = (data.page - 1) * data.pageSize + 1;
  const to = from + data.rows.length - 1;
  return (
    <section className="card ledger-section" ref={top}>
      <div className="section-head">
        <h2>История кредитов</h2>
        {data.total > 0 && <span className="muted">{from}–{to} из {data.total}</span>}
      </div>
      {data.total === 0 ? <p className="muted">Пока пусто — здесь появятся начисления и списания.</p> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Когда</th><th>Что</th><th>Кредиты</th><th>Подробности</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{when(r.created_at)}</td>
                  <td>{KIND[r.kind]}{r.pipeline ? ` · ${WHAT[r.pipeline] ?? r.pipeline}` : ''}</td>
                  <td className={r.delta > 0 ? 'plus' : 'minus'}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                  <td className="muted">
                    {r.note || '—'}
                    {r.kind === 'grant' && r.expires_at && ` · до ${day(r.expires_at)}`}
                    {r.price_usd ? ` · ${usd(r.price_usd)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pages > 1 && (
        <div className="pager">
          <button className="btn ghost" disabled={data.page <= 1} onClick={() => go(data.page - 1)}>‹ Назад</button>
          <span>стр. {data.page} из {data.pages}</span>
          <button className="btn ghost" disabled={data.page >= data.pages} onClick={() => go(data.page + 1)}>Вперёд ›</button>
        </div>
      )}
    </section>
  );
};

export const KIND: Record<LedgerRow['kind'], string> = {grant: 'Начислено', charge: 'Списано', refund: 'Возврат', adjust: 'Правка'};
export const WHAT: Record<string, string> = {ads: 'Ролик', carousels: 'Карусель', reviews: 'Обзор'};
