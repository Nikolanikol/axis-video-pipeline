// Вход в SMMAKER: экран входа и регистрации, контекст «кто вошёл».
//
// Интерфейс начинает с /api/auth/me. Вход выключен (нет базы — Mac без DATABASE_URL,
// тесты) — сразу пускаем внутрь, как было. Включён и никто не вошёл — витрина KOK с формой
// входа и регистрации (app/Landing.tsx).
import React, {Suspense, createContext, lazy, useCallback, useContext, useEffect, useState} from 'react';
import {Loading} from './Loading';
import {Balance, Me, Registration, User, api} from './api';
import {Field} from './LotForm';
import {useRoute} from './router';

// Витрина — отдельным куском сборки: в ней плеер и композиции роликов, вошедшему они не нужны
const Landing = lazy(() => import('./Landing').then((m) => ({default: m.Landing})));

type Session = {
  enabled: boolean;
  email: string | null;
  name: string | null;
  // Админ — прайс, роли, бонусы; сотрудник (админ или менеджер) — лиды и пакеты, не платит
  isAdmin: boolean;
  isStaff: boolean;
  // Почта не подтверждена — бесплатных кредитов ещё нет, генерация закрыта
  emailVerified: boolean;
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

  // Ссылка из письма: #/verify?t=… или #/reset?t=…. Читаем один раз при загрузке
  const [link] = useState(readEmailLink);
  const route = useRoute();
  const [notice, setNotice] = useState('');

  // Перечитать, кто вошёл: после подтверждения почты меняются и признак, и баланс
  const load = useCallback(() => {
    api.me().then((m) => { setMe(m); if (signedIn(m)) setBalance(m.balance); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (link?.kind !== 'verify') { load(); return; }
    // Подтверждаем и убираем ключ из адреса: в истории браузера и при пересылке ссылки
    // ему делать нечего
    api.verifyLink(link.token)
      .then(() => setNotice('Почта подтверждена — бесплатные кредиты на счёте'))
      .catch((e) => setNotice(e.message))
      .finally(() => { window.history.replaceState(null, '', '#/account'); load(); });
  }, [link, load]);

  const logout = useCallback(() => {
    api.logout().finally(() => window.location.reload());
  }, []);

  if (link?.kind === 'reset') return <ResetScreen token={link.token} />;
  if (error) return <div className="boot">Сервер не отвечает: {error}</div>;
  if (!me) return <Loading />;
  // Гость — витрина KOK с образцами, условиями и формой (владелец 01.10: «зазвать людей»).
  // #/welcome показывает её и без базы — посмотреть витрину на копии сервера без входа
  if (me.authRequired && !me.user) return <Suspense fallback={<Loading />}><Landing signup={me.signup} notice={notice} /></Suspense>;
  if (!me.authRequired && route.pipeline === 'welcome') {
    return <Suspense fallback={<Loading />}><Landing signup={{credits: 7, days: 30}} notice="" /></Suspense>;
  }

  const session: Session = signedIn(me)
    ? {enabled: true, email: me.user.email, name: me.user.name, isAdmin: me.user.isAdmin, isStaff: me.user.isStaff,
      emailVerified: me.user.emailVerified, workspace: me.workspace, balance, refresh: load, logout}
    : {enabled: false, email: null, name: null, isAdmin: true, isStaff: true, emailVerified: true, workspace: null, balance: null,
      refresh: load, logout};
  return (
    <SessionCtx.Provider value={session}>
      {notice && <div className="readonly" onClick={() => setNotice('')}>{notice}</div>}
      {children}
    </SessionCtx.Provider>
  );
};

type EmailLink = {kind: 'verify' | 'reset'; token: string};
const readEmailLink = (): EmailLink | null => {
  const m = /^#\/(verify|reset)\?t=([\w-]+)/.exec(window.location.hash);
  return m ? {kind: m[1] as EmailLink['kind'], token: m[2]} : null;
};

// Новый пароль по ссылке из письма. Сессия не нужна: пароль и забывают, когда войти нельзя
const ResetScreen: React.FC<{token: string}> = ({token}) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.reset(token, password);
      // Сервер уже впустил с новым паролем — на главную, ключ сброса из адреса убираем
      window.location.replace(window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <img src="/kok/full.svg" alt="KOK — контент одной кнопкой" className="auth-logo" />
      <form className="auth-card form" onSubmit={submit}>
        <h2>Новый пароль</h2>
        <Field label="Пароль" hint="не короче 8 символов">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>Сохранить и войти</button>
        <p className="hint"><a href={window.location.pathname}>Вернуться ко входу</a></p>
      </form>
    </div>
  );
};

/**
 * Полоса «подтвердите почту»: ввести код из письма или запросить новый. До подтверждения
 * бесплатных кредитов нет — без полосы человек не понял бы, почему генерация закрыта
 */
export const VerifyBanner: React.FC = () => {
  const {enabled, isStaff, emailVerified, email, refresh} = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!enabled || isStaff || emailVerified) return null;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote('');
    try { await fn(); setNote(ok); } catch (err) { setNote(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return (
    <form className="readonly verify" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.verify(code); refresh(); }, ''); }}>
      <span>Подтвердите почту: код отправлен на <b>{email}</b>. После подтверждения придут бесплатные кредиты.</span>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 цифр" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <button className="btn primary" disabled={busy}>Подтвердить</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => api.resendVerify(), 'Отправили новый код')}>Отправить ещё раз</button>
      {note && <span className="muted">{note}</span>}
    </form>
  );
};

