// Единые ошибки модулей-ядер (cores/CONTRACT.md, раздел 3). Общий набор cores/kit — его берут
// все ядра; друг друга ядра не импортируют.

// code → HTTP-статус и можно ли повторить позже. Коды одинаковые во всех ядрах:
// пайплайн решает по ним, что делать, и не знает, какое ядро ответило.
export const CODES = Object.freeze({
  BAD_INPUT: { status: 400, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  UPSTREAM_BLOCKED: { status: 503, retryable: false },
  UPSTREAM_TIMEOUT: { status: 504, retryable: true },
  UPSTREAM_UNAVAILABLE: { status: 502, retryable: true },
  UPSTREAM_BAD_RESPONSE: { status: 502, retryable: false },
  OVERLOADED: { status: 503, retryable: true },
  INTERNAL: { status: 500, retryable: false },
});

export class CoreError extends Error {
  /**
   * @param {keyof CODES} code
   * @param {string} message — по-русски, для человека
   * @param {{details?: object, cause?: unknown}} [opts] — details уходят в ответ, cause — только в лог
   */
  constructor(code, message, { details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    if (!CODES[code]) throw new Error(`Неизвестный код ошибки ядра: ${code}`);
    this.name = 'CoreError';
    this.code = code;
    this.status = CODES[code].status;
    this.retryable = CODES[code].retryable;
    this.details = details;
  }
}

export const isCoreError = e => e instanceof CoreError;

/** Любое исключение → CoreError. Чужое (TypeError и т.п.) — это баг ядра: INTERNAL, текст наружу не отдаём. */
export function toCoreError(e) {
  if (isCoreError(e)) return e;
  return new CoreError('INTERNAL', 'Внутренняя ошибка ядра — подробности в логе по requestId', { cause: e });
}

/** Часть ошибки, которая уходит в ответ. Стек и cause — только в лог. */
export function errorPayload(e) {
  const err = toCoreError(e);
  return { code: err.code, message: err.message, retryable: err.retryable, ...(err.details ? { details: err.details } : {}) };
}

/** Предупреждение о частичных данных: карточка отдаётся, но без этой части. */
export const warning = (code, part, message) => ({ code, part, message });
