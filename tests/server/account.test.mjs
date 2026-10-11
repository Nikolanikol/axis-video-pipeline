// Личный кабинет (12.10): профиль, смена пароля и почты, где выполнен вход, удаление аккаунта
// с восстановлением и окончательной очисткой, история кредитов страницами — на настоящем Postgres.
//
// Как и tests/server/auth.test.mjs, нужна своя база: TEST_DATABASE_URL (пользователь с правом
// создавать схемы). Каждый прогон — своя схема smmaker_test_<случайное>, после — удаляется.
//
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/server/account.test.mjs
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

const TEST_DB = process.env.TEST_DATABASE_URL;
const suite = TEST_DB ? describe : describe.skip;

suite('личный кабинет', () => {
  let env;
  let server;
  let base;
  let db;
  let accounts;
  const schema = `smmaker_test_${Math.random().toString(36).slice(2, 8)}`;
  const mails = [];

  beforeAll(async () => {
    env = await useTempEnv();
    process.env.DATABASE_URL = TEST_DB;
    process.env.SMMAKER_DB_SCHEMA = schema;
    const dbm = await import('../../server/db/index.mjs');
    await dbm.migrate({log: () => {}});
    db = dbm.db();
    const store = await import('../../server/store.mjs');
    await store.ensureWorkspace({log: () => {}});
    // Письма не отправляем, а складываем в ящик теста: коды и ссылки берём оттуда
    (await import('../../server/mailer.mjs')).setMailTransport(async (mail) => { mails.push(mail); });
    accounts = await import('../../server/accounts.mjs');
    await accounts.upsertAdmin({email: 'owner@smmaker.test', password: 'owner-pass-1', workspaceId: store.DEFAULT_WORKSPACE});
    const {createApp} = await import('../../server/app.mjs');
    server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    (await import('../../server/mailer.mjs')).setMailTransport();
    await new Promise((r) => server?.close(r));
    await db?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const dbm = await import('../../server/db/index.mjs');
    await dbm.closeDb();
    delete process.env.DATABASE_URL;
    delete process.env.SMMAKER_DB_SCHEMA;
    await env?.cleanup();
  });

  // Клиент с cookie: как браузер, но руками. ua — строка браузера (для списка входов),
  // ip — адрес «снаружи» через прокси: у каждой регистрации свой, чтобы не упереться в лимит
  const client = ({ua = '', ip = '203.0.113.7'} = {}) => {
    let cookie = '';
    const call = async (method, url, body) => {
      const headers = {'x-forwarded-for': ip};
      if (cookie) headers.cookie = cookie;
      if (ua) headers['user-agent'] = ua;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* не JSON */ }
      return {status: res.status, body: json};
    };
    return {call};
  };
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
  const me = async (c) => (await c.call('GET', '/api/auth/me')).body;
  const lastMail = (to) => mails.findLast((x) => x.to === to);
  const codeFrom = (mail) => /код[^:]*: (\d{6})/i.exec(mail.text)[1];
  const linkFrom = (mail) => /\?t=([\w-]+)/.exec(mail.text)[1];

  // Зарегистрировать и подтвердить почту: живой клиент с 7 бесплатными кредитами
  const signup = async (c, {email, phone, company = 'Дилер', name = 'Иван'}) => {
    expect((await c.call('POST', '/api/auth/register', {name, email, phone, company, password: 'password-1'})).status).toBe(200);
    expect((await c.call('POST', '/api/auth/verify', {code: codeFrom(lastMail(email))})).status).toBe(200);
  };

  describe('профиль', () => {
    const c = client({ua: MAC, ip: '203.0.113.11'});
    beforeAll(() => signup(c, {email: 'prof@dealer.test', phone: '+82 10 1111 2222', company: 'Сеул Моторс'}));

    it('показывает имя, телефон, почту и компанию', async () => {
      const {body} = await c.call('GET', '/api/account/profile');
      expect(body).toMatchObject({name: 'Иван', email: 'prof@dealer.test', phone: '+821011112222', company: 'Сеул Моторс',
        emailVerified: true, canEditCompany: true, pendingEmail: null});
    });

    it('телефон сам не меняется; имя и компания — да, компания та же, что в профиле настроек', async () => {
      const {body} = await c.call('PUT', '/api/account/profile', {name: 'Иван Ким', phone: '+1 555 000 0000', company: 'Пусан Авто'});
      expect(body).toMatchObject({name: 'Иван Ким', phone: '+821011112222', company: 'Пусан Авто'});
      const cfg = (await c.call('GET', '/api/config')).body;
      expect(cfg.profiles.find((p) => p.id === cfg.defaultProfile).company).toBe('Пусан Авто');
      expect((await me(c)).workspace.name).toBe('Пусан Авто');
    });

    it('сохранение профиля в Настройках переименовывает кабинет', async () => {
      const cfg = (await c.call('GET', '/api/config')).body;
      const {id, ...profile} = cfg.profiles.find((p) => p.id === cfg.defaultProfile);
      expect((await c.call('PUT', `/api/profiles/${id}`, {...profile, company: 'Инчхон Трейд'})).status).toBe(200);
      expect((await me(c)).workspace.name).toBe('Инчхон Трейд');
    });

    it('пустое имя или пустая компания — отказ', async () => {
      expect((await c.call('PUT', '/api/account/profile', {name: ' '})).status).toBe(400);
      expect((await c.call('PUT', '/api/account/profile', {name: 'Иван', company: ' '})).status).toBe(400);
    });
  });

  describe('пароль и входы', () => {
    const mac = client({ua: MAC, ip: '203.0.113.21'});
    const phone = client({ua: IPHONE, ip: '203.0.113.22'});

    beforeAll(async () => {
      await signup(mac, {email: 'sec@dealer.test', phone: '+82 10 3333 4444'});
      expect((await phone.call('POST', '/api/auth/login', {email: 'sec@dealer.test', password: 'password-1'})).status).toBe(200);
    });

    it('список входов: устройство, адрес, текущий — первым', async () => {
      const {body} = await mac.call('GET', '/api/account/sessions');
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({device: 'Chrome · Mac', ip: '203.0.113.21', current: true});
      expect(body[1]).toMatchObject({device: 'Safari · iPhone', ip: '203.0.113.22', current: false});
      // Наружу — не хеш токена, а его начало
      expect(body[0].id).toHaveLength(16);
    });

    it('свой вход «Завершить» не закрывает, чужой — закрывает', async () => {
      const [mine, other] = (await mac.call('GET', '/api/account/sessions')).body;
      expect((await mac.call('DELETE', `/api/account/sessions/${mine.id}`)).status).toBe(409);
      const left = (await mac.call('DELETE', `/api/account/sessions/${other.id}`)).body;
      expect(left).toHaveLength(1);
      expect((await phone.call('GET', '/api/account/profile')).status).toBe(401);
      expect((await mac.call('DELETE', `/api/account/sessions/${other.id}`)).status).toBe(404);
    });

    it('смена пароля: нужен верный текущий, другие входы закрываются, письмо-уведомление', async () => {
      expect((await phone.call('POST', '/api/auth/login', {email: 'sec@dealer.test', password: 'password-1'})).status).toBe(200);
      expect((await mac.call('POST', '/api/account/password', {current: 'wrong-pass', password: 'password-2'})).status).toBe(403);
      expect((await mac.call('POST', '/api/account/password', {current: 'password-1', password: 'password-1'})).status).toBe(400);
      expect((await mac.call('POST', '/api/account/password', {current: 'password-1', password: 'short'})).status).toBe(400);
      const ok = await mac.call('POST', '/api/account/password', {current: 'password-1', password: 'password-2'});
      expect(ok.body).toEqual({ok: true, closed: 1});
      expect((await phone.call('GET', '/api/account/profile')).status).toBe(401);
      expect((await mac.call('GET', '/api/account/profile')).status).toBe(200);
      expect(lastMail('sec@dealer.test').subject).toMatch(/пароль изменён/);
      expect((await client().call('POST', '/api/auth/login', {email: 'sec@dealer.test', password: 'password-2'})).status).toBe(200);
    });

    it('«выйти на других устройствах» оставляет только этот вход', async () => {
      expect((await phone.call('POST', '/api/auth/login', {email: 'sec@dealer.test', password: 'password-2'})).status).toBe(200);
      const left = (await mac.call('POST', '/api/account/sessions/close-others')).body;
      expect(left).toEqual([expect.objectContaining({current: true})]);
      expect((await phone.call('GET', '/api/account/profile')).status).toBe(401);
    });
  });

  describe('смена почты', () => {
    const c = client({ip: '203.0.113.31'});
    beforeAll(() => signup(c, {email: 'old@dealer.test', phone: '+82 10 5555 6666'}));

    it('нужен пароль, занятая или та же почта — отказ', async () => {
      expect((await c.call('POST', '/api/account/email', {email: 'new@dealer.test', password: 'wrong-pass'})).status).toBe(403);
      expect((await c.call('POST', '/api/account/email', {email: 'prof@dealer.test', password: 'password-1'})).status).toBe(409);
      expect((await c.call('POST', '/api/account/email', {email: 'OLD@dealer.test', password: 'password-1'})).status).toBe(400);
    });

    it('код уходит на новый адрес, почта меняется только после кода, старой — уведомление', async () => {
      const r = await c.call('POST', '/api/account/email', {email: 'new@dealer.test', password: 'password-1'});
      expect(r.body).toEqual({sent: true, pendingEmail: 'new@dealer.test'});
      expect((await c.call('GET', '/api/account/profile')).body).toMatchObject({email: 'old@dealer.test', pendingEmail: 'new@dealer.test'});
      expect((await c.call('POST', '/api/account/email/confirm', {code: '000000'})).status).toBe(400);
      const code = codeFrom(lastMail('new@dealer.test'));
      expect((await c.call('POST', '/api/account/email/confirm', {code})).body).toEqual({ok: true, email: 'new@dealer.test'});
      expect(lastMail('old@dealer.test').subject).toMatch(/почта аккаунта изменена/);
      expect((await client().call('POST', '/api/auth/login', {email: 'old@dealer.test', password: 'password-1'})).status).toBe(401);
      expect((await client().call('POST', '/api/auth/login', {email: 'new@dealer.test', password: 'password-1'})).status).toBe(200);
    });

    it('смену можно отменить — адрес остаётся прежним', async () => {
      await db.query(`UPDATE ${schema}.smmaker_email_tokens SET created_at = now() - interval '2 minutes'`);
      expect((await c.call('POST', '/api/account/email', {email: 'other@dealer.test', password: 'password-1'})).status).toBe(200);
      expect((await c.call('DELETE', '/api/account/email')).status).toBe(200);
      expect((await c.call('GET', '/api/account/profile')).body).toMatchObject({email: 'new@dealer.test', pendingEmail: null});
    });
  });

  describe('удаление аккаунта', () => {
    const c = client({ip: '203.0.113.41'});
    let wsId;
    let userId;
    beforeAll(async () => {
      await signup(c, {email: 'bye@dealer.test', phone: '+82 10 7777 8888', company: 'Прощай Авто'});
      ({workspace: {id: wsId}, user: {id: userId}} = await me(c));
      // Файлы компании — проверить, что окончательное удаление их сотрёт
      await fs.mkdir(path.join(env.data, 'workspaces', wsId, 'lots'), {recursive: true});
    });

    it('без верного названия компании или пароля — отказ; сотруднику платформы — нельзя', async () => {
      expect((await c.call('POST', '/api/account/delete', {password: 'password-1', confirm: 'Другая'})).status).toBe(400);
      expect((await c.call('POST', '/api/account/delete', {password: 'wrong-pass', confirm: 'Прощай Авто'})).status).toBe(403);
      const owner = client();
      await owner.call('POST', '/api/auth/login', {email: 'owner@smmaker.test', password: 'owner-pass-1'});
      const company = (await me(owner)).workspace.name;
      expect((await owner.call('POST', '/api/account/delete', {password: 'owner-pass-1', confirm: company})).status).toBe(409);
    });

    it('удаление: вход закрыт, сброс пароля молчит, письмо со ссылкой и датой', async () => {
      const before = mails.length;
      // Регистр и лишние пробелы не важны — важно набрать название руками
      const r = await c.call('POST', '/api/account/delete', {password: 'password-1', confirm: '  прощай   АВТО '});
      expect(r.status).toBe(200);
      expect((new Date(r.body.until) - Date.now()) / 864e5).toBeGreaterThan(13.9);
      expect((await c.call('GET', '/api/account/profile')).status).toBe(401);
      const login = await client().call('POST', '/api/auth/login', {email: 'bye@dealer.test', password: 'password-1'});
      expect(login.status).toBe(403);
      expect(login.body.error).toMatch(/восстановить/);
      expect(lastMail('bye@dealer.test').subject).toMatch(/будет удалён/);
      const count = mails.length;
      await client().call('POST', '/api/auth/forgot', {email: 'bye@dealer.test'});
      expect(mails.length).toBe(count);
      expect(count).toBe(before + 1);
    });

    it('в админке клиент виден как «удаляет аккаунт»', async () => {
      const owner = client();
      await owner.call('POST', '/api/auth/login', {email: 'owner@smmaker.test', password: 'owner-pass-1'});
      const row = (await owner.call('GET', '/api/admin/clients?q=bye')).body.rows[0];
      expect(row.delete_after).toBeTruthy();
    });

    it('ссылка из письма восстанавливает и сразу впускает — один раз', async () => {
      const token = linkFrom(lastMail('bye@dealer.test'));
      const back = client();
      expect((await back.call('POST', '/api/auth/restore', {token})).status).toBe(200);
      expect((await me(back)).user.email).toBe('bye@dealer.test');
      expect((await client().call('POST', '/api/auth/restore', {token})).status).toBe(410);
      expect(lastMail('bye@dealer.test').subject).toMatch(/восстановлен/);
      expect((await c.call('POST', '/api/auth/login', {email: 'bye@dealer.test', password: 'password-1'})).status).toBe(200);
    });

    it('через 14 дней: данные обезличены, файлы стёрты, кредиты сгорели, расчёты на месте', async () => {
      expect((await c.call('POST', '/api/account/delete', {password: 'password-1', confirm: 'Прощай Авто'})).status).toBe(200);
      await db.query(`UPDATE ${schema}.smmaker_users SET delete_after = now() - interval '1 minute' WHERE id = $1`, [userId]);
      await accounts.purgeDeleted({log: () => {}});

      const {rows: [u]} = await db.query(`SELECT email, name, phone, password_hash FROM ${schema}.smmaker_users WHERE id = $1`, [userId]);
      expect(u).toEqual({email: `deleted-${userId}@deleted.invalid`, name: '', phone: null, password_hash: 'deleted'});
      const {rows: [w]} = await db.query(`SELECT name, profile, deleted_at FROM ${schema}.smmaker_workspaces WHERE id = $1`, [wsId]);
      expect(w).toMatchObject({name: 'Удалённый клиент', profile: {}});
      expect(w.deleted_at).toBeTruthy();
      const {rows: ledger} = await db.query(`SELECT delta, kind FROM ${schema}.smmaker_credit_ledger WHERE workspace_id = $1 ORDER BY id`, [wsId]);
      expect(ledger.at(-1)).toEqual({delta: -7, kind: 'adjust'});
      await expect(fs.access(path.join(env.data, 'workspaces', wsId))).rejects.toThrow();
      expect(lastMail('bye@dealer.test').subject).toMatch(/аккаунт удалён/);

      const owner = client();
      await owner.call('POST', '/api/auth/login', {email: 'owner@smmaker.test', password: 'owner-pass-1'});
      expect((await owner.call('GET', '/api/admin/clients?q=Удалённый')).body.total).toBe(0);
    });

    it('повторная регистрация на ту же почту и телефон — можно, но без подарка', async () => {
      const again = client({ip: '203.0.113.42'});
      expect((await again.call('POST', '/api/auth/register',
        {name: 'Снова', email: 'bye@dealer.test', phone: '+82 10 7777 8888', password: 'password-1'})).status).toBe(200);
      const mail = lastMail('bye@dealer.test');
      expect(mail.text).not.toMatch(/бесплатных кредитов/);
      expect((await again.call('POST', '/api/auth/verify', {code: codeFrom(mail)})).status).toBe(200);
      expect((await me(again)).balance.credits).toBe(0);
    });
  });

  it('история кредитов в кабинете — страницами по 20', async () => {
    const c = client({ip: '203.0.113.51'});
    await signup(c, {email: 'ledger@dealer.test', phone: '+82 10 9999 0000'});
    const ws = (await me(c)).workspace.id;
    for (let i = 0; i < 44; i++) {
      await db.query(`INSERT INTO ${schema}.smmaker_credit_ledger (workspace_id, delta, kind, note) VALUES ($1, -1, 'adjust', $2)`, [ws, `строка ${i}`]);
    }
    const p1 = (await c.call('GET', '/api/account/ledger')).body;
    expect(p1).toMatchObject({total: 45, page: 1, pages: 3, pageSize: 20});
    expect(p1.rows).toHaveLength(20);
    expect((await c.call('GET', '/api/account/ledger?page=3')).body.rows).toHaveLength(5);
    // Страница за краем — последняя, а не пустая
    expect((await c.call('GET', '/api/account/ledger?page=99')).body.page).toBe(3);
  });
});
