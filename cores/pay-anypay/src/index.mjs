// Касса AnyPay — точка входа модуля (контракт касс: cores/PAYMENTS.md). Рубли от клиентов из РФ:
// банковская карта и СБП. Справка по кассе — ANYPAY.md, устройство модуля — README.md.
//
// Модуль-касса — независимая часть KOK: знает только API своей кассы и общий контракт, не знает
// про кредиты, тарифы и базу. Ключи из окружения не читает — их передаёт KOK в createClient.
//
// Отличия от NOWPayments, которые видны снаружи:
//   • номер заказа у кассы (pay_id) — только цифры, до 15 знаков. Наш «pay-…» не подходит: KOK
//     заводит заказу отдельный числовой номер и передаёт его сюда как orderId;
//   • платёж создаётся через API (create-payment) и сразу получает номер у кассы (transaction_id) —
//     его можно переспрашивать, не дожидаясь первого оповещения;
//   • адрес оповещений задаётся только в кабинете кассы, один на проект: notifyUrl модуль не берёт;
//   • песочницы нет. Тестовое оповещение из кабинета приходит с test=1 — флаг в платеже `test`,
//     решать, начислять ли по нему, — KOK.
import { CoreError, toCoreError } from '../../kit/errors.mjs';
import { request } from './upstream.mjs';
import { verifyNotification } from './signature.mjs';
import { normalizeStatus } from './status.mjs';

export const core = Object.freeze({
  id: 'pay-anypay',
  title: 'AnyPay — карта (сумы, гривны; рубли и СБП — когда касса откроет)',
  version: '1.0.0',
  contract: 'pay-1',
  // Валюта счёта по умолчанию — рубли (для них касса и задумывалась). Другую валюту KOK передаёт в
  // createInvoice({currency}); тарифы в вонах переводит в неё по курсу дня
  priceCurrency: 'rub',
  // Чем платит клиент — способ AnyPay (коды: ANYPAY.md, «Способы оплаты»). Выбирает клиент у нас,
  // а не на странице кассы: так ошибку «способ недоступен» (208) мы видим сразу
  methods: Object.freeze(['sbp', 'card']),
  // В каких валютах способ может принять оплату (документация create-payment, method_currency).
  // 13.10 у проекта на деле открыта только карта в UAH, UZS и KGS (P2P) — рубли касса не принимает
  currencies: Object.freeze({ sbp: Object.freeze(['rub']), card: Object.freeze(['rub', 'uah', 'uzs', 'kgs']) }),
});

// Адреса, с которых касса шлёт оповещения (документация SCI и метод API ip-notification, 13.10).
// Проверять обязательно: подпись без IP — одна линия обороны вместо двух
export const NOTIFY_IPS = Object.freeze(['185.162.128.38', '185.162.128.39', '185.162.128.88']);

/** Адрес — касса. IPv4 за прокси может прийти как «::ffff:185.162.128.38» */
export const isKassaIp = (ip) => NOTIFY_IPS.includes(String(ip ?? '').trim().replace(/^::ffff:/i, ''));

// Номер заказа у кассы: цифры, до 15 знаков, без ведущего нуля (касса хранит его числом —
// «007» вернулся бы «7» и не нашёл бы заказ)
const ORDER_RE = /^[1-9]\d{0,14}$/;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
const low = (v) => str(v)?.toLowerCase() ?? null;

/**
 * Платёж кассы → общий вид (cores/PAYMENTS.md, раздел 3). Один разбор и для оповещения, и для
 * ответа API payments: поля у них одинаковые. Касса пишет валюту то «RUB», то «rub» — приводим к
 * строчным. Разбор не доверяет форме: любое поле может пропасть или сменить тип
 */
