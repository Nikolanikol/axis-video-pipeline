// Раскадровка для проверки: по кадру из каждой сцены формата.
// node stills.mjs [lot.json] [папка] [формат]  →  frame-075.png, …
// Свои кадры: FRAMES=130,300 node stills.mjs
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {getFormat, storyboardFrames} from './server/formats.mjs';
import {loadInput} from './server/store.mjs';

const lotPath = process.argv[2] ?? 'lot.json';
const dir = process.argv[3] ?? 'out/frames';
const inputProps = await loadInput(lotPath);
const format = await getFormat(process.argv[4] || inputProps.lot.format);
const browserExecutable = process.env.CHROME_PATH || null;
const FRAMES = process.env.FRAMES ? process.env.FRAMES.split(',').map(Number) : storyboardFrames(format);

fs.mkdirSync(dir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, id: format.id, inputProps, browserExecutable});
for (const frame of FRAMES) {
  const output = path.join(dir, `frame-${String(frame).padStart(3, '0')}.png`);
  await renderStill({composition, serveUrl, frame, output, inputProps, browserExecutable});
  console.log(output);
}
