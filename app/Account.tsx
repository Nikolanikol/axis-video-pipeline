// Кабинет компании и админка владельца платформы.
import React, {useCallback, useEffect, useState} from 'react';
import {ActivationCode, Plan, WorkspaceRow, api} from './api';
import {day, daysLeft, useSession} from './auth';
import {Field} from './LotForm';

const PIPELINE_TITLES: Record<string, string> = {ads: 'Реклама', reviews: 'Обзоры', carousels: 'Карусели'};
const pipelinesText = (list: string[] | undefined) => (list ?? []).map((p) => PIPELINE_TITLES[p] ?? p).join(', ') || '—';
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ——— Мой кабинет ———

export const AccountPage: React.FC = () => {
  const {email, workspace, access, setAccess, enabled} = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ok: boolean; text: string} | null>(null);

  if (!enabled) {
    return (
      <div className="page"><div className="card">
        <h1>Кабинет</h1>
        <p className="muted">Кабинеты работают с базой SMMAKER. Здесь база не подключена — инструмент работает на одного владельца.</p>
      </div></div>
    );
  }

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const a = await api.redeem(code);
      setAccess(a);
      setCode('');
      setNote({ok: true, text: `Код принят — доступ до ${day(a.paidUntil)}`});
    } catch (err) {
      setNote({ok: false, text: message(err)});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Мой кабинет</h1>
      <div className="cards">
        <section className="card">
          <h2>{workspace?.name}</h2>
          <p className="muted">{email}</p>
          {access?.active ? (
            <dl className="facts">
              <dt>Тариф</dt><dd>{access.plan?.title}</dd>
              <dt>Разделы</dt><dd>{pipelinesText(access.plan?.pipelines)}</dd>
              <dt>Текущий период</dt><dd>{day(access.periodStart)} — {day(access.periodEnd)}</dd>
              <dt>Оплачено до</dt><dd>{day(access.paidUntil)} <span className="muted">· {daysLeft(access.paidUntil)} дн.</span></dd>
              <dt>Кредитов</dt><dd><b>{access.credits}</b> <span className="muted">остаток сгорает в конце периода</span></dd>
            </dl>
          ) : (
            <p className="auth-error">
              Доступ {access?.paidUntil ? `закончился ${day(access.paidUntil)}` : 'не активирован'}.
              Готовое можно смотреть и скачивать; чтобы создавать новое, продлите кодом.
            </p>
          )}
        </section>
        <section className="card">
          <form className="form" onSubmit={redeem}>
            <h2>Продлить кодом</h2>
            <p className="note">Новый период начнётся с конца уже оплаченного — ранняя оплата не сгорает.</p>
            <Field label="Код активации">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SMM-XXXX-XXXX-XXXX" autoComplete="off" required />
            </Field>
            {note && <div className={note.ok ? 'auth-ok' : 'auth-error'}>{note.text}</div>}
            <button className="btn primary" disabled={busy || !code.trim()}>Применить код</button>
          </form>
        </section>
      </div>
    </div>
  );
};

// ——— Админка ———

const EMPTY_PLAN: Plan = {id: '', title: '', credits: 30, days: 30, pipelines: ['ads', 'carousels'], active: true};

export const AdminPage: React.FC = () => {
  const {isAdmin, enabled} = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [clients, setClients] = useState<WorkspaceRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([api.admin.plans(), api.admin.codes(), api.admin.workspaces()])
      .then(([p, c, w]) => { setPlans(p); setCodes(c); setClients(w); })
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(() => { if (enabled && isAdmin) load(); }, [enabled, isAdmin, load]);

  if (!enabled || !isAdmin) {
    return <div className="page"><div className="card"><h1>Админка</h1><p className="muted">Только для владельца платформы, и только с базой SMMAKER.</p></div></div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Админка</h1>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="cards">
        <IssueCodes plans={plans.filter((p) => p.active)} onIssued={load} onError={setError} />
        <PlanEditor plans={plans} onSaved={load} onError={setError} />
      </div>
      <Clients clients={clients} onChanged={load} onError={setError} />
      <Codes codes={codes} />
    </div>
  );
};

const IssueCodes: React.FC<{plans: Plan[]; onIssued: () => void; onError: (e: string) => void}> = ({plans, onIssued, onError}) => {
  const [planId, setPlanId] = useState('');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [issued, setIssued] = useState<ActivationCode[]>([]);
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    try {
      setIssued(await api.admin.createCodes(plan.id, count, note));
      setNote('');
      onIssued();
    } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };
  const text = issued.map((c) => c.code).join('\n');

  return (
    <section className="card">
      <form className="form" onSubmit={issue}>
        <h2>Выдать код</h2>
        {!plans.length ? <p className="note">Сначала заведите тариф — справа.</p> : (
          <>
            <div className="row">
              <Field label="Тариф">
                <select value={plan?.id} onChange={(e) => setPlanId(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.credits} кр. · {p.days} дн.</option>)}
                </select>
              </Field>
              <Field label="Сколько кодов"><input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} /></Field>
            </div>
            <Field label="Заметка" hint="кому и за что — видно только вам"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className="btn primary" disabled={busy}>Выдать</button>
          </>
        )}
        {issued.length > 0 && (
          <div className="issued">
            <pre>{text}</pre>
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(text)}>Скопировать</button>
            <p className="hint">Отправьте клиенту. Регистрация — на странице входа, кнопка «Есть код активации».</p>
          </div>
        )}
      </form>
    </section>
  );
};