export const toPayment = (p) => {
  if (!p || typeof p !== 'object') throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса прислала платёж не объектом');
  const paymentId = str(p.transaction_id);
  if (!paymentId) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'В платеже кассы нет transaction_id', { details: { keys: Object.keys(p).slice(0, 20) } });
  const status = normalizeStatus(p.status);
  const amount = num(p.amount);
  return {
    provider: core.id,
    paymentId,
    // Отдельного счёта у AnyPay нет: номер платежа и есть номер счёта
    invoiceId: paymentId,
    orderId: str(p.pay_id),
    status,
    providerStatus: str(p.status),
    priceAmount: amount,
    priceCurrency: low(p.currency),
    payAmount: amount,
    payCurrency: low(p.method),
    // Сколько дошло, касса отдельно не пишет: у оплаченного — вся сумма, у частичного — неизвестно
    actuallyPaid: status === 'paid' ? amount : null,
    // Сверх контракта: сколько придёт нам после комиссии (касса считает в рублях, по документации) и
    // тестовое ли оповещение
    profit: num(p.profit),
    test: String(p.test ?? '') === '1',
  };
};

/**
 * Клиент кассы.
 * @param {{projectId: string, secret: string, apiId: string, apiKey: string}} cfg
 *   projectId и secret — проект → «Основное» (ID и «Секретный ключ»: подпись оповещений);
 *   apiId и apiKey — профиль → «API» (подпись запросов к API)
 */
