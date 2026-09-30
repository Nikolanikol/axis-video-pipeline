// Пересобрать рабочие копии фото лотов из оригиналов — после смены правил копии.
// node tools/rebuild-photos.mjs            — только показать, что пересоберётся
// node tools/rebuild-photos.mjs --apply    — пересобрать
//
// Зачем: 30.09 рабочая копия горизонтального фото стала 1500 px по высоте (было 1080 по
// ширине — в крупной полосе ролика фото мылилось). Новые фото копируются по-новому сами,
// а у лотов, собранных раньше, копии старые. Оригиналы (photos/src) лежат рядом — из них и
// пересобираем, с теми же областями размытия. Имена файлов не меняются, лот не трогаем.
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildPhoto, stemOf} from '../server/photos.mjs';
import {DATA_DIR} from '../server/store.mjs';

const apply = process.argv.includes('--apply');
const root = path.join(DATA_DIR, 'workspaces');
let done = 0, skipped = 0;

for (const ws of await fs.readdir(root).catch(() => [])) {
  const lotsDir = path.join(root, ws, 'lots');
  for (const id of await fs.readdir(lotsDir).catch(() => [])) {
    const lot = JSON.parse(await fs.readFile(path.join(lotsDir, id, 'lot.json'), 'utf8').catch(() => 'null'));
    if (!lot?.photos) continue;
    for (const url of lot.photos) {
      // Только свои фото лота (…/lots/<id>/photos/<имя>.jpg); встроенные и внешние ссылки — мимо
      const name = url.split('/').pop();
      if (!url.includes(`/lots/${id}/photos/`) || !/^[\w-]+(~\d+)?\.jpg$/.test(name)) { skipped++; continue; }
      const stem = stemOf(name);
      const src = path.join(lotsDir, id, 'photos', 'src', `${stem}.jpg`);
      if (!(await fs.access(src).then(() => true, () => false))) { skipped++; continue; }
      console.log(`${apply ? 'пересобираю' : 'пересоберётся'}: ${ws}/${id}/${name}`);
      if (apply) await buildPhoto(src, lot.blur?.[stem] ?? [], path.join(lotsDir, id, 'photos', name));
      done++;
    }
  }
}
console.log(`${apply ? 'Пересобрано' : 'К пересборке'}: ${done}, пропущено (нет оригинала или чужое фото): ${skipped}`);
if (!apply && done) console.log('Запустить: node tools/rebuild-photos.mjs --apply');