const EMPTY: Registration = {name: '', email: '', phone: '', password: '', company: ''};

export type AuthMode = 'login' | 'register' | 'forgot';

/**
 * Форма входа и регистрации. Живёт на витрине гостя (app/Landing.tsx) — режим держит
 * витрина: кнопки «Войти» и «Попробовать бесплатно» в шапке и на первом экране переключают
 * её и подводят к ней
 */
export const AuthCard: React.FC<{signup: {credits: number; days: number}; notice: string; mode: AuthMode; setMode: (m: AuthMode) => void}> = (
  {signup, notice, mode, setMode},
) => {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState<Registration>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Registration) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, [k]: e.target.value});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api.forgot(form.email);
        setSent(true);
        setBusy(false);
        return;
      }
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
      <form className="auth-card form" onSubmit={submit}>
        <div className="btn-row auth-switch">
          <button type="button" className={`btn ${mode === 'login' ? 'primary' : 'ghost'}`} onClick={() => setMode('login')}>Вход</button>
          <button type="button" className={`btn ${mode === 'register' ? 'primary' : 'ghost'}`} onClick={() => setMode('register')}>Регистрация</button>
        </div>
        {notice && <p className="note">{notice}</p>}
        {mode === 'forgot' && (
          <p className="note">{sent
            ? 'Если такая почта зарегистрирована, на неё ушло письмо со ссылкой. Ссылка действует час.'
            : 'Пришлём ссылку, по которой можно задать новый пароль.'}</p>
        )}
        {mode === 'register' && (
          <>
            {signup.credits > 0 && (
              <p className="note auth-gift">Подтвердите почту — и получите <b>{signup.credits} кредитов бесплатно</b> на {signup.days} дней: карусель стоит 1 кредит, рекламный ролик — 3.</p>
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
        {mode !== 'forgot' && (
          <Field label="Пароль" hint={mode === 'register' ? 'не короче 8 символов' : undefined}>
            <input type="password" value={form.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
          </Field>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy || (mode === 'forgot' && sent)}>
          {mode === 'login' ? 'Войти' : mode === 'register' ? 'Создать кабинет' : 'Прислать ссылку'}
        </button>
        {mode === 'login' && <p className="hint"><button type="button" className="link" onClick={() => { setMode('forgot'); setSent(false); }}>Забыли пароль?</button></p>}
        {mode === 'forgot' && <p className="hint"><button type="button" className="link" onClick={() => setMode('login')}>Вернуться ко входу</button></p>}
      </form>
  );
};

/** Баланс кончился — генерация закрыта (сотрудники платформы не платят) */
export const useOutOfCredits = () => {
  const {enabled, isStaff, emailVerified, balance} = useSession();
  // Не подтвердил почту — про это своя полоса (VerifyBanner), «кончились» было бы неправдой
  return enabled && !isStaff && emailVerified && balance !== null && balance.credits <= 0;
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
