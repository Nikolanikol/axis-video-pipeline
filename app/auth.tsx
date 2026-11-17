// Вход в SMMAKER: экран входа и регистрации, контекст «кто вошёл».
//
// Интерфейс начинает с /api/auth/me. Вход выключен (нет базы — Mac без DATABASE_URL,
// тесты) — сразу пускаем внутрь, как было. Включён и никто не вошёл — экран входа и регистрации
// (app/GuestEntry.tsx; витрина KOK с 17.11 — на axis-beauty.com, site/).
import React, {Suspense, createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Loading} from './Loading';
import {lazyNamed} from './errorReport';
import {track, trackFirstGeneration} from './analytics';
import {Balance, Me, Registration, User, api, errorText} from './api';
import {Field} from './LotForm';
import {useRoute} from './router';
import {locale, tNow, useT, type Lang} from './i18n';

// Экран входа гостя — отдельным куском сборки: вошедшему он не нужен
const GuestEntry = lazyNamed(() => import('./GuestEntry'), 'GuestEntry');
// Оферта и политика — открыты всем, и гостю, и вошедшему: их открывают по прямой ссылке
// модератор платёжного сервиса и клиент из окна оплаты
const LegalPage = lazyNamed(() => import('./Legal'), 'LegalPage');

type Session = {
  enabled: boolean;
  email: string | null;
  name: string | null;
  // Язык человека с сервера (null — ещё не выбирал); синхронизация с переключателем — app/config.tsx
  lang: Lang | null;
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
// Поисковые и проверочные роботы (Googlebot и его проверка URL, Яндекс, Bing, превью соцсетей)
const IS_BOT = typeof navigator !== 'undefined' && /bot|crawl|spider|slurp|Google-InspectionTool|Lighthouse|facebookexternalhit/i.test(navigator.userAgent);
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
      // Поисковому роботу — экран гостя, а не экран ошибки: его рендер может не выполнить запрос
      // входа (21.10: Google обрывал его с 499, и в поиск уходила плашка «Сервер ответил ошибкой»).
      // Человеку — прежний экран с «Обновить страницу»: ему нужно знать, что вход не проверился
      .catch((e) => {
        if (!IS_BOT) { setError(errorText(e)); return; }
        // Подарок при регистрации — из условий витрины (тот же источник, что у GuestEntry); не отдались —
        // те же умолчания, что у документов (Legal.tsx)
        const guest = (signup: {credits: number; days: number}): Me => ({authRequired: true, user: null, signup});
        api.publicOffer().then((o) => setMe(guest(o?.signup ?? {credits: 7, days: 30}))).catch(() => setMe(guest({credits: 7, days: 30})));
      });
  }, []);

  // Баланс меняется и в других вкладках (собрали там ролик, оплатили тариф). Раньше он читался
  // один раз при открытии, и вкладка показывала старое число до перезагрузки (тест Дмитрия, PR 13).
  // Перечитываем при возврате во вкладку и при переходе между разделами — только баланс
  const signed = !!me && signedIn(me);
  const freshBalance = useCallback(() => {
    if (signed && document.visibilityState === 'visible') api.me().then((m) => { if (signedIn(m)) setBalance(m.balance); }).catch(() => {});
  }, [signed]);
  useEffect(() => {
    document.addEventListener('visibilitychange', freshBalance);
    window.addEventListener('focus', freshBalance);
    return () => {
      document.removeEventListener('visibilitychange', freshBalance);
      window.removeEventListener('focus', freshBalance);
    };
  }, [freshBalance]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(freshBalance, [route]);

  useEffect(() => {
    // Ссылка «восстановить» из письма об удалении: сервер снимает удаление и сразу впускает
    if (link?.kind === 'restore') {
      api.restore(link.token)
        .then(() => setNotice(tNow()('auth.restored')))
        .catch((e) => setNotice(errorText(e)))
        .finally(() => { window.history.replaceState(null, '', '#/account'); load(); });
      return;
    }
    // Только что удалили аккаунт — экран входа покажет эту строку
    if (window.location.hash.startsWith('#/deleted')) {
      setNotice(tNow()('auth.deleted'));
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (link?.kind !== 'verify') { load(); return; }
    // Подтверждаем и убираем ключ из адреса: в истории браузера и при пересылке ссылки
    // ему делать нечего
    api.verifyLink(link.token)
      .then(() => setNotice(tNow()('auth.verified')))
      .catch((e) => setNotice(errorText(e)))
      .finally(() => { window.history.replaceState(null, '', '#/account'); load(); });
  }, [link, load]);

  // Первая генерация — событием в счётчики (app/analytics.tsx): баланс перечитывается при переходах
  // и возврате во вкладку, так что смена «не было → было» видна вскоре после запуска
  const wsId = me && signedIn(me) ? me.workspace?.id : undefined;
  useEffect(() => { trackFirstGeneration(wsId, balance?.generated); }, [wsId, balance?.generated]);

  const legal = route.pipeline === 'offer' || route.pipeline === 'privacy';

  const t = useT();
  const logout = useCallback(() => {
    api.logout().finally(() => window.location.reload());
  }, []);

  if (link?.kind === 'reset') return <ResetScreen token={link.token} />;
  // До проверки входа: документ не зависит от сессии и должен открываться, даже если сервер вход не отдал
  if (legal) {
    return <Suspense fallback={<Loading />}><LegalPage kind={route.pipeline as 'offer' | 'privacy'} anchor={route.tool} /></Suspense>;
  }
  if (error) return (
    <div className="boot">
      <p>{error}</p>
      <button className="btn" onClick={() => window.location.reload()}>{t('common.reload')}</button>
    </div>
  );
  if (!me) return <Loading />;
  // Гость — сразу вход и регистрация (17.11): витрина с образцами и условиями переехала на
  // axis-beauty.com. #/welcome показывает экран гостя и без базы — посмотреть его на копии сервера
  if (me.authRequired && !me.user) return <Suspense fallback={<Loading />}><GuestEntry signup={me.signup} notice={notice} /></Suspense>;
  if (!me.authRequired && route.pipeline === 'welcome') {
    return <Suspense fallback={<Loading />}><GuestEntry signup={{credits: 7, days: 30}} notice="" /></Suspense>;
  }

  const session: Session = signedIn(me)
    ? {enabled: true, email: me.user.email, name: me.user.name, lang: me.user.lang ?? null, isAdmin: me.user.isAdmin, isStaff: me.user.isStaff,
      emailVerified: me.user.emailVerified, workspace: me.workspace, balance, refresh: load, logout}
    : {enabled: false, email: null, name: null, lang: null, isAdmin: true, isStaff: true, emailVerified: true, workspace: null, balance: null,
      refresh: load, logout};
  return (
    <SessionCtx.Provider value={session}>
      {notice && <div className="readonly" onClick={() => setNotice('')}>{notice}</div>}
      {children}
    </SessionCtx.Provider>
  );
};

type EmailLink = {kind: 'verify' | 'reset' | 'restore'; token: string};
const readEmailLink = (): EmailLink | null => {
  const m = /^#\/(verify|reset|restore)\?t=([\w-]+)/.exec(window.location.hash);
  return m ? {kind: m[1] as EmailLink['kind'], token: m[2]} : null;
};

// Новый пароль по ссылке из письма. Сессия не нужна: пароль и забывают, когда войти нельзя
const ResetScreen: React.FC<{token: string}> = ({token}) => {
  const t = useT();
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
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <img src="/kok/full.svg" alt={t('auth.logoAlt')} className="auth-logo" />
      <form className="auth-card form" onSubmit={submit}>
        <h2>{t('land.auth.reset')}</h2>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{t('auth.saveAndLogin')}</button>
        <p className="hint"><a href={window.location.pathname}>{t('auth.backToLogin')}</a></p>
      </form>
    </div>
  );
};

