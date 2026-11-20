// Проверка составного блока фактов: измеряем саму вёрстку без масштаба Player и
// входных transform. Текст/данные не вырезаем, предупреждаем при нехватке места.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {continueRender, delayRender} from 'remotion';
import {loadFitFont, stopBadText, textFitIssue, useFitScope} from './FitText';
import type {TextFont} from './measure';

export const FitBounds: React.FC<{width: number; height: number; field: string; source: string;
  fonts: TextFont[]; fontUrl?: string; layoutKey?: string; children: React.ReactNode}> = ({width, height, field, source, fonts, fontUrl = '', layoutKey = '', children}) => {
  const scope = useFitScope(), inner = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([width, height, source, fonts, fontUrl, layoutKey]);
  const handle = useMemo(() => delayRender(`Область текста: ${field}`), [key]);
  const [bad, setBad] = useState('');
  useEffect(() => {
    let live = true, failedRender = false, frame = 0;
    setBad('');
    const fail = (fontError = false) => {
      const issue = textFitIssue(scope, field, fontError);
      if (live) setBad(issue.short);
      failedRender = stopBadText(issue.full, fontError);
    };
    let timer: ReturnType<typeof setTimeout>;
    Promise.race([Promise.all(fonts.map((font) => loadFitFont(font, fontUrl, source))),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Шрифт не загрузился')), 8000); })])
      .then(() => {
        if (!live) return;
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
          if (live && inner.current && (inner.current.offsetHeight > height + 1 || inner.current.scrollWidth > width + 1)) fail();
          if (!failedRender) continueRender(handle);
        }); });
      }, () => { if (live) fail(true); if (!failedRender) continueRender(handle); }).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); cancelAnimationFrame(frame); if (!failedRender) continueRender(handle); };
  }, [key, handle]);
  return <div data-fit-field={field} data-fit-ok={!bad} style={{width, height, overflow: 'hidden'}}>
    {bad ? <div role="alert" style={{fontSize: 28, padding: 12, color: '#fff', background: '#7F1530'}}>{textFitIssue(scope, field).label}: {bad}</div>
      : <div ref={inner} style={{width, display: 'flow-root'}}>{children}</div>}
  </div>;
};
