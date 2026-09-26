// База SMMAKER: подключение к Postgres в общем Supabase и миграции.
//
// В одном Supabase живут kmotors и caranalizer, поэтому всё наше помечено дважды:
// отдельной схемой (smmaker — прод, smmaker_dev — Mac) и префиксом smmaker_ у каждой
// таблицы. Подробности и причины — CONTEXT.md, раздел «База SMMAKER».
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// Тот же признак, что PRODUCTION в store.mjs. Не импортируем оттуда: store сам ходит в базу,
// и взаимный импорт отдал бы здесь неинициализированное значение
const PRODUCTION = process.env.NODE_ENV === 'production';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Схема обязана начинаться с smmaker: опечатка в переменной не должна увести наши
// миграции в public или в схему соседнего проекта
const SCHEMA_RE = /^smmaker(_[a-z0-9]+)*$/;

/**
 * Схема по окружению. Прод и Mac расходятся тем же признаком PRODUCTION, что и всё
 * остальное: разработка на Mac пишет в smmaker_dev и не трогает данные клиентов.
 */
export const resolveSchema = (env = process.env, production = PRODUCTION) => {
  const schema = env.SMMAKER_DB_SCHEMA || (production ? 'smmaker' : 'smmaker_dev');
  if (!SCHEMA_RE.test(schema)) {
    throw new Error(`SMMAKER_DB_SCHEMA=«${schema}»: схема должна начинаться с smmaker (smmaker, smmaker_dev…)`);
  }
  return schema;
};

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

let pool = null;

/**
 * Общий пул подключений. search_path задаётся в самом подключении, поэтому запросы
 * пишутся без имени схемы, а одни и те же миграции ложатся и в smmaker, и в smmaker_dev.
 * Подключаться надо к Postgres напрямую: пулер в режиме транзакций параметр options
 * отбрасывает, и запросы ушли бы в public.
 */
export const db = () => {
  if (pool) return pool;
  if (!hasDatabase()) throw new Error('Нет DATABASE_URL: база SMMAKER не подключена');
  const schema = resolveSchema();
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
    // Сервер делит машину с боевым сайтом и чужой базой: держим мало соединений
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
};

export const closeDb = async () => {
  if (pool) await pool.end();
  pool = null;
};

/** Файлы миграций по порядку: NNN_имя.sql. Номер — версия, дубли номеров — ошибка. */
export const listMigrations = async (dir = MIGRATIONS_DIR) => {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const seen = new Set();
  return files.map((file) => {
    const m = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(file);
    if (!m) throw new Error(`Миграция «${file}»: имя должно быть NNN_имя.sql`);
    const version = Number(m[1]);
    if (seen.has(version)) throw new Error(`Две миграции с номером ${m[1]}`);
    seen.add(version);
    return {version, file, path: path.join(dir, file)};
  });
};

/**
 * Применить недостающие миграции. Каждая — в своей транзакции: упавшая не оставляет
 * полсхемы. Замок по имени схемы: два процесса (контейнер при передеплое стартует
 * рядом со старым) не применят одну миграцию дважды. Возвращает список применённых.
 */
export const migrate = async ({log = console.log} = {}) => {
  const schema = resolveSchema();
  const client = await db().connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [schema]);
    // Схему создаёт tools/db/setup.sql от админа. Сами создаём, только если её нет:
    // CREATE SCHEMA IF NOT EXISTS проверяет право на создание раньше, чем наличие,
    // и у smmaker_app (права на базу у него нет) падал бы даже на готовой схеме
    const {rowCount} = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
    if (!rowCount) await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS smmaker_schema_migrations (
      version integer PRIMARY KEY, file text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const {rows} = await client.query('SELECT version FROM smmaker_schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    const applied = [];
    for (const m of await listMigrations()) {
      if (done.has(m.version)) continue;
      const sql = await fs.readFile(m.path, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO smmaker_schema_migrations (version, file) VALUES ($1, $2)', [m.version, m.file]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${m.file} не применилась: ${e.message}`);
      }
      log(`База ${schema}: применена ${m.file}`);
      applied.push(m.file);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [schema]).catch(() => {});
    client.release();
  }
};
