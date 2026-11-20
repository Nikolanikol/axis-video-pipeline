import React from 'react';
import {useConfig} from './config';
import {useT} from './i18n';

/** До платной сборки человек явно сохраняет общие правки, которые уже видит в превью. */
export const SettingsSaveNotice: React.FC = () => {
  const {unsaved, savingSettings, settingsError, saveSettings} = useConfig();
  const t = useT();
  if (!unsaved && !savingSettings) return null;
  return <div className="settings-save-notice" role="status">
    <span>{t('settings.beforeBuild')}</span>
    <button type="button" className="btn primary" disabled={savingSettings} onClick={() => { void saveSettings().catch(() => {}); }}>
      {t(savingSettings ? 'settings.saving' : 'settings.saveBeforeBuild')}
    </button>
    {settingsError && <p className="error" role="alert">{settingsError}</p>}
  </div>;
};
