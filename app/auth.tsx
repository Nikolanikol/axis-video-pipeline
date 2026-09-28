// Вход в SMMAKER: экран входа и регистрации, контекст «кто вошёл».
//
// Интерфейс начинает с /api/auth/me. Вход выключен (нет базы — Mac без DATABASE_URL,
// тесты) — сразу пускаем внутрь, как было. Включён и никто не вошёл — экран входа.
import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Balance, Me, Registration, User, api} from './api';
import {Field} from './LotForm';

type Session = {
  enabled: boolean;
  email: string | null;
  name: string | null;
  // Админ — прайс, роли, бонусы; сотрудник (админ или менеджер) — лиды и пакеты, не платит
  isAdmin: boolean;
  isStaff: boolean;
  workspace: {id: string; name: string} | null;
  balance: Balance | null;
  // Перечитать баланс с сервера — после списания, возврата или начисления
  refresh: () => void;
  logout: () => void;
};

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession вне AuthGate');
  return ctx;
};

type Signed = Extract<Me, {user: User}>;
const signedIn = (m: Me): m is Signed => m.authRequired && m.user !== null;

export const AuthGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<Balance | null>(null);

  useEffect(() => {
    api.me().then((m) => { setMe(m); if (signedIn(m)) setBalance(m.balance); })
      .catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(() => {
    api.me().then((m) => { if (signedIn(m)) setBalance(m.balance); }).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    api.logout().finally(() => window.location.reload());
  }, []);

  if (error) return <div className="boot">Сервер не отвечает: {error}</div>;
  if (!me) return <div className="boot">Загрузка…</div>;
  if (me.authRequired && !me.user) return <LoginScreen signup={me.signup} />;

  const session: Session = signedIn(me)
    ? {enabled: true, email: me.user.email, name: me.user.name, isAdmin: me.user.isAdmin, isStaff: me.user.isStaff,
      workspace: me.workspace, balance, refresh, logout}
    : {enabled: false, email: null, name: null, isAdmin: true, isStaff: true, workspace: null, balance: null, refresh, logout};
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
};

const EMPTY: Registration = {name: '', email: '', phone: '', password: '', company: ''};

const LoginScreen: React.FC<{signup: {credits: number; days: number}}> = ({signup}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState<Registration>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Registration) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, [k]: e.target.value});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await api.login(form.email, form.password);
      else await api.register(form);
      // Перезагрузка, а не смена состояния: настройки, бренд и списки должны прийти уже
      // от имени вошедшей компании, с нуля
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card form" onSubmit={submit}>
        <img src="/brand/logo-horizontal.svg" alt="" className="auth-logo" />
        <div className="btn-row auth-switch">
          <button type="button" className={`btn ${mode === 'login' ? 'primary' : 'ghost'}`} onClick={() => setMode('login')}>Вход</button>
          <button type="button" className={`btn ${mode === 'register' ? 'primary' : 'ghost'}`} onClick={() => setMode('register')}>Регистрация</button>
        </div>
        {mode === 'register' && (
          <>
            {signup.credits > 0 && (
              <p className="note">После регистрации — {signup.credits} кредитов бесплатно на {signup.days} дней: карусель стоит 1 кредит, рекламный ролик — 3.</p>
            )}
            <Field label="Имя"><input value={form.name} onChange={set('name')} autoComplete="name" required /></Field>
            <Field label="Телефон" hint="с кодом страны — свяжемся, если понадобится помощь">
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+82 10 1234 5678" autoComplete="tel" required />
            </Field>
            <Field label="Компания" hint="будет на ваших постах; можно оставить пустым и поменять потом">
              <input value={form.company} onChange={set('company')} autoComplete="organization" />
            </Field>
          </>
        )}
        <Field label="Почта"><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></Field>
        <Field label="Пароль" hint={mode === 'register' ? 'не короче 8 символов' : undefined}>
          <input type="password" value={form.password} onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{mode === 'login' ? 'Войти' : 'Создать кабинет'}</button>
      </form>
    </div>
  );
};

/** Баланс кончился — генерация закрыта (сотрудники платформы не платят) */
export const useOutOfCredits = () => {
  const {enabled, isStaff, balance} = useSession();
  return enabled && !isStaff && balance !== null && balance.credits <= 0;
};

/**
 * Цена генерации для подписи на кнопке: « · 3 кр.». Пусто, если клиент не платит
 * (сотрудник платформы, вход выключен) — тогда и писать нечего.
 */
export const useCost = (pipeline: string, costs?: Record<string, number>) => {
  const {enabled, isStaff} = useSession();
  const cost = costs?.[pipeline];
  return enabled && !isStaff && cost ? ` · ${cost} кр.` : '';
};

/** Дата для людей: 26.10.2026 */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');
/** Сколько полных дней осталось до даты (0, если уже прошла) */
export const daysLeft = (iso: string | null | undefined) =>
  (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0);
