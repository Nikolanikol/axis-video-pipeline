// «Дверь» оплаты (server/payments.mjs, 12.10) на настоящем Postgres: начисление ровно один раз,
// сверка с кассой, подделки, недоплата, второй платёж, потерянное уведомление, журнал и тревоги.
//
// Как tests/server/account.test.mjs, нужна своя база: TEST_DATABASE_URL, каждый прогон — своя схема
// smmaker_test_<случайное>. Касса и курс подменены: fetch отвечает за NOWPayments и open.er-api,
// сообщения в Telegram перехватываются — в сеть тест не ходит.
//
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/server/payments.test.mjs
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {useTempEnv} from '../helpers.mjs';
import {sign} from '../../cores/pay-nowpayments/src/signature.mjs';

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;
const KEYS = {NOWPAYMENTS_SANDBOX: '1', NOWPAYMENTS_SANDBOX_API_KEY: 'test-api-key', NOWPAYMENTS_SANDBOX_IPN_SECRET: 'test-ipn-secret'};

suite('оплата тарифа', () => {
  let env;
  let db;
  let pay;
  const schema = `smmaker_test_${Math.random().toString(36).slice(2, 8)}`;
  const WS = 'ws-paytest';
  // Что «знает» касса: номер платежа → ответ GET /payment/:id
  const kassa = new Map();
  const telegram = [];
  const mails = [];
  let invoices = 0;

  beforeAll(async () => {
    env = await useTempEnv();
    Object.assign(process.env, KEYS, {DATABASE_URL: TEST_DB, SMMAKER_DB_SCHEMA: schema});
    const dbm = await import('../../server/db/index.mjs');
    await dbm.migrate({log: () => {}});
    db = dbm.db();
    await db.query(`INSERT INTO smmaker_workspaces (id, name) VALUES ($1, 'Тест оплаты')`, [WS]);
    // Владелец кабинета — ему уходит подтверждение оплаты; второй участник — чтобы письмо не ушло не тому
    const {rows: [owner]} = await db.query(`INSERT INTO smmaker_users (email, email_key, password_hash, name)
      VALUES ('owner@kok.test', 'owner@kok.test', 'x', 'Иван') RETURNING id`);
    const {rows: [member]} = await db.query(`INSERT INTO smmaker_users (email, email_key, password_hash, name)
      VALUES ('member@kok.test', 'member@kok.test', 'x', 'Пётр') RETURNING id`);
    await db.query(`INSERT INTO smmaker_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`, [WS, owner.id, member.id]);
    (await import('../../server/telegram.mjs')).setTelegramTransport(async (m) => { telegram.push(m.text); });
    (await import('../../server/mailer.mjs')).setMailTransport(async (m) => { mails.push(m); });
    pay = await import('../../server/payments.mjs');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const json = (data, status = 200) => ({ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data)});
      const u = String(url);
      if (u.includes('open.er-api.com')) return json({rates: {KRW: 1342, JPY: 150, RUB: 80}});
      if (u.endsWith('/invoice') && init.method === 'POST') {
        invoices += 1;
        return json({id: `${9000 + invoices}`, invoice_url: `https://sandbox.example/invoice/${invoices}`});
      }
      const m = u.match(/\/payment\/(\d+)$/);
      if (m && kassa.has(m[1])) return json(kassa.get(m[1]));
      return json({message: 'not found'}, 404);
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

  const checkout = (packId = 'start') => pay.startCheckout({workspaceId: WS, userId: null, packId, origin: 'https://kok.test'});
  const order = async (id) => (await db.query('SELECT * FROM smmaker_payments WHERE id = $1', [id])).rows[0];
  const lots = async () => (await db.query('SELECT * FROM smmaker_credit_lots WHERE workspace_id = $1 ORDER BY id', [WS])).rows;
  const notify = (body, signature = sign(body, KEYS.NOWPAYMENTS_SANDBOX_IPN_SECRET)) => pay.handleNotification({body, signature});
  // Уведомление кассы о платеже по заказу; то же самое касса «знает» при сверке
  const paid = async (id, paymentId, over = {}) => {
    const o = await order(id);
    const body = {payment_id: paymentId, invoice_id: o.invoice_id, order_id: id, payment_status: 'finished',
      price_amount: Number(o.amount), price_currency: 'usd', pay_currency: 'usdttrc20', pay_amount: Number(o.amount), actually_paid: Number(o.amount), ...over};
    kassa.set(String(paymentId), body);
    return body;
  };

  it('цена — из базы по тарифу, в долларах по курсу дня до цента', async () => {
    const {id, url} = await checkout('plan-basic');
    const o = await order(id);
    // ₩49 000 / 1342 = 36,5126…
    expect(Number(o.amount)).toBe(36.51);
    expect(o).toMatchObject({status: 'created', price_krw: 49000, currency: 'usd', pay_currency: 'usdttrc20', sandbox: true});
    expect(url).toMatch(/^https:\/\//);
  });

  it('оплата начисляется ровно один раз, сколько бы раз касса ни повторила уведомление', async () => {
    const {id} = await checkout('plan-basic');
    const body = await paid(id, 7001);
    const before = (await lots()).length;
    await notify(body);
    await notify(body);
    await Promise.all([notify(body), notify(body)]);
    // Запоздавшее «подтверждается» после «оплачено» не затирает статус
    await notify({...body, payment_status: 'confirming'});
    const got = await lots();
    expect(got).toHaveLength(before + 1);
    expect(got.at(-1)).toMatchObject({source: 'subscription', pack_id: 'plan-basic', credits: 30, price_krw: 49000});
    expect(await order(id)).toMatchObject({status: 'paid', payment_id: '7001'});
    expect(await pay.paymentOf(WS, id)).toMatchObject({credited: true, status: 'paid'});
    expect(telegram.some((t) => t.startsWith('✅ Оплата пришла') && t.includes(id))).toBe(true);
  });

  // Письмо уходит после ответа кассе (не держит оплату) — ждём его, а не полагаемся на порядок
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const events = async (id, kind) => (await db.query('SELECT * FROM smmaker_payment_events WHERE payment_id = $1 AND kind = $2', [id, kind])).rows;

  it('подтверждение оплаты — одно письмо владельцу кабинета, сколько бы ни было уведомлений', async () => {
    const {id} = await checkout('plan-basic');
    const body = await paid(id, 7101);
    const before = mails.length;
    await notify(body);
    await Promise.all([notify(body), notify(body)]);
    await settle();
    const got = mails.slice(before);
    expect(got).toHaveLength(1);
    expect(got[0].to).toBe('owner@kok.test');
    expect(got[0].subject).toMatch(/\+30 кр\./);
    expect(got[0].text).toContain(id);
    expect(got[0].text).toContain('песочниц');
    expect(got[0].text).toMatch(/Оплачено: \$36,51 · USDT TRC20 \(тариф ₩49\s000\)/);
    expect(got[0].html).toContain(`/#/account/${id}`);
    expect(await events(id, 'mail')).toHaveLength(1);
  });

  it('письмо не ушло — кредиты на месте, тревога в «Оплаты» одна', async () => {
    const mailer = await import('../../server/mailer.mjs');
    mailer.setMailTransport(async () => { throw new Error('Resend ответил 500'); });
    try {
      const {id} = await checkout();
      const body = await paid(id, 7102);
      await notify(body);
      await notify(body);
      await settle();
      expect(await order(id)).toMatchObject({status: 'paid'});
      expect((await order(id)).credited_at).not.toBeNull();
      expect(await events(id, 'mail')).toHaveLength(0);
      expect(telegram.filter((t) => t.includes('подтверждение оплаты не ушло') && t.includes(id))).toHaveLength(1);
    } finally {
      mailer.setMailTransport(async (m) => { mails.push(m); });
    }
  });

  it('пакет, начисленный менеджером в админке, — тоже письмо владельцу, с ценой тарифа, без номера заказа', async () => {
    const {grantPack} = await import('../../server/accounts.mjs');
    const before = mails.length;
    await grantPack({workspaceId: WS, packId: 'start', note: 'перевод на карту', createdBy: null});
    const got = mails.slice(before);
    expect(got).toHaveLength(1);
    expect(got[0].to).toBe('owner@kok.test');
    expect(got[0].text).toMatch(/Стоимость: ₩.+ · оплата через менеджера/);
    expect(got[0].text).not.toContain('Номер заказа');
    expect(got[0].text).not.toContain('песочниц');
  });

  it('письмо о ручном начислении не ушло — кредиты всё равно начислены, менеджер ошибки не видит', async () => {
    const {grantPack} = await import('../../server/accounts.mjs');
    const mailer = await import('../../server/mailer.mjs');
    mailer.setMailTransport(async () => { throw new Error('Resend ответил 500'); });
    try {
      const before = (await lots()).length;
      await expect(grantPack({workspaceId: WS, packId: 'start', createdBy: null})).resolves.toBeTruthy();
      expect(await lots()).toHaveLength(before + 1);
    } finally {
      mailer.setMailTransport(async (m) => { mails.push(m); });
    }
  });

  it('подпись верна, но касса знает платёж с другой суммой — не начисляем, тревога одна', async () => {
    const {id} = await checkout();
    const body = await paid(id, 7002);
    kassa.set('7002', {...body, price_amount: 1});
    const before = (await lots()).length;
    await notify(body);
    await notify(body);
    expect(await lots()).toHaveLength(before);
    expect((await order(id)).error).toMatch(/сумма/);
    expect(telegram.filter((t) => t.includes(id) && t.startsWith('⚠️'))).toHaveLength(1);
  });

  it('подделка и мусор: неверная подпись — 400, чужой заказ — тихо пропускаем, тело-массив — 400', async () => {
    const {id} = await checkout();
    const body = await paid(id, 7003);
    await expect(notify(body, 'deadbeef')).rejects.toMatchObject({status: 400});
    await expect(notify(body, '')).rejects.toMatchObject({status: 400});
    await expect(pay.handleNotification({body: [], signature: 'x'})).rejects.toMatchObject({status: 400});
    expect((await order(id)).credited_at).toBeNull();
    await expect(notify({order_id: 'pay-00000000000000000000', payment_id: 1, payment_status: 'finished'})).resolves.toEqual({ok: true});
  });

  it('недоплата: кредитов нет, тревога одна', async () => {
    const {id} = await checkout('plan-pro');
    const body = await paid(id, 7004, {payment_status: 'partially_paid', actually_paid: 10});
    await notify(body);
    await notify(body);
    expect((await order(id))).toMatchObject({status: 'partial', credited_at: null});
    expect(telegram.filter((t) => t.includes(id) && /недоплата/.test(t))).toHaveLength(1);
  });

  it('второй платёж по тому же заказу не начисляется сам — тревога человеку', async () => {
    const {id} = await checkout();
    await notify(await paid(id, 7005, {payment_status: 'waiting'}));
    const before = (await lots()).length;
    await notify(await paid(id, 7006));
    await settle(); // тревога уходит в фоне — не держит ответ кассе
    expect(await lots()).toHaveLength(before);
    expect(telegram.some((t) => t.includes(id) && /второй платёж/.test(t))).toBe(true);
  });

  it('перевод, уже привязанный к одному заказу, по другому заказу не начисляется — тревога, без сбоя', async () => {
    const first = await checkout();
    await notify(await paid(first.id, 7010, {payment_status: 'waiting'}));
    const second = await checkout();
    const before = (await lots()).length;
    await expect(notify(await paid(second.id, 7010))).resolves.toEqual({ok: true});
    await settle(); // тревога уходит в фоне — без ожидания тест зависел от скорости машины и падал через раз
    expect(await lots()).toHaveLength(before);
    expect(telegram.some((t) => t.includes(second.id) && /уже привязан/.test(t))).toBe(true);
  });

  it('потерянное «оплачено»: фоновая сверка переспрашивает кассу и начисляет', async () => {
    const {id} = await checkout();
    const body = await paid(id, 7007, {payment_status: 'waiting'});
    await notify(body);
    // Касса уже провела платёж, а уведомление «finished» до нас не дошло
    kassa.set('7007', {...body, payment_status: 'finished'});
    await db.query(`UPDATE smmaker_payments SET updated_at = now() - interval '5 minutes' WHERE id = $1`, [id]);
    await pay.reconcilePayments();
    expect((await order(id)).credited_at).not.toBeNull();
  });

  it('касса недоступна при сверке — 503, кассе повторить; заказ ждёт, кредитов нет', async () => {
    const {id} = await checkout();
    const body = await paid(id, 7008);
    kassa.delete('7008');
    vi.stubGlobal('fetch', vi.fn(async () => ({ok: false, status: 502, text: async () => 'Bad Gateway'})));
    await expect(notify(body)).rejects.toMatchObject({status: 503});
    expect((await order(id)).credited_at).toBeNull();
  }, 15_000);

  it('чужая компания чужой заказ не видит; журнал заказа пишется', async () => {
    const {id} = await checkout();
    await expect(pay.paymentOf('k-axis', id)).rejects.toMatchObject({status: 404});
    const events = await pay.paymentEvents(id);
    expect(events[0]).toMatchObject({kind: 'checkout', status: 'created'});
  });

  it('несуществующий или снятый тариф — 404, а не счёт', async () => {
    await expect(checkout('нет-такого')).rejects.toMatchObject({status: 404});
  });
});
