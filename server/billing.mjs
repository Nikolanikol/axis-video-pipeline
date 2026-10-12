// Кредиты SMMAKER: партии со сроком, списание за генерацию, возврат при неудаче.
//
// Модель (решение владельца 28 сентября, см. CONTEXT.md «Кредиты»):
//   • кредиты лежат партиями: бесплатные за подтверждение почты (7 на 30 дней), подписка на месяц
//     и докупка от менеджера (с 29.09 сгорают в конце месяца подписки), бонусы. У каждой партии
//     свой остаток и срок; «подписка до» — срок последней партии подписки;
//   • баланс — сумма остатков несгоревших партий;
//   • кредит списывается при ЗАПУСКЕ — иначе с пятью кредитами можно поставить в очередь
//     пятьдесят роликов — и берётся из партии, которая сгорает раньше: иначе бесплатные
//     сгорали бы нетронутыми, пока тратятся купленные;
//   • задание выполнено — списание закрывается (settled_at); упало или отменено — кредиты
//     возвращаются в те же партии, откуда взяты;
//   • сервер перезапустился посреди задания — очередь в памяти пропала, при старте за всё
//     незакрытое кредиты возвращаются;
//   • база не приняла исход (обрыв соединения, 12.10 на превью так пропал кредит за карусель:
//     возврат упал один раз и больше не повторялся) — исход помним и дожимаем сторожем
//     sweepCharges раз в пару минут, а не ждём следующего перезапуска.
// Владелец платформы и сервер без базы (вход выключен) не платят.
import path from 'node:path';
import {db, hasDatabase} from './db/index.mjs';
import {CONFIG_DIR, HttpError, clientMessage, readJson} from './store.mjs';
import {serverLog} from './log.mjs';

const journal = serverLog('billing');

// «Вход включён» — то же, что authEnabled в session.mjs; берём из базы напрямую, иначе
// session → accounts → billing → session замкнулись бы в круг импортов
const authEnabled = () => hasDatabase();

export const PIPELINE_TITLES = {ads: 'ролик', carousels: 'карусель', reviews: 'обзор'};

const creditsConfig = () => readJson(path.join(CONFIG_DIR, 'credits.json'));

/** Цены из config/credits.json: {ads, carousels, reviews}. Читаем при каждом запуске — файл крошечный */
export const creditCosts = async () => {
  const {_note, signup, ...costs} = await creditsConfig();
  return costs;
};

/** Бесплатные кредиты новой компании — начисляются при подтверждении почты: {credits, days} */
export const signupCredits = async () => ({credits: 7, days: 30, ...(await creditsConfig()).signup});

// Задания этого процесса, за которые списано и исход ещё не известен: сторож их не трогает
const live = new Set();
// Исход известен, но база его не приняла: jobId → {kind: 'settle' | 'refund', note}
const owed = new Map();
// Списание без исхода старше этого и не наше — сирота (процесс, что его делал, умер).
// С запасом: при выкладке старый контейнер ещё доделывает своё, пока новый уже работает
const ORPHAN_AGE_MIN = 10;

export const plural = (n) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'кредит';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'кредита';
  return 'кредитов';
};

/**
 * Положить партию кредитов и записать начисление в журнал. Вызывать внутри транзакции.
 * source — signup | pack | bonus | subscription. Срок — либо days от сейчас, либо точная
 * дата expiresAt: подписка продлевается от конца текущей, докупка сгорает вместе с ней.
 */
export const addLot = async (client, {workspaceId, credits, days, expiresAt = null, source, packId = null, priceKrw = null, note = '', createdBy = null}) => {
  const {rows: [lot]} = await client.query(
    `INSERT INTO smmaker_credit_lots (workspace_id, credits, remaining, expires_at, source, pack_id, price_krw, note, created_by)
     VALUES ($1, $2, $2, COALESCE($9::timestamptz, now() + $3 * interval '1 day'), $4, $5, $6, $7, $8) RETURNING id, expires_at`,
    [workspaceId, credits, days ?? 30, source, packId, priceKrw, String(note).slice(0, 200), createdBy, expiresAt]);
  await client.query(
    `INSERT INTO smmaker_credit_ledger (workspace_id, lot_id, delta, kind, note, created_by)
     VALUES ($1, $2, $3, 'grant', $4, $5)`,
    [workspaceId, lot.id, credits, String(note).slice(0, 200), createdBy]);
  return lot;
};

