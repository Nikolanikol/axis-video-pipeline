// Сборка интерфейса для боевого запуска.
//
// В разработке Vite поднимается прямо внутри сервера (server/index.mjs, middlewareMode) —
// с горячей перезагрузкой и без отдельной команды. Для сервера это не годится: сервер
// разработки держит в памяти исходники и следит за файлами, а отдавать надо готовую статику.
//
// Настройки обязаны совпадать с теми, что заданы в server/index.mjs: тот же корень,
// та же папка ассетов. Разойдутся — интерфейс в контейнере соберётся иначе, чем работает
// на Mac, и разницу заметишь уже на сервере.
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  root: 'app',
  publicDir: '../public',
  plugins: [react()],
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
  },
});
