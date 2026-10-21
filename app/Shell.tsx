// Оболочка: шапка с пайплайнами, вкладки инструментов, экран выбранного инструмента
import React, {Suspense, useCallback, useEffect, useState} from 'react';
import {CircleUserRound, Menu, X} from 'lucide-react';
import {Loading} from './Loading';
import {ConfigProvider, useConfig} from './config';
import {AuthGate, VerifyBanner, day, daysLeft, useOutOfCredits, useSession} from './auth';
import {AccountPage, AdminPage, RENEW_DAYS} from './Account';
import {Home, PipelinePage} from './Home';
import {StartPage} from './Onboarding';
import {Pipeline, ToolMeta, findPipeline, isClosed, toolKey, visiblePipelines} from './pipelines';
import {href, useRoute} from './router';
import {currencyCode, currencySign, isDirect, krwPerUnit} from '../src/shared/currencies';
import {useRates} from './rates';
import {TOOLS, hasTool} from './tools';
import {Toasts} from './Toast';
import {STALE_BUILD, reloadForNewBuild, reportError} from './errorReport';
import {errorText} from './api';
import {SiteFooter} from './SiteFooter';
import {SourcesStrip} from './Sources';
import {HeaderSlotProvider, useHeaderSlotValue} from './headerSlot';
import {useIsPhone} from './MobileTabs';

export const Shell: React.FC = () => {
  const [error, setError] = useState('');
  const report = useCallback((e: unknown) => setError(errorText(e)), []);
  return (
    <div className="shell">
      <AuthGate>
        <ConfigProvider report={report}>
          <HeaderSlotProvider>
            <Frame error={error} clearError={() => setError('')} />
          </HeaderSlotProvider>
        </ConfigProvider>
      </AuthGate>
      <Toasts />
    </div>
  );
};

