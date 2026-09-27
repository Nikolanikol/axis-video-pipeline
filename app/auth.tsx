// Вход в SMMAKER: экран входа и регистрации по коду, контекст «кто вошёл».
//
// Интерфейс начинает с /api/auth/me. Вход выключен (нет базы — Mac без DATABASE_URL,
// прод до переезда) — сразу пускаем внутрь, как было. Включён и никто не вошёл — экран входа.
import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Access, Me, api} from './api';
import {Field} from './LotForm';

type Session = {
  enabled: boolean;
  email: string | null;
  isAdmin: boolean;
  workspace: {id: string; name: string} | null;
  access: Access | null;
  // Обновить доступ после погашения кода или правки кредитов
  setAccess: (a: Access) => void;
  // Перечитать доступ с сервера — после списания или возврата кредитов
  refresh: () => void;
  logout: () => void;
};

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession вне AuthGate');
  return ctx;
};

export const AuthGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    api.me().then((m) => { setMe(m); if (m.authRequired && m.user) setAccess(m.access); })
      .catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(() => {
    api.me().then((m) => { if (m.authRequired && m.user) setAccess(m.access); }).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    api.logout().finally(() => window.location.reload());
  }, []);

  if (error) return <div className="boot">Сервер не отвечает: {error}</div>;
  if (!me) return <div className="boot">Загрузка…</div>;
  if (me.authRequired && !me.user) return <LoginScreen />;

  const session: Session = me.authRequired && me.user
    ? {enabled: true, email: me.user.email, isAdmin: me.user.isAdmin, workspace: me.workspace, access, setAccess, refresh, logout}
    : {enabled: false, email: null, isAdmin: true, workspace: null, access: null, setAccess, refresh, logout};
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
};

const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await api.login(email, password);
      else await api.register({email, password, company, code});
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
          <button type="button" className={`btn ${mode === 'register' ? 'primary' : 'ghost'}`} onClick={() => setMode('register')}>Есть код активации</button>
        </div>
        {mode === 'register' && (
          <>
            <p className="note">Код вы получили после оплаты — вида SMM-XXXX-XXXX-XXXX. По нему откроется кабинет вашей компании.</p>
            <Field label="Код активации">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SMM-XXXX-XXXX-XXXX" autoComplete="off" required />
            </Field>
            <Field label="Компания" hint="будет на ваших постах, можно поменять потом">
              <input value={company} onChange={(e) => setCompany(e.target.value)} required />
            </Field>
          </>
        )}
        <Field label="Почта"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Пароль" hint={mode === 'register' ? 'не короче 8 символов' : undefined}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{mode === 'login' ? 'Войти' : 'Создать кабинет'}</button>
      </form>
    </div>
  );
};

/**
 * Пайплайны, которые показывать: из тарифа компании. Сервер всё равно не даст создать
 * лишнее, но кнопка, которая всегда отвечает «не входит в тариф», — это ловушка.
 */
export const useAllowedPipelines = (): string[] | null => {
  const {enabled, isAdmin, access} = useSession();
  if (!enabled || isAdmin || !access?.active) return null;
  return access.plan?.pipelines ?? null;
};

/**
 * Цена генерации для подписи на кнопке: « · 3 кр.». Пусто, если клиент не платит
 * (владелец платформы, вход выключен) — тогда и писать нечего.
 */
export const useCost = (pipeline: string, costs?: Record<string, number>) => {
  const {enabled, isAdmin} = useSession();
  const cost = costs?.[pipeline];
  return enabled && !isAdmin && cost ? ` · ${cost} кр.` : '';
};

/** Дата для людей: 26.10.2026 */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');
/** Сколько полных дней осталось до даты (0, если уже прошла) */
export const daysLeft = (iso: string | null | undefined) =>
  (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0);
