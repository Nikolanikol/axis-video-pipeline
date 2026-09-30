// Нижняя панель разделов на телефоне (владелец 01.10: «мобильная версия — длинная полоса
// скролла, невозможно разобраться, что где»). Экран инструмента режется на разделы: главный
// («Ролик», «Карусель») и выдвижные панели поверх него (см. usePanelSwipes ниже). Было: «Ролик по объявлению» был 2131 px при экране 812 (2,6 экрана), с
// ручными настройками — 3593 px (4,4 экрана).
//
// Панель — сосед блока .quick, а не его часть: .quick прокручивается, панель стоит внизу.
// Какой раздел открыт, знает сам инструмент; на .quick он ставит data-mtab, остальное
// (что прятать) — в styles.css. На компьютере панели нет, и data-mtab ни на что не влияет.
import React, {useEffect, useSyncExternalStore} from 'react';

// Та же граница, что у телефонной раскладки в styles.css (@media (max-width: 900px))
const PHONE = '(max-width: 900px)';
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
/** Телефонная раскладка сейчас? Нужно там, где поведение разное, а не только вид */
export const useIsPhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches);

export type MobileTab<T extends string> = {id: T; label: string; icon: React.ReactNode; badge?: number};

export const MobileTabs = <T extends string>({tabs, value, onChange}: {tabs: MobileTab<T>[]; value: T; onChange: (id: T) => void}) => (
  <nav className="mtabs" aria-label="Разделы">
    {tabs.map((t) => (
      <button key={t.id} className={t.id === value ? 'mtab on' : 'mtab'} aria-current={t.id === value ? 'page' : undefined}
        onClick={() => onChange(t.id)}>
        <span className="mtab-icon">{t.icon}{!!t.badge && <span className="mtab-badge">{t.badge}</span>}</span>
        {t.label}
      </button>
    ))}
  </nav>
);

// ——— Выдвижные панели и свайпы (владелец 01.10) ———
// «Ролик» — домашний раздел. «Объявления» выезжает слева, «Правка» справа (обе — поверх
// ролика, в styles.css: position: fixed и transform). Свайп от левого края открывает
// «Объявления», от правого — «Правку»; из открытой панели обратный свайп возвращает в «Ролик».
// Панель идёт за пальцем, а при отпускании доезжает сама — или возвращается, если потянули
// слабо. Ролик под панелью остаётся как был (прокрутка, выбранный формат).
//
// Ограничения, о которых стоит помнить:
//  • Safari на iPhone сам занимает самый край левой стороны (жест «назад»), поэтому зона
//    начала жеста — 32 px, а не 10: на самом краю срабатывает система, а не мы;
//  • touch-action: pan-y в стилях отдаёт браузеру только вертикальную прокрутку — горизонтальные
//    движения приходят нам, и слушатели могут быть пассивными: страница при прокрутке не ждёт JS;
//  • жест не начинается на полях ввода (там выделяют текст) и при перетаскивании фото в
//    галерее (там палец занят перестановкой).
const EDGE = 32;        // px от края экрана, где жест считается «от края»
const LOCK = 10;        // px движения, после которых решаем: горизонтально или вертикально
const COMMIT = 0.3;     // доля ширины, после которой панель доезжает сама
const FLING = 0.45;     // px/мс — быстрый короткий «щелчок» тоже считается
const EASE = 'cubic-bezier(.22,.8,.26,1)';

