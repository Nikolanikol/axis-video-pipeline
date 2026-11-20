// Проверка настоящей композиции до списания. Фото при этом не загружаются:
// textFitOnly сохраняет геометрию и выключает только изображения у защищённых шаблонов.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {renderStill} from '@remotion/renderer';
import {HttpError} from './store.mjs';

let active = 0;
const waiting = [];
const acquire = () => active < 2 ? (active++, Promise.resolve()) : new Promise((resolve) => waiting.push(resolve));
const release = () => waiting.length ? waiting.shift()() : active--;

export const preflightTextFrames = async ({serveUrl, composition, inputProps, browser, frames}) => {
  await acquire();
  let dir;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kok-text-fit-'));
    const auditInput = {...inputProps, textFitOnly: true};
    // calculateMetadata карусели возвращает resolved props. renderStill берёт их
    // из composition.props: одного inputProps недостаточно, и фото продолжали грузиться.
    const auditComposition = {...composition, props: {...composition.props, ...auditInput}};
    for (const frame of [...new Set(frames)]) await renderStill({
      serveUrl, composition: auditComposition, inputProps: auditInput, frame,
      puppeteerInstance: browser, imageFormat: 'png', scale: .2,
      output: path.join(dir, `frame-${frame}.png`), timeoutInMilliseconds: 15000,
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    const fit = /TEXT_FIT(_FONT)?: ([^\n]+)/.exec(message);
    if (fit) throw new HttpError(fit[1] ? 503 : 422, fit[2]);
    throw error;
  } finally {
    if (dir) await fs.rm(dir, {recursive: true, force: true}).catch(() => {});
    release();
  }
};