/**
 * Полоса «подтвердите почту» на всех страницах, кроме «Первых шагов»: до подтверждения
 * бесплатных кредитов нет, и без полосы человек не понял бы, почему генерация закрыта. Сам
 * код вводится крупно на «Первых шагах» (app/Onboarding.tsx) — владелец 01.10: «почту
 * явно, а не тонкой полосой». Здесь — только напоминание и ссылка туда
 */
export const VerifyBanner: React.FC = () => {
  const {enabled, isStaff, emailVerified, email} = useSession();
  const route = useRoute();
  const t = useT();
  if (!enabled || isStaff || emailVerified || route.pipeline === 'start') return null;
  return (
    <div className="readonly verify">
      <span>{t('auth.verifyBanner.a')}<b>{email}</b>{t('auth.verifyBanner.b')}</span>
      <a className="btn primary" href="#/start">{t('auth.enterCode')}</a>
    </div>
  );
};

const EMPTY: Registration = {name: '', email: '', phone: '', password: '', company: '', news: true};

export type AuthMode = 'login' | 'register' | 'forgot';

/**
 * Форма входа и регистрации. Живёт на экране гостя (app/GuestEntry.tsx) — режим держит
 * он: вход, регистрация (пришёл с витрины по «Попробовать») или «забыли пароль»
 */
