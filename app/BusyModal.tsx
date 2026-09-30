// Окно «идёт работа» поверх всего экрана: шаги с отметками, экран под ним не нажимается.
// Общее для лота по ссылке Encar и сборки карусели (владелец 30.09: «такой же индикатор
// с блокировкой экрана»). Окно — в body через портал, #root на время — inert: затемнение
// закрывает мышь, а inert — ещё и Tab с клавиатуры. Отмены нет: работа уже идёт на сервере,
// прерванная оставила бы лот или карусель наполовину собранными.
import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {RecMark} from './Loading';

type Props = {
  // null — окна нет
  step: number | null;
  steps: string[];
  label: string;
  note?: string;
};

/** step — индекс текущего шага (что до него — отмечено галочкой), null — окна нет */
export const BusyModal: React.FC<Props> = ({step, steps, label, note}) => {
  const open = step !== null;
  // Секунды с начала — когда шаг один и долгий (сборка карусели), видно, что дело идёт
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const root = document.getElementById('root');
    if (!open || !root) return;
    root.inert = true;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { root.inert = false; clearInterval(t); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop import-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <div className="import-modal" role="status">
        <RecMark />
        <ol className="import-steps">
          {steps.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
              <span className="import-mark" aria-hidden="true">{i < step ? '✓' : i + 1}</span>{s}{i === step ? '…' : ''}
            </li>
          ))}
        </ol>
        <div className="muted import-note">{note}{secs >= 3 ? ` · ${secs} с` : ''}</div>
      </div>
    </div>,
    document.body,
  );
};
