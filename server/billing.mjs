// Кредиты SMMAKER: списание за генерацию, возврат при неудаче.
//
// Правила (решение владельца, см. CONTEXT.md «Кредиты»):
//   • кредит списывается при ЗАПУСКЕ — иначе с пятью кредитами можно поставить в очередь
//     пятьдесят роликов;
//   • задание выполнено — списание закрывается (settled_at);
//   • упало или отменено — кредит возвращается строкой refund: сбой — не вина клиента;
//   • сервер перезапустился посреди задания — очередь в памяти пропала, при старте за всё
//     незакрытое кредиты возвращаются.
// Владелец платформы и сервер без базы (вход выключен) не платят.
import path from 'node:path';
import {db} from './db/index.mjs';
import {accessOf} from './accounts.mjs';
import {CONFIG_DIR, HttpError, readJson} from './store.mjs';
import {authEnabled} from './session.mjs';

export const PIPELINE_TITLES = {ads: 'ролик', carousels: 'карусель', reviews: 'обзор'};

/** Цены из config/credits.json: {ads, carousels, reviews}. Читаем при каждом запуске — файл крошечный */
export const creditCosts = async () => {
  const {_note, ...costs} = await readJson(path.join(CONFIG_DIR, 'credits.json'));
  return costs;
};

const plural = (n) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'кредит';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'кредита';
  return 'кредитов';
};

/**
 * Списать за генерацию. Возвращает квитанцию {jobId, cost} или null, если платить не нужно.
 *
 * Строка периода блокируется (FOR UPDATE): два запуска одновременно не увидят один и тот же
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
    const access = await accessOf(workspaceId, client);
    if (!access.active) throw new HttpError(403, 'Доступ закончился — продлите кодом');
    await client.query('SELECT 1 FROM smmaker_subscriptions WHERE id = $1 FOR UPDATE', [access.subscriptionId]);
    // Остаток пересчитываем уже под замком: accessOf выше мог видеть его до чужого списания
    const {rows: [{balance}]} = await client.query(
      'SELECT COALESCE(sum(delta), 0)::int AS balance FROM smmaker_credit_ledger WHERE subscription_id = $1',
      [access.subscriptionId]);
    if (balance < cost) {
      throw new HttpError(402, `Не хватает кредитов: ${PIPELINE_TITLES[pipeline] ?? pipeline} стоит ${cost} ${plural(cost)}, осталось ${balance}. Продлите доступ кодом`);
    }
    await client.query(
      `INSERT INTO smmaker_credit_ledger (workspace_id, subscription_id, delta, kind, pipeline, job_id, note, created_by)
       VALUES ($1, $2, $3, 'charge', $4, $5, $6, $7)`,
      [workspaceId, access.subscriptionId, -cost, pipeline, jobId, String(note).slice(0, 200), userId]);
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
 * Вернуть кредит за задание. Возврат идёт в тот же период, что и списание, — даже если он
 * уже закончился: иначе неудача в последний день периода дарила бы кредит следующему.
 * Повторный возврат по той же задаче не пройдёт: уникальный индекс (job_id, kind).
 */
export const refund = async (receipt, note = 'не выполнено') => {
  if (!receipt) return;
  await db().query(
    `WITH c AS (
       UPDATE smmaker_credit_ledger SET settled_at = now()
        WHERE job_id = $1 AND kind = 'charge' RETURNING workspace_id, subscription_id, delta, pipeline
     )
     INSERT INTO smmaker_credit_ledger (workspace_id, subscription_id, delta, kind, pipeline, job_id, note)
     SELECT workspace_id, subscription_id, -delta, 'refund', pipeline, $1, $2 FROM c
     ON CONFLICT DO NOTHING`,
    [receipt.jobId, String(note).slice(0, 200)]);
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
 * Возвращаем. Оговорка: при выкладке новый контейнер может подняться раньше, чем старый
 * допишет рендер, — тогда клиент получит этот ролик бесплатно. Лучше так, чем наоборот.
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

/** Журнал кредитов компании — для кабинета: что, когда и за сколько */
export const ledgerOf = async (workspaceId, limit = 200) => (await db().query(
  `SELECT l.id, l.delta, l.kind, l.pipeline, l.job_id, l.note, l.created_at, l.subscription_id,
          s.period_start, s.period_end
     FROM smmaker_credit_ledger l JOIN smmaker_subscriptions s ON s.id = l.subscription_id
    WHERE l.workspace_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT $2`,
  [workspaceId, limit])).rows;