const Frame: React.FC<{error: string; clearError: () => void}> = ({error, clearError}) => {
  const route = useRoute();
  const {config} = useConfig();
  const session = useSession();
  const outOfCredits = useOutOfCredits();
  const pipeline = findPipeline(route.pipeline);
  const tool = pipeline?.tools.find((t) => t.id === route.tool);
  // На проде обзоры скрыты из вкладок; сам инструмент по прямой ссылке всё равно откроется
  const pipelines = visiblePipelines(config.production);
  const main = pipelines.filter((p) => p.kind !== 'settings');
  const settings = pipelines.find((p) => p.kind === 'settings');

  // Разделы одним списком: на компьютере это вкладки в шапке, на телефоне — пункты меню-бургера
  const navItems = [
    ...main.map((p) => ({key: p.id, to: href(p.id, firstReady(p)?.id), label: p.title, active: p.id === pipeline?.id})),
    ...(settings ? [{key: settings.id, to: href(settings.id, firstReady(settings)?.id), label: settings.title, active: settings.id === pipeline?.id}] : []),
    ...(session.enabled && session.isStaff ? [{key: 'admin', to: href('admin'), label: 'Админка', active: route.pipeline === 'admin'}] : []),
  ];

  // Меню-бургер (телефон, владелец 01.10: вкладки не помещались, шапка получала полосу
  // прокрутки). Закрывается при переходе, по Escape и по нажатию мимо меню
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [route.pipeline, route.tool]);
  // Своя строка экрана вместо логотипа (headerSlot.tsx) — только на телефоне: на компьютере место есть
  const phone = useIsPhone();
  const slot = useHeaderSlotValue();
  const own = phone && slot;
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Подвал — под рабочей зоной высотой в экран (владелец 12.10): виден всегда, но до него надо
  // чуть прокрутить. Исключение — телефон на экранах с выдвижными панелями (MobileTabs.tsx): там
  // панели, нижние вкладки и кнопка сборки закреплены поверх экрана и закрывали бы подвал, а верх
  // панелей (--mtop) меряется без учёта прокрутки страницы
  const fixedPanels = !!pipeline && !!tool && PHONE_PANEL_TOOLS.has(toolKey(pipeline.id, tool.id)) && !isClosed(pipeline.id, config.production);
  const service = [
    ...main.map((p) => ({label: p.title, href: href(p.id, firstReady(p)?.id)})),
    ...(session.enabled && !session.isStaff ? [{label: 'Кабинет и тарифы', href: href('account')}] : []),
  ];

  return (
    <>
    <div className="app">
      <div className={menuOpen ? 'menu-scrim open' : 'menu-scrim'} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <header className={own ? 'top top-slot' : 'top'}>
        {/* Нажали что-то в строке экрана (например, «Ролики») при открытом меню — меню закрывается, а не
            остаётся висеть поверх (владелец 20.10) */}
        {own ? <div className="top-slot-content" onClickCapture={() => setMenuOpen(false)}>{slot.content}</div> : <>
        <a href={href()} className="top-home" title="Все пайплайны">
          <img src="/kok/wordmark.svg" alt="KOK" className="top-logo" />
        </a>
        <RatesChip />
        {config.preview && <span className="top-preview" title="Превью ветки: тестовая база, не прод">ТЕСТ · PR {config.preview}</span>}
        <nav className="crumbs">
          <a href={href()}>Пайплайны</a>
          {pipeline && <><span>›</span><a href={href(pipeline.id)}>{pipeline.title}</a></>}
          {pipeline && tool && <><span>›</span><b>{tool.title}</b></>}
        </nav>
        {/* Площадки-источники — в свободном месте шапки, слева от вкладок пайплайнов (владелец 13.10).
            Только на широком экране; уже — строка под полем ссылки (QuickLink), стили — .top-sources */}
        <SourcesStrip compact title="" countries={false} className="top-sources" />
        <nav className="tabs">
          {navItems.map((i) => <a key={i.key} href={i.to} className={i.active ? 'tab active' : 'tab'}>{i.label}</a>)}
        </nav>
        {session.enabled && <AccountChip />}
        {/* Только телефон: остаток кредитов всегда на виду, остальное — в меню */}
        {session.enabled && !session.isStaff && session.balance && (
          <a className="top-credits" href={href('account')} title="Личный кабинет и тарифы" aria-label={`Личный кабинет, ${session.balance.credits} кр.`}>
            <CircleUserRound size={18} aria-hidden />{session.balance.credits} кр.
          </a>
        )}
        </>}
        <button className="burger" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="menu-sheet"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div id="menu-sheet" className={menuOpen ? 'menu-sheet open' : 'menu-sheet'}>
          {/* Пункты экрана (например, «Ролики» у мобильной палитры) — первыми, над разделами */}
          {own && slot.menu?.length ? <nav className="menu-links" aria-label="Этот экран">
            <a href={href()} className="menu-link">Главная</a>
            {slot.menu.map((m) => <button key={m.label} type="button" className="menu-link" onClick={() => { setMenuOpen(false); m.onClick(); }}>{m.label}</button>)}
          </nav> : null}
          <nav className="menu-links" aria-label="Разделы">
            {navItems.map((i) => <a key={i.key} href={i.to} className={i.active ? 'menu-link active' : 'menu-link'}>{i.label}</a>)}
          </nav>
          {session.enabled && <AccountChip />}
          {/* На телефоне курсы — в меню: в шапке рядом с логотипом им нет места */}
          <RatesChip />
        </div>
      </header>

      {pipeline && pipeline.tools.length > 1 && (
        <nav className="subnav">
          {pipeline.tools.map((t) => (
            <a key={t.id} href={href(pipeline.id, t.id)} className={t.id === tool?.id ? 'subtab active' : 'subtab'}>
              {t.title}{t.status === 'soon' && <span className="badge">скоро</span>}
            </a>
          ))}
        </nav>
      )}

      {error && <div className="error" onClick={clearError}>{error} <span className="muted">— нажми, чтобы скрыть</span></div>}
      <VerifyBanner />
      {outOfCredits && (
        <div className="readonly">
          Кредиты закончились: готовое можно смотреть и скачивать, новое — после продления подписки или докупки.{' '}
          <a href={href('account')}>Тарифы</a>
        </div>
      )}
      {!outOfCredits && <RenewBanner />}

      <div className="tool">
        {route.pipeline === 'account' ? <AccountPage />
          : route.pipeline === 'start' ? <StartPage />
          : route.pipeline === 'admin' ? <AdminPage />
          : !route.pipeline ? <Home />
          : !pipeline ? <NotFound />
            : isClosed(pipeline.id, config.production) ? <Unavailable pipeline={pipeline} />
            : !route.tool ? <PipelinePage pipeline={pipeline} />
              : !tool ? <NotFound />
                : <ToolScreen pipeline={pipeline} tool={tool} />}
      </div>
    </div>
    <SiteFooter service={service} className={fixedPanels ? 'foot-no-phone' : undefined} />
    </>
  );
};

