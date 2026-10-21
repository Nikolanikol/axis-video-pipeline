// HTTP-клиент Resend (resend.com) и перевод его ответов в коды контракта ядер
// (cores/CONTRACT.md, раздел 3). Наружу отсюда выходят только CoreError.
//
// Повторов здесь нет намеренно: повтор отправки после оборванного ответа — это два одинаковых
// письма у клиента. Что делать с временным сбоем (подождать и продолжить очередь), решает KOK
// по retryable — у него очередь и отметка «ушло» по каждому получателю.
import { CoreError } from '../../kit/errors.mjs';

export const BASE = 'https://api.resend.com';
const TIMEOUT_MS = 30_000;

const fail = (status, data, path, retryAfter) => {
  const said = typeof data?.message === 'string' ? data.message.slice(0, 300) : undefined;
  const details = { path, status, said, name: data?.name, retryAfter };
  if (status === 401) return new CoreError('UPSTREAM_BLOCKED', 'Resend не принял ключ — проверьте RESEND_API_KEY', { details });
  // 403 у Resend — отправитель с неподтверждённого домена (CLAUDE.md: «Почта уходит только с
  // подтверждённого домена») или ограничение тестового аккаунта
  if (status === 403) return new CoreError('UPSTREAM_BLOCKED', said ? `Resend отказал: ${said}` : 'Resend отказал в отправке (403)', { details });
  if (status === 429) return new CoreError('RATE_LIMITED', 'Resend просит слать реже — лимит запросов или дневная квота', { details });
  if (status >= 500) return new CoreError('UPSTREAM_UNAVAILABLE', `Resend ответил ошибкой ${status}`, { details });
  // 400/422 — письмо не прошло проверку: неверный адрес, слишком большое письмо…
  return new CoreError('BAD_INPUT', said ? `Resend не принял письмо: ${said}` : `Resend не принял письмо (${status})`, { details });
};

export async function request(apiKey, method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new CoreError('UPSTREAM_TIMEOUT', 'Resend не ответил вовремя', { details: { path }, cause: e });
    throw new CoreError('UPSTREAM_UNAVAILABLE', 'Нет связи с Resend', { details: { path }, cause: e });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw fail(res.status, data, path, res.headers.get('retry-after'));
  if (data === null) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Resend ответил не JSON', { details: { path, status: res.status } });
  return data;
}
