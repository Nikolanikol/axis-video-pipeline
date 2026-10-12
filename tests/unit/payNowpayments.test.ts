// Модуль-касса NOWPayments (cores/pay-nowpayments, контракт cores/PAYMENTS.md): подпись уведомлений,
// статусы, разбор платежа, перевод ответов кассы в коды ошибок. Сеть подменена — в кассу тест не ходит.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {sign, sortDeep, verify} from '../../cores/pay-nowpayments/src/signature.mjs';
import {normalizeStatus} from '../../cores/pay-nowpayments/src/status.mjs';
import {createClient, toPayment} from '../../cores/pay-nowpayments/src/index.mjs';

const SECRET = 'test-ipn-secret';
const client = () => createClient({apiKey: 'test-key', ipnSecret: SECRET, sandbox: true});
const answer = (status: number, body: unknown) => vi.fn(async () => ({ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body))}));

afterEach(() => vi.unstubAllGlobals());

describe('подпись уведомления', () => {
  it('ключи сортируются на всех уровнях: порядок полей в теле не важен', () => {
    expect(JSON.stringify(sortDeep({b: 1, a: {d: 2, c: [{f: 1, e: 2}]}}))).toBe('{"a":{"c":[{"e":2,"f":1}],"d":2},"b":1}');
    const body = {payment_status: 'finished', order_id: 'pay-1', fee: {depositFee: 0, currency: 'usdttrc20'}};
    const shuffled = {fee: {currency: 'usdttrc20', depositFee: 0}, order_id: 'pay-1', payment_status: 'finished'};
    expect(verify(shuffled, sign(body, SECRET), SECRET)).toBe(true);
    expect(verify(shuffled, sign(body, SECRET).toUpperCase(), SECRET)).toBe(true);
  });

  it('любая правка тела, чужой секрет, пустая подпись и пустой секрет — неверно', () => {
    const body = {payment_status: 'finished', order_id: 'pay-1', price_amount: 18.56};
    const sig = sign(body, SECRET);
    expect(verify({...body, price_amount: 1856}, sig, SECRET)).toBe(false);
    expect(verify(body, sig, 'другой секрет')).toBe(false);
    expect(verify(body, '', SECRET)).toBe(false);
    expect(verify(body, undefined as unknown as string, SECRET)).toBe(false);
    // HMAC с пустым ключом посчитать может кто угодно — такой секрет не принимаем никогда
    expect(verify(body, sign(body, ''), '')).toBe(false);
    expect(verify([] as unknown as object, sig, SECRET)).toBe(false);
  });
});

describe('статусы и разбор платежа', () => {
  it('слова кассы → общие статусы; незнакомое — unknown, а не «оплачено»', () => {
    expect(normalizeStatus('finished')).toBe('paid');
    expect(normalizeStatus('partially_paid')).toBe('partial');
    expect(normalizeStatus('sending')).toBe('confirming');
    expect(normalizeStatus('FINISHED')).toBe('paid');
    expect(normalizeStatus('something_new')).toBe('unknown');
    expect(normalizeStatus(undefined)).toBe('unknown');
  });

  it('разбор не доверяет форме: числа строками, пропуски, регистр валют', () => {
    expect(toPayment({payment_id: 5194530281, order_id: 'pay-1', payment_status: 'finished', price_amount: '18.56', price_currency: 'USD', pay_currency: 'USDTTRC20', actually_paid: 'x'}))
      .toMatchObject({paymentId: '5194530281', status: 'paid', priceAmount: 18.56, priceCurrency: 'usd', payCurrency: 'usdttrc20', actuallyPaid: null, invoiceId: null});
    expect(() => toPayment({order_id: 'pay-1'})).toThrow(/payment_id/);
    expect(() => toPayment(null)).toThrow();
  });
});

