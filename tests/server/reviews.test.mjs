// API обзоров: проекты, загрузка и обработка видео (прокси, миниатюры, поворот), проверки перед рендером
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {makeTestVideo, sineWav, useTempEnv, waitFor} from '../helpers.mjs';
import {REVIEW_FPS} from '../../src/shared/timeline.js';

const env = await useTempEnv();

// Подставной ElevenLabs: тесты не ходят в сеть и ничего не стоят
const eleven = await (async () => {
  const {createServer} = await import('node:http');
  const state = {requests: 0, tts: 0, lastKey: null, lastBody: '', status: 200};
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    state.requests++;
    state.lastKey = req.headers['xi-api-key'];
    state.lastBody = Buffer.concat(chunks).toString('latin1');
    // Озвучка одной начиткой: тон плюс разметка по символам (по 0,05 с на символ)
    if (req.url.startsWith('/v1/text-to-speech/') && state.status === 200) {
      state.tts++;
      const text = JSON.parse(state.lastBody || '{}').text ?? '';
      const chars = [...text];
      const step = 0.05;
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        audio_base64: sineWav(Math.max(0.5, chars.length * step)).toString('base64'),
        alignment: {
          characters: chars,
          character_start_times_seconds: chars.map((_, i) => +(i * step).toFixed(3)),
          character_end_times_seconds: chars.map((_, i) => +((i + 1) * step).toFixed(3)),
        },
      }));
      return;
    }
    res.writeHead(state.status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(state.status === 200 ? {
      language_code: 'rus',
      text: 'Привет! Смотрим Audi A6.',
      words: [
        {text: 'Привет!', start: 0.1, end: 0.6, type: 'word'},
        {text: '[tone]', start: 0.6, end: 0.7, type: 'audio_event'},
        {text: 'Смотрим', start: 1.4, end: 1.9, type: 'word'},
        {text: 'Audi', start: 1.9, end: 2.3, type: 'word'},
        {text: 'A6.', start: 2.3, end: 2.8, type: 'word'},
      ],
    } : {detail: {message: 'нет доступа'}}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r))};
})();
process.env.ELEVENLABS_BASE_URL = eleven.url;
process.env.ELEVENLABS_API_KEY = 'test-key';

const {createApp} = await import('../../server/app.mjs');
const {probe} = await import('../../server/media.mjs');

let server;
let base;
beforeAll(async () => {
  server = http.createServer(createApp({photoOrigin: 'http://127.0.0.1:0'}));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}, 30_000);
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await eleven.close();
  await env.cleanup();
});

const call = async (method, url, body) => {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    headers: body && !isForm ? {'Content-Type': 'application/json'} : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  return {status: res.status, body: await res.json().catch(() => null)};
};

const uploadVideo = async (id, file, name) => {
  const form = new FormData();
  form.append('video', new Blob([await fs.readFile(file)], {type: 'video/mp4'}), name);
  return call('POST', `/api/reviews/${id}/source`, form);
};

const ready = (id) => waitFor(async () => {
  const {body} = await call('GET', `/api/reviews/${id}`);
  if (body.source?.status === 'error') throw new Error(body.source.error);
  return body.source?.status === 'ready' ? body : null;
}, {timeout: 60_000});

