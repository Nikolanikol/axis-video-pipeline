// Рендер лота в выбранном формате
import React from 'react';
import {missing} from '../src/shared/model';
import type {FormatMeta, Requirement} from '../src/shared/types';
import {api, LotEntry} from './api';
import {JobsPanel, type JobPanelState} from './JobsPanel';
import {useT, type Key} from './i18n';

type Props = {
  lot: LotEntry;
  format: FormatMeta;
  unsavedSettings: boolean;
  beforeRender: () => Promise<void>;
  onError: (e: unknown) => void;
  // Список роликов свёрнут под «Ролики (N)» — в закреплённом низу палитры (JobsPanel)
  folded?: boolean;
  // Мобильная палитра: кнопка сборки — в верхней строке экрана (см. JobsPanel)
  hideButton?: boolean;
  trigger?: React.MutableRefObject<(() => void) | null>;
  onState?: (state: JobPanelState) => void;
};

// Чего не хватает объявлению — render.missing.<что> в словаре
const MISSING = (r: Requirement): Key => `render.missing.${r}` as Key;

export const RenderPanel: React.FC<Props> = ({lot, format, unsavedSettings, beforeRender, onError, folded, hideButton, trigger, onState}) => {
  const t = useT();
  const warnings = [
    ...missing(lot, format).map((r) => t(MISSING(r))),
    unsavedSettings && t('render.unsaved'),
  ].filter(Boolean) as string[];
  return (
    <JobsPanel
      query={{lot: lot.id}}
      label={t('render.build')}
      warnings={warnings}
      disabled={!lot.photos.length}
      start={async () => { await beforeRender(); return api.render(lot.id, format.id); }}
      onError={onError}
      pipeline="ads"
      folded={folded}
      hideButton={hideButton}
      trigger={trigger}
      onState={onState}
    />
  );
};
