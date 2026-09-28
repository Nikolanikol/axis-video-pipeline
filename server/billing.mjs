// Кредиты SMMAKER: партии со сроком, списание за генерацию, возврат при неудаче.
//
// Модель (решение владельца 28 сентября, см. CONTEXT.md «Кредиты»):
//   • кредиты лежат партиями: бесплатные за подтверждение почты (10 на 30 дней), пакеты от менеджера
//     (живут год), бонусы. У каждой партии свой остаток и срок;
//   • баланс — сумма остатков несгоревших партий;
//   • кредит списывается при ЗАПУСКЕ — иначе с пятью кредитами можно поставить в очередь
//     пятьдесят роликов — и берётся из партии, которая сгорает раньше: иначе бесплатные
//     сгорали бы нетронутыми, пока тратятся купленные;
//   • задание выполнено — списание закрывается (settled_at); упало или отменено — кредиты
//     возвращаются в те же партии, откуда взяты;
//   • сервер перезапустился посреди задания — очередь в памяти пропала, при старте за всё
//     незакрытое кредиты возвращаются.
// Владелец платформы и сервер без базы (вход выключен) не платят.
import path from 'node:path';
import {db, hasDatabase} from './db/index.mjs';
import {CONFIG_DIR, HttpError, readJson} from './store.mjs';

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
export const signupCredits = async () => ({credits: 10, days: 30, ...(await creditsConfig()).signup});

const plural = (n) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'кредит';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'кредита';
  return 'кредитов';
};

/**
 * Положить партию кредитов и записать начисление в журнал. Вызывать внутри транзакции.
 * source — signup | pack | bonus; days — сколько дней живёт партия.
 */
export const addLot = async (client, {workspaceId, credits, days, source, packId = null, priceKrw = null, note = '', createdBy = null}) => {
  const {rows: [lot]} = await client.query(
    `INSERT INTO smmaker_credit_lots (workspace_id, credits, remaining, expires_at, source, pack_id, price_krw, note, created_by)
     VALUES ($1, $2, $2, now() + $3 * interval '1 day', $4, $5, $6, $7, $8) RETURNING id, expires_at`,
    [workspaceId, credits, days, source, packId, priceKrw, String(note).slice(0, 200), createdBy]);
  await client.query(
    `INSERT INTO smmaker_credit_ledger (workspace_id, lot_id, delta, kind, note, created_by)
     VALUES ($1, $2, $3, 'grant', $4, $5)`,
    [workspaceId, lot.id, credits, String(note).slice(0, 200), createdBy]);
  return lot;
};

/**
 * Баланс компании: сумма несгоревших остатков и ближайшее сгорание — чтобы в кабинете
 * было видно «10 кредитов, 4 из них сгорят 27 октября».
 */
export const balanceOf = async (workspaceId, client = db()) => {
  const {rows} = await client.query(
    `SELECT id, credits, remaining, expires_at, source, pack_id, created_at FROM smmaker_credit_lots
      WHERE workspace_id = $1 AND remaining > 0 AND expires_at > now() ORDER BY expires_at`,
    [workspaceId]);
  const credits = rows.reduce((s, r) => s + r.remaining, 0);
  return {
    credits,
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
      throw new HttpError(402, `Не хватает кредитов: ${PIPELINE_TITLES[pipeline] ?? pipeline} стоит ${cost} ${plural(cost)}, осталось ${balance}. Напишите нам — пополним пакетом`);
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
    return {jobId, cost};
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

/** Задание выполнено — списание окончательное */
export const settle = async (receipt) => {
  if (!receipt) return;
  await db().query(
    `UPDATE smmaker_credit_ledger SET settled_at = now() WHERE job_id = $1 AND kind = 'charge' AND settled_at IS NULL`,
    [receipt.jobId]);
};

/**
 * Вернуть кредиты за задание — в те же партии, откуда взяты, даже если партия уже сгорела:
 * иначе неудача в последний день дарила бы кредит из более поздней партии.
 * Повторный возврат по той же задаче не пройдёт: уникальный индекс (job_id, kind) в журнале,
 * и возврат в партии идёт только после успешной записи строки возврата.
 */
export const refund = async (receipt, note = 'не выполнено') => {
  if (!receipt) return;
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
  try {
    const out = await work();
    await settle(receipt);
    return out;
  } catch (e) {
    await refund(receipt, `ошибка: ${String(e?.message || e).slice(0, 150)}`).catch((err) => console.error('Возврат кредита:', err));
    throw e;
  }
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

/** Журнал кредитов компании — для кабинета: что, когда и за сколько; у начислений — срок партии */
export const ledgerOf = async (workspaceId, limit = 200) => (await db().query(
  `SELECT l.id, l.delta, l.kind, l.pipeline, l.job_id, l.note, l.created_at, t.expires_at, t.source, t.price_krw
     FROM smmaker_credit_ledger l LEFT JOIN smmaker_credit_lots t ON t.id = l.lot_id
    WHERE l.workspace_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT $2`,
  [workspaceId, limit])).rows;