const onDisk = (url) => path.join(env.data, url.replace(/^\/data\//, ''));

describe('проекты обзоров', () => {
  it('новый обзор с лотом берёт название из лота', async () => {
    const {body: lot} = await call('POST', '/api/lots', {});
    await call('PUT', `/api/lots/${lot.id}`, {...lot, brand: 'Audi', model: 'A6', year: 2018});
    const {status, body} = await call('POST', '/api/reviews', {lotId: lot.id});
    expect(status).toBe(200);
    expect(body.id).toMatch(/^rv-/);
    expect(body.title).toBe('Audi A6 2018');
    expect(body.lotId).toBe(lot.id);
    expect(body.segments).toEqual([]);
    expect((await call('GET', '/api/reviews')).body.map((r) => r.id)).toContain(body.id);
  });

  it('несуществующий лот — ошибка, кривой id — 400', async () => {
    expect((await call('POST', '/api/reviews', {lotId: 'lot-nope'})).status).toBe(404);
    expect((await call('GET', '/api/reviews/..%2Fetc')).status).toBe(400);
    const {body: r} = await call('POST', '/api/reviews', {});
    expect((await call('PUT', `/api/reviews/${r.id}`, {...r, lotId: 'lot-nope'})).status).toBe(404);
  });

  it('сохранение формы не меняет видео и чистит фрагменты', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Тест'});
    const {body} = await call('PUT', `/api/reviews/${r.id}`, {
      ...r, title: 'Новое имя', source: {status: 'ready', proxy: '/etc/passwd'},
      segments: [{id: 'a', start: -1, duration: 3, speed: 9, kind: 'hook'}],
      sourceVolume: 5, music: {track: null, volume: 7, junk: 1},
    });
    expect(body.title).toBe('Новое имя');
    expect(body.source).toBeNull();
    expect(body.segments).toEqual([expect.objectContaining({id: 'a', start: 0, duration: 3, speed: 1, kind: 'hook'})]);
    expect(body.sourceVolume).toBe(1);
    expect(body.music).toEqual({track: null, volume: 1});
  });

  it('подпись под названием: своя сохраняется, пустая значит «без подписи»', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Подпись'});
    expect(r.tagline).toBeUndefined();   // не задана — заставка возьмёт из рынка
    const {body: own} = await call('PUT', `/api/reviews/${r.id}`, {...r, tagline: '  From Korea  '.trim()});
    expect(own.tagline).toBe('From Korea');
    // Пустую строку отличаем от «не прислали»: это осознанный отказ от подписи
    const {body: none} = await call('PUT', `/api/reviews/${r.id}`, {...own, tagline: ''});
    expect(none.tagline).toBe('');
    const {body: kept} = await call('PUT', `/api/reviews/${r.id}`, {...none, tagline: undefined});
    expect(kept.tagline).toBe('');
    const {body: long} = await call('PUT', `/api/reviews/${r.id}`, {...kept, tagline: 'я'.repeat(200)});
    expect(long.tagline).toHaveLength(60);
  });

  it('звуки машины: форма включает слой, но не подменяет дорожку', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Звуки'});
    // Дорожки нет — включать нечего, и поле не появляется от одного желания формы
    const {body: empty} = await call('PUT', `/api/reviews/${r.id}`, {...r, ambience: {enabled: true}});
    expect(empty.ambience).toBeUndefined();

    // Дорожку создаёт только сервер; здесь подкладываем её в файл напрямую, как это сделал бы он
    const file = path.join(env.data, 'reviews', r.id, 'review.json');
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    stored.ambience = {status: 'ready', file: '/data/reviews/x/ambience-1.m4a', enabled: false};
    await fs.writeFile(file, JSON.stringify(stored));

    const {body: open} = await call('GET', `/api/reviews/${r.id}`);
    const {body: on} = await call('PUT', `/api/reviews/${r.id}`, {
      ...open,
      // Форма пытается заодно подсунуть свой файл и статус — их ведёт сервер
      ambience: {enabled: true, file: '/etc/passwd', status: 'error'},
    });
    expect(on.ambience.enabled).toBe(true);
    expect(on.ambience.file).toBe('/data/reviews/x/ambience-1.m4a');
    expect(on.ambience.status).toBe('ready');

    const {body: off} = await call('PUT', `/api/reviews/${r.id}`, {...on, ambience: {enabled: false}});
    expect(off.ambience.enabled).toBe(false);
    expect(off.ambience.file).toBe('/data/reviews/x/ambience-1.m4a');   // выключили слой, не стёрли работу
  });

  it('настройки цвета сохраняются и чистятся', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Цвет'});
    expect(r.colour).toEqual({exposure: 0, contrast: 0, saturation: 0, warmth: 0});
    const {body} = await call('PUT', `/api/reviews/${r.id}`, {
      ...r, colour: {exposure: 500, contrast: 12.4, saturation: -20, warmth: 'тепло', lift: 9},
    });
    expect(body.colour).toEqual({exposure: 100, contrast: 12, saturation: -20, warmth: 0});
    // Поле не прислали — прежние настройки на месте
    const {body: kept} = await call('PUT', `/api/reviews/${r.id}`, {...body, colour: undefined});
    expect(kept.colour).toEqual(body.colour);
  });

  it('сохранение поверх чужих правок отклоняется, а не затирает их', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Версии'});
    // Форму открыли на этой версии
    const opened = r.updatedAt;
    // Кто-то другой (вторая вкладка, распознавание, озвучка) успел записать своё
    const {body: other} = await call('PUT', `/api/reviews/${r.id}`, {...r, title: 'Чужая правка'});
    expect(other.updatedAt).not.toBe(opened);

    const stale = await call('PUT', `/api/reviews/${r.id}`, {...r, title: 'Устаревшая форма', baseUpdatedAt: opened});
    expect(stale.status).toBe(409);
    expect((await call('GET', `/api/reviews/${r.id}`)).body.title).toBe('Чужая правка');

    // С актуальной версией сохранение проходит
    const fresh = await call('PUT', `/api/reviews/${r.id}`, {...other, title: 'Свежая', baseUpdatedAt: other.updatedAt});
    expect(fresh.status).toBe(200);
    expect(fresh.body.title).toBe('Свежая');
  });
});

