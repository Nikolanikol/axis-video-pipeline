#!/usr/bin/env node
// Забрать машину(ы) с Carsensor в папку: car.json (конверт контракта) + photos/.
//   node bin/fetch.mjs <ссылка|номер> [ещё…] [--out out] [--lang en,ru] [--no-photos] [--raw]
// Код выхода: 0 — все машины забраны, 1 — хотя бы одна с ошибкой, 2 — неверный запуск.
// Через ту же точку входа, что и KOK (src/index.mjs), — поведение одинаковое.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { core, getCar } from '../src/index.mjs';
import { toCoreError, errorPayload, warning } from '../../kit/errors.mjs';
import { createLogger, levelFor } from '../../kit/log.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };

const outDir = opt('--out', 'out');
const langs = String(opt('--lang', core.languages.default.join(','))).split(',').map(s => s.trim()).filter(Boolean);
const noPhotos = flag('--no-photos');
const raw = flag('--raw');
const log = createLogger(core.id);

if (!args.length) {
  console.error('Использование: node bin/fetch.mjs <ссылка carsensor.net или номер AU…> [--out out] [--lang en,ru] [--no-photos] [--raw]');
  process.exit(2);
}

// Фото по 4 параллельно. Не скачалось — предупреждение, машина всё равно сохраняется.
async function downloadPhotos(photos, dir, warnings) {
  await mkdir(dir, { recursive: true });
  let next = 0, failed = 0;
  const worker = async () => {
    while (next < photos.length) {
      const i = next++;
      const p = photos[i];
      const file = `${String(i + 1).padStart(2, '0')}.jpg`;
      try {
        const res = await fetch(p.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await writeFile(join(dir, file), Buffer.from(await res.arrayBuffer()));
        p.file = `photos/${file}`;
      } catch (e) {
        failed++;
        p.error = e?.message || String(e);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failed) warnings.push(warning('PART_FAILED', 'photos', `photos: не скачалось ${failed} из ${photos.length}`));
}

let failedCars = 0;
for (const ref of args) {
  const requestId = randomUUID();
  const t0 = Date.now();
  try {
    const { data, warnings: w } = await getCar(ref, { langs, raw, log: log.child({ requestId }) });
    const warnings = [...w];
    const dir = join(outDir, data.ref);
    if (!noPhotos && data.photos.length) await downloadPhotos(data.photos, join(dir, 'photos'), warnings);
    await mkdir(dir, { recursive: true });
    const envelope = { ok: true, core: core.id, version: core.version, requestId, tookMs: Date.now() - t0, warnings, data };
    await writeFile(join(dir, 'car.json'), JSON.stringify(envelope, null, 2));
    const L = data.byLang[langs[0]];
    const cert = data.certification;
    const ads = data.photos.filter(p => p.ad).length;
    console.log(`✓ ${data.ref} ${L.car.title} — ¥${data.price.amount ?? '—'}, ${data.mileageKm} км, фото ${data.photos.length} (в рекламу ${ads}), ` +
      `опций ${L.options.length}, оценка: ${cert ? cert.score : 'нет'}` +
      `${warnings.length ? `, предупреждений ${warnings.length}` : ''} → ${dir} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
    for (const x of warnings) console.log(`   ⚠ ${x.code} ${x.message}`);
  } catch (e) {
    failedCars++;
    const err = toCoreError(e);
    log[levelFor(err.code)]('request.failed', { requestId, ref, code: err.code, tookMs: Date.now() - t0, error: err });
    const p = errorPayload(err);
    console.error(`✗ ${ref}: [${p.code}] ${p.message}${p.retryable ? ' (можно повторить позже)' : ''} · requestId ${requestId}`);
  }
}
process.exit(failedCars ? 1 : 0);