describe('ответы кассы → коды ошибок', () => {
  it('ключ не принят — UPSTREAM_BLOCKED (нужен человек), без повторов', async () => {
    const fetch = answer(403, {code: 'INVALID_API_KEY', message: 'Invalid api key'});
    vi.stubGlobal('fetch', fetch);
    await expect(client().getPayment('123')).rejects.toMatchObject({code: 'UPSTREAM_BLOCKED', retryable: false});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('5xx на чтении повторяется до трёх раз', async () => {
    const fetch = answer(502, 'Bad Gateway');
    vi.stubGlobal('fetch', fetch);
    await expect(client().getPayment('123')).rejects.toMatchObject({code: 'UPSTREAM_UNAVAILABLE', retryable: true});
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('выставление счёта не повторяется: повтор при оборванном ответе дал бы второй счёт', async () => {
    const fetch = answer(503, 'down');
    vi.stubGlobal('fetch', fetch);
    await expect(client().createInvoice({orderId: 'pay-1', amount: 10, notifyUrl: 'https://x/n', returnUrl: 'https://x/r'}))
      .rejects.toMatchObject({code: 'UPSTREAM_UNAVAILABLE'});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('отказ по сути (сумма меньше минимальной) — BAD_INPUT с текстом кассы', async () => {
    vi.stubGlobal('fetch', answer(400, {message: 'amountTo is too small'}));
    await expect(client().createInvoice({orderId: 'pay-1', amount: 0.5, notifyUrl: 'https://x/n', returnUrl: 'https://x/r'}))
      .rejects.toMatchObject({code: 'BAD_INPUT', message: /too small/});
  });

  it('ответ не JSON или без счёта — UPSTREAM_BAD_RESPONSE; адрес оплаты только https', async () => {
    vi.stubGlobal('fetch', answer(200, '<html>'));
    await expect(client().getPayment('1')).rejects.toMatchObject({code: 'UPSTREAM_BAD_RESPONSE'});
    vi.stubGlobal('fetch', answer(200, {id: 77, invoice_url: 'http://evil.example/pay'}));
    await expect(client().createInvoice({orderId: 'pay-1', amount: 10, notifyUrl: 'https://x/n', returnUrl: 'https://x/r'}))
      .rejects.toMatchObject({code: 'UPSTREAM_BAD_RESPONSE'});
  });

  it('счёт: наша сумма, монета и «комиссию платим мы» уходят кассе как есть', async () => {
    const fetch = answer(200, {id: 77, invoice_url: 'https://sandbox.nowpayments.io/payment?iid=77', order_id: 'pay-1'});
    vi.stubGlobal('fetch', fetch);
    await expect(client().createInvoice({orderId: 'pay-1', amount: 18.56, description: 'KOK', notifyUrl: 'https://x/n', returnUrl: 'https://x/r'}))
      .resolves.toEqual({invoiceId: '77', url: 'https://sandbox.nowpayments.io/payment?iid=77'});
    const [url, init] = fetch.mock.calls[0] as unknown as [string, {body: string; headers: Record<string, string>}];
    expect(url).toBe('https://api-sandbox.nowpayments.io/v1/invoice');
    expect(JSON.parse(init.body)).toMatchObject({price_amount: 18.56, price_currency: 'usd', pay_currency: 'usdttrc20', order_id: 'pay-1', is_fee_paid_by_user: false});
    expect(init.headers['x-api-key']).toBe('test-key');
  });

  it('номер платежа — только цифры: в адрес запроса к кассе ничего чужого не попадёт', async () => {
    await expect(client().getPayment('1/../../invoice')).rejects.toMatchObject({code: 'BAD_INPUT'});
  });

  it('без ключей касса не настроена — понятная ошибка, а не запрос с пустым ключом', async () => {
    const empty = createClient({apiKey: '', ipnSecret: '', sandbox: true});
    expect(empty.ready).toBe(false);
    await expect(empty.getPayment('1')).rejects.toMatchObject({code: 'UPSTREAM_BLOCKED'});
  });
});
