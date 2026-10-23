// Оплата через AnyPay (13.10) на настоящем Postgres: заказ в валюте карты → оповещение кассы → сверка
// через API → кредиты ровно один раз, сообщение в группу и письмо владельцу. Плюс подделки, тестовое
// оповещение из кабинета, недоплата по сверке, потерянное оповещение, отказы кассы. И журнал AnyPay в
// Telegram (тема TELEGRAM_ANYPAY_TOPIC): каждый шаг — строкой, отдельно от темы «Оплаты».
//
// Песочницы у AnyPay нет — поэтому так: касса и курс подменены (fetch отвечает за anypay.io и
// open.er-api), Telegram и почта перехватываются — в сеть тест не ходит. Как и
// tests/server/payments.test.mjs, нужна своя база: TEST_DATABASE_URL, каждый прогон — своя схема.
//
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/server/paymentsAnypay.test.mjs
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';
import {notificationSign} from '../../cores/pay-anypay/src/signature.mjs';

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;
const KEYS = {
  ANYPAY_PROJECT_ID: '18527', ANYPAY_SECRET: 'test-project-secret', ANYPAY_API_ID: 'TESTAPIID', ANYPAY_API_KEY: 'test-api-key',
  ANYPAY_METHODS: 'card_uzs,card_uah',
  // Тема «Оплаты» и тема «AnyPay — журнал оплат»: сообщения раскладываются по ним
  TELEGRAM_PAYMENTS_TOPIC: '2', TELEGRAM_ANYPAY_TOPIC: '77',
};
// Курс: единиц за $1. Вона за сум = 1342 / 11887 ≈ 0,1129; за гривну = 1342 / 44,97 ≈ 29,84
const RATES = {KRW: 1342, JPY: 150, RUB: 80, UZS: 11887, UAH: 44.97, KGS: 87.5};

