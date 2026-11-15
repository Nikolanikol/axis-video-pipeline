// Профиль и безопасность в «Моём кабинете» (решение владельца 12.10): свои данные с правкой,
// смена почты кодом, смена пароля, где выполнен вход.
//
// Почта и пароль меняются только с текущим паролем: оставленный открытым ноутбук не должен
// позволить увести аккаунт. Новая почта вступает в силу после кода с неё — опечатка в адресе
// иначе закрыла бы и вход, и сброс пароля.
import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {Account, SessionRow, api, errorText} from './api';
import {day, useSession} from './auth';
import {useConfig} from './config';
import {Field} from './LotForm';
import {toast} from './Toast';
import {locale, useT} from './i18n';

const message = errorText;
const when = (iso: string) => new Date(iso).toLocaleString(locale(), {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});

// ——— Профиль ———

/**
 * Карточка «Профиль»: просмотр строками, «Изменить» — имя и компания, «Сменить почту» — по коду.
 * Данные — GET /api/account/profile, а не из сессии: там нет телефона, даты регистрации и
 * ожидающей смены почты
 */
export const ProfileCard: React.FC = () => {
  const {refresh} = useSession();
  const {profile, profileSaved} = useConfig();
  const t = useT();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => { api.account.profile().then(setAccount).catch((e) => setError(message(e))); }, []);
  // Имя и компания видны в шапке — после правки перечитываем сессию. Компания — то же поле,
  // что в Настройках → Профиль: кладём её и в загруженный профиль, иначе форма настроек
  // показала бы старое название и при сохранении вернула бы его
  const saved = (a: Account) => {
    setAccount(a);
    if (a.company !== profile.company) profileSaved({...profile, company: a.company}); else refresh();
  };

  if (!account) return error ? <section className="card"><h2>{t('prof.title')}</h2><p className="auth-error">{error}</p></section> : null;
  return (
    <section className="card">
      <h2>{t('prof.title')}</h2>
      {editing
        ? <ProfileForm account={account} onDone={(a) => { if (a) { saved(a); toast(t('prof.saved')); } setEditing(false); }} />
        : (
          <>
            <dl className="rows">
              <dt>{t('auth.name')}</dt><dd>{account.name || '—'}</dd>
              <dt>{t('auth.company')}</dt><dd>{account.company || '—'}</dd>
              <dt>{t('auth.phone')}</dt><dd>{account.phone || '—'}</dd>
              <dt>{t('auth.email')}</dt>
              <dd>{account.email}{!account.emailVerified && <span className="tag warn">{t('prof.unverified')}</span>}</dd>
              <dt>{t('prof.since')}</dt><dd>{day(account.createdAt)}</dd>
            </dl>
            {/* Рассылки KOK — только служебные новости; снять галочку — то же, что «Отписаться» в письме */}
            <label className="news-toggle">
              <input type="checkbox" checked={account.news} onChange={async (e) => {
                const on = e.target.checked;
                try { setAccount(await api.account.setNews(on)); toast(t(on ? 'prof.newsOn' : 'prof.newsOff')); } catch (err) { setError(message(err)); }
              }} />
              <span>{t('prof.news')}</span>
            </label>
            <div className="btn-row">
              <button className="btn" onClick={() => setEditing(true)}>{t('start.edit')}</button>
              {!emailOpen && !account.pendingEmail && <button className="btn ghost" onClick={() => setEmailOpen(true)}>{t('prof.changeEmail')}</button>}
            </div>
          </>
        )}
      {(emailOpen || account.pendingEmail) && !editing && (
        <EmailChange
          pending={account.pendingEmail}
          onPending={(pendingEmail) => setAccount({...account, pendingEmail})}
          onDone={(email) => {
            setEmailOpen(false);
            if (email) { saved({...account, email, emailVerified: true, pendingEmail: null}); toast(t('prof.emailChanged')); } else setAccount({...account, pendingEmail: null});
          }} />
      )}
    </section>
  );
};