// Инструменты с выдвижными панелями на телефоне (usePanelSwipes) — там подвала на телефоне нет
const PHONE_PANEL_TOOLS = new Set(['ads/lot', 'carousels/build', 'settings/profile', 'settings/brand', 'settings/ads']);

/**
 * Подписка скоро кончится: за RENEW_DAYS дней до конца. Кредиты подписки сгорают, поэтому
 * говорим и сколько сгорит — это и напоминание продлить, и повод потратить остаток.
 * Когда кредиты уже кончились, показывается своя полоса «кредиты закончились» — две
 * полосы подряд про одно и то же были бы лишними.
 */
const RenewBanner: React.FC = () => {
  const {enabled, isStaff, balance} = useSession();
  const sub = balance?.subscription;
  if (!enabled || isStaff || !sub) return null;
  const left = daysLeft(sub.until);
  if (left > RENEW_DAYS) return null;
  // Сгорят только кредиты с этим сроком: продлённый заранее месяц уже лежит отдельной партией
  const burning = balance!.lots.filter((l) => new Date(l.expiresAt).getTime() <= new Date(sub.until).getTime())
    .reduce((n, l) => n + l.remaining, 0);
  return (
    <div className="readonly">
      Подписка «{sub.title}» заканчивается {day(sub.until)}{left <= 1 ? ' — завтра или сегодня' : ` — через ${left} дн.`}
      {burning > 0 && <>, вместе с ней сгорят {burning} кр.</>}.{' '}
      <a href={href('account')}>Продлить</a>
    </div>
  );
};

/**
 * Курсы на сегодня рядом с логотипом (владелец 11.10): доллар и валюта компании к воне —
 * цены на Encar в вонах, и дилер сверяется с курсом, не уходя со страницы. Справочно: цены
 * объявлений считаются по курсу, записанному в объявлении, — его клиент правит сам
 */
const RatesChip: React.FC = () => {
  const {profile} = useConfig();
  const rates = useRates();
  if (!rates) return null;
  const currency = currencyCode(profile.pricing?.currency);
  const krwUsd = rates.usdRates.KRW;
  const own = isDirect(currency) ? null : krwPerUnit(currency, rates.usdRates);
  const n = (v: number) => v.toLocaleString('ru-RU', {maximumFractionDigits: 2});
  const day = new Date(rates.fetchedAt).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'});
  return (
    <span className={rates.stale ? 'top-rates stale' : 'top-rates'}
      title={`${rates.stale ? 'Курс не обновился, последний известный' : 'Курс'} на ${day} · ${rates.source}`}>
      {krwUsd ? <span>1 $ = <b>{n(krwUsd)} ₩</b></span> : null}
      {own ? <span>1 {currencySign(currency)} = <b>{n(own)} ₩</b></span> : null}
      {rates.stale && <span className="muted">на {day}</span>}
    </span>
  );
};

// Компания и кредиты в шапке: клиент видит остаток, не заходя в кабинет. Иконка профиля —
// чтобы было понятно, что это вход в личный кабинет (владелец 12.10: одно название компании
// не читалось как ссылка)
const AccountChip: React.FC = () => {
  const {workspace, balance, email, isAdmin, isStaff, logout} = useSession();
  const soon = balance?.nextExpiry;
  return (
    <div className="account-chip">
      <a className="account-link" href={href('account')} aria-label="Личный кабинет"
        title={`Личный кабинет${soon ? ` · ${soon.credits} кр. сгорят ${day(soon.at)}` : email ? ` · ${email}` : ''}`}>
        <CircleUserRound className="account-icon" size={22} aria-hidden />
        <b>{workspace?.name}</b>
        <span className="muted">
          {isStaff ? (isAdmin ? ' · владелец платформы' : ' · менеджер') : ` · ${balance?.credits ?? 0} кр.`}
        </span>
      </a>
      <button className="btn ghost" onClick={logout}>Выйти</button>
    </div>
  );
};

