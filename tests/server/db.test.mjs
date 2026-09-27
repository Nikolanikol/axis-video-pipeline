// База SMMAKER без подключения: выбор схемы, порядок миграций и префикс smmaker_.
import fs from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {listMigrations, resolveSchema} from '../../server/db/index.mjs';

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
});

describe('миграции', () => {
  it('идут по номерам без пропусков, начиная с 001', async () => {
    const list = await listMigrations();
    expect(list.length).toBeGreaterThan(0);
    list.forEach((m, i) => expect(m.version).toBe(i + 1));
  });

  // В одном Supabase живут kmotors и caranalizer. Всё, что создаём мы, должно читаться
  // как наше и без схемы — в логах, дампах и списках Studio
  it('всё, что создаётся, называется smmaker_…', async () => {
    for (const m of await listMigrations()) {
      const sql = (await fs.readFile(m.path, 'utf8')).replace(/--.*$/gm, '');
      const names = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|SEQUENCE|TYPE|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_.]*)/gi)]
        .map((x) => x[1]);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name, `${m.file}: ${name}`).toMatch(/^smmaker_/);
    }
  });
});
