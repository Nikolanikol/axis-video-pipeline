// Ошибка рядом с действием: доступна скринридеру, закрывается настоящей кнопкой.
import React from 'react';
import {X} from 'lucide-react';
import {useT} from './i18n';

export const ActionError: React.FC<{message: string; onDismiss: () => void; id?: string}> = ({message, onDismiss, id}) => {
  const t = useT();
  return <div className="error action-error" role="alert" id={id}>
    <span>{message}</span>
    <button type="button" className="icon" onClick={onDismiss} aria-label={t('common.dismissError')}><X size={18} aria-hidden /></button>
  </div>;
};
