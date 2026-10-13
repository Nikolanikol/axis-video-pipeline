// Модуль-касса AnyPay (cores/pay-anypay, контракт cores/PAYMENTS.md): подписи оповещения и API,
// статусы, разбор платежа, IP кассы, перевод ответов кассы в коды ошибок. Сеть подменена — в кассу
// тест не ходит.
import crypto from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {apiSign, notificationSign, verifyNotification} from '../../cores/pay-anypay/src/signature.mjs';
import {normalizeStatus} from '../../cores/pay-anypay/src/status.mjs';
import {createClient, isKassaIp, toPayment} from '../../cores/pay-anypay/src/index.mjs';

const PROJECT = '18527';
const SECRET = 'test-project-secret';
const client = () => createClient({projectId: PROJECT, secret: SECRET, apiId: 'APIID', apiKey: 'test-api-key'});
const answer = (status: number, body: unknown) => vi.fn(async () => ({ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body))}));
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const notification = (over: Record<string, unknown> = {}) => {
  const b: Record<string, unknown> = {merchant_id: PROJECT, transaction_id: '4950030', pay_id: '123456789012345', amount: '1990.00', currency: 'RUB', profit: '1890.50', email: 'a@b.ru', method: 'sbp', status: 'paid', test: '0', ...over};
  return {...b, sign: notificationSign(b, PROJECT, SECRET)};
};

afterEach(() => vi.unstubAllGlobals());

describe('подписи', () => {
  it('оповещение — по документации: currency:amount:pay_id:merchant_id:status:секрет', () => {
    const b = {currency: 'RUB', amount: '100.00', pay_id: '1335', status: 'paid'};
    expect(notificationSign(b, '1399', 'S')).toBe(sha('RUB:100.00:1335:1399:paid:S'));
  });

  it('запрос к API — склейка без разделителей с API-ключом', () => {
    expect(apiSign('payments', 'ID', ['18527'], 'KEY')).toBe(sha('paymentsID18527KEY'));
    expect(apiSign('balance', 'ID', [], 'KEY')).toBe(sha('balanceIDKEY'));
  });

  it('любая правка, чужой проект, пустой секрет — подпись неверна; регистр подписи не важен', () => {
    const n = notification();
    expect(verifyNotification(n, n.sign as string, PROJECT, SECRET)).toBe(true);
    expect(verifyNotification(n, String(n.sign).toUpperCase(), PROJECT, SECRET)).toBe(true);
    expect(verifyNotification({...n, amount: '19.90'}, n.sign as string, PROJECT, SECRET)).toBe(false);
    // «100» и «100.00» — разные подписи: сумму нельзя переводить в число и обратно
    expect(verifyNotification({...n, amount: '1990'}, n.sign as string, PROJECT, SECRET)).toBe(false);
    expect(verifyNotification(n, n.sign as string, '99999', SECRET)).toBe(false);
    expect(verifyNotification(n, n.sign as string, PROJECT, '')).toBe(false);
    expect(verifyNotification(n, undefined as unknown as string, PROJECT, SECRET)).toBe(false);
  });
});

describe('статусы, разбор, IP', () => {
  it('слова кассы → общие статусы; незнакомое — unknown', () => {
    expect(normalizeStatus('paid')).toBe('paid');
    expect(normalizeStatus('partially-paid')).toBe('partial');
    expect(normalizeStatus('refund')).toBe('refunded');
    expect(normalizeStatus('canceled')).toBe('failed');
    expect(normalizeStatus('PAID')).toBe('paid');
    expect(normalizeStatus('finished')).toBe('unknown');
  });

  it('разбор: регистр валюты, способ — payCurrency, тестовый флаг, без transaction_id — не платёж', () => {
    expect(toPayment({transaction_id: 4950030, pay_id: 1335, status: 'paid', method: 'SBP', amount: '1250', currency: 'rub', profit: 1200, test: '1'}))
      .toMatchObject({paymentId: '4950030', invoiceId: '4950030', orderId: '1335', status: 'paid', priceAmount: 1250, priceCurrency: 'rub', payCurrency: 'sbp', actuallyPaid: 1250, profit: 1200, test: true});
    expect(toPayment({transaction_id: 1, status: 'waiting', amount: '5'})).toMatchObject({actuallyPaid: null, test: false});
    expect(() => toPayment({pay_id: 1})).toThrow(/transaction_id/);
  });

  it('IP кассы — только три адреса, в том числе в виде IPv6-обёртки', () => {
    expect(isKassaIp('185.162.128.38')).toBe(true);
    expect(isKassaIp('::ffff:185.162.128.88')).toBe(true);
    expect(isKassaIp('185.162.128.40')).toBe(false);
    expect(isKassaIp(undefined)).toBe(false);
  });
});