const firstReady = (p: Pipeline) => p.tools.find((t) => t.status === 'ready') ?? p.tools[0];

const ToolScreen: React.FC<{pipeline: Pipeline; tool: ToolMeta}> = ({pipeline, tool}) => {
  const key = toolKey(pipeline.id, tool.id);
  if (tool.status === 'soon' || !hasTool(key)) return <ComingSoon pipeline={pipeline} tool={tool} />;
  const Tool = TOOLS[key];
  return (
    <ToolBoundary key={key} title={tool.title}>
      <Suspense fallback={<Loading />}>
        <Tool />
      </Suspense>
    </ToolBoundary>
  );
};

// Ошибка внутри инструмента не роняет всё приложение. Текст исключения человеку не показываем:
// он английский и про код («Cannot read properties of undefined»), — отчёт уже ушёл нам.
// Отдельный случай — после выкладки старая вкладка просит кусок сборки, которого больше нет:
// это лечит только перезагрузка, «Попробовать снова» падало бы раз за разом
// (шаблон и перезагрузка — в errorReport.ts: один раз сама, чаще раза в минуту — кнопкой)

class ToolBoundary extends React.Component<{title: string; children: React.ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error);
    // Устаревшая сборка — сразу на новую; не вышло (уже перезагружались только что) — экран с кнопкой
    if (STALE_BUILD.test(error.message) && reloadForNewBuild()) return;
    reportError('boundary', error, {tool: this.props.title, componentStack: info.componentStack ?? undefined});
  }
  render() {
    const {error} = this.state;
    if (!error) return this.props.children;
    const stale = STALE_BUILD.test(error.message);
    return (
      <div className="page">
        <div className="card">
          <h1>«{this.props.title}» не открылся</h1>
          <p className="job-message">
            {stale
              ? 'Мы обновили KOK, пока страница была открыта. Обновите её — всё ваше сохранено.'
              : 'На странице произошёл сбой. Мы уже получили отчёт и разберёмся. Попробуйте ещё раз или обновите страницу — сохранённое не потеряется.'}
          </p>
          <div className="actions-row">
            {stale
              ? <button className="btn primary" onClick={() => window.location.reload()}>Обновить страницу</button>
              : <button className="btn" onClick={() => this.setState({error: null})}>Попробовать снова</button>}
            <a className="btn ghost" href={href()}>Все пайплайны</a>
          </div>
        </div>
      </div>
    );
  }
}

const ComingSoon: React.FC<{pipeline: Pipeline; tool: ToolMeta}> = ({pipeline, tool}) => (
  <div className="page">
    <div className="card soon">
      <span className="badge">скоро</span>
      <h1>{tool.title}</h1>
      <p>{tool.description}</p>
      <p className="muted">Инструмент в разработке. Пока можно вернуться к пайплайну «{pipeline.title}» или на главную.</p>
      <div className="actions-row">
        <a className="btn" href={href(pipeline.id)}>{pipeline.title}</a>
        <a className="btn ghost" href={href()}>Все пайплайны</a>
      </div>
    </div>
  </div>
);

// Пайплайн закрыт на проде (см. isClosed): показываем, что он есть, но пока недоступен,
// вместо инструмента — экран инструмента даже не загружается
const Unavailable: React.FC<{pipeline: Pipeline}> = ({pipeline}) => (
  <div className="page">
    <div className="card soon">
      <span className="badge">скоро</span>
      <h1>{pipeline.title}</h1>
      <p>{pipeline.description}</p>
      <p className="muted">Этот раздел пока недоступен — готовим его к запуску. Карусели и ролики по объявлениям работают.</p>
      <div className="actions-row">
        <a className="btn" href={href()}>Все пайплайны</a>
      </div>
    </div>
  </div>
);

const NotFound: React.FC = () => (
  <div className="page">
    <div className="card">
      <h1>Такой страницы нет</h1>
      <a className="btn" href={href()}>Все пайплайны</a>
    </div>
  </div>
);
