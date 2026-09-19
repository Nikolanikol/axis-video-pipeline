// Оболочка: шапка с пайплайнами, вкладки инструментов, экран выбранного инструмента
import React, {Suspense, useCallback, useState} from 'react';
import {ConfigProvider} from './config';
import {Home, PipelinePage} from './Home';
import {PIPELINES, Pipeline, ToolMeta, findPipeline, toolKey} from './pipelines';
import {href, useRoute} from './router';
import {TOOLS, hasTool} from './tools';

export const Shell: React.FC = () => {
  const [error, setError] = useState('');
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  return (
    <div className="app">
      <ConfigProvider report={report}>
        <Frame error={error} clearError={() => setError('')} />
      </ConfigProvider>
    </div>
  );
};

const Frame: React.FC<{error: string; clearError: () => void}> = ({error, clearError}) => {
  const route = useRoute();
  const pipeline = findPipeline(route.pipeline);
  const tool = pipeline?.tools.find((t) => t.id === route.tool);
  const main = PIPELINES.filter((p) => p.kind !== 'settings');
  const settings = PIPELINES.find((p) => p.kind === 'settings');

  return (
    <>
      <header className="top">
        <a href={href()} className="top-home" title="Все пайплайны">
          <img src="/brand/logo-horizontal.svg" alt="AXIS" className="top-logo" />
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
        </nav>
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

      <div className="tool">
        {!route.pipeline ? <Home />
          : !pipeline ? <NotFound />
            : !route.tool ? <PipelinePage pipeline={pipeline} />
              : !tool ? <NotFound />
                : <ToolScreen pipeline={pipeline} tool={tool} />}
      </div>
    </>
  );
};

const firstReady = (p: Pipeline) => p.tools.find((t) => t.status === 'ready') ?? p.tools[0];

const ToolScreen: React.FC<{pipeline: Pipeline; tool: ToolMeta}> = ({pipeline, tool}) => {
  const key = toolKey(pipeline.id, tool.id);
  if (tool.status === 'soon' || !hasTool(key)) return <ComingSoon pipeline={pipeline} tool={tool} />;
  const Tool = TOOLS[key];
  return (
    <ToolBoundary key={key} title={tool.title}>
      <Suspense fallback={<div className="boot">Загрузка…</div>}>
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

const NotFound: React.FC = () => (
  <div className="page">
    <div className="card">
      <h1>Такой страницы нет</h1>
      <a className="btn" href={href()}>Все пайплайны</a>
    </div>
  </div>
);
