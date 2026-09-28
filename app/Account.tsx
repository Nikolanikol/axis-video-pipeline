// Кабинет компании и админка платформы.
//
// Кредиты покупаются вне системы: клиент пишет нам, платит, менеджер начисляет пакет.
// Поэтому кабинет — это остаток, прайс и кнопка «написать», а админка — лиды и начисление.
import React, {useCallback, useEffect, useState} from 'react';
import {Balance, ClientRow, CreditLot, LedgerRow, Offer, Pack, Role, StaffRow, api} from './api';
import {day, daysLeft, useSession} from './auth';
import {Field} from './LotForm';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const won = (n: number) => `₩${n.toLocaleString('ru-RU')}`;
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const SOURCE: Record<CreditLot['source'], string> = {signup: 'подарок за регистрацию', pack: 'пакет', bonus: 'бонус', legacy: 'перенесено'};

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
        <p className="auth-error">Кредиты закончились. Готовое можно смотреть и скачивать; чтобы создавать новое — пополните пакетом.</p>
      )}
    </>
  );
};

// Прайс и куда писать. Оплата — вне системы, поэтому здесь ссылка на мессенджер, а не касса
const OfferCard: React.FC = () => {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => { api.offer().then(setOffer).catch(() => setOffer(null)); }, []);
  if (!offer) return null;
  const {whatsapp, telegram, email} = offer.contacts;
  return (
    <section className="card">
      <h2>Пополнить кредиты</h2>
      {offer.packs.length > 0 && (
        <table className="table">
          <thead><tr><th>Пакет</th><th>Кредитов</th><th>Цена</th><th>За кредит</th></tr></thead>
          <tbody>
            {offer.packs.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td><td>{p.credits}</td><td>{won(p.price_krw)}</td>
                <td className="muted">{won(Math.round(p.price_krw / p.credits))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note">Кредиты пакета действуют {offer.packs[0] ? Math.round(offer.packs[0].valid_days / 30) : 12} мес. Напишите нам — пришлём реквизиты и начислим пакет.</p>
      <div className="btn-row">
        {whatsapp && <a className="btn primary" href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {telegram && <a className="btn" href={`https://t.me/${telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Telegram</a>}
        {email && <a className="btn" href={`mailto:${email}`}>{email}</a>}
      </div>
    </section>
  );
};

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
  return (
    <>
      <section className="card wide">
        <div className="row">
          <h2>Клиенты <span className="muted">{clients.length}</span></h2>
          <input placeholder="Поиск: имя, почта, телефон" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <table className="table">
          <thead><tr><th>Компания</th><th>Контакт</th><th>С нами с</th><th>Кредитов</th><th>Генераций</th><th>Оплачено</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={open?.id === c.id ? 'active' : ''}>
                <td>{c.name}{c.platform_role && <span className="badge">{c.platform_role === 'admin' ? 'админ' : 'менеджер'}</span>}</td>
                <td>{c.person ?? '—'}<br /><span className="muted">{c.phone ?? ''} {c.email ?? ''}</span></td>
                <td>{day(c.created_at)}</td>
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
            <Field label="Пакет">
              <select value={pack?.id} onChange={(e) => setPackId(e.target.value)}>
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.credits} кр. · {won(p.price_krw)} · {p.valid_days} дн.</option>)}
              </select>
            </Field>
            <Field label="Заметка" hint="как оплатил, номер перевода"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !pack}>Начислить пакет</button>
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

const EMPTY_PACK: Pack = {id: '', title: '', credits: 100, price_krw: 100000, valid_days: 365, active: true, sort: 0};

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
        <h2>Пакеты</h2>
        <table className="table">
          <thead><tr><th>Пакет</th><th>Кредиты</th><th>Цена</th><th>За кредит</th><th>Дней</th><th /></tr></thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'muted'}>
                <td>{p.title} <span className="muted">{p.id}</span></td><td>{p.credits}</td><td>{won(p.price_krw)}</td>
                <td className="muted">{won(Math.round(p.price_krw / p.credits))}</td><td>{p.valid_days}</td>
                <td><button type="button" className="btn ghost" onClick={() => { setPack(p); setEditing(true); }}>Изменить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <Field label="id" hint="латиницей, не меняется"><input value={pack.id} onChange={(e) => set({id: e.target.value.toLowerCase()})} disabled={editing} required /></Field>
          <Field label="Название"><input value={pack.title} onChange={(e) => set({title: e.target.value})} required /></Field>
        </div>
        <div className="row">
          <Field label="Кредитов"><input type="number" min={1} value={pack.credits} onChange={(e) => set({credits: Number(e.target.value)})} /></Field>
          <Field label="Цена, ₩"><input type="number" min={0} step={1000} value={pack.price_krw} onChange={(e) => set({price_krw: Number(e.target.value)})} /></Field>
          <Field label="Действует, дней"><input type="number" min={1} value={pack.valid_days} onChange={(e) => set({valid_days: Number(e.target.value)})} /></Field>
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
        <p className="hint">Менеджер видит клиентов и начисляет пакеты; прайс, бонусы и сотрудников не меняет.</p>
        <button className="btn primary">Назначить</button>
      </form>
    </section>
  );
};
