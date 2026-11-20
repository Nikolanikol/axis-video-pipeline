// Три действующих рабочих сценария доступны и при собственной шапке мобильного видео.
import React from 'react';
import {href, useRoute} from './router';
import {useT} from './i18n';
import './workspace.css';

export const WORKSPACE_TOOLS = [
  {pipeline: 'ads', tool: 'lot', label: 'workspace.video'},
  {pipeline: 'carousels', tool: 'build', label: 'workspace.carousels'},
  {pipeline: 'offers', tool: 'build', label: 'workspace.offers'},
] as const;
export const WorkspaceNav: React.FC = () => {
  const route = useRoute();
  const t = useT();
  if (!WORKSPACE_TOOLS.some((x) => x.pipeline === route.pipeline)) return null;
  return <nav className="workspace-nav" aria-label={t('workspace.nav')}>
    {WORKSPACE_TOOLS.map((x) => <a key={x.pipeline} href={href(x.pipeline, x.tool)} aria-current={route.pipeline === x.pipeline ? 'page' : undefined}>
      {t(x.label)}
    </a>)}
  </nav>;
};
