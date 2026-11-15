// Лист КП на экране: тело документа (offerBody из src/shared/offerHtml.js — та же вёрстка, что у PDF)
// в shadow DOM, в масштабе ширины колонки. Shadow DOM — чтобы стили документа и интерфейса не
// задевали друг друга; шрифт Manrope уже загружен страницей (app/main.tsx), @font-face действует
// и внутри. onMark — клик по части документа с меткой data-f (живой образец в настройках ставит
// курсор в её поле).
import React, {useEffect, useRef, useState} from 'react';
import {OFFER_CSS} from '../../src/shared/offerHtml.js';

// A4 по ширине в CSS-пикселях (210 мм при 96 dpi): от неё считаем масштаб под ширину колонки
const A4_PX = 793.7;
const SHEET_CSS = `:host{display:block}.wrap{display:flex;flex-direction:column;gap:16px}
.kp .page{box-shadow:0 2px 14px #0006;border-radius:2px}`;
const MARK_CSS = `.kp [data-f]{cursor:pointer;border-radius:3px}
.kp [data-f]:hover{outline:2px solid #c8304f;outline-offset:2px}`;

export const OfferSheet: React.FC<{body: string; onMark?: (key: string) => void; className?: string}> = ({body, onMark, className}) => {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const mark = useRef(onMark);
  mark.current = onMark;

  // Масштаб под ширину колонки: A4 больше панели, а листать вбок документ неудобно
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    const onClick = (e: Event) => {
      if (!mark.current) return;
      const m = (e.composedPath() as Element[]).find((n) => n instanceof Element && n.hasAttribute?.('data-f'));
      if (m) mark.current(m.getAttribute('data-f') || '');
    };
    el.addEventListener('click', onClick);
    return () => { ro.disconnect(); el.removeEventListener('click', onClick); };
  }, []);

  const marks = Boolean(onMark);
  useEffect(() => {
    const el = host.current;
    if (!el || !body) return;
    const root = el.shadowRoot ?? el.attachShadow({mode: 'open'});
    const scale = width ? Math.min(1, width / A4_PX) : 0.5;
    // zoom, а не transform: он уменьшает и место, которое документ занимает в колонке
    root.innerHTML = `<style>${OFFER_CSS}${SHEET_CSS}${marks ? MARK_CSS : ''}</style><div class="wrap" style="zoom:${scale}">${body}</div>`;
  }, [body, width, marks]);

  return <div className={className ?? 'of-live'} ref={host} />;
};
