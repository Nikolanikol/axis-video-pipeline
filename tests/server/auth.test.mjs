// Вход, коды активации и изоляция компаний — на настоящем Postgres.
//
// Нужна отдельная база: TEST_DATABASE_URL (пользователь с правом создавать схемы).
// Каждый прогон — своя схема smmaker_test_<случайное>, после — удаляется. Без переменной
// набор пропускается: общий Supabase для тестов не годится, там у smmaker_app нет права
// создавать схемы, и тестовые данные туда не нужны.
//
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/server/auth.test.mjs
import http from 'node:http';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;

suite('вход и кабинеты SMMAKER', () => {
  let env;
  let server;
  let base;
  let db;
  let accounts;
  const schema = `smmaker_test_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    env = await useTempEnv();
    process.env.DATABASE_URL = TEST_DB;
    process.env.SMMAKER_DB_SCHEMA = schema;
    const dbm = await import('../../server/db/index.mjs');
    await dbm.migrate({log: () => {}});
    db = dbm.db();
    const store = await import('../../server/store.mjs');
    await store.ensureWorkspace({log: () => {}});
    accounts = await import('../../server/accounts.mjs');
    await accounts.upsertAdmin({email: 'owner@smmaker.test', password: 'owner-pass-1', workspaceId: store.DEFAULT_WORKSPACE});
    const {createApp} = await import('../../server/app.mjs');
    server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await db?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const dbm = await import('../../server/db/index.mjs');
    await dbm.closeDb();
    delete process.env.DATABASE_URL;
    delete process.env.SMMAKER_DB_SCHEMA;
    await env?.cleanup();
  });

  // Клиент с cookie: как браузер, но руками. proxied — запрос «снаружи», через прокси
  const client = () => {
    let cookie = '';
    const call = async (method, url, body, {proxied = false} = {}) => {
      const isForm = body instanceof FormData;
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (proxied) headers['x-forwarded-for'] = '203.0.113.7';
      if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, {method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)});
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* не JSON */ }
      return {status: res.status, body: json};
    };
    return {call, cookie: () => cookie};
  };

  const owner = client();
  const a = client();
  const b = client();
  let codes = [];

  it('без входа: API закрыт, интерфейс узнаёт, что нужен вход', async () => {
    const anon = client();
    expect((await anon.call('GET', '/api/auth/me')).body).toEqual({authRequired: true, user: null});
    expect((await anon.call('GET', '/api/config')).status).toBe(401);
    expect((await anon.call('GET', '/api/lots')).status).toBe(401);
  });

  it('неверный пароль и чужая почта отвечают одинаково', async () => {
    const x = client();
    const wrong = await x.call('POST', '/api/auth/login', {email: 'owner@smmaker.test', password: 'nope-nope'});
    const nobody = await x.call('POST', '/api/auth/login', {email: 'nobody@smmaker.test', password: 'nope-nope'});
    expect(wrong).toEqual(nobody);
    expect(wrong.status).toBe(401);
  });

  it('владелец входит, заводит тариф и выдаёт коды', async () => {
    expect((await owner.call('POST', '/api/auth/login', {email: 'OWNER@smmaker.test', password: 'owner-pass-1'})).status).toBe(200);
    const me = (await owner.call('GET', '/api/auth/me')).body;
    expect(me.user.isAdmin).toBe(true);
    expect(me.workspace.id).toBe('k-axis');
    const plan = await owner.call('PUT', '/api/admin/plans/start', {title: 'Старт', credits: 30, days: 30, pipelines: ['ads', 'carousels']});
    expect(plan.status).toBe(200);
    const res = await owner.call('POST', '/api/admin/codes', {planId: 'start', count: 5, note: 'тест'});
    expect(res.status).toBe(200);
    codes = res.body.map((c) => c.code);
    expect(codes[0]).toMatch(/^SMM-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it('регистрация с негодным кодом не оставляет ни пользователя, ни компании', async () => {
    const x = client();
    const res = await x.call('POST', '/api/auth/register', {email: 'ghost@x.test', password: 'password-1', company: 'Ghost', code: 'SMM-2222-2222-2222'});
    expect(res.status).toBe(404);
    const {rowCount} = await db.query(`SELECT 1 FROM ${schema}.smmaker_users WHERE email = 'ghost@x.test'`);
    expect(rowCount).toBe(0);
  });

  it('клиент регистрируется по коду: компания, период и кредиты тарифа', async () => {
    // Код, как его перепечатали из WhatsApp: строчными и с пробелами
    const typed = codes[0].toLowerCase().replace(/-/g, ' ');
    const res = await a.call('POST', '/api/auth/register', {email: 'a@dealer.test', password: 'password-a', company: 'Дилер А', code: typed});
    expect(res.status).toBe(200);
    const me = (await a.call('GET', '/api/auth/me')).body;
    expect(me.user.isAdmin).toBe(false);
    expect(me.workspace.name).toBe('Дилер А');
    expect(me.access).toMatchObject({active: true, credits: 30, plan: {id: 'start'}});
    const days = (new Date(me.access.periodEnd) - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(29.9);
    // Стартовый профиль — пустые контакты, а не номер владельца платформы
    const cfg = (await a.call('GET', '/api/config')).body;
    expect(cfg.profiles[0].contacts.whatsapp).toBe('');
    expect(cfg.brand.name).toBe('Дилер А');
    // Вместо логотипа AXIS — название компании текстом: логотипы пустые
    expect(cfg.brand.assets).toMatchObject({logoStacked: '', logoHorizontal: '', sign: ''});
  });

  it('код гасится один раз', async () => {
    const x = client();
    const res = await x.call('POST', '/api/auth/register', {email: 'c@dealer.test', password: 'password-c', company: 'C', code: codes[0]});
    expect(res.status).toBe(409);
  });

  it('одна почта — одна регистрация', async () => {
    const x = client();
    const res = await x.call('POST', '/api/auth/register', {email: 'A@Dealer.test', password: 'password-x', company: 'X', code: codes[4]});
    expect(res.status).toBe(409);
  });

  it('компании не видят данных друг друга — ни через API, ни через файлы', async () => {
    await b.call('POST', '/api/auth/register', {email: 'b@dealer.test', password: 'password-b', company: 'Дилер Б', code: codes[1]});
    const lot = (await a.call('POST', '/api/lots', {})).body;
    const form = new FormData();
    const png = await sharp({create: {width: 1200, height: 800, channels: 3, background: '#884422'}}).jpeg().toBuffer();
    form.append('photos', new Blob([png], {type: 'image/jpeg'}), 'car.jpg');
    const withPhoto = (await a.call('POST', `/api/lots/${lot.id}/photos`, form)).body;
    const photo = withPhoto.photos[0];
    expect(photo).toMatch(new RegExp(`^/data/workspaces/${(await a.call('GET', '/api/auth/me')).body.workspace.id}/lots/`));

    expect((await b.call('GET', `/api/lots/${lot.id}`)).status).toBe(404);
    expect((await b.call('GET', '/api/lots')).body.map((l) => l.id)).not.toContain(lot.id);
    // Файлы снаружи (через прокси): свой открывается, чужой — «нет такого»
    expect((await a.call('GET', photo, undefined, {proxied: true})).status).toBe(200);
    expect((await b.call('GET', photo, undefined, {proxied: true})).status).toBe(404);
    expect((await client().call('GET', photo, undefined, {proxied: true})).status).toBe(404);
    // Браузер рендера — свой процесс на loopback без заголовков прокси — видит всё
    expect((await client().call('GET', photo)).status).toBe(200);
  });

  it('клиент не лезет в админку и в общие реестры', async () => {
    expect((await a.call('GET', '/api/admin/plans')).status).toBe(403);
    expect((await a.call('POST', '/api/admin/codes', {planId: 'start'})).status).toBe(403);
    expect((await a.call('PUT', '/api/markets/mk', {name: 'x'})).status).toBe(403);
  });

  it('бренд не принимает адреса мимо своих файлов и Google Fonts', async () => {
    const brand = (await a.call('GET', '/api/config')).body.brand;
    const bad1 = await a.call('PUT', '/api/brand', {...brand, assets: {...brand.assets, sign: 'http://169.254.169.254/latest'}});
    expect(bad1.status).toBe(400);
    const bad2 = await a.call('PUT', '/api/brand', {...brand, fonts: {...brand.fonts, url: 'http://evil.test/x.css'}});
    expect(bad2.status).toBe(400);
    const ok = await a.call('PUT', '/api/brand', {...brand, copper: '#AA5500'});
    expect(ok.body.copper).toBe('#AA5500');
  });

  it('раздел вне тарифа закрыт', async () => {
    const r = (await a.call('POST', '/api/reviews', {})).body;
    const res = await a.call('POST', `/api/reviews/${r.id}/transcribe`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/не входит в тариф «Старт»/);
  });

  it('после конца срока — только просмотр; продление кодом открывает снова', async () => {
    const wsA = (await a.call('GET', '/api/auth/me')).body.workspace.id;
    await db.query(`UPDATE ${schema}.smmaker_subscriptions SET period_start = now() - interval '31 days', period_end = now() - interval '1 day' WHERE workspace_id = $1`, [wsA]);
    const lots = await a.call('GET', '/api/lots');
    expect(lots.status).toBe(200);
    const lot = lots.body[0];
    const render = await a.call('POST', `/api/lots/${lot.id}/render`, {});
    expect(render.status).toBe(403);
    expect(render.body.error).toMatch(/Доступ закончился/);
    expect((await a.call('GET', '/api/auth/me')).body.access).toMatchObject({active: false, credits: 0});

    // Продление после окончания — период с сегодняшнего дня
    const r1 = await a.call('POST', '/api/account/redeem', {code: codes[2]});
    expect(r1.body).toMatchObject({active: true, credits: 30});
    const end1 = new Date(r1.body.paidUntil);
    // Раннее продление — с конца оплаченного, а не с сегодня; кредиты текущего периода не растут
    const r2 = await a.call('POST', '/api/account/redeem', {code: codes[3]});
    expect(new Date(r2.body.paidUntil) - end1).toBeCloseTo(30 * 864e5, -4);
    expect(r2.body.credits).toBe(30);
  });

  it('владелец правит кредиты компании, правка видна в кабинете', async () => {
    const wsA = (await a.call('GET', '/api/auth/me')).body.workspace.id;
    const res = await owner.call('POST', `/api/admin/workspaces/${wsA}/credits`, {delta: 5, note: 'компенсация'});
    expect(res.body.credits).toBe(35);
    expect((await a.call('GET', '/api/auth/me')).body.access.credits).toBe(35);
    const list = (await owner.call('GET', '/api/admin/workspaces')).body;
    expect(list.find((w) => w.id === wsA)).toMatchObject({name: 'Дилер А', emails: 'a@dealer.test'});
    const used = (await owner.call('GET', '/api/admin/codes')).body.filter((c) => c.activated_at);
    expect(used).toHaveLength(4);
  });

  describe('кредиты', () => {
    let billing;
    let wsB;
    beforeAll(async () => {
      billing = await import('../../server/billing.mjs');
      wsB = (await b.call('GET', '/api/auth/me')).body.workspace.id;
    });
    const credits = async () => (await b.call('GET', '/api/auth/me')).body.access.credits;

    it('цены приходят в настройках интерфейса', async () => {
      expect((await b.call('GET', '/api/config')).body.credits).toEqual({carousels: 1, ads: 3, reviews: 10});
    });

    it('списание, возврат один раз, закрытие', async () => {
      expect(await credits()).toBe(30);
      const r = await billing.charge({workspaceId: wsB, pipeline: 'ads', jobId: 'job-1'});
      expect(r).toEqual({jobId: 'job-1', cost: 3});
      expect(await credits()).toBe(27);
      await billing.refund(r, 'тест');
      await billing.refund(r, 'тест ещё раз');
      expect(await credits()).toBe(30);
      await billing.settle(await billing.charge({workspaceId: wsB, pipeline: 'carousels', jobId: 'job-2'}));
      expect(await credits()).toBe(29);
    });

    it('владелец платформы не платит', async () => {
      expect(await billing.charge({workspaceId: 'k-axis', pipeline: 'ads', jobId: 'job-own', free: true})).toBeNull();
    });

    it('одновременные запуски не уводят в минус', async () => {
      // 29 кредитов, ролик — 3: пройдёт ровно 9 из 12, остаток 2
      const tries = await Promise.allSettled(Array.from({length: 12}, (_, i) =>
        billing.charge({workspaceId: wsB, pipeline: 'ads', jobId: `race-${i}`})));
      expect(tries.filter((t) => t.status === 'fulfilled')).toHaveLength(9);
      expect(tries.filter((t) => t.status === 'rejected').every((t) => t.reason.status === 402)).toBe(true);
      expect(await credits()).toBe(2);
    });

    it('не хватает кредитов — рендер не ставится, объяснение человеческое', async () => {
      const lot = (await b.call('POST', '/api/lots', {})).body;
      const form = new FormData();
      const jpg = await sharp({create: {width: 1200, height: 800, channels: 3, background: '#224488'}}).jpeg().toBuffer();
      form.append('photos', new Blob([jpg], {type: 'image/jpeg'}), 'car.jpg');
      await b.call('POST', `/api/lots/${lot.id}/photos`, form);
      const res = await b.call('POST', `/api/lots/${lot.id}/render`, {});
      expect(res.status).toBe(402);
      expect(res.body.error).toMatch(/ролик стоит 3 кредита, осталось 2/);
      expect((await b.call('GET', `/api/renders?lot=${lot.id}`)).body).toEqual([]);
    });

    it('после перезапуска незакрытые списания возвращаются', async () => {
      // race-0…8 списаны и не закрыты — как задания, пропавшие с очередью в памяти
      const n = await billing.refundOrphans({log: () => {}});
      expect(n).toBe(9);
      expect(await credits()).toBe(29);
      expect(await billing.refundOrphans({log: () => {}})).toBe(0);
    });

    it('журнал в кабинете — построчно, новые сверху', async () => {
      const rows = (await b.call('GET', '/api/account/ledger')).body;
      expect(rows[0].kind).toBe('refund');
      expect(rows.at(-1)).toMatchObject({kind: 'grant', delta: 30});
      expect(rows.reduce((sum, r) => sum + r.delta, 0)).toBe(29);
      // Чужой журнал не виден: у дилера А своя компания
      expect((await owner.call('GET', '/api/account/ledger')).body.some((r) => r.job_id === 'job-1')).toBe(false);
    });
  });

  it('выход закрывает сессию и на сервере', async () => {
    const token = a.cookie();
    await a.call('POST', '/api/auth/logout');
    expect((await a.call('GET', '/api/auth/me')).body.user).toBeNull();
    // Старый cookie, сохранённый где-то ещё, больше не пускает
    const res = await fetch(`${base}/api/lots`, {headers: {cookie: token}});
    expect(res.status).toBe(401);
  });
});