suite('оплата через AnyPay', () => {
  let env;
  let db;
  let pay;
  const schema = `smmaker_test_${Math.random().toString(36).slice(2, 8)}`;
  const WS = 'ws-anypaytest';
  // Что «знает» касса: transaction_id → платёж, как его отдаёт API payments
  const kassa = new Map();
  const created = [];
  // Тема «Оплаты» (начисления, тревоги) и журнал AnyPay — отдельно: проверяем, что хроника не лезет в «Оплаты»
  const telegram = [];
  const journal = [];
  const mails = [];
  // Следующий ответ create-payment — ошибкой кассы (код), если задан
  let failNext = null;
  let tx = 24_000_000;

  beforeAll(async () => {
    env = await useTempEnv();
    Object.assign(process.env, KEYS, {DATABASE_URL: TEST_DB, SMMAKER_DB_SCHEMA: schema});
    const dbm = await import('../../server/db/index.mjs');
    await dbm.migrate({log: () => {}});
    db = dbm.db();
    await db.query(`INSERT INTO smmaker_workspaces (id, name) VALUES ($1, 'Тест AnyPay')`, [WS]);
    const {rows: [owner]} = await db.query(`INSERT INTO smmaker_users (email, email_key, password_hash, name)
      VALUES ('owner@anypay.test', 'owner@anypay.test', 'x', 'Иван') RETURNING id`);
    await db.query(`INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [WS, owner.id]);
    (await import('../../server/telegram.mjs')).setTelegramTransport(async (m) => { (m.topic === 77 ? journal : telegram).push(m.text); });
    (await import('../../server/mailer.mjs')).setMailTransport(async (m) => { mails.push(m); });
    pay = await import('../../server/payments.mjs');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const json = (data, status = 200) => ({ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data)});
      const u = String(url);
      if (u.includes('open.er-api.com')) return json({rates: RATES});
      const f = init.body instanceof FormData ? init.body : new FormData();
      if (u.includes('/api/create-payment/')) {
        if (failNext) {
          const code = failNext;
          failNext = null;
          return json({error: {code: String(code), message: 'test'}});
        }
        tx += 1;
        const p = {transaction_id: tx, pay_id: Number(f.get('pay_id')), status: 'waiting', method: f.get('method'),
          amount: f.get('amount'), currency: f.get('currency'), profit: null, email: f.get('email')};
        created.push(Object.fromEntries(f.entries()));
        kassa.set(String(tx), p);
        return json({result: {transaction_id: tx, pay_id: p.pay_id, status: 'waiting', payment_url: `https://anypay.io/pay/test-${tx}`}});
      }
      if (u.includes('/api/payments/')) {
        const p = kassa.get(String(f.get('trans_id')));
        return json({result: p ? {total: 1, payments: {[p.transaction_id]: p}} : {total: 0, payments: null}});
      }
      return json({error: {code: '100', message: 'unexpected'}});
    }));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    (await import('../../server/telegram.mjs')).setTelegramTransport();
    (await import('../../server/mailer.mjs')).setMailTransport();
    await db?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await (await import('../../server/db/index.mjs')).closeDb();
    for (const k of [...Object.keys(KEYS), 'DATABASE_URL', 'SMMAKER_DB_SCHEMA']) delete process.env[k];
    await env?.cleanup();
  });

  const checkout = (method = 'card_uzs', packId = 'plan-basic') =>
    pay.startCheckout({workspaceId: WS, userId: null, packId, method, origin: 'https://kok.test'});
  const order = async (id) => (await db.query('SELECT * FROM smmaker_payments WHERE id = $1', [id])).rows[0];
  const lots = async () => (await db.query('SELECT * FROM smmaker_credit_lots WHERE workspace_id = $1 ORDER BY id', [WS])).rows;
  const events = async (id, kind) => (await db.query('SELECT * FROM smmaker_payment_events WHERE payment_id = $1 AND kind = $2', [id, kind])).rows;
  const settle = () => new Promise((r) => setTimeout(r, 50));

  /**
   * Клиент оплатил: касса «знает» платёж оплаченным и шлёт оповещение — подписанное, как в
   * документации. over — правки оповещения (не того, что касса ответит на сверке)
   */
  const paidNotification = async (id, over = {}) => {
    const o = await order(id);
    const p = kassa.get(o.payment_id);
    p.status = 'paid';
    p.profit = String((Number(p.amount) * 0.95).toFixed(2));
    const body = {merchant_id: KEYS.ANYPAY_PROJECT_ID, transaction_id: String(p.transaction_id), pay_id: String(p.pay_id),
      amount: p.amount, currency: p.currency, profit: p.profit, email: p.email, method: p.method, status: 'paid', test: '0',
      created_date: '13.10.2026 15:00:00', completed_date: '13.10.2026 15:02:00', ...over};
    return {...body, sign: notificationSign(body, KEYS.ANYPAY_PROJECT_ID, KEYS.ANYPAY_SECRET)};
  };
  const notify = (body) => pay.handleNotification({provider: 'anypay', body, ip: '185.162.128.38'});

  it('заказ: сумма в сумах по курсу дня, целыми; числовой номер у кассы; платёж кассы известен сразу', async () => {
    const {id, url} = await checkout('card_uzs');
    const o = await order(id);
    // $36,98 (тариф) × 11 887 сумов за $1 = 439 581,26 → сумы целыми
    expect(Number(o.amount)).toBe(439581);
    expect(o).toMatchObject({provider: 'anypay', status: 'created', currency: 'uzs', pay_currency: 'card', sandbox: false});
    expect(o.kassa_order).toMatch(/^[1-9]\d{14}$/);
    expect(o.payment_id).toBe(o.invoice_id);
    expect(url).toMatch(/^https:\/\/anypay\.io\/pay\//);
    // Кассе ушло: наш числовой номер, валюта карты, способ «card», без адреса возврата (не боевой сайт)
    expect(created.at(-1)).toMatchObject({pay_id: o.kassa_order, amount: '439581.00', currency: 'UZS', method_currency: 'UZS', method: 'card'});
    expect(created.at(-1).success_url).toBeUndefined();
  });

  it('гривны — с копейками', async () => {
    const {id} = await checkout('card_uah');
    // $36,98 × 44,97 = 1662,99…
    expect(await order(id)).toMatchObject({currency: 'uah', amount: '1662.99'});
  });

  it('клиент оплатил → кредиты начисляются сами, ровно один раз, сколько бы касса ни повторяла', async () => {
    const {id} = await checkout('card_uzs');
    const body = await paidNotification(id);
    const before = (await lots()).length;
    const mailsBefore = mails.length;
    await notify(body);
    await notify(body);
    await Promise.all([notify(body), notify(body)]);
    await settle();
    const got = await lots();
    expect(got).toHaveLength(before + 1);
    expect(got.at(-1)).toMatchObject({source: 'subscription', pack_id: 'plan-basic', credits: 30, price_usd: '36.98'});
    expect(await order(id)).toMatchObject({status: 'paid', provider_status: 'paid'});
    expect(await pay.paymentOf(WS, id)).toMatchObject({credited: true, status: 'paid', currency: 'uzs'});
    // Сообщение в «Оплаты» — с суммой в сумах и способом
    expect(telegram.some((t) => t.startsWith('✅ Оплата пришла') && t.includes(id) && /439\s581 сум · банковская карта/.test(t))).toBe(true);
    // Письмо — одно, владельцу, сумма в сумах
    expect(mails.length - mailsBefore).toBe(1);
    expect(mails.at(-1).to).toBe('owner@anypay.test');
    // Разряды — неразрывным пробелом (toLocaleString), поэтому \s
    expect(JSON.stringify(mails.at(-1))).toMatch(/439(\s|\\u00a0)581 сум/);
    expect(await events(id, 'credit')).toHaveLength(1);
    // Журнал AnyPay: весь путь заказа по шагам, начисление — одно
    const mine = journal.filter((t) => t.includes(id));
    expect(mine.some((t) => t.startsWith('🟡 Клиент начал оплату') && t.includes('Тест AnyPay'))).toBe(true);
    expect(mine.some((t) => t.startsWith('🔗 Касса выдала ссылку'))).toBe(true);
    expect(mine.some((t) => t.startsWith('📩 Оповещение кассы: «paid»'))).toBe(true);
    expect(mine.filter((t) => t.startsWith('✅ Кредиты начислены'))).toHaveLength(1);
  });

  it('подделка: неверная подпись, чужой проект — 400, кредитов нет', async () => {
    const {id} = await checkout('card_uzs');
    const body = await paidNotification(id);
    const before = (await lots()).length;
    await expect(notify({...body, amount: '1.00'})).rejects.toMatchObject({status: 400});
    await expect(notify({...body, merchant_id: '1'})).rejects.toMatchObject({status: 400});
    await expect(notify({...body, sign: 'x'.repeat(64)})).rejects.toMatchObject({status: 400});
    expect(await lots()).toHaveLength(before);
    expect((await order(id)).credited_at).toBeNull();
    expect(journal.filter((t) => t.startsWith('🚫 Оповещение отклонено') && t.includes(id))).toHaveLength(3);
  });

  it('оповещение по заказу, которого у нас нет (превью, Mac), — пропускаем и пишем в журнал', async () => {
    const body = {merchant_id: KEYS.ANYPAY_PROJECT_ID, transaction_id: '1', pay_id: '123456789012345', amount: '10.00', currency: 'UAH', status: 'paid', test: '0'};
    await expect(notify({...body, sign: notificationSign(body, KEYS.ANYPAY_PROJECT_ID, KEYS.ANYPAY_SECRET)})).resolves.toMatchObject({ok: true});
    expect(journal.some((t) => t.startsWith('❔ Оповещение по незнакомому заказу') && t.includes('123456789012345'))).toBe(true);
  });

  it('оповещение «оплачено», а касса на сверке говорит «ждём» — не начисляем, тревога', async () => {
    const {id} = await checkout('card_uzs');
    const body = await paidNotification(id);
    kassa.get((await order(id)).payment_id).status = 'waiting';
    const before = (await lots()).length;
    await notify(body);
    await settle();
    expect(await lots()).toHaveLength(before);
    expect(await events(id, 'reject')).toHaveLength(1);
    expect(telegram.some((t) => t.startsWith('⚠️ Нужен человек') && t.includes(id))).toBe(true);
  });

  it('касса на сверке знает другую сумму — не начисляем', async () => {
    const {id} = await checkout('card_uah');
    const body = await paidNotification(id);
    kassa.get((await order(id)).payment_id).amount = '10.00';
    const before = (await lots()).length;
    await notify(body);
    expect(await lots()).toHaveLength(before);
    expect((await order(id)).error).toMatch(/сумма счёта у кассы/);
  });

  it('комиссию платит покупатель: касса знает сумму больше счёта — начисляем; меньше — нет (выше)', async () => {
    const {id} = await checkout('card_uah');
    const body = await paidNotification(id);
    // Счёт 1641,97 ₴, с комиссией 6,9% сверху касса могла записать 1755,27 ₴
    kassa.get((await order(id)).payment_id).amount = '1755.27';
    const before = (await lots()).length;
    await notify({...body});
    await settle();
    expect(await lots()).toHaveLength(before + 1);
    expect(journal.some((t) => t.startsWith('✅ Кредиты начислены') && t.includes(id) && t.includes('комиссия клиента'))).toBe(true);
  });

  it('тестовое оповещение из кабинета AnyPay (test=1) — принято, но заказ не трогает', async () => {
    const {id} = await checkout('card_uzs');
    const body = await paidNotification(id, {test: '1'});
    const before = (await lots()).length;
    await expect(notify(body)).resolves.toMatchObject({ok: true, test: true});
    await settle();
    expect(journal.some((t) => t.startsWith('🧪 Тестовое оповещение') && t.includes(id))).toBe(true);
    expect(await lots()).toHaveLength(before);
    expect(await order(id)).toMatchObject({status: 'created', credited_at: null});
  });

  it('оповещение потерялось — фоновая сверка сама находит оплату и начисляет', async () => {
    const {id} = await checkout('card_uzs');
    await paidNotification(id);
    // Сверка берёт заказы, которые не менялись дольше 2 минут
    await db.query(`UPDATE smmaker_payments SET updated_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
    const before = (await lots()).length;
    await pay.reconcilePayments();
    await settle();
    expect(await lots()).toHaveLength(before + 1);
    expect(journal.some((t) => t.startsWith('🔄 Сверка: статус «created» → «paid»') && t.includes(id))).toBe(true);
    expect(await order(id)).toMatchObject({status: 'paid'});
  });

  it('способ не включён в ANYPAY_METHODS (сомы) — 503, к кассе не ходим', async () => {
    const n = created.length;
    await expect(checkout('card_kgs')).rejects.toMatchObject({status: 503});
    await expect(checkout('btc')).rejects.toMatchObject({status: 400});
    expect(created).toHaveLength(n);
  });

  it('касса: «способ недоступен» (208) и «не удалось создать ссылку» (215) — понятный текст, без тревоги', async () => {
    const alarms = telegram.length;
    failNext = 208;
    await expect(checkout('card_uzs')).rejects.toMatchObject({status: 502, message: /способ оплаты сейчас недоступен/});
    failNext = 215;
    await expect(checkout('card_uah')).rejects.toMatchObject({message: /способ оплаты сейчас недоступен/});
    await settle();
    // В «Оплаты» — ничего (клиент выберет другой способ), в журнал — оба отказа с кодом
    expect(telegram.length).toBe(alarms);
    expect(journal.filter((t) => t.startsWith('❌ Касса отказала в счёте')).map((t) => t.match(/код (\d+)/)?.[1])).toEqual(expect.arrayContaining(['208', '215']));
  });

  it('заказы USDT в журнал AnyPay не пишутся', async () => {
    const n = journal.length;
    process.env.NOWPAYMENTS_SANDBOX = '1';
    process.env.NOWPAYMENTS_SANDBOX_API_KEY = 'k';
    process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET = 's';
    try {
      await pay.startCheckout({workspaceId: WS, userId: null, packId: 'plan-basic', method: 'usdt', origin: 'https://kok.test'}).catch(() => {});
      await settle();
      expect(journal.length).toBe(n);
    } finally {
      for (const k of ['NOWPAYMENTS_SANDBOX', 'NOWPAYMENTS_SANDBOX_API_KEY', 'NOWPAYMENTS_SANDBOX_IPN_SECRET']) delete process.env[k];
    }
  });
});
