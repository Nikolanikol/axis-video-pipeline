// «КП в PDF» у объявления: кнопка и окно сборки коммерческого предложения.
// В окне — только то, что меняется от клиента к клиенту: кому, суммы этого раза, разовые строки.
// Всё постоянное (реквизиты, строки расчёта, условия) — в Настройки → «Коммерческое предложение».
// Форма и расчёт — общие с экраном «Сформировать КП» (app/offers/OfferBuilder.tsx).
import React, {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText} from 'lucide-react';
import type {LotEntry} from '../api';
import {OfferBuilder, useOfferDraft, useOfferBuild} from '../offers/OfferBuilder';
import {useT} from '../i18n';
import {useModalFocus} from '../useModalFocus';

const OfferDialog: React.FC<{lot: LotEntry; onClose: () => void}> = ({lot, onClose}) => {
  const t = useT();
  const draft = useOfferDraft(lot);
  const action = useOfferBuild(draft);
  const close = () => { if (!action.busy) onClose(); };
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, true, close);
  // Порталом в body: у предков анимация оставляет transform, и fixed считался бы от блока
  return createPortal(
    <div className="modal-backdrop" onClick={close}>
      <div ref={dialog} tabIndex={-1} className="pay-dialog offer-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="offer-title">
        <h2 id="offer-title">{t('of.dialog')}</h2>
        <OfferBuilder draft={draft} action={action} />
        <button className="btn ghost" disabled={action.busy} onClick={close}>{t('of.close')}</button>
      </div>
    </div>,
    document.body,
  );
};

export const OfferButton: React.FC<{lot: LotEntry}> = ({lot}) => {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button type="button" className="btn offer-btn" onClick={() => setOpen(true)} disabled={!lot.brand}>
        <FileText size={16} /> {t('of.button')}
      </button>
      {open && <OfferDialog lot={lot} onClose={() => setOpen(false)} />}
    </>
  );
};
