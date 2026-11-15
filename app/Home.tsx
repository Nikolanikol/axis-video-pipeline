// Главная: пайплайны и их инструменты
import React from 'react';
import {Pipeline, visiblePipelines} from './pipelines';
import {href} from './router';
import {useConfig} from './config';
import {StartCard} from './Onboarding';
import {useT} from './i18n';

const ToolList: React.FC<{pipeline: Pipeline}> = ({pipeline}) => {
  const t = useT();
  return (
  <div className="tool-list">
    {pipeline.tools.map((x) => (
      <a key={x.id} href={href(pipeline.id, x.id)} className={x.status === 'soon' ? 'tool-link soon' : 'tool-link'}>
        <span className="tool-title">{t.cfg(x.title)}{x.status === 'soon' && <span className="badge">{t('shell.soon')}</span>}</span>
        <span className="muted">{t.cfg(x.description)}</span>
      </a>
    ))}
  </div>
  );
};

export const Home: React.FC = () => {
  const {config} = useConfig();
  const t = useT();
  const pipelines = visiblePipelines(config.production);
  const main = pipelines.filter((p) => p.kind !== 'settings');
  const settings = pipelines.filter((p) => p.kind === 'settings');
  return (
    <div className="page">
      {/* Пока «Первые шаги» не пройдены — карточка над пайплайнами, иначе ничего */}
      <StartCard />
      <h1 className="page-title">{t('shell.pipelines')}</h1>
      <div className="cards">
        {main.map((p) => (
          <section key={p.id} className="card pipeline">
            <a href={href(p.id)} className="card-head">
              <h2>{t.cfg(p.title)}</h2>
              <p className="muted">{t.cfg(p.description)}</p>
            </a>
            <ToolList pipeline={p} />
          </section>
        ))}
      </div>
      {settings.map((p) => (
        <section key={p.id} className="card settings-card">
          <h2>{t.cfg(p.title)} <span className="muted">{t.cfg(p.description)}</span></h2>
          <ToolList pipeline={p} />
        </section>
      ))}
    </div>
  );
};

export const PipelinePage: React.FC<{pipeline: Pipeline}> = ({pipeline}) => {
  const t = useT();
  return (
  <div className="page">
    <h1 className="page-title">{t.cfg(pipeline.title)}</h1>
    <p className="muted">{t.cfg(pipeline.description)}</p>
    <section className="card">
      <h2>{t('shell.tools')}</h2>
      <ToolList pipeline={pipeline} />
    </section>
  </div>
  );
};
