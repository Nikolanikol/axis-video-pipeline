// «Первые шаги» — куда попадает компания сразу после регистрации (владелец 01.10: «ввести
// клиента куда надо, показать, что он должен видеть; почту — явно, а не полосой; потом
// чтобы интуитивно понял, что надо сделать настройки»).
//
// Список из четырёх шагов с прогрессом: подтвердить почту → о компании → бренд → первый
// ролик. Галочки ставятся сами по данным — человеку ничего не отмечать руками. Шаги 2 и 3
// необязательные (решение владельца): их можно пропустить, к ним можно вернуться. Пока
// список не пройден и не скрыт, он стоит карточкой над пайплайнами на главной.
//
// Без базы (копия на Mac) входа нет и почты нет — шаг почты считается пройденным;
// #/start/unverified показывает его неподтверждённым, чтобы посмотреть карточку кода.
import React, {useEffect, useRef, useState} from 'react';
import {Check, ChevronRight, Mail} from 'lucide-react';
import {api, errorText} from './api';
import {useSession} from './auth';
import {useConfig} from './config';
import platformBrand from '../config/brand.json';
import {href} from './router';
import {useT, type Key, type T} from './i18n';

type StepId = 'email' | 'company' | 'brand' | 'first';
type Step = {id: StepId; done: boolean; skipped: boolean};

// Пропуски и «скрыть список» — удобство этого браузера, на компанию: в двух кабинетах
// на одном компьютере у каждого свой список. localStorage может не быть (приватный режим)
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

