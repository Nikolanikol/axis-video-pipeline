// Админка 21.10 на настоящем Postgres: удаление тарифов (архив проданных), правка и скрытие клиентов,
// списание кредитов, рассылки — сегмент, поимённо, согласие, отписка, очередь.
//
// Как auth.test.mjs: нужна своя база TEST_DATABASE_URL (право создавать схемы), схема на прогон.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/server/admin.test.mjs
import http from 'node:http';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;

suite('админка: тарифы, клиенты, рассылки', () => {
  let env;
  let server;
  let base;
  let db;
  const schema = `smmaker_test_${Math.random().toString(36).slice(2, 8)}`;
  const mails = [];
  const sent = [];

  beforeAll(async () => {
    env = await useTempEnv();
    process.env.DATABASE_URL = TEST_DB;
    process.env.SMMAKER_DB_SCHEMA = schema;
    const dbm = await import('../../server/db/index.mjs');
    await dbm.migrate({log: () => {}});
    db = dbm.db();
    const store = await import('../../server/store.mjs');
    await store.ensureWorkspace({log: () => {}});
    (await import('../../server/mailer.mjs')).setMailTransport(async (mail) => { mails.push(mail); });
    // Рассылки не уходят в Resend, а складываются сюда — по одному и пачками
    (await import('../../server/mailing.mjs')).setMailingClient({
      ready: true,
      send: async (m) => { sent.push(m); return `id-${sent.length}`; },
      sendBatch: async (ms) => ms.map((m) => { sent.push(m); return `id-${sent.length}`; }),
    });
    const accounts = await import('../../server/accounts.mjs');
    await accounts.upsertAdmin({email: 'owner@smmaker.test', password: 'owner-pass-1', workspaceId: store.DEFAULT_WORKSPACE});
    const {createApp} = await import('../../server/app.mjs');
    server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    (await import('../../server/mailer.mjs')).setMailTransport();
    (await import('../../server/mailing.mjs')).setMailingClient();
    await new Promise((r) => server?.close(r));
    await db?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await (await import('../../server/db/index.mjs')).closeDb();
    delete process.env.DATABASE_URL;
    delete process.env.SMMAKER_DB_SCHEMA;
    await env?.cleanup();
  });

  const client = () => {
    let cookie = '';
    const call = async (method, url, body, {form = false} = {}) => {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['content-type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
      const res = await fetch(base + url, {method, headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body)});
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* страница, не JSON */ }
      return {status: res.status, body: json, text};
    };
    return {call};
  };
  const owner = client();
  const m = client();
  const codeFrom = (to) => /код[^:]*: (\d{6})/i.exec(mails.findLast((x) => x.to === to).text)[1];
  // Клиент с подтверждённой почтой: только таким уходят рассылки
  const verified = async (c, data) => {
    expect((await c.call('POST', '/api/auth/register', {password: 'password-1', ...data})).status).toBe(200);
    expect((await c.call('POST', '/api/auth/verify', {code: codeFrom(data.email)})).status).toBe(200);
    return (await c.call('GET', '/api/auth/me')).body.workspace.id;
  };
  const wait = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v || Date.now() > end) return v;
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const a = client();
  const b = client();
  const c = client();
  let wsA;
  let wsB;
  let wsC;

  it('подготовка: админ, менеджер, три клиента', async () => {
    expect((await owner.call('POST', '/api/auth/login', {email: 'owner@smmaker.test', password: 'owner-pass-1'})).status).toBe(200);
    wsA = await verified(a, {name: 'Анна', email: 'a@dealer.test', phone: '+82 10 1111 0001', company: 'Дилер А'});
    wsB = await verified(b, {name: 'Борис', email: 'b@dealer.test', phone: '+82 10 1111 0002', company: 'Дилер Б'});
    // Снял галочку «Получать новости» при регистрации
    wsC = await verified(c, {name: 'Вера', email: 'c@dealer.test', phone: '+82 10 1111 0003', company: 'Дилер В', news: false});
    expect((await m.call('POST', '/api/auth/register', {name: 'Мария', email: 'm@smmaker.test', phone: '+82 10 1111 0009', password: 'password-1'})).status).toBe(200);
    expect((await owner.call('PUT', '/api/admin/staff', {email: 'm@smmaker.test', role: 'manager'})).status).toBe(200);
  });

  describe('тарифы', () => {
    it('непроданный удаляется совсем, проданный уходит в архив и не продаётся', async () => {
      await owner.call('PUT', '/api/admin/packs/plan-temp', {title: 'Временный', credits: 5, price_krw: 1000, kind: 'plan'});
      expect((await owner.call('DELETE', '/api/admin/packs/plan-temp')).body).toEqual({result: 'deleted'});
      expect((await owner.call('GET', '/api/admin/packs')).body.map((p) => p.id)).not.toContain('plan-temp');

      expect((await owner.call('POST', `/api/admin/clients/${wsA}/packs`, {packId: 'start'})).status).toBe(200);
      expect((await owner.call('DELETE', '/api/admin/packs/start')).body).toEqual({result: 'archived'});
      const start = (await owner.call('GET', '/api/admin/packs')).body.find((p) => p.id === 'start');
      expect(start).toMatchObject({active: false});
      expect(start.archived_at).toBeTruthy();
      expect((await a.call('GET', '/api/account/offer')).body.packs.map((p) => p.id)).not.toContain('start');
      expect((await owner.call('POST', `/api/admin/clients/${wsA}/packs`, {packId: 'start'})).status).toBe(404);
    });

    it('«Вернуть» снимает архив, но в продажу не выставляет; «продаётся» — выставляет', async () => {
      expect((await owner.call('POST', '/api/admin/packs/start/restore')).body).toMatchObject({archived_at: null, active: false});
      await owner.call('DELETE', '/api/admin/packs/start');
      const back = await owner.call('PUT', '/api/admin/packs/start', {title: 'Старт', credits: 10, price_krw: 19000, active: true});
      expect(back.body).toMatchObject({active: true, archived_at: null});
    });

    it('менеджер тарифы не удаляет', async () => {
      expect((await m.call('DELETE', '/api/admin/packs/base')).status).toBe(403);
    });
  });

  describe('клиенты', () => {
    it('менеджер правит контакты; занятая почта — отказ; сотрудника правит только админ', async () => {
      const ok = await m.call('PUT', `/api/admin/clients/${wsB}`, {company: 'Дилер Б Групп', person: 'Борис П.', phone: '+82 10 2222 0002'});
      expect(ok.status).toBe(200);
      const row = (await m.call('GET', '/api/admin/clients?q=Групп')).body.rows[0];
      expect(row).toMatchObject({id: wsB, name: 'Дилер Б Групп', person: 'Борис П.', phone: '+821022220002'});
      const dup = await m.call('PUT', `/api/admin/clients/${wsB}`, {email: 'a@dealer.test'});
      expect(dup.status).toBe(409);
      expect((await m.call('PUT', '/api/admin/clients/k-axis', {person: 'Взлом'})).status).toBe(403);
    });

    it('списание: только админ, с причиной, не больше остатка, строкой в истории', async () => {
      expect((await m.call('POST', `/api/admin/clients/${wsB}/take`, {credits: 1, note: 'x'})).status).toBe(403);
      expect((await owner.call('POST', `/api/admin/clients/${wsB}/take`, {credits: 1})).status).toBe(400);
      expect((await owner.call('POST', `/api/admin/clients/${wsB}/take`, {credits: 999, note: 'много'})).status).toBe(409);
      const res = await owner.call('POST', `/api/admin/clients/${wsB}/take`, {credits: 2, note: 'ошибочное начисление'});
      expect(res.body.credits).toBe(5);
      const ledger = (await owner.call('GET', `/api/admin/clients/${wsB}/ledger`)).body;
      expect(ledger[0]).toMatchObject({kind: 'adjust', delta: -2});
      expect(ledger[0].note).toMatch(/ошибочное начисление/);
    });

    it('скрытый: выкинут, не входит, не сбрасывает пароль, виден только в «Скрытых»; вернули — входит', async () => {
      expect((await m.call('POST', `/api/admin/clients/${wsC}/hide`, {note: 'x'})).status).toBe(403);
      expect((await owner.call('POST', '/api/admin/clients/k-axis/hide', {note: 'x'})).status).toBe(409);
      expect((await owner.call('POST', `/api/admin/clients/${wsC}/hide`, {note: 'дубль кабинета'})).status).toBe(200);
      expect((await c.call('GET', '/api/auth/me')).body.user).toBeNull();
      const login = await c.call('POST', '/api/auth/login', {email: 'c@dealer.test', password: 'password-1'});
      expect(login.status).toBe(403);
      expect(login.body.error).toMatch(/закрыт/);
      const before = mails.length;
      await c.call('POST', '/api/auth/forgot', {email: 'c@dealer.test'});
      expect(mails.length).toBe(before);
      const all = (await owner.call('GET', '/api/admin/clients')).body;
      expect(all.rows.map((r) => r.id)).not.toContain(wsC);
      expect(all.counts.hidden).toBe(1);
      const hidden = (await owner.call('GET', '/api/admin/clients?filter=hidden')).body.rows;
      expect(hidden.map((r) => [r.id, r.hidden_note])).toEqual([[wsC, 'дубль кабинета']]);

      expect((await owner.call('POST', `/api/admin/clients/${wsC}/unhide`)).status).toBe(200);
      expect((await c.call('POST', '/api/auth/login', {email: 'c@dealer.test', password: 'password-1'})).status).toBe(200);
    });
  });

  describe('рассылки', () => {
    const draft = {subject: 'Новое для {компания}', body: 'Здравствуйте, {имя}!', button_label: '', button_url: '', segment: 'all', user_ids: []};

    it('получатели — подтверждённые без отписки, без сотрудников; галочка регистрации учтена', async () => {
      const aud = (await m.call('GET', '/api/admin/mailings/audience')).body;
      // a и b; c снял галочку, менеджер и админ — сотрудники
      expect(aud.all).toBe(2);
    });

    it('черновик с опечаткой в подстановке не отправить; тест — только себе, с пометкой', async () => {
      const bad = (await m.call('POST', '/api/admin/mailings', {...draft, body: 'Привет, {имяя}'})).body;
      expect((await m.call('POST', `/api/admin/mailings/${bad.id}/send`)).status).toBe(400);
      expect((await m.call('DELETE', `/api/admin/mailings/${bad.id}`)).status).toBe(200);

      const d = (await m.call('POST', '/api/admin/mailings', draft)).body;
      const t = await m.call('POST', `/api/admin/mailings/${d.id}/test`);
      expect(t.body).toEqual({ok: true, to: 'm@smmaker.test'});
      expect(sent.at(-1)).toMatchObject({to: 'm@smmaker.test', subject: expect.stringMatching(/^\[Тест\] /)});
      expect(sent.at(-1).unsubscribeUrl).toMatch(/\/api\/public\/unsubscribe\?k=/);
    });

    it('отправка сегменту: каждому своё письмо, очередь доходит до конца, правка после — отказ', async () => {
      const d = (await m.call('POST', '/api/admin/mailings', draft)).body;
      const before = sent.length;
      expect((await m.call('POST', `/api/admin/mailings/${d.id}/send`)).status).toBe(200);
      const done = await wait(async () => {
        const x = (await m.call('GET', `/api/admin/mailings/${d.id}`)).body;
        return x.status === 'done' && x;
      });
      expect(done.counts).toMatchObject({total: 2, sent: 2, failed: 0});
      const got = sent.slice(before);
      expect(got.map((x) => x.to).sort()).toEqual(['a@dealer.test', 'b@dealer.test']);
      expect(got.find((x) => x.to === 'a@dealer.test').subject).toBe('Новое для Дилер А');
      expect(got.find((x) => x.to === 'a@dealer.test').text).toMatch(/Здравствуйте, Анна!/);
      expect((await m.call('PUT', `/api/admin/mailings/${d.id}`, draft)).status).toBe(409);
    });

    it('отписка: GET — только страница, отписывает POST; дальше человеку не шлём', async () => {
      const link = sent.findLast((x) => x.to === 'b@dealer.test').unsubscribeUrl;
      const path = link.slice(link.indexOf('/api/'));
      const page = await client().call('GET', path);
      expect(page.text).toMatch(/Отписаться/);
      expect((await m.call('GET', '/api/admin/mailings/audience')).body.all).toBe(2);
      const done = await client().call('POST', path, 'List-Unsubscribe=One-Click', {form: true});
      expect(done.text).toMatch(/больше не придут/);
      expect((await m.call('GET', '/api/admin/mailings/audience')).body.all).toBe(1);
      // В кабинете галочка снята — и её можно вернуть
      expect((await b.call('GET', '/api/account/profile')).body.news).toBe(false);
      expect((await b.call('PUT', '/api/account/news', {on: true})).body.news).toBe(true);
    });

    it('поимённо: поиск показывает причину, письмо уходит только подходящим', async () => {
      const found = (await m.call('GET', '/api/admin/mailings/people?q=Дилер')).body;
      const vera = found.find((r) => r.email === 'c@dealer.test');
      expect(vera).toMatchObject({ok: false, why: 'отписался от новостей'});
      const anna = found.find((r) => r.email === 'a@dealer.test');
      const d = (await m.call('POST', '/api/admin/mailings', {...draft, segment: 'pick', user_ids: [anna.user_id, vera.user_id]})).body;
      expect(d.picked.map((r) => [r.email, r.ok])).toEqual(expect.arrayContaining([['a@dealer.test', true], ['c@dealer.test', false]]));
      const before = sent.length;
      expect((await m.call('POST', `/api/admin/mailings/${d.id}/send`)).body.counts.total).toBe(1);
      await wait(async () => (await m.call('GET', `/api/admin/mailings/${d.id}`)).body.status === 'done');
      expect(sent.slice(before).map((x) => x.to)).toEqual(['a@dealer.test']);
    });
  });
});
