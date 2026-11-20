// Фокус и фон модального окна. Стек учитывает окно ожидания поверх формы КП.
import {useLayoutEffect, useRef, type RefObject} from 'react';

const dialogs: HTMLElement[] = [];
const controls = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export const useModalFocus = (ref: RefObject<HTMLElement>, open: boolean, onClose?: () => void) => {
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const background = new Map<HTMLElement, boolean>();
    // Помечаем только соседние ветви: окно может быть порталом или частью #root.
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    dialogs.push(dialog);
    document.body.style.overflow = 'hidden';
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(controls)]
      .filter((el) => el.getClientRects().length && !el.closest('[inert], [hidden]') && el.getAttribute('aria-disabled') !== 'true');
    (focusable()[0] ?? dialog).focus({preventScroll: true});
    const key = (e: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation(); close.current?.();
      } else if (e.key === 'Tab') {
        const items = focusable(), first = items[0] ?? dialog, last = items.at(-1) ?? dialog;
        const current = document.activeElement;
        if (!items.length || !dialog.contains(current) || (e.shiftKey ? current === first || current === dialog : current === last || current === dialog)) {
          e.preventDefault(); (e.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      for (const [node, inert] of background) node.inert = inert;
      document.body.style.overflow = overflow;
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest('[inert]') && (!dialogs.length || dialogs.at(-1)?.contains(previous))) previous.focus({preventScroll: true});
      });
    };
  }, [open, ref]);
};
