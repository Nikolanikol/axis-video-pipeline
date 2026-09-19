// node render.mjs [lot.json] [out.mp4] [формат]   — формат по умолчанию из лота или первый в config/formats.json
// Лоты из веб-интерфейса (фото в /data/...) рендерятся через интерфейс: npm run app
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import {getFormat} from './server/formats.mjs';
import {loadInput} from './server/store.mjs';

const lotPath = process.argv[2] ?? 'lot.json';
const out = process.argv[3] ?? 'out/ad.mp4';
const inputProps = await loadInput(lotPath);
const format = await getFormat(process.argv[4] || inputProps.lot.format);
const browserExecutable = process.env.CHROME_PATH || null;

const {lot} = inputProps;
if (format.requires.includes('price') && !lot.carPriceUsd && !(lot.carPriceKrw && lot.krwPerUsd)) {
  console.warn('⚠ Цена не задана (carPriceUsd или carPriceKrw + krwPerUsd) — в ролике будет заглушка «XX XXX $»');
}

const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, id: format.id, inputProps, browserExecutable});
await renderMedia({
  composition, serveUrl, codec: 'h264', outputLocation: out,
  inputProps, browserExecutable, crf: Number(process.env.RENDER_CRF || 20), colorSpace: 'bt709', enforceAudioTrack: true,
  onProgress: ({progress}) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
});
console.log(`\nГотово (${format.title}): ${out}`);
