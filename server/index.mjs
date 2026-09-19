// Веб-интерфейс AXIS Video: npm run app → http://localhost:3210
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer as createVite} from 'vite';
import react from '@vitejs/plugin-react';
import {createApp} from './app.mjs';
import {ROOT} from './store.mjs';

const PORT = Number(process.env.PORT || 3210);
// Без авторизации — поэтому только локально
const HOST = process.env.HOST || '127.0.0.1';

const app = createApp({photoOrigin: `http://${HOST}:${PORT}`});
const server = http.createServer(app);

// Интерфейс (React) через Vite; public/ — ассеты бренда и музыка для превью
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

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`AXIS Video: ${url}`);
  if (process.platform === 'darwin' && process.env.OPEN_BROWSER !== '0') spawn('open', [url], {stdio: 'ignore'});
});
