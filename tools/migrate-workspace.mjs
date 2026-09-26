// Перенос файлов старой раскладки в папку компании SMMAKER.
//
//   node tools/migrate-workspace.mjs           — только показать, что куда поедет
//   node tools/migrate-workspace.mjs --apply   — перенести
//
// Было: data/{lots,reviews,renders,carousels,brand}/…   (файлы без хозяина)
// Стало: data/workspaces/<компания>/{lots,…}/…
//
// Папки переезжают переименованием, а не копированием: 11 ГБ на Mac копировались бы
// минуты и заняли бы вдвое больше места. Внутри JSON (лоты, обзоры, задания рендера,
// карусели) пути вида /data/lots/… переписываются на новый адрес — иначе фото, прокси
// и готовые ролики перестали бы открываться.
//
// Ничего не сливает: если в папке компании уже лежит такая же папка — отказ, разбираться
// руками. Резервную копию data/ сделать ДО запуска (на Mac мгновенно: cp -cR data data.bak).
import fs from 'node:fs/promises';
import path from 'node:path';
import {DATA_DIR, DEFAULT_WORKSPACE, WORKSPACE_KINDS, toWorkspaceUrl, workspaceDir, workspaceUrl} from '../server/store.mjs';

// Старая раскладка — это данные компании по умолчанию (владельца): до кабинетов она была одна
const WORKSPACE_ID = DEFAULT_WORKSPACE;
const WORKSPACE_DIR = workspaceDir(WORKSPACE_ID);

const apply = process.argv.includes('--apply');

const jsonFiles = async (dir) => {
  const out = [];
  for (const e of await fs.readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsonFiles(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
};

const plan = [];
for (const kind of WORKSPACE_KINDS) {
  const from = path.join(DATA_DIR, kind);
  const entries = await fs.readdir(from).catch(() => null);
  if (!entries || !entries.some((e) => !e.startsWith('.'))) continue;
  const to = path.join(WORKSPACE_DIR, kind);
  const busy = await fs.readdir(to).then((x) => x.some((e) => !e.startsWith('.'))).catch(() => false);
  if (busy) {
    console.error(`Отказ: ${path.relative(DATA_DIR, to)} уже не пустая — сливать не берусь, разберись руками`);
    process.exit(1);
  }
  plan.push({kind, from, to, count: entries.filter((e) => !e.startsWith('.')).length});
}

if (!plan.length) {
  console.log('Переносить нечего: в data/ нет файлов старой раскладки');
  process.exit(0);
}

console.log(`Компания: ${WORKSPACE_ID}`);
for (const p of plan) console.log(`  data/${p.kind}/  →  ${path.relative(DATA_DIR, p.to)}/   (${p.count} шт.)`);

// Пути внутри JSON считаем до переноса: сколько файлов и строк поменяется
let files = 0;
let urls = 0;
for (const p of plan) {
  for (const f of await jsonFiles(p.from)) {
    const text = await fs.readFile(f, 'utf8');
    const n = (text.match(/\/data\/(lots|reviews|renders|carousels|brand)\//g) || []).length;
    if (n) { files++; urls += n; }
  }
}
console.log(`  пути внутри JSON: ${urls} в ${files} файлах`);

if (!apply) {
  console.log('\nЭто просмотр. Перенести: node tools/migrate-workspace.mjs --apply');
  process.exit(0);
}

await fs.mkdir(WORKSPACE_DIR, {recursive: true});
for (const p of plan) {
  // Сначала переписываем пути на месте, потом переносим папку: сбой посередине оставит
  // файлы в старом месте, а сервер их не видит и не портит — запуск можно повторить
  for (const f of await jsonFiles(p.from)) {
    const text = await fs.readFile(f, 'utf8');
    if (!/\/data\/(lots|reviews|renders|carousels|brand)\//.test(text)) continue;
    const next = toWorkspaceUrl(JSON.parse(text), workspaceUrl(WORKSPACE_ID));
    await fs.writeFile(`${f}.tmp`, JSON.stringify(next, null, 2) + '\n');
    await fs.rename(`${f}.tmp`, f);
  }
  await fs.rm(p.to, {recursive: true, force: true});   // пустая (проверено выше)
  await fs.rename(p.from, p.to);
  console.log(`Перенесено: data/${p.kind}/`);
}
console.log('Готово. Перезапусти сервер: ./tools/restart.sh');