export const useOnboarding = () => {
  const session = useSession();
  const {profile, brand} = useConfig();
  const ws = session.workspace?.id ?? 'local';
  const key = (k: string) => `kok:start:${ws}:${k}`;
  const [lots, setLots] = useState<number | null>(null);
  const [, bump] = useState(0);
  // Готовые работы: объявления роликов и собранные карусели. Считаем не один раз при открытии, а и
  // при возврате на страницу: шапка с «3 из 4» живёт всё время, и после первого ролика она
  // продолжала звать «соберите первый ролик» до перезагрузки (тест Дмитрия, PR 13)
  useEffect(() => {
    const count = () => Promise.all([api.lots(), api.carousels().catch(() => [])])
      .then(([l, c]) => setLots(l.length + c.length)).catch(() => setLots(null));
    count();
    const onVisible = () => { if (document.visibilityState === 'visible') count(); };
    window.addEventListener('hashchange', count);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('hashchange', count);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const preview = !session.enabled && window.location.hash.includes('unverified');
  const c = profile.contacts ?? {whatsapp: null, site: ''};
  // Бренд «настроен»: свой логотип или цвета не те, что достались от платформы при
  // регистрации (стартовый бренд копируется с платформенного)
  const ownBrand = !!brand.assets?.logoStacked || brand.copper !== platformBrand.copper || brand.bg !== platformBrand.bg;
  const raw: [StepId, boolean][] = [
    ['email', session.enabled ? session.emailVerified : !preview],
    ['company', !!profile.company?.trim() && !!(c.whatsapp || c.site || c.telegram)],
    ['brand', ownBrand],
    ['first', (lots ?? 0) > 0],
  ];
  const steps: Step[] = raw.map(([id, done]) => ({id, done, skipped: !done && store.get(key(`skip-${id}`)) === '1'}));
  const passed = steps.filter((s) => s.done || s.skipped).length;
  return {
    steps, passed, total: steps.length,
    allDone: passed === steps.length,
    hidden: store.get(key('hidden')) === '1',
    // Сотрудникам платформы (они не платят и не настраивают свой бренд) список не нужен
    relevant: !session.isStaff || preview,
    skip: (id: StepId) => { store.set(key(`skip-${id}`), '1'); bump((n) => n + 1); },
    hide: () => { store.set(key('hidden'), '1'); bump((n) => n + 1); },
    show: () => { store.set(key('hidden'), null); bump((n) => n + 1); },
  };
};

// Тексты шагов — в словаре (app/i18n): start.<шаг>.title / .why / .go
const LINK: Partial<Record<StepId, string>> = {
  company: href('settings', 'profile'),
  brand: href('settings', 'brand'),
  first: href('ads', 'lot'),
};
const text = (t: T, id: StepId) => ({
  title: t(`start.${id}.title` as Key), why: t(`start.${id}.why` as Key),
  go: id === 'email' ? undefined : t(`start.${id}.go` as Key), link: LINK[id],
});

/** Страница «Первые шаги» (#/start) — сюда ведёт регистрация */
export const StartPage: React.FC = () => {
  const o = useOnboarding();
  const {balance} = useSession();
  const tr = useT();
  const emailDone = o.steps[0].done;
  return (
    <div className="page start">
      <h1 className="page-title">{tr('start.h1')}</h1>
      <p className="muted start-lead">{tr('start.lead')}</p>
      <div className="start-progress" aria-label={tr('start.done', {a: o.passed, b: o.total})}>
        <div className="start-bar"><div style={{width: `${(o.passed / o.total) * 100}%`}} /></div>
        <span>{tr('start.done', {a: o.passed, b: o.total})}</span>
      </div>
      <ol className="start-steps">
        {o.steps.map((s, i) => {
          const t = text(tr, s.id);
          // Первый ролик тратит кредиты — до подтверждения почты их нет, шаг приглушён
          const locked = s.id === 'first' && !emailDone;
          return (
            <li key={s.id} className={`start-step${s.done ? ' done' : ''}${s.skipped ? ' skipped' : ''}${locked ? ' locked' : ''}`}>
              <span className="start-mark">{s.done ? <Check size={18} /> : i + 1}</span>
              <div className="start-body">
                <h3>{t.title}{s.skipped && <span className="muted"> · {tr('start.skipped')}</span>}</h3>
                {s.id === 'email' && !s.done ? <VerifyEmailCard /> : (
                  <>
                    <p className="muted">
                      {s.id === 'email'
                        ? <>{tr('start.emailDone')}{balance ? <>{tr('start.onAccount')}<b className="start-ok">{tr.n('unit.creditShort', balance.credits)}</b></> : null}</>
                        : locked ? tr('start.locked') : t.why}
                    </p>
                    {/* Пройденный шаг можно поправить: профиль и бренд меняются когда угодно */}
                    {s.done && t.link && s.id !== 'first' && (
                      <a className="link start-edit" href={t.link}>{tr('start.edit')}</a>
                    )}
                    {!s.done && t.link && (
                      <div className="btn-row">
                        <a className={`btn ${s.id === o.steps.find((x) => !x.done && !x.skipped)?.id ? 'primary' : ''}`}
                          href={t.link} aria-disabled={locked}>{t.go} <ChevronRight size={16} aria-hidden /></a>
                        {(s.id === 'company' || s.id === 'brand') && !s.skipped && (
                          <button className="btn ghost" onClick={() => o.skip(s.id)}>{tr('start.skip')}</button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {o.allDone ? (
        <div className="start-finish">
          <b>{tr('start.finish.a')}</b> {tr('start.finish.b')}
          <a className="btn primary" href={href()} onClick={o.hide}>{tr('start.toPipelines')}</a>
        </div>
      ) : (
        <p className="muted start-foot"><a className="link" href={href()} onClick={o.hide}>{tr('start.hide')}</a>{tr('start.hideNote')}</p>
      )}
    </div>
  );
};

/** Карточка на главной: прогресс и следующий шаг, пока список не пройден и не скрыт */
export const StartCard: React.FC = () => {
  const o = useOnboarding();
  const tr = useT();
  if (!o.relevant || o.hidden || o.allDone) return null;
  const next = o.steps.find((s) => !s.done && !s.skipped);
  return (
    <a className="card start-card" href={href('start')}>
      <div>
        <b>{tr('start.h1')} · {tr('start.of', {a: o.passed, b: o.total})}</b>
        <span className="muted">{tr('start.next', {step: next ? text(tr, next.id).title.toLocaleLowerCase(tr.lang) : tr('start.allDone')})}</span>
      </div>
      <div className="start-bar"><div style={{width: `${(o.passed / o.total) * 100}%`}} /></div>
      <span className="btn primary">{tr('start.continue')} <ChevronRight size={16} aria-hidden /></span>
    </a>
  );
};

// Подписи плиток в кабинете — короче, чем заголовки страницы (start.<шаг>.short): плитка узкая

/**
 * «Настройка кабинета» вверху «Моего кабинета» (владелец 12.10: первые шаги — и в кабинете).
 * Четыре плитки в ряд с прогрессом: что сделано и куда нажать дальше. Видна, пока список не
 * пройден, — даже если на главной его скрыли: кабинет и есть место, где к нему возвращаются.
 * Пройден — карточки нет, кабинет не загромождаем
 */
export const SetupCard: React.FC = () => {
  const o = useOnboarding();
  const tr = useT();
  if (!o.relevant || o.allDone) return null;
  const next = o.steps.find((s) => !s.done && !s.skipped);
  return (
    <section className="setup">
      <div className="setup-head">
        <h2>{tr('start.setup')}</h2>
        <span className="muted">{tr('start.of', {a: o.passed, b: o.total})}</span>
      </div>
      <div className="start-bar"><div style={{width: `${(o.passed / o.total) * 100}%`}} /></div>
      <ol className="setup-steps">
        {o.steps.map((s, i) => {
          const t = text(tr, s.id);
          // Почта вводится крупными клетками на «Первых шагах» — туда и ведём. Плитка нажимается
          // целиком: в ней одно действие, и узкая ссылка внутри была бы мелкой целью на телефоне.
          // Сделанные почта и первый ролик никуда не ведут — плитка не двигается при наведении
          const link = s.id === 'email' ? href('start') : t.link;
          const clickable = !!link && !(s.done && (s.id === 'email' || s.id === 'first'));
          const action = s.done ? tr(clickable ? 'start.tile.doneEdit' : 'start.tile.done')
            : s.id === 'email' ? tr('auth.enterCode') : s.skipped ? tr('start.tile.skipped') : t.go;
          const body = (
            <>
              <span className="start-mark">{s.done ? <Check size={16} /> : i + 1}</span>
              <div><b>{tr(`start.${s.id}.short` as Key)}</b><span className="muted">{action}</span></div>
            </>
          );
          const cls = `setup-step${s.done ? ' done' : ''}${s.id === next?.id ? ' next' : ''}${clickable ? ' lift' : ''}`;
          return <li key={s.id}>{clickable ? <a className={cls} href={link}>{body}</a> : <div className={cls}>{body}</div>}</li>;
        })}
      </ol>
    </section>
  );
};

/**
 * Подтверждение почты крупно: адрес, шесть клеток под код, «отправить ещё раз» с паузой.
 * Код вводится и вставкой целиком (из темы письма — «Код подтверждения KOK: 123456»),
 * шестая цифра отправляет сама. Ошибка — клетки очищаются, курсор в первую
 */
const RESEND_PAUSE = 30;
const VerifyEmailCard: React.FC = () => {
  const {email, refresh, enabled} = useSession();
  const tr = useT();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [wait, setWait] = useState(0);
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { cells.current[0]?.focus(); }, []);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (code: string) => {
    setBusy(true); setError(''); setNote('');
    try { await api.verify(code); refresh(); } catch (e) {
      setError(errorText(e));
      setDigits(Array(6).fill(''));
    } finally { setBusy(false); }
  };
  // Курсор в первую клетку — уже после того, как клетки снова включились: пока идёт проверка,
  // они disabled, и фокус в них не встаёт
  useEffect(() => { if (error && !busy) cells.current[0]?.focus(); }, [error, busy]);
  const put = (from: number, text: string) => {
    const got = text.replace(/\D/g, '').slice(0, 6 - from).split('');
    if (!got.length) return;
    const next = [...digits];
    got.forEach((d, i) => { next[from + i] = d; });
    setDigits(next);
    const end = Math.min(from + got.length, 5);
    cells.current[end]?.focus();
    if (next.every(Boolean)) submit(next.join(''));
  };
  const resend = async () => {
    setError(''); setNote('');
    try { await api.resendVerify(); setNote(tr('verify.resent')); setWait(RESEND_PAUSE); } catch (e) { setError(errorText(e)); }
  };

  return (
    <div className="verify-card">
      <p className="verify-to"><Mail size={18} aria-hidden /> {tr('verify.sentTo')}<b>{email ?? tr('verify.yourEmail')}</b></p>
      <div className="otp" onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData('text')); }}>
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { cells.current[i] = el; }} value={d} disabled={busy} inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} aria-label={tr('verify.digit', {n: i + 1})}
            onChange={(e) => put(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) {
                const next = [...digits]; next[i - 1] = ''; setDigits(next); cells.current[i - 1]?.focus();
              }
            }} />
        ))}
      </div>
      {busy && <p className="muted">{tr('verify.checking')}</p>}
      {error && <p className="auth-error">{error}</p>}
      {note && <p className="auth-ok">{note}</p>}
      <p className="muted verify-hint">
        {tr('verify.hint')}
      </p>
      <button className="btn ghost" onClick={resend} disabled={!enabled || wait > 0}>
        {wait > 0 ? tr('verify.resendIn', {n: wait}) : tr('verify.resend')}
      </button>
    </div>
  );
};
