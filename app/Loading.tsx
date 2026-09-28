// Экран ожидания платформы: знак KOK, у которого точка пульсирует, как лампочка записи.
// Знак встроен разметкой, а не <img src="/kok/mark.svg">: анимировать нужно одну точку,
// а у картинки внутренности недоступны CSS.
import React from 'react';

export const Loading: React.FC<{text?: string}> = ({text = 'Загрузка…'}) => (
  <div className="boot" role="status">
    <svg className="rec" viewBox="0 0 320 320" aria-hidden="true">
      <circle cx="160" cy="160" r="112" fill="none" stroke="var(--text)" strokeWidth="58" />
      <circle className="rec-dot" cx="160" cy="160" r="50" fill="var(--accent)" />
    </svg>
    <span>{text}</span>
  </div>
);
