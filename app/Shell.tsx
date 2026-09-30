// Оболочка: шапка с пайплайнами, вкладки инструментов, экран выбранного инструмента
import React, {Suspense, useCallback, useState} from 'react';
import {Loading} from './Loading';
import {ConfigProvider, useConfig} from './config';
import {AuthGate, VerifyBanner, day, daysLeft, useOutOfCredits, useSession} from './auth';
import {AccountPage, AdminPage, RENEW_DAYS} from './Account';
import {Home, PipelinePage} from './Home';
import {Pipeline, ToolMeta, findPipeline, isClosed, toolKey, visiblePipelines} from './pipelines';
import {href, useRoute} from './router';
import {TOOLS, hasTool} from './tools';
import {Toasts} from './Toast';

export const Shell: React.FC = () => {
  const [error, setError] = useState('');
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  return (
    <div className="app">
      <AuthGate>
        <ConfigProvider report={report}>
          <Frame error={error} clearError={() => setError('')} />
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

  return (
    <>
      <header className="top">
        <a href={href()} className="top-home" title="Все пайплайны">
          <img src="/kok/wordmark.svg" alt="KOK" className="top-logo" />
        </a>
        <nav className="crumbs">
          <a href={href()}>Пайплайны</a>
          {pipeline && <><span>›</span><a href={href(pipeline.id)}>{pipeline.title}</a></>}
          {pipeline && tool && <><span>›</span><b>{tool.title}</b></>}
        </nav>
        <nav className="tabs">
          {main.map((p) => (
            <a key={p.id} href={href(p.id, firstReady(p)?.id)} className={p.id === pipeline?.id ? 'tab active' : 'tab'}>{p.title}</a>
          ))}
          {settings && (
            <a href={href(settings.id, firstReady(settings)?.id)} className={settings.id === pipeline?.id ? 'tab active' : 'tab'}>
              {settings.title}
            </a>
          )}
          {session.enabled && session.isStaff && (
            <a href={href('admin')} className={route.pipeline === 'admin' ? 'tab active' : 'tab'}>Админка</a>
          )}
        </nav>
        {session.enabled && <AccountChip />}
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
          : route.pipeline === 'admin' ? <AdminPage />
          : !route.pipeline ? <Home />
          : !pipeline ? <NotFound />
            : isClosed(pipeline.id, config.production) ? <Unavailable pipeline={pipeline} />
            : !route.tool ? <PipelinePage pipeline={pipeline} />
              : !tool ? <NotFound />
                : <ToolScreen pipeline={pipeline} tool={tool} />}
      </div>
    </>
  );
};

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

// Компания и кредиты в шапке: клиент видит остаток, не заходя в кабинет
const AccountChip: React.FC = () => {
  const {workspace, balance, email, isAdmin, isStaff, logout} = useSession();
  const soon = balance?.nextExpiry;
  return (
    <div className="account-chip">
      <a href={href('account')} title={soon ? `${soon.credits} кр. сгорят ${day(soon.at)}` : email ?? ''}>
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

// Ошибка внутри инструмента не роняет всё приложение
class ToolBoundary extends React.Component<{title: string; children: React.ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card">
          <h1>«{this.props.title}» не открылся</h1>
          <p className="job-message">{this.state.error.message}</p>
          <div className="actions-row">
            <button className="btn" onClick={() => this.setState({error: null})}>Попробовать снова</button>
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
      <p className="muted">Этот раздел пока недоступен — готовим его к запуску. Карусели и ролики по лотам работают.</p>
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
