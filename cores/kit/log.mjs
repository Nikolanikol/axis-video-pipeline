// Логи ядра — одна строка JSON на событие в stdout (cores/CONTRACT.md, раздел 6).
// Coolify собирает stdout сам; искать по requestId. Общий набор cores/kit.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

// Ошибку раскладываем в поля: в JSON.stringify у Error всё пусто.
// Стек — только для уровня error: у ожидаемых ошибок (машины нет, кривая ссылка) он лишь шум.
function serializeError(e, withStack) {
  if (!(e instanceof Error)) return { message: String(e) };
  const out = { name: e.name, message: e.message };
  if (e.code) out.code = e.code;
  if (e.details) out.details = e.details;
  if (withStack && e.stack) out.stack = e.stack.split('\n').slice(0, 8).join('\n');
  if (e.cause) out.cause = serializeError(e.cause, withStack);
  return out;
}

/**
 * @param {string} core — id ядра
 * @param {object} [base] — поля, которые попадут в каждую строку (например, requestId)
 */
export function createLogger(core, base = {}) {
  const write = (level, event, fields = {}) => {
    if (LEVELS[level] < minLevel) return;
    const line = { ts: new Date().toISOString(), level, core, event, ...base };
    for (const [k, v] of Object.entries(fields)) line[k] = v instanceof Error ? serializeError(v, level === 'error') : v;
    let text;
    try { text = JSON.stringify(line); } catch { text = JSON.stringify({ ts: line.ts, level, core, event, note: 'поля не сериализуются' }); }
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(text + '\n');
  };
  return {
    debug: (event, f) => write('debug', event, f),
    info: (event, f) => write('info', event, f),
    warn: (event, f) => write('warn', event, f),
    error: (event, f) => write('error', event, f),
    /** Тот же лог с добавочными полями — для одного запроса */
    child: extra => createLogger(core, { ...base, ...extra }),
  };
}

// Ожидаемые ошибки (машины нет, кривая ссылка) — warn; поломки ядра и источника — error.
export const levelFor = code =>
  ['INTERNAL', 'UPSTREAM_BAD_RESPONSE', 'UPSTREAM_BLOCKED'].includes(code) ? 'error' : 'warn';
