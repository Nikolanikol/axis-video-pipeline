// Откуда пришёл гость (17.11, план витрины axis-beauty.com): метки рекламы utm_*, сайт-источник (ref)
// и страница витрины (land). Витрина дописывает их в ссылку «Попробовать»; реклама может вести и
// прямо сюда с utm_*. Забираем из адреса при загрузке, держим в памяти вкладки до регистрации и
// отправляем вместе с ней (api.register) — в базу клиента, миграция 022.
//
// Почему не cookie: метки нужны только в момент регистрации и только своему серверу. Память вкладки
// не уходит ни в какие запросы сама, не живёт после закрытия и не требует отдельного согласия.
// Первое касание важнее последнего: уже запомненное не перезаписываем.
const KEY = 'kok:source';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'land'] as const;
export type Source = Partial<Record<(typeof FIELDS)[number], string>>;

const read = (): Source | null => {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
};

const capture = () => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const got: Source = {};
    for (const f of FIELDS) {
      const v = url.searchParams.get(f);
      if (v) got[f] = v.slice(0, 200);
      url.searchParams.delete(f);
    }
    // Пришёл не с витрины и без меток — хотя бы сайт, с которого перешли (поиск, соцсеть)
    if (!got.ref && document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && !/(^|\.)axis-beauty\.com$/.test(host) && host !== window.location.hostname) got.ref = host;
    }
    if (Object.keys(got).length && !read()) window.sessionStorage.setItem(KEY, JSON.stringify(got));
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* приватный режим или странный адрес — без источника, регистрации это не мешает */ }
};
capture();

/** Источник для регистрации: null — пришёл без меток */
export const getSource = (): Source | null => read();
