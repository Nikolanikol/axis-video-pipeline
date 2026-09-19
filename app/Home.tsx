// Главная: пайплайны и их инструменты
import React from 'react';
import {PIPELINES, Pipeline} from './pipelines';
import {href} from './router';

const ToolList: React.FC<{pipeline: Pipeline}> = ({pipeline}) => (
  <div className="tool-list">
    {pipeline.tools.map((t) => (
      <a key={t.id} href={href(pipeline.id, t.id)} className={t.status === 'soon' ? 'tool-link soon' : 'tool-link'}>
        <span className="tool-title">{t.title}{t.status === 'soon' && <span className="badge">скоро</span>}</span>
        <span className="muted">{t.description}</span>
      </a>
    ))}
  </div>
);

export const Home: React.FC = () => {
  const main = PIPELINES.filter((p) => p.kind !== 'settings');
  const settings = PIPELINES.filter((p) => p.kind === 'settings');
  return (
    <div className="page">
      <h1 className="page-title">Пайплайны</h1>
      <div className="cards">
        {main.map((p) => (
          <section key={p.id} className="card pipeline">
            <a href={href(p.id)} className="card-head">
              <h2>{p.title}</h2>
              <p className="muted">{p.description}</p>
            </a>
            <ToolList pipeline={p} />
          </section>
        ))}
      </div>
      {settings.map((p) => (
        <section key={p.id} className="card settings-card">
          <h2>{p.title} <span className="muted">{p.description}</span></h2>
          <ToolList pipeline={p} />
        </section>
      ))}
    </div>
  );
};

export const PipelinePage: React.FC<{pipeline: Pipeline}> = ({pipeline}) => (
  <div className="page">
    <h1 className="page-title">{pipeline.title}</h1>
    <p className="muted">{pipeline.description}</p>
    <section className="card">
      <h2>Инструменты</h2>
      <ToolList pipeline={pipeline} />
    </section>
  </div>
);
