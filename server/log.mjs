// Единый журнал KOK (стандарт ошибок, 12.10): тот же формат, что у ядер (cores/kit/log.mjs) —
// одна строка JSON на событие, Coolify собирает stdout сам. Сервер больше не пишет console.error:
// по такой строке на проде не найти ни запрос, ни компанию.
//
// Каждая строка сама получает requestId и компанию текущего запроса (контекст ниже), поэтому
// жалобу клиента «код запроса a1b2c3d4e5» находим поиском по журналу. Уровень error дополнительно
// уходит тревогой в Telegram (server/alarm.mjs).
import crypto from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {configureLog, createLogger} from '../cores/kit/log.mjs';

const requestContext = new AsyncLocalStorage();
// Компанию знает store.mjs — он и подключает её сюда (setWorkspacePeek). Импорт в обратную сторону
// дал бы круг: store → … → log → store
let peekWorkspace = () => null;
export const setWorkspacePeek = (fn) => { peekWorkspace = fn; };

// Короткий: человек диктует его в поддержку. 10 знаков hex — 10¹² вариантов, вместе с временем
// строки повтор не мешает
export const newRequestId = () => crypto.randomBytes(5).toString('hex');
export const currentRequestId = () => requestContext.getStore()?.requestId ?? null;

/** Первый шаг каждого запроса: номер в ответ (X-Request-Id) и в контекст журнала */
export const requestIdMw = (req, res, next) => {
  req.requestId = newRequestId();
  res.set('X-Request-Id', req.requestId);
  requestContext.run({requestId: req.requestId}, next);
};

configureLog({
  context: () => {
    const out = {};
    const requestId = currentRequestId();
    const ws = peekWorkspace();
    if (requestId) out.requestId = requestId;
    if (ws) out.ws = ws;
    return out;
  },
});

/** Журнал модуля сервера: core = «app», module — какой файл пишет */
export const serverLog = (module) => createLogger('app', {module});
