// Как позвать ffmpeg/ffprobe из сборки Remotion.
// node_modules/.bin/remotion — sh-скрипт: на Windows spawn его не запускает (ENOENT),
// поэтому там зовём настоящий вход CLI через node. На macOS и Linux — прежний шим.
// Модуль намеренно без зависимостей от store.mjs: его импортируют и тесты,
// до того как выставят CONFIG_DIR / DATA_DIR.
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const SHIM = path.join(ROOT, 'node_modules', '.bin', 'remotion');

// name — 'ffmpeg' или 'ffprobe'. Возвращает команду и аргументы перед своими.
export const remotionTool = (name) => process.platform === 'win32'
  ? {cmd: process.execPath, pre: [CLI, name]}
  : {cmd: SHIM, pre: [name]};