const PlanEditor: React.FC<{plans: Plan[]; onSaved: () => void; onError: (e: string) => void}> = ({plans, onSaved, onError}) => {
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  // Правка существующего тарифа: id не меняется. Новый с занятым id не сохраняем —
  // сервер молча перезаписал бы чужой тариф
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => { setPlan(EMPTY_PLAN); setEditing(false); };
  const set = (patch: Partial<Plan>) => setPlan({...plan, ...patch});
  const toggle = (id: string) => set({pipelines: plan.pipelines.includes(id) ? plan.pipelines.filter((p) => p !== id) : [...plan.pipelines, id]});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && plans.some((p) => p.id === plan.id)) return onError(`Тариф с id «${plan.id}» уже есть — нажмите «Изменить» у него`);
    setBusy(true);
    try { await api.admin.savePlan(plan); reset(); onSaved(); } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <form className="form" onSubmit={save}>
        <h2>Тарифы</h2>
        {plans.length > 0 && (
          <table className="table">
            <thead><tr><th>Тариф</th><th>Кредиты</th><th>Дней</th><th>Разделы</th><th /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'muted'}>
                  <td>{p.title} <span className="muted">{p.id}</span></td><td>{p.credits}</td><td>{p.days}</td>
                  <td>{pipelinesText(p.pipelines)}</td>
                  <td><button type="button" className="btn ghost" onClick={() => { setPlan(p); setEditing(true); }}>Изменить</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <Field label="id" hint="латиницей, не меняется"><input value={plan.id} onChange={(e) => set({id: e.target.value.toLowerCase()})} disabled={editing} required /></Field>
          <Field label="Название"><input value={plan.title} onChange={(e) => set({title: e.target.value})} required /></Field>
        </div>
        <div className="row">
          <Field label="Кредитов на период"><input type="number" min={0} value={plan.credits} onChange={(e) => set({credits: Number(e.target.value)})} /></Field>
          <Field label="Дней в периоде"><input type="number" min={1} value={plan.days} onChange={(e) => set({days: Number(e.target.value)})} /></Field>
        </div>
        <div className="checks">
          {Object.entries(PIPELINE_TITLES).map(([id, title]) => (
            <label key={id}><input type="checkbox" checked={plan.pipelines.includes(id)} onChange={() => toggle(id)} /> {title}</label>
          ))}
          <label><input type="checkbox" checked={plan.active} onChange={(e) => set({active: e.target.checked})} /> продаётся</label>
        </div>
        <p className="hint">Правка тарифа не меняет уже выданные коды: срок и кредиты копируются в код при выдаче.</p>
        <div className="btn-row">
          <button className="btn primary" disabled={busy}>{editing ? 'Сохранить тариф' : 'Добавить тариф'}</button>
          {editing && <button type="button" className="btn ghost" onClick={reset}>Новый</button>}
        </div>
      </form>
    </section>
  );
};

const Clients: React.FC<{clients: WorkspaceRow[]; onChanged: () => void; onError: (e: string) => void}> = ({clients, onChanged, onError}) => {
  const adjust = async (w: WorkspaceRow) => {
    const raw = window.prompt(`Кредиты для «${w.name}»: +5 начислить, −5 списать`, '+5');
    if (!raw) return;
    const delta = Number(raw.replace('−', '-').replace('+', ''));
    if (!Number.isInteger(delta) || delta === 0) return onError('Нужно целое число, не ноль');
    const note = window.prompt('Причина (видна в журнале)', 'компенсация') ?? '';
    try { await api.admin.adjustCredits(w.id, delta, note); onChanged(); } catch (err) { onError(message(err)); }
  };
  return (
    <section className="card wide">
      <h2>Клиенты <span className="muted">{clients.length}</span></h2>
      <table className="table">
        <thead><tr><th>Компания</th><th>Почта</th><th>Тариф</th><th>Оплачено до</th><th>Кредитов</th><th /></tr></thead>
        <tbody>
          {clients.map((w) => (
            <tr key={w.id}>
              <td>{w.name} <span className="muted">{w.id}</span></td>
              <td>{w.emails ?? '—'}</td>
              <td>{w.access.active ? w.access.plan?.title : <span className="muted">нет доступа</span>}</td>
              <td>{day(w.access.paidUntil)}{w.access.paidUntil && <span className="muted"> · {daysLeft(w.access.paidUntil)} дн.</span>}</td>
              <td>{w.access.active ? w.access.credits : '—'}</td>
              <td>{w.access.active && <button className="btn ghost" onClick={() => adjust(w)}>± кредиты</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const Codes: React.FC<{codes: ActivationCode[]}> = ({codes}) => (
  <section className="card wide">
    <h2>Коды <span className="muted">{codes.filter((c) => !c.activated_at).length} свободно</span></h2>
    <table className="table">
      <thead><tr><th>Код</th><th>Тариф</th><th>Заметка</th><th>Выдан</th><th>Активирован</th></tr></thead>
      <tbody>
        {codes.map((c) => (
          <tr key={c.code} className={c.activated_at ? 'muted' : ''}>
            <td><code>{c.code}</code></td>
            <td>{c.plan_title} · {c.credits} кр. · {c.days} дн.</td>
            <td>{c.note || '—'}</td>
            <td>{day(c.created_at)}</td>
            <td>{c.activated_at ? `${c.workspace_name ?? c.activated_workspace_id}, ${day(c.activated_at)}` : 'свободен'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
