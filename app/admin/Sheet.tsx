// Панель поверх экрана на телефоне: карточка клиента, форма тарифа. Карточка внутри строки
// таблицы на 375 px была узкой лентой посреди длинного списка (владелец 21.10: «на мобилке
// почти невозможно пользоваться»), поэтому на телефоне открытое — во весь экран, «Назад»
// возвращает к списку на то же место.
//
// Порталом в body: анимация появления страницы оставляет на предках transform, и position:
// fixed внутри считался бы от блока, а не от экрана (то же у окон кабинета, CLAUDE.md)
import React, {useEffect} from 'react';
import {createPortal} from 'react-dom';

export const Sheet: React.FC<{title: React.ReactNode; onClose: () => void; children: React.ReactNode}> = ({title, onClose, children}) => {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    // Страница под панелью не должна листаться пальцем вместе с ней (iOS протаскивает прокрутку)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="admin-sheet" role="dialog" aria-modal="true">
      <header className="admin-sheet-head">
        <button type="button" className="btn ghost" onClick={onClose}>‹ Назад</button>
        <b>{title}</b>
      </header>
      <div className="admin-sheet-body">{children}</div>
    </div>,
    document.body,
  );
};
