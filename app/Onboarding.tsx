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
import {api} from './api';
import {useSession} from './auth';
import {useConfig} from './config';
import platformBrand from '../config/brand.json';
import {href} from './router';

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
  useEffect(() => { api.lots().then((l) => setLots(l.length)).catch(() => setLots(null)); }, []);

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

const TEXT: Record<StepId, {title: string; why: string; go?: string; link?: string}> = {
  email: {title: 'Подтвердите почту', why: 'После подтверждения на счёт придут бесплатные кредиты — без них ролики и карусели не собираются.'},
  company: {title: 'Расскажите о компании', why: 'Название, язык постов и WhatsApp или сайт — они будут на каждом вашем ролике и карусели.',
    go: 'Заполнить профиль', link: href('settings', 'profile')},
  brand: {title: 'Настройте бренд', why: 'Логотип, цвета и шрифты. Можно позже: без логотипа на роликах будет название компании текстом.',
    go: 'Открыть бренд', link: href('settings', 'brand')},
  first: {title: 'Соберите первый ролик', why: 'Вставьте ссылку на объявление Encar — фото, характеристики и цена подтянутся сами.',
    go: 'Вставить ссылку', link: href('ads', 'lot')},
};

/** Страница «Первые шаги» (#/start) — сюда ведёт регистрация */
export const StartPage: React.FC = () => {
  const o = useOnboarding();
  const {balance} = useSession();
  const emailDone = o.steps[0].done;
  return (
    <div className="page start">
      <h1 className="page-title">Первые шаги</h1>
      <p className="muted start-lead">Четыре шага — и у вас первый ролик. «О компании» и «Бренд» можно пропустить и вернуться к ним позже.</p>
      <div className="start-progress" aria-label={`Готово ${o.passed} из ${o.total}`}>
        <div className="start-bar"><div style={{width: `${(o.passed / o.total) * 100}%`}} /></div>
        <span>Готово {o.passed} из {o.total}</span>
      </div>
      <ol className="start-steps">
        {o.steps.map((s, i) => {
          const t = TEXT[s.id];
          // Первый ролик тратит кредиты — до подтверждения почты их нет, шаг приглушён
          const locked = s.id === 'first' && !emailDone;
          return (
            <li key={s.id} className={`start-step${s.done ? ' done' : ''}${s.skipped ? ' skipped' : ''}${locked ? ' locked' : ''}`}>
              <span className="start-mark">{s.done ? <Check size={18} /> : i + 1}</span>
              <div className="start-body">
                <h3>{t.title}{s.skipped && <span className="muted"> · пропущено</span>}</h3>
                {s.id === 'email' && !s.done ? <VerifyEmailCard /> : (
                  <>
                    <p className="muted">
                      {s.id === 'email'
                        ? <>Почта подтверждена{balance ? <> — на счёте <b className="start-ok">{balance.credits} кр.</b></> : null}</>
                        : locked ? 'Откроется после подтверждения почты: сборка тратит кредиты.' : t.why}
                    </p>
                    {/* Пройденный шаг можно поправить: профиль и бренд меняются когда угодно */}
                    {s.done && t.link && s.id !== 'first' && (
                      <a className="link start-edit" href={t.link}>Изменить</a>
                    )}
                    {!s.done && t.link && (
                      <div className="btn-row">
                        <a className={`btn ${s.id === o.steps.find((x) => !x.done && !x.skipped)?.id ? 'primary' : ''}`}
                          href={t.link} aria-disabled={locked}>{t.go} <ChevronRight size={16} aria-hidden /></a>
                        {(s.id === 'company' || s.id === 'brand') && !s.skipped && (
                          <button className="btn ghost" onClick={() => o.skip(s.id)}>Пропустить</button>
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
          <b>Всё готово.</b> Дальше — ролики и карусели по любым объявлениям.
          <a className="btn primary" href={href()} onClick={o.hide}>К пайплайнам</a>
        </div>
      ) : (
        <p className="muted start-foot"><a className="link" href={href()} onClick={o.hide}>Скрыть список</a> — вернуть можно в кабинете.</p>
      )}
    </div>
  );
};

/** Карточка на главной: прогресс и следующий шаг, пока список не пройден и не скрыт */
export const StartCard: React.FC = () => {
  const o = useOnboarding();
  if (!o.relevant || o.hidden || o.allDone) return null;
  const next = o.steps.find((s) => !s.done && !s.skipped);
  return (
    <a className="card start-card" href={href('start')}>
      <div>
        <b>Первые шаги · {o.passed} из {o.total}</b>
        <span className="muted">Дальше: {next ? TEXT[next.id].title.toLowerCase() : 'всё готово'}</span>
      </div>
      <div className="start-bar"><div style={{width: `${(o.passed / o.total) * 100}%`}} /></div>
      <span className="btn primary">Продолжить <ChevronRight size={16} aria-hidden /></span>
    </a>
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
      setError(e instanceof Error ? e.message : String(e));
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
    try { await api.resendVerify(); setNote('Отправили новый код.'); setWait(RESEND_PAUSE); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="verify-card">
      <p className="verify-to"><Mail size={18} aria-hidden /> Код отправлен на <b>{email ?? 'вашу почту'}</b></p>
      <div className="otp" onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData('text')); }}>
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { cells.current[i] = el; }} value={d} disabled={busy} inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} aria-label={`Цифра ${i + 1} из 6`}
            onChange={(e) => put(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) {
                const next = [...digits]; next[i - 1] = ''; setDigits(next); cells.current[i - 1]?.focus();
              }
            }} />
        ))}
      </div>
      {busy && <p className="muted">Проверяю…</p>}
      {error && <p className="auth-error">{error}</p>}
      {note && <p className="auth-ok">{note}</p>}
      <p className="muted verify-hint">
        Код — прямо в теме письма «Код подтверждения KOK». Можно и просто нажать ссылку в письме.
        Нет письма — загляните в «Спам» и «Промоакции».
      </p>
      <button className="btn ghost" onClick={resend} disabled={!enabled || wait > 0}>
        {wait > 0 ? `Отправить ещё раз через ${wait} с` : 'Отправить ещё раз'}
      </button>
    </div>
  );
};