/** Правка профиля. onDone(a) — сохранено, onDone() — отмена. Компанию меняет только владелец кабинета */
const ProfileForm: React.FC<{account: Account; onDone: (a?: Account) => void}> = ({account, onDone}) => {
  const t = useT();
  const [form, setForm] = useState({name: account.name, company: account.company});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, [k]: e.target.value});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await api.account.save({name: form.name, ...(account.canEditCompany ? {company: form.company} : {})}));
    } catch (err) { setError(message(err)); setBusy(false); }
  };
  return (
    <form className="form" onSubmit={submit}>
      <Field label={t('auth.name')}><input value={form.name} onChange={set('name')} autoComplete="name" required /></Field>
      {account.canEditCompany && (
        <Field label={t('auth.company')} hint={t('prof.companyHint')}>
          <input value={form.company} onChange={set('company')} autoComplete="organization" required />
        </Field>
      )}
      {/* Телефон не меняется самостоятельно (владелец 12.10): он держит бесплатные кредиты,
          и смена номера открывала бы новую регистрацию на старый */}
      <Field label={t('auth.phone')} hint={t('prof.phoneHint')}>
        <input type="tel" value={account.phone} disabled readOnly />
      </Field>
      {error && <div className="auth-error">{error}</div>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy}>{t('common.save')}</button>
        <button type="button" className="btn ghost" onClick={() => onDone()} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </form>
  );
};

/**
 * Смена почты в два шага: новый адрес и текущий пароль → код с нового адреса. pending —
 * адрес, на который код уже ушёл (переживает перезагрузку: сервер помнит его в ключе письма)
 */
const EmailChange: React.FC<{pending: string | null; onPending: (email: string) => void; onDone: (email?: string) => void}> = (
  {pending, onPending, onDone},
) => {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { onDone((await api.account.confirmEmail(code)).email); }); }}>
        <h3>{t('prof.newEmail')}</h3>
        <p className="note">{t('verify.sentTo')}<b>{pending}</b>{t('prof.pendingNote')}</p>
        <Field label={t('prof.code')}>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <div className="btn-row">
          <button className="btn primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>{t('prof.confirm')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await api.account.cancelEmail(); onDone(); })}>{t('prof.cancelChange')}</button>
        </div>
      </form>
    );
  }
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { onPending((await api.account.changeEmail(email, password)).pendingEmail); }); }}>
      <h3>{t('prof.changeEmail')}</h3>
      <Field label={t('prof.newEmail')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
      <Field label={t('prof.currentPassword')} hint={t('prof.currentPasswordHint')}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error && <div className="auth-error">{error}</div>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy}>{t('prof.sendCode')}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onDone()}>{t('common.cancel')}</button>
      </div>
    </form>
  );
};

// ——— Безопасность ———

/**
 * Карточка «Безопасность»: смена пароля и «Где выполнен вход». Список входов — сессии из
 * smmaker_sessions с браузером и адресом (как это устроено — CONTEXT.md, «Профиль и безопасность»).
 * После смены пароля список перечитываем: сервер закрыл остальные входы
 */
export const SecurityCard: React.FC = () => {
  const {logout} = useSession();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = () => api.account.sessions().then(setSessions).catch((e) => setError(message(e)));
  useEffect(() => { load(); }, []);

  // Завершить вход или все чужие: busy — какая кнопка ждёт ответа («Завершаю…» только на ней),
  // сервер возвращает уже обновлённый список
  const act = async (id: string, fn: () => Promise<SessionRow[]>, done: string) => {
    setBusy(id);
    setError('');
    try { setSessions(await fn()); toast(done); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };
  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <section className="card">
      <h2>{t('prof.security')}</h2>
      {passwordOpen
        ? <PasswordForm onDone={(closed) => {
          setPasswordOpen(false);
          if (closed === undefined) return;
          toast(closed > 0 ? t('prof.passwordChangedOthers', {n: closed}) : t('prof.passwordChanged'));
          load();
        }} />
        : <div className="btn-row"><button className="btn" onClick={() => setPasswordOpen(true)}>{t('prof.changePassword')}</button></div>}

      <h3>{t('prof.sessions')}</h3>
      {error && <div className="auth-error">{error}</div>}
      {sessions && (
        <ul className="sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.device}</b>{s.current && <span className="tag ok">{t('prof.thisDevice')}</span>}
                <div className="muted">
                  {[s.ip, s.current ? t('prof.now') : t('prof.seen', {date: when(s.seenAt)}), t('prof.signedIn', {date: day(s.createdAt)})].filter(Boolean).join(' · ')}
                </div>
              </div>
              {s.current
                ? <button className="btn ghost" onClick={logout}>{t('shell.logout')}</button>
                : <button className="btn ghost" disabled={!!busy} onClick={() => act(s.id, () => api.account.closeSession(s.id), t('prof.sessionClosed'))}>
                  {busy === s.id ? t('prof.ending') : t('prof.end')}
                </button>}
            </li>
          ))}
        </ul>
      )}
      {others > 0 && (
        <div className="btn-row">
          <button className="btn" disabled={!!busy} onClick={() => act('all', api.account.closeOthers, t('prof.othersClosed'))}>
            {t('prof.logoutOthers', {n: others})}
          </button>
        </div>
      )}
      <p className="hint">{t('prof.unknownSession')}</p>
    </section>
  );
};

