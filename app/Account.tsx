// Кабинет компании и админка платформы.
//
// Кредиты покупаются вне системы: клиент пишет нам, платит, менеджер начисляет подписку на
// месяц или докупку. Поэтому кабинет — это остаток, подписка, прайс и кнопка «написать»,
// а админка — лиды, кому пора продлевать, и начисление.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Balance, ClientFilter, ClientList, ClientQuery, ClientRow, ClientSort, CreditLot, LedgerRow, Offer, Pack, Role, StaffRow, api} from './api';
import {day, daysLeft, useSession} from './auth';
import {Field} from './LotForm';
import {useOnboarding} from './Onboarding';
import {href} from './router';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
// Откуда партия кредитов — подпись в кабинете. «pack» с 29.09 — докупка: пакеты на год
// стали докупкой к подписке (миграция 006)
const SOURCE: Record<CreditLot['source'], string> = {
  signup: 'подарок за регистрацию', subscription: 'подписка', pack: 'докупка', bonus: 'бонус', legacy: 'перенесено',
};
// За сколько дней до конца подписки предупреждать — клиента плашкой, менеджера списком.
// Пять дней: успеть написать, оплатить переводом и получить начисление до сгорания
export const RENEW_DAYS = 5;

// ——— Мой кабинет ———

export const AccountPage: React.FC = () => {
  const {email, name, workspace, balance, enabled, isStaff} = useSession();
  const onboarding = useOnboarding();

  if (!enabled) {
    return (
      <div className="page"><div className="card">
        <h1>Кабинет</h1>
        <p className="muted">Кабинеты работают только с базой. Здесь база не подключена — инструмент работает на одного владельца.</p>
      </div></div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Мой кабинет</h1>
      <div className="cards">
        <section className="card">
          <h2>{workspace?.name}</h2>
          <p className="muted">{[name, email].filter(Boolean).join(' · ')}</p>
          {isStaff ? <p className="note">Сотрудники платформы генерируют без кредитов.</p> : <BalanceFacts balance={balance} />}
          {/* Скрытый список «Первые шаги» возвращается отсюда — так обещает сам список */}
          {!isStaff && <p className="hint"><a className="link" href={href('start')} onClick={onboarding.show}>Первые шаги</a> — почта, профиль, бренд, первый ролик</p>}
        </section>
        {!isStaff && <OfferCard />}
      </div>
      <Ledger rows={null} credits={balance?.credits} />
    </div>
  );
};

const BalanceFacts: React.FC<{balance: Balance | null}> = ({balance}) => {
  if (!balance) return null;
  return (
    <>
      <dl className="facts">
        <dt>Кредитов</dt><dd><b>{balance.credits}</b> <span className="muted">· карусель 1, рекламный ролик 3</span></dd>
        <dt>Подписка</dt>
        <dd>{balance.subscription
          ? <>«{balance.subscription.title}» до {day(balance.subscription.until)} <span className="muted">· через {daysLeft(balance.subscription.until)} дн.</span></>
          : <span className="muted">нет — напишите нам, подключим</span>}</dd>
        {balance.nextExpiry && (
          <><dt>Ближайшее сгорание</dt><dd>{balance.nextExpiry.credits} кр. — {day(balance.nextExpiry.at)} <span className="muted">· через {daysLeft(balance.nextExpiry.at)} дн.</span></dd></>
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
      {balance.credits <= 0 && (
        <p className="auth-error">Кредиты закончились. Готовое можно смотреть и скачивать; чтобы создавать новое — продлите подписку или докупите кредиты.</p>
      )}
    </>
  );
};

// Прайс и куда писать. Оплата — вне системы, поэтому здесь ссылка на мессенджер, а не касса.
// Сначала подписки (основной способ), ниже докупка — на случай, если месяца не хватило
const OfferCard: React.FC = () => {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => { api.offer().then(setOffer).catch(() => setOffer(null)); }, []);
  if (!offer) return null;
  const {whatsapp, telegram, email} = offer.contacts;
  const plans = offer.packs.filter((p) => p.kind === 'plan');
  const topups = offer.packs.filter((p) => p.kind === 'topup');
  return (
    <section className="card">
      <h2>Подписка</h2>
      {plans.length > 0 && <PriceTable packs={plans} head="Тариф" perMonth />}
      <p className="note">Кредиты подписки действуют месяц и сгорают в конце — чем больше тариф, тем дешевле кредит.</p>
      {topups.length > 0 && (
        <>
          <h2>Не хватило на месяц</h2>
          <PriceTable packs={topups} head="Докупка" />
          <p className="note">Докупленные кредиты сгорают вместе с подпиской.</p>
        </>
      )}
      <p className="note">Напишите нам — пришлём реквизиты и подключим.</p>
      <div className="btn-row">
        {whatsapp && <a className="btn primary" href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {telegram && <a className="btn" href={`https://t.me/${telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Telegram</a>}
        {email && <a className="btn" href={`mailto:${email}`}>{email}</a>}
      </div>
    </section>
  );
};

// Таблица цен с ценой за кредит: по ней клиент видит, что больший тариф выгоднее
const PriceTable: React.FC<{packs: Pack[]; head: string; perMonth?: boolean}> = ({packs, head, perMonth}) => (
  <table className="table">
    <thead><tr><th>{head}</th><th>Кредитов</th><th>{perMonth ? 'В месяц' : 'Цена'}</th><th>За кредит</th></tr></thead>
    <tbody>
      {packs.map((p) => (
        <tr key={p.id}>
          <td>{p.title}</td><td>{p.credits}</td><td>{won(p.price_krw)}</td>
          <td className="muted">{won(Math.round(p.price_krw / p.credits))}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const KIND: Record<LedgerRow['kind'], string> = {grant: 'Начислено', charge: 'Списано', refund: 'Возврат', adjust: 'Правка'};
const WHAT: Record<string, string> = {ads: 'Ролик', carousels: 'Карусель', reviews: 'Обзор'};

/**
 * Журнал кредитов: каждое движение строкой. На вопрос «почему осталось 3» ответ здесь.
 * rows — готовый журнал (админка смотрит чужой); null — загрузить свой.
 */
const Ledger: React.FC<{rows: LedgerRow[] | null; credits?: number; title?: string}> = ({rows: given, credits, title}) => {
  const [own, setOwn] = useState<LedgerRow[] | null>(null);
  // credits в зависимостях: остаток изменился (списание, возврат, пакет) — журнал тоже
  useEffect(() => { if (!given) api.ledger().then(setOwn).catch(() => setOwn([])); }, [given, credits]);
  const rows = given ?? own;
  if (!rows?.length) return null;
  return (
    <section className="card wide">
      <h2>{title ?? 'История кредитов'}</h2>
      <table className="table">
        <thead><tr><th>Когда</th><th>Что</th><th>Кредиты</th><th>Подробности</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{when(r.created_at)}</td>
              <td>{KIND[r.kind]}{r.pipeline ? ` · ${WHAT[r.pipeline] ?? r.pipeline}` : ''}</td>
              <td className={r.delta > 0 ? 'plus' : 'minus'}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
              <td className="muted">
                {r.note || '—'}
                {r.kind === 'grant' && r.expires_at && ` · до ${day(r.expires_at)}`}
                {r.price_krw ? ` · ${won(r.price_krw)}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

// ——— Админка ———
// Менеджер видит лидов и начисляет пакеты. Прайс, бонусы и сотрудники — только у админа

export const AdminPage: React.FC = () => {
  const {isAdmin, isStaff, enabled} = useSession();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [error, setError] = useState('');

  const loadPacks = useCallback(() => { api.admin.packs().then(setPacks).catch((e) => setError(message(e))); }, []);
  useEffect(() => { if (enabled && isStaff) loadPacks(); }, [enabled, isStaff, loadPacks]);

  if (!enabled || !isStaff) {
    return <div className="page"><div className="card"><h1>Админка</h1><p className="muted">Только для сотрудников платформы, и только с подключённой базой.</p></div></div>;
  }

  // Прайс — сбоку и закреплён (владелец 11.10): справа было пусто, а до прайса под длинным
  // списком клиентов приходилось листать. Менеджеру прайс не показываем — колонка одна
  return (
    <div className={`page admin-page${isAdmin ? ' with-side' : ''}`}>
      <h1 className="page-title">Админка</h1>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="admin-layout">
        <div className="admin-main">
          <Clients packs={packs.filter((p) => p.active)} isAdmin={isAdmin} onError={setError} />
          {isAdmin && <Staff onError={setError} />}
        </div>
        {isAdmin && (
          <aside className="admin-side">
            <PackEditor packs={packs} onSaved={loadPacks} onError={setError} />
          </aside>
        )}
      </div>
    </div>
  );
};

// Быстрые фильтры: подпись и подсказка. Порядок — как CLIENT_FILTERS в server/accounts.mjs
const FILTERS: {id: ClientFilter; label: string; hint: string}[] = [
  {id: 'all', label: 'Все', hint: ''},
  {id: 'new', label: 'Новые', hint: 'зарегистрировались за 7 дней'},
  {id: 'trial', label: 'Без оплат', hint: 'ни разу не платили — лиды'},
  {id: 'active', label: 'С подпиской', hint: 'подписка действует'},
  {id: 'renew', label: 'Пора продлевать', hint: `подписка кончается в ближайшие ${RENEW_DAYS} дн.`},
  {id: 'lapsed', label: 'Подписка кончилась', hint: 'платили, но не продлили'},
  {id: 'idle', label: 'Затихли', hint: 'не генерировали 14 дней или ни разу'},
  {id: 'unverified', label: 'Почта не подтверждена', hint: 'бесплатные кредиты не получили'},
];
const SORTS: {id: ClientSort; label: string}[] = [
  {id: 'new', label: 'сначала новые'},
  {id: 'seen', label: 'кто недавно заходил'},
  {id: 'generated', label: 'кто недавно генерировал'},
  {id: 'paid', label: 'больше оплатили'},
  {id: 'credits', label: 'больше кредитов'},
  {id: 'plan', label: 'подписка кончается раньше'},
];
// «Заходил»: свежее — словами, давнее — датой. Менеджеру важно «вчера» против «месяц назад»,
// а не точное время
const ago = (iso: string | null) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days < 1 ? 'сегодня' : days < 2 ? 'вчера' : days < 30 ? `${days} дн. назад` : day(iso);
};

/**
 * Клиенты — они же лиды. Поиск, фильтры и страницы считает сервер (listClients): список
 * растёт, и держать его целиком в браузере — тормоза на каждой букве. «Генераций 0» у
 * свежего — повод позвонить и помочь; «кредитов 0» у активного — повод предложить пакет.
 */
const Clients: React.FC<{packs: Pack[]; isAdmin: boolean; onError: (e: string) => void}> = ({packs, isAdmin, onError}) => {
  const [query, setQuery] = useState<ClientQuery>({q: '', filter: 'all', sort: 'new', page: 1});
  const [typed, setTyped] = useState('');
  const [list, setList] = useState<ClientList | null>(null);
  // Храним id, а не строку: после начисления список перечитывается, и карточка должна
  // показать новый остаток, а не снимок на момент открытия
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<ClientQuery>) => setQuery((cur) => ({...cur, page: 1, ...patch}));

  // Поиск — после паузы в наборе: запрос на каждую букву гонял бы базу впустую
  useEffect(() => {
    // Тот же текст (пробел в конце, первый запуск) — не трогаем: новая страница 1 и лишний запрос
    const t = setTimeout(() => setQuery((cur) => (cur.q === typed.trim() ? cur : {...cur, q: typed.trim(), page: 1})), 300);
    return () => clearTimeout(t);
  }, [typed]);

  // Ответы могут прийти не по порядку (быстро набрал и стёр) — показываем только последний
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    api.admin.clients(query).then((l) => { if (n === seq.current) setList(l); }).catch((e) => onError(message(e)));
  }, [query, onError]);
  useEffect(load, [load]);

  const rows = list?.rows ?? [];
  // Карточка открыта из «Пора продлевать», а в текущей странице такого нет — показываем над списком
  const openOutside = openId && !rows.some((c) => c.id === openId) ? list?.renew.find((c) => c.id === openId) : undefined;
  const from = list && list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = list ? Math.min(list.page * list.pageSize, list.total) : 0;
  const card = (c: ClientRow) => <ClientCard key={c.id} client={c} packs={packs} isAdmin={isAdmin} onChanged={load} onError={onError} />;

  return (
    <>
      {list && list.renew.length > 0 && (
        <section className="card wide renew">
          <h2>Пора продлевать <span className="muted">{list.renew.length}</span></h2>
          <table className="table">
            <tbody>
              {list.renew.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}<br /><span className="muted">{c.person ?? ''} {c.phone ?? ''}</span></td>
                  <td>«{c.plan_title}» до {day(c.plan_until)}<br /><span className="muted">через {daysLeft(c.plan_until)} дн. · осталось {c.credits} кр.</span></td>
                  <td><button className="btn ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? 'Скрыть' : 'Открыть'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {openOutside && card(openOutside)}
      <section className="card wide clients">
        <div className="clients-head">
          <h2>Клиенты <span className="muted">{list?.counts.all ?? ''}</span></h2>
          <input type="search" placeholder="Поиск: компания, имя, почта, телефон" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <select value={query.sort} onChange={(e) => set({sort: e.target.value as ClientSort})} aria-label="Сортировка">
            {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" title={f.hint} className={`chip${query.filter === f.id ? ' active' : ''}`}
              onClick={() => set({filter: f.id})}>
              {f.label} <span className="chip-n">{list?.counts[f.id] ?? ''}</span>
            </button>
          ))}
        </div>
        <table className="table">
          <thead><tr><th>Компания</th><th>Контакт</th><th>С нами с</th><th>Заходил</th><th>Генерации</th><th>Подписка</th><th>Кредитов</th><th>Оплачено</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <React.Fragment key={c.id}>
                <tr className={openId === c.id ? 'active' : ''}>
                  <td>
                    {c.name}
                    {c.platform_role && <span className="badge">{c.platform_role === 'admin' ? 'админ' : 'менеджер'}</span>}
                    {!c.verified && <><br /><span className="muted">почта не подтверждена</span></>}
                  </td>
                  <td>{c.person ?? '—'}<br /><span className="muted">{c.phone ?? ''} {c.email ?? ''}</span></td>
                  <td>{day(c.created_at)}</td>
                  <td>{ago(c.last_seen_at)}</td>
                  <td>
                    {c.generations}{c.generations > 0 && <span className="muted"> · за 30 дн. {c.generations_30d}</span>}
                    {c.last_generation && <><br /><span className="muted">последняя {ago(c.last_generation)}</span></>}
                  </td>
                  <td>{c.plan_until ? <>{c.plan_title}<br /><span className="muted">до {day(c.plan_until)}</span></>
                    : <span className="muted">{c.had_plan ? 'кончилась' : '—'}</span>}</td>
                  <td>{c.credits}</td>
                  <td>{c.paid_krw ? won(c.paid_krw) : <span className="muted">—</span>}</td>
                  <td><button className="btn ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? 'Скрыть' : 'Открыть'}</button></td>
                </tr>
                {/* Карточка — прямо под строкой: внизу длинной страницы её приходилось искать */}
                {openId === c.id && <tr className="client-open"><td colSpan={9}>{card(c)}</td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {list && !rows.length && <p className="muted">{query.q ? `По «${query.q}» никого.` : 'Здесь пока никого.'}</p>}
        {list && list.total > 0 && (
          <div className="pager">
            <span className="muted">{from}–{to} из {list.total}</span>
            {list.pages > 1 && (
              <>
                <button className="btn ghost" disabled={list.page <= 1} onClick={() => set({page: list.page - 1})}>‹ Назад</button>
                <span>стр. {list.page} из {list.pages}</span>
                <button className="btn ghost" disabled={list.page >= list.pages} onClick={() => set({page: list.page + 1})}>Вперёд ›</button>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
};

const ClientCard: React.FC<{client: ClientRow; packs: Pack[]; isAdmin: boolean; onChanged: () => void; onError: (e: string) => void}> = (
  {client, packs, isAdmin, onChanged, onError},
) => {
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [bonus, setBonus] = useState(5);
  const [bonusNote, setBonusNote] = useState('');
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const reload = useCallback(() => { api.admin.clientLedger(client.id).then(setRows).catch((e) => onError(message(e))); }, [client.id, onError]);
  useEffect(reload, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); setNote(''); setBonusNote(''); reload(); onChanged(); } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };
  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    // Подтверждение: начисление — это деньги, которые клиент уже заплатил. Промах по строке
    // в длинном списке лидов начислил бы пакет не тому
    if (!window.confirm(`Начислить «${pack.title}» (${pack.credits} кр., ${won(pack.price_krw)}) компании «${client.name}»?`)) return;
    run(() => api.admin.grantPack(client.id, pack.id, note));
  };
  const gift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusNote.trim()) return;
    // Подтверждение, как у начисления: промах по клиенту или лишний ноль в числе — это
    // бесплатные кредиты не тому
    if (!window.confirm(`Подарить ${bonus} кр. компании «${client.name}» на год, бесплатно?\nЗа что: ${bonusNote.trim()}`)) return;
    run(() => api.admin.grantBonus(client.id, bonus, bonusNote.trim()));
  };

  return (
    <>
      <section className="card wide">
        <form className="form" onSubmit={grant}>
          <h2>{client.name} <span className="muted">{client.credits} кр.</span></h2>
          <div className="row">
            <Field label="Что начислить" hint={pack?.kind === 'plan'
              ? (client.plan_until ? `продлится до ${day(addDays(client.plan_until, pack.valid_days))}` : `месяц с сегодняшнего дня`)
              : (client.plan_until ? `сгорит вместе с подпиской ${day(client.plan_until)}` : `подписки нет — сгорит через ${pack?.valid_days ?? 30} дн.`)}>
              <select value={pack?.id} onChange={(e) => setPackId(e.target.value)}>
                <optgroup label="Подписка на месяц">
                  {packs.filter((p) => p.kind === 'plan').map((p) => <option key={p.id} value={p.id}>{p.title} · {p.credits} кр. · {won(p.price_krw)}</option>)}
                </optgroup>
                <optgroup label="Докупка">
                  {packs.filter((p) => p.kind === 'topup').map((p) => <option key={p.id} value={p.id}>{p.title} · {won(p.price_krw)}</option>)}
                </optgroup>
              </select>
            </Field>
            <Field label="Заметка" hint="как оплатил, номер перевода"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !pack}>{pack?.kind === 'plan' ? 'Начислить подписку' : 'Начислить докупку'}</button>
          </div>
        </form>
        {/* Подарок — отдельной строкой, не рядом с «Начислить»: владелец 11.10 принял безымянное
            «Бонус на год» с цифрой за часть подписки. Причина обязательна — её же требует сервер */}
        {isAdmin && (
          <form className="form gift" onSubmit={gift}>
            <h3>Подарить кредиты</h3>
            <p className="hint">Бесплатно, вне прайса: компенсация, акция. Живут год и не сгорают вместе с подпиской, в «Оплачено» не попадают.</p>
            <div className="row">
              <Field label="Кредитов"><input type="number" min={1} value={bonus} onChange={(e) => setBonus(Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></Field>
              <Field label="За что" hint="будет в истории клиента"><input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} placeholder="например, упал рендер 10.10" required /></Field>
            </div>
            <button className="btn" disabled={busy || !bonusNote.trim()}>Подарить {bonus} кр.</button>
          </form>
        )}
      </section>
      <Ledger rows={rows} title={`История «${client.name}»`} />
    </>
  );
};

// Новый пакет в прайсе по умолчанию — подписка «Базовый»: чаще всего добавляют тариф, а не докупку
const EMPTY_PACK: Pack = {id: '', title: '', credits: 30, price_krw: 49000, valid_days: 30, active: true, sort: 0, kind: 'plan'};
// Дата через n дней — подсказка менеджеру, до какого числа продлится подписка. Считает
// сервер (от конца действующей подписки); здесь только то же правило для подписи
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * 864e5).toISOString();

const PackEditor: React.FC<{packs: Pack[]; onSaved: () => void; onError: (e: string) => void}> = ({packs, onSaved, onError}) => {
  const [pack, setPack] = useState<Pack>(EMPTY_PACK);
  // Правка существующего пакета: id не меняется. Новый с занятым id не сохраняем —
  // сервер молча перезаписал бы другой пакет
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => { setPack(EMPTY_PACK); setEditing(false); };
  const set = (patch: Partial<Pack>) => setPack({...pack, ...patch});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && packs.some((p) => p.id === pack.id)) return onError(`Пакет с id «${pack.id}» уже есть — нажмите «Изменить» у него`);
    setBusy(true);
    try { await api.admin.savePack(pack); reset(); onSaved(); } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <form className="form" onSubmit={save}>
        <h2>Подписки и докупка</h2>
        {/* Таблица в узкой боковой колонке: вид, срок и цена за кредит — второй строкой */}
        <table className="table">
          <thead><tr><th>Пакет</th><th>Кредиты</th><th>Цена</th><th /></tr></thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.id} className={`${p.active ? '' : 'muted'}${editing && pack.id === p.id ? ' active' : ''}`}>
                <td>{p.title} <span className="muted">{p.id}</span><br /><span className="muted">{p.kind === 'plan' ? 'подписка' : 'докупка'} · {p.valid_days} дн.</span></td>
                <td>{p.credits}</td>
                <td>{won(p.price_krw)}<br /><span className="muted">{won(Math.round(p.price_krw / p.credits))} за кр.</span></td>
                <td><button type="button" className="btn ghost" onClick={() => { setPack(p); setEditing(true); }}>Изменить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <Field label="id" hint="латиницей, не меняется"><input value={pack.id} onChange={(e) => set({id: e.target.value.toLowerCase()})} disabled={editing} required /></Field>
          <Field label="Название"><input value={pack.title} onChange={(e) => set({title: e.target.value})} required /></Field>
          <Field label="Вид">
            <select value={pack.kind} onChange={(e) => set({kind: e.target.value as Pack['kind']})}>
              <option value="plan">подписка на месяц</option>
              <option value="topup">докупка</option>
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Кредитов"><input type="number" min={1} value={pack.credits} onChange={(e) => set({credits: Number(e.target.value)})} /></Field>
          {/* step={1}: любая сумма в вонах. Был step={1000}, и браузер не давал сохранить 24 900 —
              «ближайшие допустимые 24 000 и 25 000» (владелец 04.10). Сервер всегда принимал любое целое */}
          <Field label="Цена, ₩"><input type="number" min={0} step={1} value={pack.price_krw} onChange={(e) => set({price_krw: Number(e.target.value)})} /></Field>
          <Field label="Действует, дней" hint="у подписки — длина месяца; у докупки — если подписки нет"><input type="number" min={1} value={pack.valid_days} onChange={(e) => set({valid_days: Number(e.target.value)})} /></Field>
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={pack.active} onChange={(e) => set({active: e.target.checked})} /> продаётся</label>
        </div>
        <p className="hint">Правка цены не меняет уже начисленное: цена записывается в партию в момент начисления.</p>
        <div className="btn-row">
          <button className="btn primary" disabled={busy}>{editing ? 'Сохранить пакет' : 'Добавить пакет'}</button>
          {editing && <button type="button" className="btn ghost" onClick={reset}>Новый</button>}
        </div>
      </form>
    </section>
  );
};

const Staff: React.FC<{onError: (e: string) => void}> = ({onError}) => {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState('');
  useEffect(() => { api.admin.staff().then(setStaff).catch((e) => onError(message(e))); }, [onError]);
  const set = async (mail: string, role: Role) => {
    try { setStaff(await api.admin.setRole(mail, role)); setEmail(''); } catch (err) { onError(message(err)); }
  };
  return (
    <section className="card">
      <form className="form" onSubmit={(e) => { e.preventDefault(); set(email, 'manager'); }}>
        <h2>Сотрудники</h2>
        <table className="table">
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name ?? '—'}<br /><span className="muted">{s.email}</span></td>
                <td>{s.platform_role === 'admin' ? 'админ' : 'менеджер'}</td>
                <td>{s.platform_role === 'manager' && <button type="button" className="btn ghost" onClick={() => set(s.email, null)}>Снять</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Field label="Сделать менеджером" hint="человек сначала регистрируется сам — пароль остаётся только у него">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="почта" required />
        </Field>
        <p className="hint">Менеджер видит клиентов и начисляет подписки и докупку; прайс, бонусы и сотрудников не меняет.</p>
        <button className="btn primary">Назначить</button>
      </form>
    </section>
  );
};