// Обработка видео под нагрузкой (например, параллельно с test:render) идёт дольше стандартных 5 с
describe('видео', {timeout: 120_000}, () => {
  let review;
  let dir;
  beforeAll(async () => {
    ({body: review} = await call('POST', '/api/reviews', {title: 'С видео'}));
    dir = await fs.mkdtemp(path.join(env.dir, 'videos-'));
  }, 30_000);

  it('видео с поворотом (как с iPhone) разворачивается, даёт прокси и миниатюры', async () => {
    const file = await makeTestVideo(path.join(dir, 'iphone.mp4'), {width: 320, height: 180, seconds: 4, rotation: 90});
    const {status, body} = await uploadVideo(review.id, file, 'IMG_0001.MOV');
    expect(status).toBe(200);
    expect(body.source).toMatchObject({status: 'processing', name: 'IMG_0001.MOV'});
    expect(body.source.original).toMatchObject({width: 180, height: 320, rotation: 90});

    const done = await ready(review.id);
    const s = done.source;
    // Поворот применён, пропорции сохранены, маленький исходник не растянут
    expect([s.width, s.height]).toEqual([180, 320]);
    expect(s.duration).toBeCloseTo(4, 0);
    expect(s.thumbs.fps).toBe(2);
    expect(s.thumbs.count).toBeGreaterThanOrEqual(7);
    const info = await probe(onDisk(s.proxy));
    // частота копии равна частоте обзора: лишние кадры обрабатывать незачем, недостающие взять неоткуда
    expect(info.video).toMatchObject({codec: 'h264', width: 180, height: 320, fps: REVIEW_FPS, rotation: 0});
    expect(await fs.readdir(onDisk(s.thumbs.base))).toContain('0001.jpg');
    review = done;
  });

  it('большой исходник ужимается до 1080 по ширине', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Большой'});
    const file = await makeTestVideo(path.join(dir, 'big.mp4'), {width: 1600, height: 2848, seconds: 2});
    await uploadVideo(r.id, file, 'big.mp4');
    const done = await ready(r.id);
    // Вписан в 1080×1920 с сохранением пропорций: кадр выше 9:16, поэтому упирается в высоту
    expect(done.source.width).toBeLessThan(1600);
    expect(done.source.width).toBeLessThanOrEqual(1080);
    expect(done.source.height).toBeLessThanOrEqual(1920);
    expect(done.source.height).toBeGreaterThan(1900);
  });

  it('HDR с телефона переводится в обычный цвет, а теги не врут', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'HDR'});
    const file = await makeTestVideo(path.join(dir, 'hdr.mp4'), {width: 180, height: 320, seconds: 2, hdr: true});
    const {body: up} = await uploadVideo(r.id, file, 'IMG_HDR.MOV');
    expect(up.source.original.hdr).toBe(true);
    const done = await ready(r.id);
    const info = await probe(onDisk(done.source.proxy));
    // Рабочая копия — обычный BT.709: иначе плееры трактуют её по-разному и картинка выходит вялой
    expect(info.video.hdr).toBe(false);
    expect(info.video.transfer).not.toBe('arib-std-b67');
  });

  it('маленький исходник не растягивается: апскейл только весит', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Мелкий'});
    const file = await makeTestVideo(path.join(dir, 'small.mp4'), {width: 240, height: 426, seconds: 2});
    await uploadVideo(r.id, file, 'small.mp4');
    const done = await ready(r.id);
    expect(done.source.width).toBeLessThanOrEqual(240);
    expect(done.source.height).toBeLessThanOrEqual(426);
  });

  it('«Пересобрать видео» делает копию заново из того же файла', async () => {
    const {body: r} = await call('POST', '/api/reviews', {title: 'Пересборка'});
    expect((await call('POST', `/api/reviews/${r.id}/reprocess`)).status).toBe(400);   // видео ещё нет

    const file = await makeTestVideo(path.join(dir, 'again.mp4'), {width: 180, height: 320, seconds: 2});
    await uploadVideo(r.id, file, 'again.mp4');
    const first = await ready(r.id);
    const {body: started} = await call('POST', `/api/reviews/${r.id}/reprocess`);
    expect(started.source.status).toBe('processing');
    const second = await ready(r.id);
    // Новая версия копии, исходник тот же, фрагменты и речь на месте
    expect(second.source.proxy).not.toBe(first.source.proxy);
    expect(second.source.name).toBe('again.mp4');
    await fs.access(onDisk(second.source.proxy));
  });

  it('фрагменты обрезаются по длине готового видео', async () => {
    const {body} = await call('PUT', `/api/reviews/${review.id}`, {
      ...review, segments: [{id: 'a', start: 3, duration: 10, speed: 1, kind: 'caption'}],
    });
    expect(body.segments[0].start + body.segments[0].duration).toBeLessThanOrEqual(review.source.duration + 1e-6);
  });

  it('замена видео убирает прежние прокси и миниатюры', async () => {
    const before = review.source;
    const file = await makeTestVideo(path.join(dir, 'second.mp4'), {width: 180, height: 320, seconds: 2});
    expect((await uploadVideo(review.id, file, 'second.mp4')).status).toBe(200);
    const done = await ready(review.id);
    expect(done.source.proxy).not.toBe(before.proxy);
    expect(done.source.duration).toBeCloseTo(2, 0);
    const files = await fs.readdir(path.join(env.data, 'reviews', review.id));
    expect(files.filter((f) => f.startsWith('proxy-'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('thumbs-'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('source.'))).toEqual(['source.mp4']);
    review = done;
  });

  it('не видео — понятная ошибка, временный файл не остаётся', async () => {
    const junk = path.join(dir, 'junk.mov');
    await fs.writeFile(junk, 'это не видео');
    const {status, body} = await uploadVideo(review.id, junk, 'junk.mov');
    expect(status).toBe(400);
    expect(body.error).toContain('junk.mov');
    expect(await fs.readdir(path.join(env.data, 'tmp'))).toEqual([]);
  });

  it('рендер: без видео и без фрагментов — 400', async () => {
    const {body: empty} = await call('POST', '/api/reviews', {});
    expect((await call('POST', `/api/reviews/${empty.id}/render`, {})).body.error).toContain('Видео');
    const {body: noSegs} = await call('PUT', `/api/reviews/${review.id}`, {...review, segments: []});
    const res = await call('POST', `/api/reviews/${noSegs.id}/render`, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('фрагмент');
  });
});

// Распознавание речи (через подставной сервис)
describe('речь', {timeout: 120_000}, () => {
  let review;
  beforeAll(async () => {
    ({body: review} = await call('POST', '/api/reviews', {title: 'Речь'}));
    const dir = await fs.mkdtemp(path.join(env.dir, 'speech-'));
    const file = await makeTestVideo(path.join(dir, 'clip.mp4'), {width: 180, height: 320, seconds: 3, audio: true});
    await uploadVideo(review.id, file, 'clip.mp4');
    review = await ready(review.id);
  }, 120_000);

  it('в видео есть звук, иначе распознавать нечего', async () => {
    expect(review.source.hasAudio).toBe(true);
    const {body: silent} = await call('POST', '/api/reviews', {});
    const dir = await fs.mkdtemp(path.join(env.dir, 'silent-'));
    const file = await makeTestVideo(path.join(dir, 'mute.mp4'), {width: 180, height: 320, seconds: 2});
    await uploadVideo(silent.id, file, 'mute.mp4');
    await ready(silent.id);
    const {status, body} = await call('POST', `/api/reviews/${silent.id}/transcribe`);
    expect(status).toBe(400);
    expect(body.error).toContain('нет звука');
  });

  it('ключ в настройках включает распознавание', async () => {
    expect((await call('GET', '/api/config')).body.features.speech).toBe(true);
  });

  it('распознаёт речь: слова, строки субтитров, звуки не попадают в текст', async () => {
    const before = eleven.state.requests;
    expect((await call('POST', `/api/reviews/${review.id}/transcribe`)).body.speech.status).toBe('running');
    const done = await waitFor(async () => {
      const {body} = await call('GET', `/api/reviews/${review.id}`);
      if (body.speech?.status === 'error') throw new Error(body.speech.error);
      return body.speech?.status === 'ready' ? body : null;
    });
    expect(eleven.state.requests).toBe(before + 1);
    expect(eleven.state.lastKey).toBe('test-key');
    expect(eleven.state.lastBody).toContain('model_id');
    expect(done.speech.language).toBe('rus');
    expect(done.speech.words).toHaveLength(4);            // [tone] отброшен
    expect(done.speech.lines.map((l) => l.text)).toEqual(['Привет!', 'Смотрим Audi A6.']);
    review = done;
  });

  it('правки строк сохраняются, слова и статус трогать нельзя', async () => {
    const lines = review.speech.lines.map((l) => ({...l, translation: 'Здраво'}));
    const {body} = await call('PUT', `/api/reviews/${review.id}`, {
      ...review,
      speech: {...review.speech, status: 'error', words: [], lines},
      subtitles: {enabled: true, useTranslation: true},
    });
    expect(body.speech.status).toBe('ready');
    expect(body.speech.words).toHaveLength(4);
    expect(body.speech.lines[0].translation).toBe('Здраво');
    expect(body.subtitles).toEqual({enabled: true, useTranslation: true});
    review = body;
  });

  it('«Пересобрать строки» работает без обращения к сервису', async () => {
    const before = eleven.state.requests;
    const {body} = await call('POST', `/api/reviews/${review.id}/relines`);
    expect(eleven.state.requests).toBe(before);
    expect(body.speech.lines.map((l) => l.text)).toEqual(['Привет!', 'Смотрим Audi A6.']);
    expect(body.speech.lines[0].translation ?? '').toBe('');  // строки собраны заново
  });

  it('ошибка сервиса попадает в проект понятным текстом', async () => {
    eleven.state.status = 403;
    await call('POST', `/api/reviews/${review.id}/transcribe`);
    const failed = await waitFor(async () => {
      const {body} = await call('GET', `/api/reviews/${review.id}`);
      return body.speech?.status === 'error' ? body : null;
    });
    expect(failed.speech.error).toContain('Speech to Text');
    eleven.state.status = 200;
  });

  it('без ключа распознавание не запускается', async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    const {status, body} = await call('POST', `/api/reviews/${review.id}/transcribe`);
    process.env.ELEVENLABS_API_KEY = key;
    expect(status).toBe(400);
    expect(body.error).toContain('ELEVENLABS_API_KEY');
  });
});