/**
 * Действующая подписка: тариф и до какого числа. Берём партию подписки, которая сгорает
 * позже всех: продлённая заранее подписка — это вторая партия со сроком после первой,
 * и «до» должно показывать конец оплаченного, а не текущего месяца. Остаток не важен:
 * все кредиты месяца потрачены, а подписка идёт. null — подписки нет или она кончилась.
 */
export const subscriptionOf = async (workspaceId, client = db()) => {
  const {rows: [s]} = await client.query(
    `SELECT l.expires_at, l.pack_id, COALESCE(p.title, l.pack_id) AS title, l.credits
       FROM smmaker_credit_lots l LEFT JOIN smmaker_packs p ON p.id = l.pack_id
      WHERE l.workspace_id = $1 AND l.source = 'subscription' AND l.expires_at > now()
      ORDER BY l.expires_at DESC LIMIT 1`,
    [workspaceId]);
  return s ? {planId: s.pack_id, title: s.title, credits: s.credits, until: s.expires_at} : null;
};

/**
 * Баланс компании: сумма несгоревших остатков, ближайшее сгорание и подписка — чтобы в
 * кабинете было видно «10 кредитов, 4 из них сгорят 27 октября, подписка до 27 октября».
 */
export const balanceOf = async (workspaceId, client = db()) => {
  const {rows} = await client.query(
    `SELECT id, credits, remaining, expires_at, source, pack_id, created_at FROM smmaker_credit_lots
      WHERE workspace_id = $1 AND remaining > 0 AND expires_at > now() ORDER BY expires_at`,
    [workspaceId]);
  const credits = rows.reduce((s, r) => s + r.remaining, 0);
  return {
    credits,
    subscription: await subscriptionOf(workspaceId, client),
    nextExpiry: rows[0] ? {at: rows[0].expires_at, credits: rows[0].remaining} : null,
    lots: rows.map((r) => ({id: Number(r.id), remaining: r.remaining, credits: r.credits, expiresAt: r.expires_at,
      source: r.source, packId: r.pack_id, createdAt: r.created_at})),
  };
};

/**
 * Списать за генерацию. Возвращает квитанцию {jobId, cost} или null, если платить не нужно.
 *
 * Партии компании блокируются (FOR UPDATE): два запуска одновременно не увидят один и тот же
 * остаток и не уйдут в минус. Проверка остатка и списание — в одной транзакции.
 */
