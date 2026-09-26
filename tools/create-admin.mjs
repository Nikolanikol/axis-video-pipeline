// Вход владельца платформы: npm run admin -- you@mail.com
//
// Пароль спрашивается в терминале и не отображается — в историю команд и в переписку он
// не попадает. Повторный запуск с той же почтой меняет пароль. Владелец становится
// админом платформы и владельцем компании по умолчанию (SMMAKER_WORKSPACE, k-axis).
import readline from 'node:readline';
import {migrate, closeDb, resolveSchema} from '../server/db/index.mjs';
import {DEFAULT_WORKSPACE, ensureWorkspace} from '../server/store.mjs';
import {upsertAdmin} from '../server/accounts.mjs';

// Один интерфейс на все вопросы, строки складываются в очередь: при вводе из конвейера
// все строки приходят разом, и вопрос, заданный позже, иначе остался бы без ответа
const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY});
let muted = false;
// Пока muted, символы пароля на экран не выводим
rl._writeToOutput = (s) => { if (!muted) process.stdout.write(s); };
const lines = [];
const waiting = [];
rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
const ask = (question, hidden = false) => {
  process.stdout.write(question);
  muted = hidden;
  const done = (answer) => { muted = false; if (hidden) process.stdout.write('\n'); return answer; };
  return lines.length ? Promise.resolve(done(lines.shift())) : new Promise((resolve) => waiting.push((l) => resolve(done(l))));
};

try {
  if (!process.env.DATABASE_URL) throw new Error('Нет DATABASE_URL в .env — вход работает только с базой');
  const email = process.argv[2] || await ask('Почта: ');
  const password = await ask('Пароль (не меньше 8 символов): ', true);
  const again = await ask('Ещё раз: ', true);
  if (password !== again) throw new Error('Пароли не совпали');
  await migrate({log: () => {}});
  await ensureWorkspace();
  await upsertAdmin({email, password, workspaceId: DEFAULT_WORKSPACE});
  console.log(`Готово: ${email} — владелец платформы и компании ${DEFAULT_WORKSPACE} (база ${resolveSchema()})`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await closeDb();
}
