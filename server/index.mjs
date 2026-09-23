// Веб-интерфейс AXIS Video: npm run app → http://localhost:3210
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createApp} from './app.mjs';
import {ROOT} from './store.mjs';

const PORT = Number(process.env.PORT || 3210);
// Без авторизации — поэтому только локально
const HOST = process.env.HOST || '127.0.0.1';

// Последняя сетка безопасности. Без неё невыловленная ошибка в фоновой задаче роняет сервер
// молча: страница просто перестаёт открываться, и причину потом не найти. Здесь мы её печатаем
// и остаёмся жить — отказала одна задача, а не весь инструмент; её статус уже записан в обзор.
const stamp = () => new Date().toLocaleTimeString('ru-RU');
process.on('unhandledRejection', (reason) => {
  console.error(`[${stamp()}] Необработанный отказ:`, reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (e) => {
  console.error(`[${stamp()}] Необработанная ошибка:`, e?.stack || e);
});

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