export function createClient({ projectId, secret, apiId, apiKey }) {
  const http = { apiId, apiKey };
  const ready = Boolean(projectId && secret && apiId && apiKey);
  const guarded = (fn) => async (...args) => {
    if (!ready) throw new CoreError('UPSTREAM_BLOCKED', 'Касса не настроена: нет ID проекта, секрета или ключей API');
    try { return await fn(...args); } catch (e) { throw toCoreError(e); }
  };

  /** Платежи из API payments по фильтру → массив в общем виде. Нет платежей — касса шлёт null */
  const list = async (filter) => {
    const r = await request(http, 'payments', { project_id: projectId, ...filter }, [projectId], { read: true });
    if (r.payments === null || r.payments === undefined) return [];
    if (typeof r.payments !== 'object') throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса прислала список платежей не объектом');
    return Object.values(r.payments).map(toPayment);
  };

  return {
    sandbox: false,
    ready,

    /**
     * Создать платёж. orderId — числовой номер заказа у кассы (до 15 цифр), method — 'sbp' или
     * 'card', currency — валюта счёта (rub, у карты ещё uah/uzs/kgs), email — почта плательщика (касса требует). Возвращает {invoiceId, paymentId, url}:
     * url — страница оплаты кассы. returnUrl/failUrl работают, только если в проекте разрешено
     * «Переопределять URL»; иначе касса вернёт клиента на адреса из кабинета.
     * Повтора нет (см. upstream.mjs): оборвался ответ — заказ сбойный, клиент жмёт снова
     */
    createInvoice: guarded(async ({ orderId, amount, currency: cur = core.priceCurrency, description, email, method, returnUrl, failUrl }) => {
      const payId = String(orderId ?? '');
      if (!ORDER_RE.test(payId)) throw new CoreError('BAD_INPUT', 'Номер заказа у AnyPay — только цифры, до 15 знаков');
      if (!(Number(amount) > 0)) throw new CoreError('BAD_INPUT', 'Сумма счёта должна быть больше нуля');
      if (!core.methods.includes(method)) throw new CoreError('BAD_INPUT', `Способ оплаты «${method}» не поддерживается`);
      if (!core.currencies[method].includes(String(cur).toLowerCase())) throw new CoreError('BAD_INPUT', `Способ «${method}» не принимает валюту ${cur}`);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ''))) throw new CoreError('BAD_INPUT', 'Касса требует почту плательщика');
      // Сумма — строкой с копейками: так её ждёт касса, и так же она входит в подпись
      const sum = Number(amount).toFixed(2);
      // Валюта счёта и валюта способа — одна и та же: клиент платит картой своей страны в своей валюте,
      // без пересчёта кассой
      const currency = String(cur).toUpperCase();
      // Касса ограничивает описание 150 символами; без него — ошибка 210
      const desc = String(description ?? '').trim().slice(0, 150) || 'KOK';
      const r = await request(http, 'create-payment', {
        project_id: projectId, pay_id: payId, amount: sum, currency, desc, email: String(email), method, method_currency: currency,
        success_url: returnUrl, fail_url: failUrl ?? returnUrl, lang: 'ru',
      }, [projectId, payId, sum, currency, desc, method]);
      const paymentId = str(r.transaction_id);
      const url = typeof r.payment_url === 'string' && /^https:\/\//.test(r.payment_url) ? r.payment_url : null;
      if (!paymentId || !url) throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса не вернула платёж', { details: { keys: Object.keys(r).slice(0, 20) } });
      // Касса обязана вернуть наш номер заказа: иначе оповещения по этому платежу не найдут заказ
      if (str(r.pay_id) && str(r.pay_id) !== payId) {
        throw new CoreError('UPSTREAM_BAD_RESPONSE', 'Касса вернула платёж с чужим номером заказа', { details: { paymentId } });
      }
      return { invoiceId: paymentId, paymentId, url };
    }),

    /** Платёж по номеру кассы (transaction_id), как его видит касса сейчас. Сверка перед начислением */
    getPayment: guarded(async (paymentId) => {
      const id = String(paymentId ?? '');
      if (!/^\d{1,20}$/.test(id)) throw new CoreError('BAD_INPUT', 'Номер платежа кассы — только цифры');
      const found = (await list({ trans_id: id })).find((p) => p.paymentId === id);
      if (!found) throw new CoreError('NOT_FOUND', 'Касса не знает такого платежа', { details: { paymentId: id } });
      return found;
    }),

    /** Платёж по нашему номеру заказа у кассы (pay_id) — когда номера кассы ещё нет */
    findByOrder: guarded(async (orderId) => {
      const payId = String(orderId ?? '');
      if (!ORDER_RE.test(payId)) throw new CoreError('BAD_INPUT', 'Номер заказа у AnyPay — только цифры, до 15 знаков');
      const found = (await list({ pay_id: payId })).filter((p) => p.orderId === payId);
      if (!found.length) throw new CoreError('NOT_FOUND', 'Касса не знает платежа по этому заказу', { details: { orderId: payId } });
      // pay_id касса держит уникальным (ошибка 202), но если вдруг два — важнее оплаченный
      return found.find((p) => p.status === 'paid') ?? found[0];
    }),

    /**
     * Прочитать оповещение кассы: проверить проект и подпись, вернуть платёж в общем виде.
     * Подпись приходит полем sign в самом теле. Неверная — BAD_INPUT. IP отправителя проверяет KOK
     * (isKassaIp): модуль не видит запроса. Начислять без сверки через getPayment нельзя
     * (cores/PAYMENTS.md, раздел 5)
     */
    readNotification: guarded(async (body, signature = body?.sign) => {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CoreError('BAD_INPUT', 'Пустое оповещение кассы');
      if (str(body.merchant_id) !== String(projectId)) throw new CoreError('BAD_INPUT', 'Оповещение для другого проекта AnyPay');
      if (!verifyNotification(body, signature, projectId, secret)) throw new CoreError('BAD_INPUT', 'Подпись оповещения кассы не сходится');
      return toPayment(body);
    }),

    /**
     * Связь и ключ: касса жива, API включён, подпись верна. Заодно — какие способы реально открыты
     * для рублей: витрина пишет «от 4%», а настоящую ставку знает только commissions.
     * → {ok, ms, balance, commissions, rub: {sbp, card}} или CoreError
     */
    checkUpstream: guarded(async () => {
      const t = Date.now();
      const { balance } = await request(http, 'balance', {}, [], { read: true });
      const commissions = await request(http, 'commissions', { project_id: projectId }, [projectId], { read: true });
      // Формат на деле (13.10): {"card": {"uah_p2p": "6.9", …}}; в документации — плоско {"card": 5}.
      // Рубли открыты, если у способа есть ставка с «rub» в ключе или ставка одна, без валют
      const rub = Object.fromEntries(core.methods.map((m) => {
        const c = commissions[m];
        return [m, c !== undefined && (typeof c !== 'object' || Object.keys(c ?? {}).some((k) => k.toLowerCase().startsWith('rub')))];
      }));
      return { ok: true, ms: Date.now() - t, balance: num(balance), commissions, rub };
    }),
  };
}
