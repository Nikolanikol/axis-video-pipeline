// Уточнить границы фраз озвучки по звуку у уже готовой начитки — без нового синтеза:
// ElevenLabs не вызывается, кредиты не тратятся. Для озвучек, сделанных до 02.10, где фраза
// на слитных местах обрывалась (см. src/shared/voiceCuts.js).
//
//   node tools/refine-voice.mjs <id обзора>            — показать, что изменится
//   node tools/refine-voice.mjs <id обзора> --apply    — записать в обзор
//
// Новые озвучки и повторное нажатие «Озвучить» делают то же самое сами; скрипт — чтобы
// не нажимать. Правит review.json напрямую: открытую страницу обзора после этого обнови —
// иначе её автосохранение получит «обзор изменился в другом месте».
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../server/store.mjs';
import {refineCuts} from '../server/voiceCuts.mjs';

const [id, flag] = process.argv.slice(2);
if (!id) { console.error('Укажи id обзора: node tools/refine-voice.mjs rv-… [--apply]'); process.exit(1); }

const found = [];
for (const ws of await fs.readdir(path.join(ROOT, 'data/workspaces')).catch(() => [])) {
  const f = path.join(ROOT, 'data/workspaces', ws, 'reviews', id, 'review.json');
  if (await fs.stat(f).then(() => true, () => false)) found.push(f);
}
if (found.length !== 1) { console.error(found.length ? `Обзор «${id}» найден в нескольких компаниях` : `Обзор «${id}» не найден`); process.exit(1); }

const file = found[0];
const review = JSON.parse(await fs.readFile(file, 'utf8'));
const voice = review.voice;
if (!voice?.track?.file || !voice.clips) { console.error('У обзора нет единой начитки — нечего уточнять'); process.exit(1); }
// Адрес дорожки в интерфейсе (/data/workspaces/…) → путь на диске
const track = path.join(ROOT, voice.track.file);
// Границы считаем от разметки (from/to), а не от прежних cut*: так повторный запуск даёт тот же результат
const raw = Object.fromEntries(Object.entries(voice.clips).map(([k, c]) => [k, {from: c.from, to: c.to}]));
const cuts = await refineCuts(track, raw, voice.track.duration);

let moved = 0;
for (const [k, c] of Object.entries(cuts)) {
  const dTo = Math.round((c.cutTo - c.to) * 1000);
  const dFrom = Math.round((c.cutFrom - c.from) * 1000);
  if (Math.abs(dTo) > 20 || Math.abs(dFrom) > 20 || c.joinedNext) moved++;
  console.log(k.padEnd(5), `начало ${dFrom >= 0 ? '+' : ''}${dFrom} мс, конец ${dTo >= 0 ? '+' : ''}${dTo} мс${c.joinedNext ? '  — слитно со следующей, граница встык' : ''}`);
}
console.log(`Строк: ${Object.keys(cuts).length}, заметно сдвинуты или склеены: ${moved}`);
if (flag !== '--apply') { console.log('Это показ. Записать: добавь --apply'); process.exit(0); }
review.voice = {...voice, clips: cuts};
review.updatedAt = new Date().toISOString();
await fs.writeFile(file, JSON.stringify(review, null, 2) + '\n');
console.log('Записано:', path.relative(ROOT, file));
