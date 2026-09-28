// Вход, регистрация, кредиты партиями, пакеты, роли и изоляция компаний — на настоящем Postgres.
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
    const call = async (method, url, body, {proxied = false, ip = '203.0.113.7'} = {}) => {
      const isForm = body instanceof FormData;
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (proxied) headers['x-forwarded-for'] = ip;
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
  const m = client();
  const register = (c, data) => c.call('POST', '/api/auth/register', {password: 'password-1', ...data});
  const me = async (c) => (await c.call('GET', '/api/auth/me')).body;
  const daysTo = (iso) => (new Date(iso) - Date.now()) / 864e5;

  it('без входа: API закрыт, интерфейс узнаёт, что нужен вход и что дарим', async () => {
    const anon = client();
    expect(await me(anon)).toEqual({authRequired: true, user: null, signup: {credits: 10, days: 30}});
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

  it('владелец входит: админ, компания по умолчанию, черновые пакеты на месте', async () => {
    expect((await owner.call('POST', '/api/auth/login', {email: 'OWNER@smmaker.test', password: 'owner-pass-1'})).status).toBe(200);
    const m0 = await me(owner);
    expect(m0.user).toMatchObject({role: 'admin', isAdmin: true, isStaff: true});
    expect(m0.workspace.id).toBe('k-axis');
    const packs = (await owner.call('GET', '/api/admin/packs')).body;
    expect(packs.map((p) => p.id)).toEqual(['start', 'base', 'pro', 'business']);
  });

  it('без имени или с негодным телефоном — отказ, и ничего не остаётся', async () => {
    const x = client();
    expect((await register(x, {email: 'ghost@x.test', phone: '+82 10 1111 0000'})).status).toBe(400);
    const bad = await register(x, {name: 'Призрак', email: 'ghost@x.test', phone: '12-34'});
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/телефон/);
    const {rowCount} = await db.query(`SELECT 1 FROM ${schema}.smmaker_users WHERE email = 'ghost@x.test'`);
    expect(rowCount).toBe(0);
  });

  it('клиент регистрируется сам: компания, 10 кредитов на 30 дней, контакты для лида', async () => {
    const res = await register(a, {name: 'Анна', email: 'a@dealer.test', phone: '+82 10-1111 2222', company: 'Дилер А', password: 'password-a'});
    expect(res.status).toBe(200);
    const ma = await me(a);
    expect(ma.user).toMatchObject({name: 'Анна', role: null, isAdmin: false, isStaff: false});
    expect(ma.workspace.name).toBe('Дилер А');
    expect(ma.balance.credits).toBe(10);
    expect(ma.balance.nextExpiry.credits).toBe(10);
    expect(daysTo(ma.balance.nextExpiry.at)).toBeGreaterThan(29.9);
    expect(ma.balance.lots).toMatchObject([{source: 'signup', credits: 10, remaining: 10}]);
    const {rows: [u]} = await db.query(`SELECT phone FROM ${schema}.smmaker_users WHERE email = 'a@dealer.test'`);
    expect(u.phone).toBe('+821011112222');
    // Стартовый профиль — пустые контакты, а не номер владельца платформы
    const cfg = (await a.call('GET', '/api/config')).body;
    expect(cfg.profiles[0].contacts.whatsapp).toBe('');
    expect(cfg.brand.name).toBe('Дилер А');
    // Вместо логотипа AXIS — название компании текстом: логотипы пустые
    expect(cfg.brand.assets).toMatchObject({logoStacked: '', logoHorizontal: '', sign: ''});
  });

  it('компания необязательна — тогда называется по имени человека', async () => {
    expect((await register(b, {name: 'Борис', email: 'b@dealer.test', phone: '+7 900 000-00-01'})).status).toBe(200);
    expect((await me(b)).workspace.name).toBe('Борис');
  });

  it('одна почта и один телефон — одна регистрация', async () => {
    const x = client();
    const mail = await register(x, {name: 'X', email: 'A@Dealer.test', phone: '+82 10 9999 9999'});
    expect(mail.status).toBe(409);
    // Тот же номер, записанный иначе
    const tel = await register(x, {name: 'X', email: 'x@dealer.test', phone: '+821011112222'});
    expect(tel.status).toBe(409);
    expect(tel.body.error).toMatch(/телефон/);
  });

  it('компании не видят данных друг друга — ни через API, ни через файлы', async () => {
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
    expect((await a.call('GET', '/api/admin/clients')).status).toBe(403);
    expect((await a.call('PUT', '/api/admin/packs/start', {title: 'x', credits: 1, price_krw: 1})).status).toBe(403);
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

  it('в кабинете — прайс действующих пакетов и куда писать', async () => {
    const offer = (await a.call('GET', '/api/account/offer')).body;
    expect(offer.contacts.whatsapp).toMatch(/\d/);
    expect(offer.contacts._note).toBeUndefined();
    expect(offer.packs.map((p) => p.id)).toEqual(['start', 'base', 'pro', 'business']);
  });

  describe('пакеты и роли', () => {
    let wsA;
    beforeAll(async () => { wsA = (await me(a)).workspace.id; });

    it('менеджера назначает админ; менеджер — сотрудник, но не админ', async () => {
      await register(m, {name: 'Мария', email: 'm@smmaker.test', phone: '+82 10 3333 4444'});
      expect((await owner.call('PUT', '/api/admin/staff', {email: 'M@smmaker.test', role: 'manager'})).status).toBe(200);
      expect((await me(m)).user).toMatchObject({role: 'manager', isAdmin: false, isStaff: true});
      // Роль по почте несуществующего — понятный отказ
      expect((await owner.call('PUT', '/api/admin/staff', {email: 'nobody@x.test', role: 'manager'})).status).toBe(404);
      // Снять админа с себя нельзя: платформа осталась бы без админа
      const self = await owner.call('PUT', '/api/admin/staff', {email: 'owner@smmaker.test', role: null});
      expect(self.status).toBe(409);
    });

    it('менеджер видит лидов с телефонами и начисляет пакет', async () => {
      const clients = (await m.call('GET', '/api/admin/clients')).body;
      expect(clients.find((c) => c.id === wsA)).toMatchObject({person: 'Анна', phone: '+821011112222', credits: 10, paid_krw: 0});
      const res = await m.call('POST', `/api/admin/clients/${wsA}/packs`, {packId: 'start', note: 'перевод 123'});
      expect(res.status).toBe(200);
      expect(res.body.credits).toBe(40);
      const pack = res.body.lots.find((l) => l.source === 'pack');
      expect(daysTo(pack.expiresAt)).toBeGreaterThan(364.9);
      // Ближайшее сгорание — бесплатные, а не купленные
      expect(res.body.nextExpiry.credits).toBe(10);
      expect((await me(a)).balance.credits).toBe(40);
    });

    it('менеджер не меняет цены, бонусы и сотрудников', async () => {
      expect((await m.call('PUT', '/api/admin/packs/start', {title: 'Старт', credits: 30, price_krw: 1})).status).toBe(403);
      expect((await m.call('POST', `/api/admin/clients/${wsA}/bonus`, {credits: 100})).status).toBe(403);
      expect((await m.call('GET', '/api/admin/staff')).status).toBe(403);
      expect((await m.call('PUT', '/api/admin/staff', {email: 'a@dealer.test', role: 'admin'})).status).toBe(403);
    });

    it('новая цена не меняет проданное; снятый с продажи пакет не начислить', async () => {
      const saved = await owner.call('PUT', '/api/admin/packs/start', {title: 'Старт', credits: 30, price_krw: 45000, valid_days: 365, active: false});
      expect(saved.body).toMatchObject({price_krw: 45000, active: false});
      expect((await a.call('GET', '/api/account/offer')).body.packs.map((p) => p.id)).not.toContain('start');
      expect((await owner.call('POST', `/api/admin/clients/${wsA}/packs`, {packId: 'start'})).status).toBe(404);
      const clients = (await owner.call('GET', '/api/admin/clients')).body;
      expect(clients.find((c) => c.id === wsA).paid_krw).toBe(39000);
      const rows = (await a.call('GET', '/api/account/ledger')).body;
      expect(rows[0]).toMatchObject({kind: 'grant', delta: 30, source: 'pack', price_krw: 39000});
      expect(rows[0].note).toMatch(/Старт.*перевод 123/);
    });

    it('негодный пакет в прайс не попадает', async () => {
      expect((await owner.call('PUT', '/api/admin/packs/Bad_Id', {title: 'x', credits: 1, price_krw: 1})).status).toBe(400);
      expect((await owner.call('PUT', '/api/admin/packs/zero', {title: 'x', credits: 0, price_krw: 1})).status).toBe(400);
    });
  });

  describe('кредиты', () => {
    let billing;
    let wsB;
    beforeAll(async () => {
      billing = await import('../../server/billing.mjs');
      wsB = (await me(b)).workspace.id;
    });
    const credits = async () => (await me(b)).balance.credits;

    it('цены приходят в настройках интерфейса', async () => {
      expect((await b.call('GET', '/api/config')).body.credits).toEqual({carousels: 1, ads: 3, reviews: 10});
    });

    it('списание, возврат один раз, закрытие', async () => {
      expect(await credits()).toBe(10);
      const r = await billing.charge({workspaceId: wsB, pipeline: 'ads', jobId: 'job-1'});
      expect(r).toEqual({jobId: 'job-1', cost: 3});
      expect(await credits()).toBe(7);
      await billing.refund(r, 'тест');
      await billing.refund(r, 'тест ещё раз');
      expect(await credits()).toBe(10);
      await billing.settle(await billing.charge({workspaceId: wsB, pipeline: 'carousels', jobId: 'job-2'}));
      expect(await credits()).toBe(9);
    });

    it('сотрудники платформы не платят', async () => {
      expect(await billing.charge({workspaceId: 'k-axis', pipeline: 'ads', jobId: 'job-own', free: true})).toBeNull();
    });

    it('одновременные запуски не уводят в минус', async () => {
      // 9 кредитов, ролик — 3: пройдёт ровно 3 из 8, остаток 0
      const tries = await Promise.allSettled(Array.from({length: 8}, (_, i) =>
        billing.charge({workspaceId: wsB, pipeline: 'ads', jobId: `race-${i}`})));
      expect(tries.filter((t) => t.status === 'fulfilled')).toHaveLength(3);
      expect(tries.filter((t) => t.status === 'rejected').every((t) => t.reason.status === 402)).toBe(true);
      expect(await credits()).toBe(0);
    });

    it('кредиты кончились — генерация закрыта, смотреть можно', async () => {
      const lot = (await b.call('POST', '/api/lots', {})).body;
      expect(lot.id).toBeTruthy();
      const res = await b.call('POST', `/api/lots/${lot.id}/render`, {});
      expect(res.status).toBe(402);
      expect(res.body.error).toMatch(/Кредиты закончились/);
      expect((await b.call('GET', '/api/lots')).status).toBe(200);
      expect((await b.call('GET', `/api/renders?lot=${lot.id}`)).body).toEqual([]);
    });

    it('после перезапуска незакрытые списания возвращаются', async () => {
      // race-* списаны и не закрыты — как задания, пропавшие с очередью в памяти
      expect(await billing.refundOrphans({log: () => {}})).toBe(3);
      expect(await credits()).toBe(9);
      expect(await billing.refundOrphans({log: () => {}})).toBe(0);
    });

    it('не хватает на ролик — рендер не ставится, объяснение человеческое', async () => {
      await db.query(`UPDATE ${schema}.smmaker_credit_lots SET remaining = 2 WHERE workspace_id = $1`, [wsB]);
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

    it('сначала тратятся те, что сгорают раньше; сгоревшие не считаются, возврат — в свою партию', async () => {
      // Бонус на год поверх бесплатных (2 кр., сгорят через 30 дней)
      const bonus = await owner.call('POST', `/api/admin/clients/${wsB}/bonus`, {credits: 5, note: 'подарок'});
      expect(bonus.body.credits).toBe(7);
      const c1 = await billing.charge({workspaceId: wsB, pipeline: 'ads', jobId: 'fifo-1'});
      const lots = (await me(b)).balance.lots;
      // 3 = 2 из бесплатных (они кончились и пропали из остатка) + 1 из бонуса
      expect(lots).toMatchObject([{source: 'bonus', remaining: 4}]);
      // Бесплатные сгорели; возврат кладёт их туда, откуда взяты, — в сгоревшую партию,
      // и клиент получает назад только 1 кредит бонуса
      await db.query(`UPDATE ${schema}.smmaker_credit_lots SET expires_at = now() - interval '1 second' WHERE workspace_id = $1 AND source = 'signup'`, [wsB]);
      await billing.refund(c1, 'тест');
      expect(await credits()).toBe(5);
      expect((await me(b)).balance.nextExpiry.credits).toBe(5);
    });

    it('журнал в кабинете — построчно, новые сверху, у начислений срок', async () => {
      const rows = (await b.call('GET', '/api/account/ledger')).body;
      expect(rows[0].kind).toBe('refund');
      expect(rows.at(-1)).toMatchObject({kind: 'grant', delta: 10, source: 'signup'});
      expect(rows.at(-1).expires_at).toBeTruthy();
      // Чужой журнал не виден: у владельца своя компания
      expect((await owner.call('GET', '/api/account/ledger')).body.some((r) => r.job_id === 'job-1')).toBe(false);
    });
  });

  it('регистраций с одного адреса — не больше 5 в час, неудачные не считаются', async () => {
    const ip = '198.51.100.9';
    for (let i = 0; i < 3; i++) {
      expect((await client().call('POST', '/api/auth/register', {name: 'L', email: `bad${i}@x.test`, phone: '1', password: 'password-1'}, {proxied: true, ip})).status).toBe(400);
    }
    for (let i = 0; i < 5; i++) {
      const res = await client().call('POST', '/api/auth/register',
        {name: 'L', email: `l${i}@x.test`, phone: `+82 10 5555 000${i}`, password: 'password-1'}, {proxied: true, ip});
      expect(res.status).toBe(200);
    }
    const sixth = await client().call('POST', '/api/auth/register',
      {name: 'L', email: 'l9@x.test', phone: '+82 10 5555 0009', password: 'password-1'}, {proxied: true, ip});
    expect(sixth.status).toBe(429);
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
