#!/usr/bin/env node
// Проверить ядро Encar руками: машина(ы) → конверт контракта в out/<номер>/car.json.
//   node --env-file=.env cores/encar/bin/fetch.mjs <ссылка|номер> [ещё…] [--out out/encar]
// Код выхода: 0 — все машины забраны, 1 — хотя бы одна с ошибкой, 2 — неверный запуск.
// Через ту же точку входа, что и KOK (src/index.mjs), — поведение одинаковое.
// Фото не качаем: они на CDN Encar, а проверяем мы ядро, а не CDN.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { core, getCar } from '../src/index.mjs';
import { toCoreError, errorPayload } from '../../kit/errors.mjs';
import { createLogger, levelFor } from '../../kit/log.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const outDir = opt('--out', 'out/encar');
const log = createLogger(core.id);

if (!args.length) {
  console.error('Использование: node --env-file=.env cores/encar/bin/fetch.mjs <ссылка Encar или номер> [--out out/encar]');
  process.exit(2);
}

let failed = 0;
for (const ref of args) {
  const requestId = randomUUID();
  const t0 = Date.now();
  try {
    const { data, warnings } = await getCar(ref, { log: log.child({ requestId }) });
    const dir = join(outDir, data.ref);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'car.json'), JSON.stringify({ ok: true, core: core.id, version: core.version, requestId, tookMs: Date.now() - t0, warnings, data }, null, 2));
    const c = data.card;
    console.log(`✓ ${data.ref} ${c.brand} ${c.model} ${c.year ?? ''} — ₩${data.price?.amount ?? '—'}, ${data.mileageKm ?? '—'} км, фото ${data.photos.length}`
      + `${warnings.length ? `, предупреждений ${warnings.length}` : ''} → ${dir} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
    for (const w of warnings) console.log(`   ⚠ ${w.code} ${w.message}`);
  } catch (e) {
    failed++;
    const err = toCoreError(e);
    log[levelFor(err.code)]('request.failed', { requestId, ref, code: err.code, tookMs: Date.now() - t0, error: err });
    const p = errorPayload(err);
    console.error(`✗ ${ref}: [${p.code}] ${p.message}${p.retryable ? ' (можно повторить позже)' : ''} · requestId ${requestId}`);
  }
}
process.exit(failed ? 1 : 0);