describe('озвучка перевода', {timeout: 120_000}, () => {
  let review;
  beforeAll(async () => {
    process.env.ELEVENLABS_VOICE_ID = 'test-voice';
    ({body: review} = await call('POST', '/api/reviews', {title: 'Озвучка'}));
    const dir = await fs.mkdtemp(path.join(env.dir, 'voice-'));
    const file = await makeTestVideo(path.join(dir, 'clip.mp4'), {width: 180, height: 320, seconds: 3, audio: true});
    await uploadVideo(review.id, file, 'clip.mp4');
    review = await ready(review.id);
    await call('POST', `/api/reviews/${review.id}/transcribe`);
    review = await waitFor(async () => {
      const {body} = await call('GET', `/api/reviews/${review.id}`);
      return body.speech?.status === 'ready' ? body : null;
    });
  }, 120_000);

  const withTranslations = async (texts) => {
    const lines = review.speech.lines.map((l, i) => ({...l, translation: texts[i] ?? ''}));
    const {body} = await call('PUT', `/api/reviews/${review.id}`, {...review, speech: {...review.speech, lines}});
    review = body;
    return body;
  };

  it('ключ и голос в настройках включают озвучку', async () => {
    expect((await call('GET', '/api/config')).body.features.voice).toBe(true);
  });

  it('без перевода озвучивать нечего', async () => {
    await withTranslations([]);
    const {status, body} = await call('POST', `/api/reviews/${review.id}/voice`);
    expect(status).toBe(400);
    expect(body.error).toContain('перевод');
  });

  it('язык без голоса: субтитры можно, озвучку нет', async () => {
    await withTranslations(['Здраво', 'Гледаме Audi A6']);
    const {body} = await call('PUT', `/api/reviews/${review.id}`, {...review, targetLanguage: 'sq'});
    review = body;
    expect(body.targetLanguage).toBe('sq');
    const {status, body: err} = await call('POST', `/api/reviews/${review.id}/voice`);
    expect(status).toBe(400);
    expect(err.error).toContain('албанский');
    const {body: back} = await call('PUT', `/api/reviews/${review.id}`, {...review, targetLanguage: 'mk'});
    review = back;
  });

  it('весь перевод — одной начиткой, отрезки строк берутся из разметки', async () => {
    const before = eleven.state.tts;
    const {status, body} = await call('POST', `/api/reviews/${review.id}/voice`);
    expect(status).toBe(200);
    expect(body.voice).toMatchObject({status: 'running', done: 0, total: 2});

    const done = await waitFor(async () => {
      const {body: r} = await call('GET', `/api/reviews/${review.id}`);
      if (r.voice?.status === 'error') throw new Error(r.voice.error);
      return r.voice?.status === 'ready' ? r : null;
    });
    // Один запрос на весь текст, а не по запросу на строку: иначе голос «прыгает» между фразами
    expect(eleven.state.tts).toBe(before + 1);
    expect(done.voice.track.file).toMatch(/^\/data\/reviews\/.+\/voice\/track-.+\.mp3$/);
    await fs.access(onDisk(done.voice.track.file));
    expect(done.voice.track.duration).toBeGreaterThan(0);

    // У каждой строки свой отрезок дорожки, идущий по порядку и не пустой
    const ids = review.speech.lines.map((l) => l.id);
    let prev = -1;
    for (const id of ids) {
      const c = done.voice.clips[id];
      expect(c.to).toBeGreaterThan(c.from);
      expect(c.from).toBeGreaterThanOrEqual(prev);
      prev = c.to;
    }
    expect(done.voice).toMatchObject({enabled: true, language: 'mk', speaker: 'nikolai'});
    review = done;
  });

  it('текст не менялся — начитку не переделываем; поменялся — переозвучиваем целиком', async () => {
    const same = eleven.state.tts;
    await call('POST', `/api/reviews/${review.id}/voice`);
    await waitFor(async () => {
      const {body: r} = await call('GET', `/api/reviews/${review.id}`);
      return r.voice?.status === 'ready' && !r.voice.total ? r : null;
    });
    expect(eleven.state.tts).toBe(same);

    const before = eleven.state.tts;
    const lines = review.speech.lines.map((l, i) => ({...l, translation: i === 0 ? 'Здраво' : 'Сосема друг текст'}));
    const {body} = await call('PUT', `/api/reviews/${review.id}`, {...review, speech: {...review.speech, lines}});
    review = body;
    await call('POST', `/api/reviews/${review.id}/voice`);
    const done = await waitFor(async () => {
      const {body: r} = await call('GET', `/api/reviews/${review.id}`);
      return r.voice?.status === 'ready' && !r.voice.total ? r : null;
    });
    // Правка любой строки переозвучивает весь текст: иначе в этом месте голос снова «прыгнет»
    expect(eleven.state.tts).toBe(before + 1);
    expect(Object.keys(done.voice.clips)).toHaveLength(2);
  });
});
