// Клиент глазами админки: правка контактов, списание кредитов, скрытие (21.10).
//
// Список клиентов и начисления — в accounts.mjs (listClients, grantPack, grantBonus); здесь то,
// что меняет самого клиента. Кто что может (решение владельца 21.10):
//   • контакты правят и менеджер, и админ — менеджер чаще говорит с клиентом и узнаёт новый номер;
//   • списать кредиты и скрыть клиента — только админ: это деньги клиента и его доступ.
// Удаления здесь нет намеренно: админ клиента только скрывает, в базе ничего не стирается.
import {db} from './db/index.mjs';
import {HttpError} from './store.mjs';
import {balanceOf} from './billing.mjs';
import {emailKey, inTransaction, normEmail, normPhone} from './accounts.mjs';
import {serverLog} from './log.mjs';

const journal = serverLog('clients');

/** Владелец кабинета — его контакты и есть контакты клиента в админке (как в listClients) */
const ownerRow = async (client, workspaceId) => {
  const {rows: [r]} = await client.query(
    `SELECT u.id, u.email, u.platform_role FROM smmaker_memberships m JOIN smmaker_users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 ORDER BY m.created_at LIMIT 1`, [workspaceId]);
  return r ?? null;
};

/**
 * Поправить контакты клиента: компания, имя, телефон, почта. Поля, которых нет в запросе, не
 * трогаем. Почту сотрудник меняет без кода подтверждения — он и так говорит с клиентом и
 * исправляет опечатку с его слов; отметку «почта подтверждена» оставляем как была: бесплатные
 * кредиты за подтверждение уже выданы или нет, и смена адреса не должна их выдать второй раз.
 * Менеджер не правит сотрудников платформы — иначе мог бы сменить почту админа и войти за него
 */
