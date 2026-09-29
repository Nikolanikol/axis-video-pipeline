// Кабинет компании и админка платформы.
//
// Кредиты покупаются вне системы: клиент пишет нам, платит, менеджер начисляет подписку на
// месяц или докупку. Поэтому кабинет — это остаток, подписка, прайс и кнопка «написать»,
// а админка — лиды, кому пора продлевать, и начисление.
import React, {useCallback, useEffect, useState} from 'react';
import {Balance, ClientRow, CreditLot, LedgerRow, Offer, Pack, Role, StaffRow, api} from './api';
import {day, daysLeft, useSession} from './auth';
import {Field} from './LotForm';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const SOURCE: Record<CreditLot['source'], string> = {
  signup: 'подарок за регистрацию', subscription: 'подписка', pack: 'докупка', bonus: 'бонус', legacy: 'перенесено',
};
// За сколько дней до конца подписки предупреждать — клиента плашкой, менеджера списком.
// Пять дней: успеть написать, оплатить переводом и получить начисление до сгорания
export const RENEW_DAYS = 5;

// ——— Мой кабинет ———

export const AccountPage: React.FC = () => {
  const {email, name, workspace, balance, enabled, isStaff} = useSession();

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
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([api.admin.packs(), api.admin.clients()])
      .then(([p, c]) => { setPacks(p); setClients(c); })
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(() => { if (enabled && isStaff) load(); }, [enabled, isStaff, load]);

  if (!enabled || !isStaff) {
    return <div className="page"><div className="card"><h1>Админка</h1><p className="muted">Только для сотрудников платформы, и только с подключённой базой.</p></div></div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Админка</h1>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <Clients clients={clients} packs={packs.filter((p) => p.active)} isAdmin={isAdmin} onChanged={load} onError={setError} />
      {isAdmin && (
        <div className="cards">
          <PackEditor packs={packs} onSaved={load} onError={setError} />
          <Staff onError={setError} />
        </div>
      )}
    </div>
  );
};

/**
 * Клиенты — они же лиды: новые сверху, с телефоном. «Генераций 0» у свежего — повод
 * позвонить и помочь; «кредитов 0» у активного — повод предложить пакет.
 */
const Clients: React.FC<{clients: ClientRow[]; packs: Pack[]; isAdmin: boolean; onChanged: () => void; onError: (e: string) => void}> = (
  {clients, packs, isAdmin, onChanged, onError},
) => {
  // Храним id, а не строку: после начисления список перечитывается, и карточка должна
  // показать новый остаток, а не снимок на момент открытия
  const [openId, setOpenId] = useState<string | null>(null);
  const open = clients.find((c) => c.id === openId) ?? null;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? clients.filter((c) => [c.name, c.person, c.email, c.phone].some((v) => v?.toLowerCase().includes(q))) : clients;
  // Кому пора продлевать: подписка кончается в ближайшие RENEW_DAYS дней — ближайшие сверху.
  // Отдельным блоком над списком: в общем списке новые лиды сверху, и эти строки утонули бы
  const renew = clients.filter((c) => c.plan_until && daysLeft(c.plan_until) <= RENEW_DAYS)
    .sort((a, b) => a.plan_until!.localeCompare(b.plan_until!));
  return (
    <>
      {renew.length > 0 && (
        <section className="card wide renew">
          <h2>Пора продлевать <span className="muted">{renew.length}</span></h2>
          <table className="table">
            <tbody>
              {renew.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}<br /><span className="muted">{c.person ?? ''} {c.phone ?? ''}</span></td>
                  <td>«{c.plan_title}» до {day(c.plan_until)}<br /><span className="muted">через {daysLeft(c.plan_until)} дн. · осталось {c.credits} кр.</span></td>
                  <td><button className="btn ghost" onClick={() => setOpenId(c.id)}>Открыть</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="card wide">
        <div className="row">
          <h2>Клиенты <span className="muted">{clients.length}</span></h2>
          <input placeholder="Поиск: имя, почта, телефон" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <table className="table">
          <thead><tr><th>Компания</th><th>Контакт</th><th>С нами с</th><th>Подписка</th><th>Кредитов</th><th>Генераций</th><th>Оплачено</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={open?.id === c.id ? 'active' : ''}>
                <td>{c.name}{c.platform_role && <span className="badge">{c.platform_role === 'admin' ? 'админ' : 'менеджер'}</span>}</td>
                <td>{c.person ?? '—'}<br /><span className="muted">{c.phone ?? ''} {c.email ?? ''}</span></td>
                <td>{day(c.created_at)}</td>
                <td>{c.plan_until ? <>{c.plan_title}<br /><span className="muted">до {day(c.plan_until)}</span></> : <span className="muted">—</span>}</td>
                <td>{c.credits}</td>
                <td>{c.generations}{c.last_generation && <span className="muted"> · {day(c.last_generation)}</span>}</td>
                <td>{c.paid_krw ? won(c.paid_krw) : <span className="muted">—</span>}</td>
                <td><button className="btn ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{open?.id === c.id ? 'Скрыть' : 'Открыть'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {open && <ClientCard key={open.id} client={open} packs={packs} isAdmin={isAdmin} onChanged={onChanged} onError={onError} />}
    </>
  );
};

const ClientCard: React.FC<{client: ClientRow; packs: Pack[]; isAdmin: boolean; onChanged: () => void; onError: (e: string) => void}> = (
  {client, packs, isAdmin, onChanged, onError},
) => {
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [bonus, setBonus] = useState(5);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const reload = useCallback(() => { api.admin.clientLedger(client.id).then(setRows).catch((e) => onError(message(e))); }, [client.id, onError]);
  useEffect(reload, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); setNote(''); reload(); onChanged(); } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };
  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    // Подтверждение: начисление — это деньги, которые клиент уже заплатил. Промах по строке
    // в длинном списке лидов начислил бы пакет не тому
    if (!window.confirm(`Начислить «${pack.title}» (${pack.credits} кр., ${won(pack.price_krw)}) компании «${client.name}»?`)) return;
    run(() => api.admin.grantPack(client.id, pack.id, note));
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
            {isAdmin && (
              <>
                <input type="number" min={1} value={bonus} onChange={(e) => setBonus(Number(e.target.value) || 1)} style={{width: 80}} />
                <button type="button" className="btn" disabled={busy}
                  onClick={() => run(() => api.admin.grantBonus(client.id, bonus, note))}>Бонус на год</button>
              </>
            )}
          </div>
        </form>
      </section>
      <Ledger rows={rows} title={`История «${client.name}»`} />
    </>
  );
};

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
        <table className="table">
          <thead><tr><th>Пакет</th><th>Вид</th><th>Кредиты</th><th>Цена</th><th>За кредит</th><th>Дней</th><th /></tr></thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'muted'}>
                <td>{p.title} <span className="muted">{p.id}</span></td><td>{p.kind === 'plan' ? 'подписка' : 'докупка'}</td><td>{p.credits}</td><td>{won(p.price_krw)}</td>
                <td className="muted">{won(Math.round(p.price_krw / p.credits))}</td><td>{p.valid_days}</td>
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
          <Field label="Цена, ₩"><input type="number" min={0} step={1000} value={pack.price_krw} onChange={(e) => set({price_krw: Number(e.target.value)})} /></Field>
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
