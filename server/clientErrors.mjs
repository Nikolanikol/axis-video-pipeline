// Ошибки из браузера клиента (стандарт ошибок, 12.10): упавший экран или необработанная ошибка
// страницы присылает короткий отчёт сюда, а отсюда он идёт в общий журнал и тревогой в «Сбои».
// Раньше такая ошибка оставалась в консоли у клиента, и узнавали мы о ней, только если он напишет.
//
// Отчёт присылает кто угодно (витрина открыта гостю), поэтому: всё обрезаем, адрес — без запроса
// (в #/reset?t=… лежит ключ сброса пароля), с одного адреса — не больше 20 отчётов за 10 минут.
// Одинаковые ошибки у разных клиентов склеивает сама тревога (server/alarm.mjs).
import {serverLog} from './log.mjs';

const log = serverLog('browser');
// 20 за 10 минут с адреса: настоящему клиенту хватает с запасом (сам браузер шлёт не больше 10
// за открытие страницы), а кто шлёт мусор нарочно — не засыплет журнал и группу
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60_000;
const windows = new Map();

const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
// Только путь и раздел приложения: всё после «?» — и в адресе, и в части после «#» — прочь
export const safeUrl = (v) => {
  if (typeof v !== 'string') return undefined;
  const [main, hash = ''] = v.split('#');
  const pathOnly = main.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  const route = hash.split('?')[0];
  return cut(route ? `${pathOnly}#${route}` : pathOnly, 200);
};

const allowed = (ip, now = Date.now()) => {
  const w = windows.get(ip);
  if (w && w.until > now) {
    if (w.count >= MAX_PER_WINDOW) return false;
    w.count++;
    return true;
  }
  windows.set(ip, {count: 1, until: now + WINDOW_MS});
  if (windows.size > 5000) for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
  return true;
};

/** POST /api/client-error — всегда 204: браузеру ответ не нужен, а отказ не должен звать новый отчёт */
export const clientErrorHandler = (req, res) => {
  res.status(204).end();
  if (!allowed(req.ip ?? '')) return;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const message = cut(b.message, 500);
  if (!message) return;
  const error = {name: cut(b.name, 80) || 'Error', message, stack: cut(b.stack, 2000)};
  log.error('client.error', {
    note: b.kind === 'boundary' ? `экран «${cut(b.tool, 80) ?? '?'}» упал у клиента` : 'ошибка на странице у клиента',
    kind: cut(b.kind, 20),
    page: safeUrl(b.url),
    userId: req.user?.id,
    browser: cut(req.get('user-agent'), 200),
    error,
  });
};
