// Ядро рассылок — точка входа (21.10). Служебные новости KOK: собрать письмо и отправить пачкой.
//
// Ядро — независимый модуль внутри KOK, как источники и кассы (cores/CONTRACT.md, cores/PAYMENTS.md):
// знает только Resend и вёрстку письма. Про базу, клиентов, сегменты, согласие и очередь не знает —
// это дело KOK (server/mailing.mjs): кому слать, кто отписался, что уже ушло. Ключ ядро из
// окружения не читает — его передаёт KOK в createClient, так тесты не трогают переменные.
// Наружу — только CoreError (cores/kit/errors.mjs).
import { CoreError, toCoreError } from '../../kit/errors.mjs';
import { request } from './upstream.mjs';

export { PLACEHOLDERS, fill, isHttpUrl, problemsOf, renderMessage, textToHtml } from './render.mjs';

export const core = Object.freeze({
  id: 'mailing',
  title: 'Рассылки — служебные новости через Resend',
  version: '1.0.0',
  contract: 'mail-1',
  // Resend принимает до 100 писем в одном запросе пакетной отправки (/emails/batch)
  batchMax: 100,
});

/**
 * Письмо в пакете: заголовки отписки обязательны. List-Unsubscribe с адресом и
 * List-Unsubscribe-Post (RFC 8058) — кнопка «Отписаться» прямо в Gmail и Яндексе; без неё
 * Gmail с февраля 2024 режет массовые письма в спам. Ссылка — та же, что внизу письма
 */
const toResend = (from, replyTo, m) => ({
  from,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(replyTo ? { reply_to: replyTo } : {}),
  headers: {
    'List-Unsubscribe': `<${m.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});

/**
 * Клиент Resend.
 * @param {{apiKey?: string, from: string, replyTo?: string}} cfg
 * ready: false — ключа нет: KOK тогда не шлёт, а пишет письма в журнал (Mac, тесты)
 */
export function createClient({ apiKey, from, replyTo }) {
  const key = String(apiKey ?? '').trim();
  const ready = Boolean(key && from);
  const need = () => { if (!ready) throw new CoreError('BAD_INPUT', 'Рассылки выключены: нет RESEND_API_KEY или отправителя'); };
  return {
    ready,
    /**
     * Отправить пачку (до batchMax). Сообщения — {to, subject, html, text, unsubscribeUrl}.
     * Ответ — id писем у Resend по порядку. Resend проверяет пачку целиком: одно плохое
     * письмо (неверный адрес) — отказ всей пачки с BAD_INPUT; тогда KOK шлёт её по одному (send),
     * чтобы найти виноватого и не задержать остальных
     */
    async sendBatch(messages) {
      need();
      if (!Array.isArray(messages) || !messages.length) return [];
      if (messages.length > core.batchMax) throw new CoreError('BAD_INPUT', `В пачке не больше ${core.batchMax} писем`);
      try {
        const data = await request(key, 'POST', '/emails/batch', messages.map((m) => toResend(from, replyTo, m)));
        const ids = Array.isArray(data?.data) ? data.data.map((r) => r?.id ?? null) : null;
        if (!ids || ids.length !== messages.length) {
          throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Resend ответил на пачку без списка писем', { details: { keys: Object.keys(data ?? {}) } });
        }
        return ids;
      } catch (e) { throw toCoreError(e); }
    },
    /** Одно письмо — тестовое себе или разбор отказавшей пачки. Ответ — id письма у Resend */
    async send(message) {
      need();
      try {
        const data = await request(key, 'POST', '/emails', toResend(from, replyTo, message));
        return data?.id ?? null;
      } catch (e) { throw toCoreError(e); }
    },
  };
}
