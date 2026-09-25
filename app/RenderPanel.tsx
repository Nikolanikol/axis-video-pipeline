// Рендер лота в выбранном формате
import React from 'react';
import {missing} from '../src/shared/model';
import type {FormatMeta, Requirement} from '../src/shared/types';
import {api, LotEntry} from './api';
import {JobsPanel} from './JobsPanel';

type Props = {
  lot: LotEntry;
  format: FormatMeta;
  unsavedSettings: boolean;
  beforeRender: () => Promise<void>;
  onError: (e: unknown) => void;
};

const MISSING: Record<Requirement, string> = {
  photos: 'нет фото',
  specs: 'нет характеристик',
  price: 'нет цены — будет «XX XXX $»',
};

export const RenderPanel: React.FC<Props> = ({lot, format, unsavedSettings, beforeRender, onError}) => {
  const warnings = [
    ...missing(lot, format).map((r) => MISSING[r]),
    unsavedSettings && 'настройки профиля/бренда не сохранены — рендер возьмёт сохранённые',
  ].filter(Boolean) as string[];
  return (
    <JobsPanel
      query={{lot: lot.id}}
      label={`Рендер: ${format.title}`}
      warnings={warnings}
      disabled={!lot.photos.length}
      start={async () => { await beforeRender(); return api.render(lot.id, format.id); }}
      onError={onError}
    />
  );
};
