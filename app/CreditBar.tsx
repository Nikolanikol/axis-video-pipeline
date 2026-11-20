import React, {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, Coins} from 'lucide-react';
import {useSession} from './auth';
import {href} from './router';
import {useT} from './i18n';

/** Счётчик движется только после подтверждённого сервером изменения, без авансового списания. */
export const CreditBar: React.FC = () => {
  const {enabled, isStaff, workspace, balance} = useSession();
  const t = useT();
  const target = balance?.credits ?? null;
  const identity = `${workspace?.id ?? ''}:${isStaff}`;
  const previous = useRef({identity, credits: target});
  const shown = useRef(target ?? 0);
  const serial = useRef(0);
  const [value, setValue] = useState(target ?? 0);
  const [change, setChange] = useState<{id: number; delta: number} | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = {identity, credits: target};
    let frame = 0;
    let timer = 0;
    const show = (n: number) => { shown.current = n; setValue(n); };
    if (isStaff || target === null || before.identity !== identity || before.credits === null) {
      show(target ?? 0); setChange(null);
      return;
    }
    if (before.credits === target) return;
    setChange({id: ++serial.current, delta: target - before.credits});
    timer = window.setTimeout(() => setChange(null), 2200);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || document.hidden) show(target);
    else {
      const from = shown.current;
      const started = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - started) / 560);
        show(reduced.matches ? target : Math.round(from + (target - from) * (1 - (1 - p) ** 3)));
        if (p < 1 && !reduced.matches) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [identity, target, isStaff]);
  if (!enabled) return null;
  const delta = change ? `${change.delta > 0 ? '+' : '−'}${t.n('unit.creditShort', Math.abs(change.delta))}` : '';
  return <div className="credit-bar" aria-label={t('credits.title')}>
    <div className="credit-bar-main">
      <Coins size={16} aria-hidden="true" />
      <span className="credit-bar-label">{t('credits.title')}</span>
      <span className="credit-bar-number" data-balance={isStaff ? 'free' : target ?? 'unknown'}>
        <b aria-hidden="true">{isStaff ? t('credits.free') : target === null ? '—' : t.n('unit.creditShort', value)}</b>
        <span className="credit-sr-only">{isStaff ? t('credits.free') : target === null ? t('credits.loading') : t('credits.balance', {n: t.n('unit.creditShort', target)})}</span>
        {change && !isStaff && <span key={change.id} className={`credit-bar-delta ${change.delta < 0 ? 'spent' : 'added'}`} aria-hidden="true">{delta}</span>}
      </span>
    </div>
    <a href={href('account')} className="credit-bar-account">{t(isStaff ? 'credits.account' : 'credits.topup')}<ArrowUpRight size={14} aria-hidden="true" /></a>
    <span className="credit-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {change && target !== null && !isStaff ? t('credits.changed', {delta, n: t.n('unit.creditShort', target)}) : ''}
    </span>
  </div>;
};