// closed — сколько других входов закрыто; undefined — отмена
const PasswordForm: React.FC<{onDone: (closed?: number) => void}> = ({onDone}) => {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Повтор сверяем здесь: сервер получает один новый пароль, опечатка в нём — потерянный вход
    if (password !== repeat) return setError(t('prof.mismatch'));
    setBusy(true);
    setError('');
    try { onDone((await api.account.changePassword(current, password)).closed); } catch (err) { setError(message(err)); setBusy(false); }
  };
  return (
    <form className="form" onSubmit={submit}>
      <Field label={t('prof.currentPassword')}><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></Field>
      <Field label={t('prof.newPassword')} hint={t('prof.newPasswordHint')}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={t('prof.repeatPassword')}>
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      {error && <div className="auth-error">{error}</div>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy}>{t('prof.savePassword')}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onDone()}>{t('common.cancel')}</button>
      </div>
    </form>
  );
};

// ——— Удаление аккаунта ———
// Владелец 12.10: в самом низу кабинета на всю ширину; подтверждение — как у GitHub: окно с
// последствиями, название компании руками и пароль. Окончательно — через 14 дней, до этого
// аккаунт восстанавливается ссылкой из письма

const DELETE_DAYS = 14;

export const DangerZone: React.FC = () => {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <section className="danger-zone">
      <div>
        <h2>{t('del.title')}</h2>
        <p className="muted">{t('del.lead', {days: t.n('unit.day', DELETE_DAYS)})}</p>
      </div>
      <button className="btn danger" onClick={() => setOpen(true)}>{t('del.button')}</button>
      {open && <DeleteDialog onClose={() => setOpen(false)} />}
    </section>
  );
};

const DeleteDialog: React.FC<{onClose: () => void}> = ({onClose}) => {
  const {workspace, balance, email} = useSession();
  const {profile} = useConfig();
  const t = useT();
  // То же название, что сверяет сервер: компания из профиля, а нет её — название кабинета
  const company = profile.company?.trim() || workspace?.name || '';
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const typed = norm(confirm) === norm(company);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.account.remove(password, confirm);
      // Сервер уже сбросил вход — на витрину, она покажет, что дальше
      window.location.replace(`${window.location.pathname}#/deleted`);
      window.location.reload();
    } catch (err) { setError(message(err)); setBusy(false); }
  };

  // Окно — порталом в body: у предков анимация появления оставляет transform, и fixed внутри
  // них считается от блока, а не от экрана — окно оказалось бы запертым в «опасной зоне»
  return createPortal(
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="danger-dialog" onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="del-title">
        <h2 id="del-title">{t('del.confirmTitle', {company})}</h2>
        <div className="notice warn">{t('del.irreversible', {days: t.n('unit.day', DELETE_DAYS)})}</div>
        <ul className="danger-list">
          <li>{t('del.li1')}</li>
          <li>{t('del.li2', {days: t.n('unit.day', DELETE_DAYS)})}</li>
          <li>{balance && balance.credits > 0 ? <><b>{t.n('unit.creditShort', balance.credits)}</b>{t('del.burn')}</> : t('del.burnAll')}{t('del.noRefund')}</li>
          <li>{t('del.restore')}<b>{email}</b>.</li>
        </ul>
        <p className="hint">{t('del.download')}<a className="link" href="#/ads/lot" onClick={onClose}>{t('del.videos')}</a>{t('auth.accept.and')}<a className="link" href="#/carousels/build" onClick={onClose}>{t('del.carousels')}</a>.</p>
        <Field label={t('del.typeCompany', {company})}>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
        </Field>
        <Field label={t('auth.password')}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn danger solid" disabled={busy || !typed || !password}>{t(busy ? 'del.deleting' : 'del.understand')}</button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
      </form>
    </div>,
    document.body,
  );
};
