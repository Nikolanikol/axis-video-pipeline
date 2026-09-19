// Реестр форматов роликов: config/formats.json (тот же файл читают ролик и интерфейс)
import path from 'node:path';
import {CONFIG_DIR, HttpError, readJson} from './store.mjs';

export const listFormats = () => readJson(path.join(CONFIG_DIR, 'formats.json'));

export const getFormat = async (id) => {
  const formats = await listFormats();
  if (!id) return formats[0];
  const format = formats.find((f) => f.id === id);
  if (!format) throw new HttpError(400, `Неизвестный формат «${id}»`);
  return format;
};

// Кадры раскадровки — по одному на сцену
export const storyboardFrames = (format) => format.scenes.map((s) => s.preview);
