// Очередь рендера: один ролик за раз, прогресс в памяти, история — JSON рядом с mp4.
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {HttpError, RENDERS_DIR, ROOT, readJson, writeJson} from './store.mjs';
const browserExecutable = process.env.CHROME_PATH || null;
const concurrency = process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null;
const crf = Number(process.env.RENDER_CRF || 20);

// Сборка проекта Remotion. Пересобираем, если изменился код ролика или ассеты бренда.
let bundled = null; // {signature, serveUrl}
const newestMtime = async (dir) => {
  let max = 0;
  for (const e of await fs.readdir(dir, {withFileTypes: true, recursive: true})) {
    if (e.isFile()) max = Math.max(max, (await fs.stat(path.join(e.parentPath, e.name))).mtimeMs);
  }
  return max;
};
const getServeUrl = async () => {
  await fs.mkdir(path.join(ROOT, 'public', 'music'), {recursive: true});
  const signature = Math.max(
    await newestMtime(path.join(ROOT, 'src')),
    await newestMtime(path.join(ROOT, 'public', 'brand')),
    await newestMtime(path.join(ROOT, 'public', 'music')),
    (await fs.stat(path.join(ROOT, 'config', 'brand.json'))).mtimeMs,
    (await fs.stat(path.join(ROOT, 'config', 'music.json'))).mtimeMs,
    (await fs.stat(path.join(ROOT, 'config', 'formats.json'))).mtimeMs,
  );
  if (bundled?.signature !== signature) {
    const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src', 'index.ts'), rootDir: ROOT, publicDir: path.join(ROOT, 'public')});
    bundled = {signature, serveUrl};
  }
  return bundled.serveUrl;
};

const jobs = new Map();
const queue = [];
// Задание ещё не отработало: ждёт очереди или считается прямо сейчас
const ACTIVE = new Set(['queued', 'running']);
let running = false;

const publicJob = ({input, silentInput, ...job}) => job;
const metaFile = (id) => path.join(RENDERS_DIR, `${id}.json`);

// Задание рендера:
// owner — {lotId} или {reviewId}; composition — id композиции Remotion (формат или review-short);
// inputProps — готовые props (адреса медиа уже полные); silentProps — props версии без музыки (если нужна);
// frames — кадры раскадровки.
export const enqueue = ({owner, composition, compositionTitle, title, frames, inputProps, silentProps}) => {
  const now = new Date();
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const ownerId = owner.lotId ?? owner.reviewId;
  // Одно задание на обзор (или лот) за раз. Рендер минутного обзора занимает четверть часа и
  // все ядра: десять нажатий подряд — это два с половиной часа очереди из одинаковых роликов.
  // Проверяем на сервере, а не только в кнопке: вкладку можно открыть дважды.
  const busy = [...jobs.values()].find((j) => (j.lotId ?? j.reviewId) === ownerId && ACTIVE.has(j.status));
  if (busy) {
    throw new HttpError(409, busy.status === 'running'
      ? `Рендер уже идёт (${busy.progress}%) — дождись или обнови страницу`
      : 'Этот ролик уже в очереди на рендер');
  }
  const id = `${ownerId}-${composition}-${stamp}`;
  const job = {
    id, ...owner, title, format: composition, formatTitle: compositionTitle, frames,
    status: 'queued', stage: 'В очереди', progress: 0, createdAt: now.toISOString(),
    video: `/data/renders/${id}.mp4`, storyboard: `/data/renders/${id}.jpg`,
    videoSilent: silentProps ? `/data/renders/${id}-silent.mp4` : undefined,
    input: inputProps, silentInput: silentProps,
  };
  jobs.set(id, job);
  queue.push(job);
  pump();
  return publicJob(job);
};

const pump = async () => {
  if (running || queue.length === 0) return;
  running = true;
  const job = queue.shift();
  try {
    await run(job);
    job.status = 'done';
    job.stage = 'Готово';
  } catch (e) {
    job.status = 'error';
    job.stage = 'Ошибка';
    job.error = String(e?.message || e);
    console.error(`Рендер ${job.id}:`, e);
  } finally {
    job.finishedAt = new Date().toISOString();
    await writeJson(metaFile(job.id), publicJob(job)).catch((e) => console.error(e));
    running = false;
    pump();
  }
};

const run = async (job) => {
  await fs.mkdir(RENDERS_DIR, {recursive: true});
  job.status = 'running';
  job.stage = 'Сборка проекта';
  const serveUrl = await getServeUrl();
  const browser = await openBrowser('chrome', {browserExecutable});
  try {
    const inputProps = job.input;
    const composition = await selectComposition({serveUrl, id: job.format, inputProps, puppeteerInstance: browser});
    // enforceAudioTrack: без аудиодорожки мессенджеры и соцсети принимают mp4 за GIF — всегда пишем хотя бы тишину
    const media = {composition, serveUrl, codec: 'h264', crf, colorSpace: 'bt709', concurrency, puppeteerInstance: browser, enforceAudioTrack: true};
    const share = job.videoSilent ? 45 : 90;
    job.stage = 'Рендер видео';
    await renderMedia({
      ...media, inputProps, outputLocation: path.join(RENDERS_DIR, `${job.id}.mp4`),
      onProgress: ({progress}) => { job.progress = Math.round(progress * share); },
    });
    if (job.videoSilent) {
      job.stage = 'Версия без звука';
      // Без музыки, но с беззвучной дорожкой — звук добавляется уже в соцсети.
      // renderMedia рендерит props выбранной композиции, поэтому выбираем её заново с другими props.
      const silentProps = job.silentInput;
      const silentComposition = await selectComposition({serveUrl, id: job.format, inputProps: silentProps, puppeteerInstance: browser});
      await renderMedia({
        ...media, composition: silentComposition, inputProps: silentProps,
        outputLocation: path.join(RENDERS_DIR, `${job.id}-silent.mp4`),
        onProgress: ({progress}) => { job.progress = share + Math.round(progress * share); },
      });
    }

    job.stage = 'Раскадровка';
    const tiles = [];
    for (const frame of job.frames) {
      const {buffer} = await renderStill({composition, serveUrl, frame, inputProps, puppeteerInstance: browser, imageFormat: 'jpeg'});
      tiles.push(await sharp(buffer).resize(360, 640).toBuffer());
      job.progress += 2;
    }
    const gap = 10;
    await sharp({create: {width: tiles.length * (360 + gap) - gap, height: 640, channels: 3, background: '#333333'}})
      .composite(tiles.map((input, i) => ({input, left: i * (360 + gap), top: 0})))
      .jpeg({quality: 88})
      .toFile(path.join(RENDERS_DIR, `${job.id}.jpg`));
    job.progress = 100;
  } finally {
    await browser.close({silent: true});
  }
};

export const getJob = async (id) => {
  const job = jobs.get(id);
  return job ? publicJob(job) : readJson(metaFile(id));
};

// История: завершённые с диска + текущие из памяти, новые сверху. filter — {lotId} или {reviewId}.
export const listJobs = async (filter = {}) => {
  await fs.mkdir(RENDERS_DIR, {recursive: true});
  const files = (await fs.readdir(RENDERS_DIR)).filter((f) => f.endsWith('.json'));
  const byId = new Map();
  for (const f of files) {
    const job = await readJson(path.join(RENDERS_DIR, f)).catch(() => null);
    if (job) byId.set(job.id, job);
  }
  for (const job of jobs.values()) byId.set(job.id, publicJob(job));
  return [...byId.values()]
    .filter((j) => (!filter.lotId || j.lotId === filter.lotId) && (!filter.reviewId || j.reviewId === filter.reviewId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
