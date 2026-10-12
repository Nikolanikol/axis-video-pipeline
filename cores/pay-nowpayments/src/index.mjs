// Касса NOWPayments — точка входа модуля (контракт касс: cores/PAYMENTS.md).
//
// Модуль-касса — независимая часть KOK, как ядра источников (cores/CONTRACT.md): знает только
// API своей кассы и общий контракт, не знает про кредиты, тарифы и базу. Что делать с
// деньгами, решает KOK (server/payments.mjs). Ключи модуль не читает из окружения сам — их
// передаёт KOK в createClient: так один процесс держит и боевой, и тестовый клиент, а тесты
// не трогают переменные.
//
// Что умеет: выставить счёт, спросить платёж, прочитать и проверить уведомление, проверить
// связь и ключ. Наружу — только CoreError (cores/kit/errors.mjs).
import { CoreError, toCoreError } from '../../kit/errors.mjs';
import { BASE, request } from './upstream.mjs';
import { sign, verify } from './signature.mjs';
import { normalizeStatus } from './status.mjs';

export const core = Object.freeze({
  id: 'pay-nowpayments',
  title: 'NOWPayments — USDT в сети TRON',
  version: '1.0.0',
  contract: 'pay-1',
  // Чем платит клиент: только USDT TRC20 (решение владельца 12.10). Другие монеты — частые
  // недоплаты («плавающий» курс) и переводы не в ту сеть
  payCurrency: 'usdttrc20',
  // В чём выставляем счёт: доллары, 1 USDT ≈ $1 — клиент видит знакомую сумму
  priceCurrency: 'usd',
});

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * Платёж кассы → общий вид (cores/PAYMENTS.md, раздел 3). Разбор не доверяет форме ответа:
 * любое поле может пропасть или сменить тип. Без номера платежа или заказа это не платёж
 */
export const toPayment = (p) => {
  if (!p || typeof p !== 'object') throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса прислала платёж не объектом');
  const paymentId = str(p.payment_id);
  if (!paymentId) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'В платеже кассы нет payment_id', { details: { keys: Object.keys(p).slice(0, 20) } });
  return {
    provider: core.id,
    paymentId,
    invoiceId: str(p.invoice_id),
    orderId: str(p.order_id),
    status: normalizeStatus(p.payment_status),
    providerStatus: str(p.payment_status),
    priceAmount: num(p.price_amount),
    priceCurrency: str(p.price_currency)?.toLowerCase() ?? null,
    payAmount: num(p.pay_amount),
    payCurrency: str(p.pay_currency)?.toLowerCase() ?? null,
    actuallyPaid: num(p.actually_paid),
  };
};

/**
 * Клиент кассы.
 * @param {{apiKey: string, ipnSecret: string, sandbox?: boolean}} cfg
 */
export function createClient({ apiKey, ipnSecret, sandbox = false }) {
  const http = { apiKey, base: sandbox ? BASE.sandbox : BASE.live };
  const ready = Boolean(apiKey && ipnSecret);
  // Любая ошибка внутри → CoreError: чужое исключение (TypeError и т.п.) — баг модуля, INTERNAL
  const guarded = (fn) => async (...args) => {
    if (!ready) throw new CoreError('UPSTREAM_BLOCKED', 'Касса не настроена: нет ключа API или секрета уведомлений');
    try { return await fn(...args); } catch (e) { throw toCoreError(e); }
  };

  return {
    sandbox,
    ready,

    /**
     * Выставить счёт. Возвращает {invoiceId, url} — url страницы оплаты кассы (адрес, сумма,
     * QR, таймер). notifyUrl — куда касса пришлёт уведомления, returnUrl — куда вернёт клиента.
     * Повтора нет (см. upstream.mjs): оборвался ответ — заказ помечается сбойным, клиент жмёт снова
     */
    createInvoice: guarded(async ({ orderId, amount, description, notifyUrl, returnUrl }) => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId ?? ''))) throw new CoreError('BAD_INPUT', 'Номер заказа — латиница, цифры, «-» и «_»');
      if (!(Number(amount) > 0)) throw new CoreError('BAD_INPUT', 'Сумма счёта должна быть больше нуля');
      const r = await request(http, 'POST', '/invoice', {
        price_amount: Number(amount), price_currency: core.priceCurrency, pay_currency: core.payCurrency,
        order_id: String(orderId), order_description: String(description ?? '').slice(0, 200),
        ipn_callback_url: notifyUrl, success_url: returnUrl, cancel_url: returnUrl,
        // Комиссию кассы платим мы (владелец 12.10): клиент платит ровно цену тарифа
        is_fee_paid_by_user: false,
      });
      const invoiceId = str(r.id);
      const url = typeof r.invoice_url === 'string' && /^https:\/\//.test(r.invoice_url) ? r.invoice_url : null;
      if (!invoiceId || !url) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса не вернула счёт', { details: { keys: Object.keys(r).slice(0, 20) } });
      // Касса обязана вернуть наш номер заказа: иначе уведомления по этому счёту не найдут заказ
      if (str(r.order_id) && str(r.order_id) !== String(orderId)) {
        throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса вернула счёт с чужим номером заказа', { details: { invoiceId } });
      }
      return { invoiceId, url };
    }),

    /** Платёж, как его видит касса сейчас, — в общем виде. Сверка перед начислением */
    getPayment: guarded(async (paymentId) => {
      if (!/^\d{1,20}$/.test(String(paymentId ?? ''))) throw new CoreError('BAD_INPUT', 'Номер платежа кассы — только цифры');
      return toPayment(await request(http, 'GET', `/payment/${paymentId}`));
    }),

    /**
     * Прочитать уведомление кассы: проверить подпись и вернуть платёж в общем виде.
     * Неверная подпись — BAD_INPUT. Подпись доказывает только, что пишет касса; начислять по
     * уведомлению без сверки через getPayment нельзя (cores/PAYMENTS.md, раздел 5)
     */
    readNotification: guarded(async (body, signature) => {
      if (!verify(body, signature, ipnSecret)) throw new CoreError('BAD_INPUT', 'Подпись уведомления кассы не сходится');
      return toPayment(body);
    }),

    /** Связь и ключ: касса жива и принимает наш ключ. → {ok, ms} или CoreError */
    checkUpstream: guarded(async () => {
      const t = Date.now();
      await request(http, 'GET', '/status');
      // /status ключ не проверяет — спрашиваем включённые монеты: этот запрос без ключа не пройдёт
      const coins = await request(http, 'GET', '/merchant/coins');
      const selected = Array.isArray(coins.selectedCurrencies) ? coins.selectedCurrencies.map((c) => String(c).toLowerCase()) : [];
      return { ok: true, ms: Date.now() - t, payCurrencyEnabled: selected.includes(core.payCurrency) };
    }),

    /** Для тестов и ручной проверки: подписать тело так, как подписывает касса */
    signForTest: (body) => sign(body, ipnSecret),
  };
}