export const AuthCard: React.FC<{signup: {credits: number; days: number}; notice: string; mode: AuthMode; setMode: (m: AuthMode) => void}> = (
  {signup, notice, mode, setMode},
) => {
  const t = useT();
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
      else {
        await api.register(form);
        // Событие «регистрация» (app/analytics.tsx): в GA4 уходит всегда (без согласия — без cookie,
        // Consent Mode), в Метрику — целью, только если гость нажал «Принять». Сразу перед reload:
        // gtag и Метрика шлют через sendBeacon, перезагрузка запрос не обрывает
        track('sign_up');
        // Новый кабинет — сразу на «Первые шаги»: подтвердить почту и настроиться
        // (app/Onboarding.tsx), а не в пустой кабинет с тонкой полосой сверху
        window.location.hash = '#/start';
      }
      // Перезагрузка, а не смена состояния: настройки, бренд и списки должны прийти уже
      // от имени вошедшей компании, с нуля
      window.location.reload();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
      <form className="auth-card form" onSubmit={submit}>
        <div className="btn-row auth-switch">
          <button type="button" className={`btn ${mode === 'login' ? 'primary' : 'ghost'}`} onClick={() => setMode('login')}>{t('auth.tab.login')}</button>
          <button type="button" className={`btn ${mode === 'register' ? 'primary' : 'ghost'}`} onClick={() => setMode('register')}>{t('auth.tab.register')}</button>
        </div>
        {notice && <p className="note">{notice}</p>}
        {mode === 'forgot' && (
          <p className="note">{sent
            ? t('auth.forgot.sent')
            : t('auth.forgot.intro')}</p>
        )}
        {mode === 'register' && (
          <>
            {signup.credits > 0 && (
              <p className="note auth-gift">{t('auth.gift.a')}<b>{t('auth.gift.b', {credits: t.n('unit.credit', signup.credits)})}</b>{t('auth.gift.c', {days: t.n('unit.day', signup.days)})}</p>
            )}
            <Field label={t('auth.name')}><input value={form.name} onChange={set('name')} autoComplete="name" required /></Field>
            <Field label={t('auth.phone')} hint={t('auth.phoneHint')}>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+82 10 1234 5678" autoComplete="tel" required />
            </Field>
            <Field label={t('auth.company')} hint={t('auth.companyHint')}>
              <input value={form.company} onChange={set('company')} autoComplete="organization" />
            </Field>
          </>
        )}
        <Field label={t('auth.email')}><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></Field>
        {mode !== 'forgot' && (
          <Field label={t('auth.password')} hint={mode === 'register' ? t('auth.passwordHint') : undefined}>
            <input type="password" value={form.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
          </Field>
        )}
        {/* Служебные новости KOK (рассылки, server/mailing.mjs). Отмечена заранее — решение владельца
            21.10: это новости сервиса, не реклама; отписка — в каждом письме и в кабинете */}
        {mode === 'register' && (
          <label className="auth-news">
            <input type="checkbox" checked={form.news} onChange={(e) => setForm({...form, news: e.target.checked})} />
            <span>{t('auth.news')}</span>
          </label>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy || (mode === 'forgot' && sent)}>
          {t(mode === 'login' ? 'land.login' : mode === 'register' ? 'auth.create' : 'auth.sendLink')}
        </button>
        {mode === 'login' && <p className="hint"><button type="button" className="link" onClick={() => { setMode('forgot'); setSent(false); }}>{t('auth.forgotLink')}</button></p>}
        {/* Акцепт оферты — регистрацией (Legal.tsx): клиент должен видеть, с чем соглашается */}
        {mode === 'register' && (
          <p className="hint">{t('auth.accept.a')}<a href="/offer" target="_blank" rel="noreferrer">{t('auth.accept.offer')}</a>{t('auth.accept.and')}
            <a href="/privacy" target="_blank" rel="noreferrer">{t('auth.accept.privacy')}</a>.</p>
        )}
        {mode === 'forgot' && <p className="hint"><button type="button" className="link" onClick={() => setMode('login')}>{t('auth.backToLogin')}</button></p>}
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
  return enabled && !isStaff && cost ? ` · ${tNow().n('unit.creditShort', cost)}` : '';
};

/** Дата для людей: 26.10.2026 (по-английски 26/10/2026 — app/i18n, locale) */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale()) : '—');
/** Сколько полных дней осталось до даты (0, если уже прошла) */
export const daysLeft = (iso: string | null | undefined) =>
  (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0);
