// Веб-интерфейс AXIS Video: npm run app → http://localhost:3210
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createApp} from './app.mjs';
import {ROOT} from './store.mjs';
import {hasDatabase, migrate} from './db/index.mjs';
import {refundOrphans, sweepCharges} from './billing.mjs';
import {purgeDeleted} from './accounts.mjs';
import {reconcilePayments} from './payments.mjs';
import {startSupport} from './support.mjs';
import {DEFAULT_WORKSPACE, ensureWorkspace, legacyDataDirs} from './store.mjs';
import {serverLog} from './log.mjs';
import {installAlarms} from './alarm.mjs';

const log = serverLog('server');
// Строки журнала уровня error — ещё и тревогой в Telegram (тема «Сбои», TELEGRAM_ALERTS_TOPIC)
installAlarms();

const PORT = Number(process.env.PORT || 3210);
// По умолчанию только локально: без базы входа нет вовсе, а с базой на Mac защищённые файлы
// отдаются своему браузеру без сессии (см. guardData в session.mjs). Наружу — только в
// контейнере (HOST=0.0.0.0 в Dockerfile), где снаружи всё идёт через прокси
const HOST = process.env.HOST || '127.0.0.1';

// Последняя сетка безопасности. Без неё невыловленная ошибка в фоновой задаче роняет сервер
// молча: страница просто перестаёт открываться, и причину потом не найти. Здесь мы её пишем
// в журнал (error — значит, и тревогой в «Сбои») и остаёмся жить — отказала одна задача, а не
// весь инструмент; её статус уже записан в обзор. Сюда попадает только то, что забыли поймать
// на месте: каждая такая тревога — повод поставить обработку там, где ошибка родилась.
process.on('unhandledRejection', (reason) => log.error('unhandled.rejection', {note: 'необработанный отказ', error: reason}));
process.on('uncaughtException', (e) => log.error('unhandled.exception', {note: 'необработанная ошибка', error: e}));

// База SMMAKER: миграции до того, как сервер начнёт отвечать. Без DATABASE_URL база
// пока не нужна — инструмент работает на файлах, как раньше. С ним падаем сразу и понятно:
// кабинеты и кредиты без базы работать не могут, и лучше не стартовать, чем стартовать наполовину.
if (hasDatabase()) {
  await migrate().then(() => ensureWorkspace()).then(() => refundOrphans()).catch((e) => {
    log.error('db.unavailable', {note: 'база SMMAKER недоступна — сервер не стартует', error: e});
    process.exit(1);
  });
  // Сторож кредитов: исходы, которые база не приняла при обрыве, и списания-сироты (billing.mjs).
  // Две минуты — клиент видит возврат почти сразу, а база не чувствует лишнего запроса
  const sweep = () => sweepCharges().catch((e) => log.error('task.failed', {task: 'sweepCharges', note: 'сторож кредитов', error: e}));
  setInterval(sweep, 2 * 60 * 1000).unref();
  // Окончательное удаление аккаунтов, чей срок (14 дней) вышел: при старте и раз в час.
  // Точность до часа достаточна — в письме обещана дата, а не минута
  const purge = () => purgeDeleted().catch((e) => log.error('task.failed', {task: 'purgeDeleted', note: 'удаление аккаунтов', error: e}));
  purge();
  setInterval(purge, 60 * 60 * 1000).unref();
  // Сверка оплат: уведомление кассы могло потеряться (перезапуск, сеть) — переспрашиваем кассу
  // о зависших заказах сами (server/payments.mjs). Раз в 5 минут и сразу после старта: перезапуск —
  // как раз тот случай, когда уведомления терялись
  const reconcile = () => reconcilePayments().catch((e) => log.error('task.failed', {task: 'reconcilePayments', note: 'сверка оплат', error: e}));
  reconcile();
  setInterval(reconcile, 5 * 60 * 1000).unref();
  // Поддержка в Telegram (server/support.mjs): вебхук на проде, опрос на Mac — по TELEGRAM_SUPPORT.
  // Не ждём: Telegram недоступен — сервер всё равно должен отвечать клиентам
  void startSupport().catch((e) => log.error('task.failed', {task: 'startSupport', note: 'поддержка Telegram не запустилась', error: e}));
}

// Файлы старой раскладки сервер не видит — история и лоты выглядели бы пропавшими.
// Переносим не сами: 11 ГБ и пути внутри JSON — это решение владельца, а не побочный эффект запуска
const legacy = await legacyDataDirs();
if (legacy.length) {
  console.warn(`Внимание: в data/ лежат файлы без компании (${legacy.join(', ')}). Они не видны, пока не перенесены:\n`
    + `  node tools/migrate-workspace.mjs           — показать, что куда поедет\n`
    + `  node tools/migrate-workspace.mjs --apply   — перенести в data/workspaces/${DEFAULT_WORKSPACE}/`);
}

const app = createApp({photoOrigin: `http://${HOST}:${PORT}`});
const server = http.createServer(app);

// Интерфейс. В бою (NODE_ENV=production) — готовая статика из dist/app; так работает
// в контейнере. Иначе поднимаем Vite прямо здесь, с горячей перезагрузкой — так удобно
// на Mac. Признак именно явный, а не «есть ли dist»: иначе одна сборка на Mac молча
// отключила бы горячую перезагрузку, и правки в интерфейсе перестали бы появляться.
const DIST = path.join(ROOT, 'dist', 'app');
const production = process.env.NODE_ENV === 'production';

if (production) {
  // Падаем сразу и понятно: тихо свалиться на Vite в контейнере хуже, чем не запуститься
  await fs.access(path.join(DIST, 'index.html')).catch(() => {
    console.error('Нет собранного интерфейса. Запусти npm run build перед стартом в бою.');
    process.exit(1);
  });
  const {default: express} = await import('express');
  app.use(express.static(DIST));
  // Разделы открываются по прямой ссылке: у одностраничного приложения все пути ведут в index.html
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api/')
    ? res.sendFile(path.join(DIST, 'index.html'))
    : next()));
} else {
  const {createServer: createVite} = await import('vite');
  const {default: react} = await import('@vitejs/plugin-react');
  const vite = await createVite({
    configFile: false,
    root: path.join(ROOT, 'app'),
    publicDir: path.join(ROOT, 'public'),
    plugins: [react()],
    appType: 'spa',
    server: {middlewareMode: true, hmr: {server}, fs: {allow: [ROOT]}},
    logLevel: 'warn',
  });
  app.use(vite.middlewares);
}

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`AXIS Video: ${url}`);
  if (process.platform === 'darwin' && process.env.OPEN_BROWSER !== '0') spawn('open', [url], {stdio: 'ignore'});
});
