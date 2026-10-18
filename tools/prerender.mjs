// Витрина для поисковиков: после vite build рисует app/Landing.tsx в HTML и кладёт рядом со сборкой
// (dist/app/landing.html). Сервер в бою вставляет её гостю на главной (server/seo.mjs) — робот видит
// тексты витрины без скрипта. Запускается из npm run build; в разработке витрину рисует сам сервер.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {ROOT} from '../server/store.mjs';
import {renderLanding} from '../server/seo.mjs';

// Vite здесь только загрузчик модулей (TSX, JSON из config): без сервера и без слежения за файлами
const vite = await createServer({
  configFile: false, root: path.join(ROOT, 'app'), appType: 'custom', logLevel: 'warn',
  server: {middlewareMode: true, hmr: false, watch: null},
});
try {
  const html = await renderLanding((id) => vite.ssrLoadModule(id));
  // Пустая или подозрительно короткая разметка — сломанная сборка, а не витрина: лучше упасть здесь
  if (html.length < 5000 || !html.includes('<h1')) throw new Error(`Витрина отрисовалась пустой (${html.length} знаков)`);
  await fs.writeFile(path.join(ROOT, 'dist', 'app', 'landing.html'), html);
  console.log(`Витрина для поисковиков: dist/app/landing.html, ${html.length} знаков`);
} finally {
  await vite.close();
}
