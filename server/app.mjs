// API сервера (без Vite и без запуска) — отдельно, чтобы тестировать
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import {
  CONFIG_DIR, DATA_DIR, DEFAULT_MARKET, HttpError, checkId, createLot, getBrand, getLot, getMarket,
  listLots, listMarkets, readJson, saveBrand, saveLot, saveMarket, withLock,
} from './store.mjs';
import {reviewStoryboard} from '../src/shared/timeline.js';
import {getFormat, listFormats, storyboardFrames} from './formats.mjs';
import {addPhoto, applyBlur, photoInfo, removePhoto} from './photos.mjs';
import {enqueue, getJob, listJobs} from './renderer.mjs';
import {
  UPLOAD_TMP, createReview, defaultMarketFor, getReview, ingestSource, listReviews, rebuildLines, reprocessSource,
  transcribeReview, updateReview, voiceReview,
} from './reviews.mjs';
import {hasKey, hasVoice} from './speech.mjs';

// Медиа с путями /data/... браузер рендера берёт по полному адресу этого сервера
const absolute = (origin, url) => (url && url.startsWith('/') ? `${origin}${url}` : url);
const withAbsolutePhotos = (lot, origin) => lot && {...lot, photos: lot.photos.map((p) => absolute(origin, p))};

const wrap = (fn) => (req, res, next) => fn(req, res).then((data) => res.json(data)).catch(next);

