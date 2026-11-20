// База SMMAKER без подключения: выбор схемы, порядок миграций и префикс smmaker_.
import fs from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {listMigrations, previewId, resolveSchema} from '../../server/db/index.mjs';

describe('схема SMMAKER', () => {
  it('прод — smmaker, Mac — smmaker_dev', () => {
    expect(resolveSchema({}, true)).toBe('smmaker');
    expect(resolveSchema({}, false)).toBe('smmaker_dev');
  });

  it('переменная переопределяет, но только в пределах smmaker', () => {
    expect(resolveSchema({SMMAKER_DB_SCHEMA: 'smmaker_test'}, false)).toBe('smmaker_test');
    for (const bad of ['public', 'kmotors', 'smmakerx', 'smmaker;drop', 'SMMAKER']) {
      expect(() => resolveSchema({SMMAKER_DB_SCHEMA: bad}, true)).toThrow(/smmaker/);
    }
  });

  it('превью PR не стартует на боевой схеме', () => {
    // Имена как у Coolify: превью — <uuid>-pr-<номер>, прод — <uuid>-<время>. Ветка в превью — main
    const pr = {COOLIFY_CONTAINER_NAME: 'ji28ak34qdz1lqate7tbuwqh-pr-15', COOLIFY_BRANCH: 'main'};
    expect(previewId(pr)).toBe('15');
    expect(previewId({COOLIFY_CONTAINER_NAME: 'ji28ak34qdz1lqate7tbuwqh-153328748858'})).toBe(null);
    expect(previewId({})).toBe(null);
    expect(() => resolveSchema(pr, true)).toThrow(/PR #15/);
    expect(() => resolveSchema({...pr, SMMAKER_DB_SCHEMA: 'smmaker'}, true)).toThrow(/PR #15/);
    expect(resolveSchema({...pr, SMMAKER_DB_SCHEMA: 'smmaker_preview'}, true)).toBe('smmaker_preview');
    expect(resolveSchema({COOLIFY_CONTAINER_NAME: 'ji28ak34qdz1lqate7tbuwqh-153328748858'}, true)).toBe('smmaker');
  });
});

describe('миграции', () => {
  it('идут по уникальным номерам с 001; 015 зарезервирован партнёркой', async () => {
    const list = await listMigrations();
    expect(list.length).toBeGreaterThan(0);
    const versions = list.map((m) => m.version);
    expect(versions[0]).toBe(1);
    expect(versions).toEqual([...new Set(versions)].sort((a, b) => a - b));
    // Причина резерва записана в 016_anypay.sql. Применённые версии не перенумеровываем;
    // если партнёрка добавит 015, список останется допустимым. Другие пропуски — ошибка.
    const missing = Array.from({length: Math.max(...versions)}, (_, i) => i + 1)
      .filter((v) => !versions.includes(v));
    expect(missing.filter((v) => v !== 15)).toEqual([]);
  });

  // В одном Supabase живут kmotors и caranalizer. Всё, что создаём мы, должно читаться
  // как наше и без схемы — в логах, дампах и списках Studio
  it('всё, что создаётся, называется smmaker_…', async () => {
    let total = 0;
    for (const m of await listMigrations()) {
      const sql = (await fs.readFile(m.path, 'utf8')).replace(/--.*$/gm, '');
      const names = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|SEQUENCE|TYPE|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_.]*)/gi)]
        .map((x) => x[1]);
      total += names.length;
      for (const name of names) expect(name, `${m.file}: ${name}`).toMatch(/^smmaker_/);
    }
    // По всем сразу, а не в каждой: миграция может только менять данные (005 — прайс).
    // Ноль на всех значит, что сломалось само выражение, и проверка молча ничего не ловит
    expect(total).toBeGreaterThan(0);
  });
});