export function usePanelSwipes<T extends string>(
  root: React.RefObject<HTMLElement | null>,
  tab: T,
  home: T,
  setTab: (t: T) => void,
  // id панели → с какой стороны выезжает; сама панель ищется по [data-mpanel="id"] внутри root
  panels: Partial<Record<T, 'left' | 'right'>>,
  // false, пока раздела ещё нет на странице (инструмент грузит данные): ref пуст, и без этого
  // флага эффект отработал бы вхолостую и больше не запустился
  ready = true,
) {
  const phone = useIsPhone();

  // Верх панелей — верх раздела: над ним шапка и, бывает, плашки (продление, подтверждение
  // почты), их высота меняется, поэтому следим за размером самого раздела
  useEffect(() => {
    const el = root.current;
    if (!el || !phone) return;
    const measure = () => el.style.setProperty('--mtop', `${Math.round(el.getBoundingClientRect().top)}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [root, phone, ready]);

  useEffect(() => {
    const host = root.current;
    if (!host || !phone) return;
    type Mode = {id: T; el: HTMLElement; side: 'left' | 'right'; opening: boolean};
    let mode: Mode | null = null;
    let locked: 'h' | 'v' | null = null;
    let x0 = 0; let y0 = 0; let t0 = 0; let dx = 0;
    const width = () => window.innerWidth;
    const find = (id: T) => host.querySelector<HTMLElement>(`[data-mpanel="${id}"]`);

    // Где панель стоит в каждый момент: открытая — 0, закрытая — за краем экрана
    const hidden = (side: 'left' | 'right') => (side === 'left' ? -width() : width());
    const pos = (m: Mode) => {
      const w = width();
      const d = Math.max(-w, Math.min(w, dx));
      if (m.side === 'left') return m.opening ? -w + Math.max(0, d) : Math.min(0, d);
      return m.opening ? w + Math.min(0, d) : Math.max(0, d);
    };
    const settle = (m: Mode, to: number, commit: boolean) => {
      m.el.style.visibility = 'visible';
      m.el.style.transition = `transform .24s ${EASE}`;
      m.el.style.transform = `translate3d(${to}px, 0, 0)`;
      if (commit) setTab(m.opening ? m.id : home);
      // Инлайн-стили снимаем, когда доехали: дальше панель ведут классы из styles.css
      window.setTimeout(() => { m.el.style.transition = ''; m.el.style.transform = ''; m.el.style.visibility = ''; }, 280);
    };

    const start = (e: TouchEvent) => {
      mode = null; locked = null; dx = 0;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now();
      if ((e.target as Element).closest('input, textarea, select')) return;
      if (tab === home) {
        for (const id of Object.keys(panels) as T[]) {
          const side = panels[id]!;
          const fromEdge = side === 'left' ? x0 <= EDGE : x0 >= width() - EDGE;
          const el = find(id);
          if (fromEdge && el) { mode = {id, el, side, opening: true}; return; }
        }
      } else {
        const side = panels[tab];
        const el = find(tab);
        if (side && el) mode = {id: tab, el, side, opening: false};
      }
    };
    const move = (e: TouchEvent) => {
      if (!mode) return;
      const t = e.touches[0];
      dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!locked) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        // Направление: открыть левую — вправо, правую — влево; закрыть левую — влево, правую — вправо
        const want = mode.side === 'left' ? (mode.opening ? 1 : -1) : (mode.opening ? -1 : 1);
        locked = Math.abs(dx) > Math.abs(dy) * 1.2 && Math.sign(dx) === want ? 'h' : 'v';
      }
      if (locked !== 'h') return;
      // Фото в галерее берут удержанием и тянут — это не жест раздела
      if (document.querySelector('.touch-ghost')) { mode = null; return; }
      mode.el.style.visibility = 'visible';
      mode.el.style.transition = 'none';
      mode.el.style.transform = `translate3d(${pos(mode)}px, 0, 0)`;
    };
    // cancelled — касание прервала система (звонок, жест iOS): панель возвращаем, как была
    const end = (cancelled = false) => {
      const m = mode; mode = null;
      if (!m || locked !== 'h') return;
      const w = width();
      const travelled = Math.abs(Math.max(-w, Math.min(w, dx))) / w;
      const speed = Math.abs(dx) / Math.max(1, performance.now() - t0);
      const commit = !cancelled && (travelled > COMMIT || speed > FLING);
      const open = 0;
      const shut = hidden(m.side);
      settle(m, m.opening ? (commit ? open : shut) : (commit ? shut : open), commit);
    };
    const finish = () => end();
    const cancel = () => end(true);

    host.addEventListener('touchstart', start, {passive: true});
    host.addEventListener('touchmove', move, {passive: true});
    host.addEventListener('touchend', finish, {passive: true});
    host.addEventListener('touchcancel', cancel, {passive: true});
    return () => {
      host.removeEventListener('touchstart', start);
      host.removeEventListener('touchmove', move);
      host.removeEventListener('touchend', finish);
      host.removeEventListener('touchcancel', cancel);
    };
  }, [root, phone, ready, tab, home, setTab, panels]);
}