export const charge = async ({workspaceId, pipeline, jobId, note = '', userId = null, free = false}) => {
  if (!authEnabled() || free) return null;
  const cost = (await creditCosts())[pipeline];
  if (!Number.isInteger(cost) || cost < 0) throw new Error(`Нет цены для «${pipeline}» в config/credits.json`);
  if (cost === 0) return null;
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const {rows: lots} = await client.query(
      `SELECT id, remaining FROM smmaker_credit_lots
        WHERE workspace_id = $1 AND remaining > 0 AND expires_at > now()
        ORDER BY expires_at, id FOR UPDATE`,
      [workspaceId]);
    const balance = lots.reduce((s, l) => s + l.remaining, 0);
    if (balance < cost) {
      throw new HttpError(402, `Не хватает кредитов: ${PIPELINE_TITLES[pipeline] ?? pipeline} стоит ${cost} ${plural(cost)}, осталось ${balance}. Напишите нам — продлим подписку или докупим кредиты`);
    }
    // Из партии, которая сгорает раньше
    const taken = [];
    let need = cost;
    for (const l of lots) {
      if (!need) break;
      const n = Math.min(need, l.remaining);
      await client.query('UPDATE smmaker_credit_lots SET remaining = remaining - $2 WHERE id = $1', [l.id, n]);
      taken.push({id: Number(l.id), n});
      need -= n;
    }
    await client.query(
      `INSERT INTO smmaker_credit_ledger (workspace_id, delta, kind, pipeline, job_id, note, created_by, lots)
       VALUES ($1, $2, 'charge', $3, $4, $5, $6, $7)`,
      [workspaceId, -cost, pipeline, jobId, String(note).slice(0, 200), userId, JSON.stringify(taken)]);
    await client.query('COMMIT');
    live.add(jobId);
    return {jobId, cost};
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Записать исход задания. Не вышло — запоминаем и пробрасываем ошибку: сторож повторит,
 * а вызывающий решает сам, пугать ли клиента (готовую карусель — нет, она уже собрана)
 */
const close = async (jobId, kind, note, write) => {
  live.delete(jobId);
  try {
    await write();
    owed.delete(jobId);
  } catch (e) {
    owed.set(jobId, {kind, note});
    throw e;
  }
};

const writeSettle = (jobId) => db().query(
  `UPDATE smmaker_credit_ledger SET settled_at = now() WHERE job_id = $1 AND kind = 'charge' AND settled_at IS NULL`,
  [jobId]);

/** Задание выполнено — списание окончательное */
export const settle = async (receipt) => {
  if (!receipt) return;
  await close(receipt.jobId, 'settle', '', () => writeSettle(receipt.jobId));
};

/**
 * Вернуть кредиты за задание — в те же партии, откуда взяты, даже если партия уже сгорела:
 * иначе неудача в последний день дарила бы кредит из более поздней партии.
 * Повторный возврат по той же задаче не пройдёт: уникальный индекс (job_id, kind) в журнале,
 * и возврат в партии идёт только после успешной записи строки возврата.
 */
export const refund = async (receipt, note = 'не выполнено') => {
  if (!receipt) return;
  await close(receipt.jobId, 'refund', note, () => writeRefund(receipt, note));
};

const writeRefund = async (receipt, note) => {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const {rows: [c]} = await client.query(
      `UPDATE smmaker_credit_ledger SET settled_at = now() WHERE job_id = $1 AND kind = 'charge'
       RETURNING workspace_id, delta, pipeline, lots`,
      [receipt.jobId]);
    if (!c) { await client.query('ROLLBACK'); return; }
    const {rowCount} = await client.query(
      `INSERT INTO smmaker_credit_ledger (workspace_id, delta, kind, pipeline, job_id, note, lots)
       VALUES ($1, $2, 'refund', $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [c.workspace_id, -c.delta, c.pipeline, receipt.jobId, String(note).slice(0, 200), JSON.stringify(c.lots ?? [])]);
    if (rowCount) {
      for (const {id, n} of c.lots ?? []) {
        await client.query('UPDATE smmaker_credit_lots SET remaining = LEAST(credits, remaining + $2) WHERE id = $1', [id, n]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Выполнить работу за кредиты: списать, сделать, закрыть или вернуть. Для синхронных
 * генераций (карусель); у видео исход приходит позже, из очереди рендера.
 */
export const billed = async (params, work) => {
  const receipt = await charge(params);
  let out;
  try {
    out = await work();
  } catch (e) {
    // Примечание видно клиенту в «Истории кредитов» — только текст для человека, не исключение
    await refund(receipt, `ошибка: ${clientMessage(e, 'сбой сборки').slice(0, 150)}`).catch((err) => journal.error('refund.failed', {note: 'кредит за упавшую работу не вернулся — дожмёт сторож', error: err}));
    throw e;
  }
  // Работа сделана — результат клиенту отдаём, даже если база не приняла закрытие:
  // раньше сбой здесь возвращал кредит и показывал ошибку при готовой карусели. Закрытие дожмёт сторож
  await settle(receipt).catch((err) => journal.warn('settle.failed', {note: 'списание не закрылось — дожмёт сторож', error: err}));
  return out;
};

/**
 * При старте сервера: всё, что списано и не закрыто, пропало вместе с очередью в памяти.
 * Возвращаем. Оговорка: при выкладке новый контейнер может подняться, пока старый
 * дописывает ролик, — тогда клиент получит его бесплатно. Лучше так, чем наоборот.
 */
export const refundOrphans = async ({log = console.log} = {}) => {
  const {rows} = await db().query(
    `SELECT job_id FROM smmaker_credit_ledger c
      WHERE kind = 'charge' AND settled_at IS NULL AND job_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM smmaker_credit_ledger r WHERE r.job_id = c.job_id AND r.kind = 'refund')`);
  for (const {job_id: jobId} of rows) await refund({jobId}, 'сервер перезапускался — задание не выполнено');
  if (rows.length) log(`Кредиты: возвращено за ${rows.length} невыполненных заданий`);
  return rows.length;
};

/**
 * Сторож кредитов, раз в пару минут (server/index.mjs): дожимает исходы, которые база не
 * приняла, и возвращает списания-сироты — без исхода дольше ORPHAN_AGE_MIN и не наши живые.
 * Без него кредит за упавшую при обрыве базы карусель висел до следующего перезапуска.
 */
export const sweepCharges = async ({log = console.log} = {}) => {
  let fixed = 0;
  for (const [jobId, {kind, note}] of owed) {
    try {
      await close(jobId, kind, note, () => (kind === 'settle' ? writeSettle(jobId) : writeRefund({jobId}, note)));
      fixed++;
    } catch { /* база всё ещё не отвечает — попробуем в следующий заход */ }
  }
  const {rows} = await db().query(
    `SELECT job_id FROM smmaker_credit_ledger c
      WHERE kind = 'charge' AND settled_at IS NULL AND job_id IS NOT NULL
        AND created_at < now() - $1 * interval '1 minute'
        AND NOT EXISTS (SELECT 1 FROM smmaker_credit_ledger r WHERE r.job_id = c.job_id AND r.kind = 'refund')`,
    [ORPHAN_AGE_MIN]);
  const orphans = rows.map((r) => r.job_id).filter((id) => !live.has(id) && !owed.has(id));
  for (const jobId of orphans) await refund({jobId}, 'задание не завершилось — кредиты возвращены');
  if (fixed || orphans.length) log(`Кредиты: дожато исходов ${fixed}, возвращено сирот ${orphans.length}`);
  return {fixed, orphans: orphans.length};
};

/** Журнал кредитов компании — для админки: что, когда и за сколько; у начислений — срок партии */
export const ledgerOf = async (workspaceId, limit = 200) => (await db().query(
  `SELECT l.id, l.delta, l.kind, l.pipeline, l.job_id, l.note, l.created_at, t.expires_at, t.source, t.price_krw
     FROM smmaker_credit_ledger l LEFT JOIN smmaker_credit_lots t ON t.id = l.lot_id
    WHERE l.workspace_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT $2`,
  [workspaceId, limit])).rows;

// Строк на страницу истории в кабинете: экран-полтора, дальше — «Вперёд»
const LEDGER_PAGE = 20;

/**
 * Журнал кредитов страницами — для кабинета (владелец 12.10: строк будет много). Каждая
 * генерация — строка, у активного клиента это сотни за месяц: целиком не отдаём
 */
export const ledgerPage = async (workspaceId, page = 1) => {
  const {rows: [c]} = await db().query('SELECT count(*)::int AS n FROM smmaker_credit_ledger WHERE workspace_id = $1', [workspaceId]);
  const pages = Math.max(1, Math.ceil(c.n / LEDGER_PAGE));
  const at = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const {rows} = await db().query(
    `SELECT l.id, l.delta, l.kind, l.pipeline, l.job_id, l.note, l.created_at, t.expires_at, t.source, t.price_krw
       FROM smmaker_credit_ledger l LEFT JOIN smmaker_credit_lots t ON t.id = l.lot_id
      WHERE l.workspace_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT $2 OFFSET $3`,
    [workspaceId, LEDGER_PAGE, (at - 1) * LEDGER_PAGE]);
  return {rows, total: c.n, page: at, pages, pageSize: LEDGER_PAGE};
};