// photoOrigin — адрес этого сервера: браузер рендера берёт по нему фото лотов (/data/...)
export const createApp = ({photoOrigin}) => {
  const app = express();
  app.use(express.json({limit: '2mb'}));
  const api = express.Router();

  api.get('/config', wrap(async () => ({
    brand: await getBrand(), markets: await listMarkets(), defaultMarket: DEFAULT_MARKET, formats: await listFormats(),
    pipelines: await readJson(path.join(CONFIG_DIR, 'pipelines.json')),
    // Что доступно: распознавание речи включается ключом ElevenLabs в .env
    features: {speech: hasKey(), voice: hasVoice()},
  })));
  api.put('/brand', wrap(async (req) => { await saveBrand(req.body); return getBrand(); }));
  api.put('/markets/:id', wrap(async (req) => {
    const {id: _ignored, ...market} = req.body;
    await saveMarket(req.params.id, market);
    return {id: req.params.id, ...(await getMarket(req.params.id))};
  }));

  // Запись лота — строго по очереди (автосохранение формы и операции с фото не должны перетирать друг друга)
  const withLot = (id, fn) => withLock(`lot:${id}`, () => fn(getLot(id)));

  api.get('/lots', wrap(() => listLots()));
  api.post('/lots', wrap((req) => createLot(req.body?.market ? {market: checkId(req.body.market)} : {})));
  api.get('/lots/:id', wrap((req) => getLot(req.params.id)));
  api.put('/lots/:id', wrap((req) => withLot(req.params.id, async (loading) => {
    const current = await loading;
    // Фото и размытие меняются только своими запросами; из формы принимаем лишь новый порядок уже загруженных
    const known = new Set(current.photos);
    const sent = [...new Set(Array.isArray(req.body.photos) ? req.body.photos.filter((p) => known.has(p)) : [])];
    const photos = sent.length === current.photos.length ? sent : current.photos;
    return saveLot(current.id, {...req.body, photos, blur: current.blur});
  })));

  // Фото: оригинал + рабочая копия 1080 по ширине (поворот по EXIF, JPEG)
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 30 * 1024 * 1024, files: 20}});
  api.post('/lots/:id/photos', upload.array('photos'), wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    const added = [];
    for (const file of req.files ?? []) added.push(await addPhoto(lot.id, file.buffer, file.originalname));
    return saveLot(lot.id, {...lot, photos: [...lot.photos, ...added]});
  })));
  api.delete('/lots/:id/photos', wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    return saveLot(lot.id, await removePhoto(lot, String(req.query.path || '')));
  })));
  // Размытие: что показать в редакторе и применить области
  api.get('/lots/:id/photo', wrap(async (req) => photoInfo(await getLot(req.params.id), String(req.query.path || ''))));
  api.put('/lots/:id/photo', wrap((req) => withLot(req.params.id, async (loading) => {
    const lot = await loading;
    return saveLot(lot.id, await applyBlur(lot, String(req.body.path || ''), req.body.regions));
  })));

  // Рендер: сохранённый лот + текущие настройки рынка и бренда, формат — из запроса или лота
  api.post('/lots/:id/render', wrap(async (req) => {
    const lot = await getLot(req.params.id);
    const format = await getFormat(req.body?.format || lot.format);
    if (format.requires.includes('photos') && !lot.photos.length) throw new HttpError(400, 'Добавь хотя бы одно фото');
    const [market, theme] = await Promise.all([getMarket(lot.market || DEFAULT_MARKET), getBrand()]);
    const title = [lot.brand, lot.model, lot.year].filter(Boolean).join(' ') || lot.id;
    const inputProps = {lot: withAbsolutePhotos(lot, photoOrigin), market, theme};
    return enqueue({
      owner: {lotId: lot.id}, composition: format.id, compositionTitle: format.title, title,
      frames: storyboardFrames(format), inputProps,
      silentProps: req.body?.silent ? {...inputProps, lot: {...inputProps.lot, music: {track: null}}} : undefined,
    });
  }));

  // Обзоры
  api.get('/reviews', wrap(() => listReviews()));
  api.post('/reviews', wrap((req) => createReview({lotId: req.body?.lotId ? checkId(req.body.lotId) : null, title: req.body?.title})));
  api.get('/reviews/:id', wrap((req) => getReview(checkId(req.params.id))));
  api.put('/reviews/:id', wrap((req) => updateReview(checkId(req.params.id), req.body ?? {})));
  const videoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => fs.mkdir(UPLOAD_TMP, {recursive: true}).then(() => cb(null, UPLOAD_TMP), cb),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.upload`),
    }),
    limits: {fileSize: 4 * 1024 ** 3, files: 1},
  });
  const validId = (req, res, next) => { try { checkId(req.params.id); next(); } catch (e) { next(e); } };
  api.post('/reviews/:id/source', validId, videoUpload.single('video'), wrap(async (req) => {
    if (!req.file) throw new HttpError(400, 'Нет файла видео');
    return ingestSource(req.params.id, req.file.path, req.file.originalname);
  }));
  api.post('/reviews/:id/reprocess', wrap((req) => reprocessSource(checkId(req.params.id))));
  api.post('/reviews/:id/transcribe', wrap((req) => transcribeReview(checkId(req.params.id))));
  api.post('/reviews/:id/relines', wrap((req) => rebuildLines(checkId(req.params.id))));
  api.post('/reviews/:id/voice', wrap(async (req) => {
    const review = await getReview(checkId(req.params.id));
    const lot = review.lotId ? await getLot(review.lotId).catch(() => null) : null;
    const market = await getMarket(defaultMarketFor(review, lot));
    return voiceReview(review.id, {language: typeof req.body?.language === 'string' ? req.body.language : undefined, market});
  }));
  api.post('/reviews/:id/render', wrap(async (req) => {
    const review = await getReview(checkId(req.params.id));
    if (review.source?.status !== 'ready') throw new HttpError(400, 'Видео ещё не готово');
    if (!review.segments.length) throw new HttpError(400, 'Добавь хотя бы один фрагмент');
    const lot = review.lotId ? await getLot(review.lotId).catch(() => null) : null;
    const [market, theme] = await Promise.all([getMarket(defaultMarketFor(review, lot)), getBrand()]);
    const inputProps = {
      review: {
        ...review,
        source: {...review.source, proxy: absolute(photoOrigin, review.source.proxy)},
        voice: review.voice && {
          ...review.voice,
          clips: Object.fromEntries(Object.entries(review.voice.clips ?? {})
            .map(([id, c]) => [id, {...c, file: absolute(photoOrigin, c.file)}])),
        },
      },
      lot: withAbsolutePhotos(lot, photoOrigin), market, theme,
    };
    return enqueue({
      owner: {reviewId: review.id}, composition: 'review-short', compositionTitle: 'Обзор', title: review.title || review.id,
      frames: reviewStoryboard(review.segments), inputProps,
      silentProps: req.body?.silent ? {...inputProps, review: {...inputProps.review, music: {track: null}}} : undefined,
    });
  }));

  api.get('/renders', wrap((req) => listJobs({
    lotId: req.query.lot ? checkId(req.query.lot) : undefined,
    reviewId: req.query.review ? checkId(req.query.review) : undefined,
  })));
  api.get('/renders/:id', wrap((req) => getJob(checkId(req.params.id))));
  api.get('/renders/:id/download', async (req, res, next) => {
    try {
      const job = await getJob(checkId(req.params.id));
      const silent = req.query.variant === 'silent';
      const suffix = silent ? '-silent' : '';
      const name = `${job.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-${job.format ?? 'price-ad'}-${job.id.slice(-14)}${silent ? '-bez-zvuka' : ''}.mp4`;
      res.download(path.join(DATA_DIR, 'renders', `${job.id}${suffix}.mp4`), name);
    } catch (e) { next(e); }
  });

  app.use('/api', api);
  app.use('/data', express.static(DATA_DIR, {fallthrough: false}));
  app.use('/api', (err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({error: err.message || 'Ошибка сервера'});
  });
  return app;
};