export const updateClient = async ({workspaceId, company, person, phone, email, by}) => inTransaction(async (client) => {
  const {rows: [w]} = await client.query('SELECT id FROM smmaker_workspaces WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [workspaceId]);
  if (!w) throw new HttpError(404, 'Нет такого клиента');
  const owner = await ownerRow(client, workspaceId);
  if (owner?.platform_role && by.role !== 'admin') throw new HttpError(403, 'Данные сотрудника платформы меняет только админ');

  if (company !== undefined) {
    const title = String(company ?? '').trim().slice(0, 120);
    if (!title) throw new HttpError(400, 'Название компании не может быть пустым');
    // Название живёт в двух местах (CLAUDE.md, «Компания одна»): шапка и админка — name,
    // кабинет и ролики — profile.company. Пишем оба, как updateAccount
    await client.query(
      `UPDATE smmaker_workspaces SET name = $2, profile = jsonb_set(profile, '{company}', to_jsonb($2::text)), updated_at = now() WHERE id = $1`,
      [workspaceId, title]);
  }
  if (owner && (person !== undefined || phone !== undefined || email !== undefined)) {
    const set = [];
    const params = [owner.id];
    if (person !== undefined) {
      const n = String(person ?? '').trim().slice(0, 120);
      if (!n) throw new HttpError(400, 'Имя не может быть пустым');
      params.push(n); set.push(`name = $${params.length}`);
    }
    if (phone !== undefined) {
      // Пустой — убрать номер; заданный — в общем виде «+цифры», как при регистрации
      params.push(String(phone ?? '').trim() ? normPhone(phone) : null); set.push(`phone = $${params.length}`);
    }
    if (email !== undefined) {
      const mail = normEmail(email);
      params.push(mail); set.push(`email = $${params.length}`);
      params.push(emailKey(mail)); set.push(`email_key = $${params.length}`);
    }
    try {
      await client.query(`UPDATE smmaker_users SET ${set.join(', ')} WHERE id = $1`, params);
    } catch (e) {
      // Уникальность: почта (и её вариант для gmail) и телефон — у одного человека
      if (e.code === '23505') {
        throw new HttpError(409, /phone/.test(e.constraint ?? '') ? 'Этот телефон уже у другого клиента' : 'Эта почта уже у другого клиента');
      }
      throw e;
    }
    if (email !== undefined && normEmail(email) !== owner.email.toLowerCase()) {
      journal.info('client.email_changed', {ws: workspaceId, by: by.id});
    }
  }
  return {ok: true};
});

/**
 * Списать кредиты (только админ): ошибочное начисление, возврат денег мимо кассы. Подарить —
 * это grantBonus; здесь только минус. Берём из партий, которые сгорают раньше, — как списание
 * за генерацию (charge), и пишем строкой журнала с причиной: в истории клиента видно, кто и за что
 */
export const takeCredits = async ({workspaceId, credits, note, by}) => {
  const n = Number(credits);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new HttpError(400, 'Сколько списать — целое число кредитов от 1');
  const why = String(note ?? '').trim().slice(0, 200);
  if (!why) throw new HttpError(400, 'Напишите, за что списание: оно будет в истории клиента');
  await inTransaction(async (client) => {
    const {rows: lots} = await client.query(
      `SELECT id, remaining FROM smmaker_credit_lots WHERE workspace_id = $1 AND remaining > 0 AND expires_at > now()
        ORDER BY expires_at, id FOR UPDATE`, [workspaceId]);
    const balance = lots.reduce((s, l) => s + l.remaining, 0);
    if (balance < n) throw new HttpError(409, `У клиента только ${balance} кр. — больше не списать`);
    const taken = [];
    let need = n;
    for (const l of lots) {
      if (!need) break;
      const k = Math.min(need, l.remaining);
      await client.query('UPDATE smmaker_credit_lots SET remaining = remaining - $2 WHERE id = $1', [l.id, k]);
      taken.push({id: Number(l.id), n: k});
      need -= k;
    }
    await client.query(
      `INSERT INTO smmaker_credit_ledger (workspace_id, delta, kind, note, created_by, lots) VALUES ($1, $2, 'adjust', $3, $4, $5)`,
      [workspaceId, -n, `списано админом · ${why}`, by.id, JSON.stringify(taken)]);
  });
  return balanceOf(workspaceId);
};

/**
 * Скрыть клиента (только админ). Кабинет закрывается сразу — входы сброшены, войти и сбросить
 * пароль нельзя (closedSql в accounts.mjs), — и уходит из списка в фильтр «Скрытые». Ничего не
 * стирается: ни файлы, ни данные, ни кредиты. Сотрудника платформы так не скрыть — сначала роль
 */
export const hideClient = async ({workspaceId, note, by}) => {
  const why = String(note ?? '').trim().slice(0, 200);
  await inTransaction(async (client) => {
    const {rows: [w]} = await client.query(
      'SELECT id, hidden_at FROM smmaker_workspaces WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [workspaceId]);
    if (!w) throw new HttpError(404, 'Нет такого клиента');
    if (w.hidden_at) return;
    const {rows: staff} = await client.query(
      `SELECT 1 FROM smmaker_memberships m JOIN smmaker_users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND u.platform_role IS NOT NULL`,
      [workspaceId]);
    if (staff.length) throw new HttpError(409, 'Это кабинет сотрудника платформы — сначала снимите роль во вкладке «Сотрудники»');
    await client.query('UPDATE smmaker_workspaces SET hidden_at = now(), hidden_by = $2, hidden_note = $3 WHERE id = $1', [workspaceId, by.id, why]);
    await client.query(
      'DELETE FROM smmaker_sessions WHERE user_id IN (SELECT user_id FROM smmaker_memberships WHERE workspace_id = $1)', [workspaceId]);
  });
  journal.info('client.hidden', {ws: workspaceId, by: by.id, note: why});
  return {ok: true};
};

/** Вернуть скрытого: кабинет снова открыт, клиент входит своим паролем */
export const unhideClient = async ({workspaceId, by}) => {
  const {rowCount} = await db().query(
    `UPDATE smmaker_workspaces SET hidden_at = NULL, hidden_by = NULL, hidden_note = '' WHERE id = $1 AND hidden_at IS NOT NULL`, [workspaceId]);
  if (!rowCount) throw new HttpError(404, 'Клиент не скрыт');
  journal.info('client.unhidden', {ws: workspaceId, by: by.id});
  return {ok: true};
};