describe('оповещение', () => {
  it('верное — платёж; чужой проект и неверная подпись — BAD_INPUT', async () => {
    await expect(client().readNotification(notification())).resolves.toMatchObject({status: 'paid', orderId: '123456789012345', payCurrency: 'sbp'});
    const alien = {...notification(), merchant_id: '1'};
    await expect(client().readNotification(alien)).rejects.toMatchObject({code: 'BAD_INPUT', message: /другого проекта/});
    await expect(client().readNotification({...notification(), status: 'waiting'})).rejects.toMatchObject({code: 'BAD_INPUT', message: /Подпись/});
  });

  it('без ключей касса не работает — UPSTREAM_BLOCKED', async () => {
    const c = createClient({projectId: PROJECT, secret: '', apiId: 'A', apiKey: 'K'});
    expect(c.ready).toBe(false);
    await expect(c.readNotification(notification())).rejects.toMatchObject({code: 'UPSTREAM_BLOCKED'});
  });
});

describe('ответы кассы → коды ошибок', () => {
  it('ошибка телом при HTTP 200: подпись API (102) — UPSTREAM_BLOCKED, без повторов', async () => {
    const fetch = answer(200, {error: {code: '102', message: 'Invalid sign'}});
    vi.stubGlobal('fetch', fetch);
    await expect(client().getPayment('123')).rejects.toMatchObject({code: 'UPSTREAM_BLOCKED', retryable: false, details: {kassaCode: 102}});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('сумма вне лимитов (204) — BAD_INPUT с кодом кассы для текста клиенту', async () => {
    vi.stubGlobal('fetch', answer(200, {error: {code: '204', message: 'Amount too small'}}));
    await expect(client().createInvoice({orderId: '123', amount: 10, email: 'a@b.ru', method: 'sbp'}))
      .rejects.toMatchObject({code: 'BAD_INPUT', details: {kassaCode: 204}});
  });

  it('5xx на чтении повторяется до трёх раз, создание платежа — ни разу', async () => {
    const fetch = answer(502, 'Bad Gateway');
    vi.stubGlobal('fetch', fetch);
    await expect(client().getPayment('123')).rejects.toMatchObject({code: 'UPSTREAM_UNAVAILABLE', retryable: true});
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockClear();
    await expect(client().createInvoice({orderId: '123', amount: 10, email: 'a@b.ru', method: 'card'})).rejects.toMatchObject({code: 'UPSTREAM_UNAVAILABLE'});
    expect(fetch).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('проверка ввода до кассы: номер не цифрами, без почты, чужой способ', async () => {
    const fetch = answer(200, {result: {}});
    vi.stubGlobal('fetch', fetch);
    await expect(client().createInvoice({orderId: 'pay-abc', amount: 10, email: 'a@b.ru', method: 'sbp'})).rejects.toMatchObject({code: 'BAD_INPUT'});
    await expect(client().createInvoice({orderId: '0123', amount: 10, email: 'a@b.ru', method: 'sbp'})).rejects.toMatchObject({code: 'BAD_INPUT'});
    await expect(client().createInvoice({orderId: '123', amount: 10, email: '', method: 'sbp'})).rejects.toMatchObject({code: 'BAD_INPUT'});
    await expect(client().createInvoice({orderId: '123', amount: 10, email: 'a@b.ru', method: 'btc'})).rejects.toMatchObject({code: 'BAD_INPUT'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('создание: сумма строкой с копейками в форме и в подписи; чужой pay_id в ответе — сбой', async () => {
    const fetch = vi.fn(async (_url: string, init: {body: FormData}) => {
      const f = init.body;
      expect(f.get('amount')).toBe('1990.50');
      expect(f.get('currency')).toBe('RUB');
      expect(f.get('sign')).toBe(sha(`create-paymentAPIID${PROJECT}1231990.50RUB${f.get('desc')}sbptest-api-key`));
      return {ok: true, status: 200, text: async () => JSON.stringify({result: {transaction_id: 77, pay_id: 123, status: 'waiting', payment_url: 'https://anypay.io/pay/x'}})};
    });
    vi.stubGlobal('fetch', fetch);
    await expect(client().createInvoice({orderId: '123', amount: 1990.5, description: 'KOK', email: 'a@b.ru', method: 'sbp'}))
      .resolves.toEqual({invoiceId: '77', paymentId: '77', url: 'https://anypay.io/pay/x'});
    vi.stubGlobal('fetch', answer(200, {result: {transaction_id: 77, pay_id: 999, payment_url: 'https://anypay.io/pay/x'}}));
    await expect(client().createInvoice({orderId: '123', amount: 10, email: 'a@b.ru', method: 'sbp'})).rejects.toMatchObject({code: 'UPSTREAM_BAD_RESPONSE'});
  });

  it('пустой список платежей приходит null — это NOT_FOUND, а не сбой', async () => {
    vi.stubGlobal('fetch', answer(200, {result: {total: 0, payments: null}}));
    await expect(client().getPayment('123')).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(client().findByOrder('123')).rejects.toMatchObject({code: 'NOT_FOUND'});
  });
});
