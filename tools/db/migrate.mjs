// Применить миграции SMMAKER вручную: npm run db:migrate
// Сервер делает то же самое сам при запуске, если задан DATABASE_URL.
import {closeDb, migrate, resolveSchema} from '../../server/db/index.mjs';

try {
  const applied = await migrate();
  console.log(applied.length ? `Готово: ${applied.length} миграций` : `База ${resolveSchema()}: всё уже применено`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
