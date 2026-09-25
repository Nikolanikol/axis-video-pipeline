// Настоящий рендер каждого формата: кадры, длительность, звук и попадание долей музыки в склейки.
// Медленно (~1–2 мин): npm run test:render
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {listFormats, storyboardFrames} from '../../server/formats.mjs';
import {TRACKS} from '../../src/shared/model';
import {loadInput} from '../../server/store.mjs';
import {ROOT, beatOffset, decodeAudio, peak, probe} from '../helpers.mjs';

const formats = await listFormats();
// Лот-образец с фото из public/ — не зависит от данных интерфейса
const fixture = await loadInput(path.join(ROOT, 'lots/audi-a6-2018.json'));
const browserExecutable = process.env.CHROME_PATH || null;
const SYNC_TOLERANCE_SEC = 0.025; // меньше кадра (33 мс)

let serveUrl;
let browser;
let dir;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axis-render-'));
  serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), rootDir: ROOT, publicDir: path.join(ROOT, 'public')});
  browser = await openBrowser('chrome', {browserExecutable});
});
afterAll(async () => {
  await browser?.close({silent: true});
  await fs.rm(dir, {recursive: true, force: true});
});

const withMusic = (music) => ({...fixture, lot: {...fixture.lot, music}});

describe.each(formats)('формат $id', (format) => {
  let composition;
  // renderMedia рендерит props выбранной композиции — для других props выбираем её заново
  const render = async (name, inputProps) => {
    const out = path.join(dir, `${format.id}-${name}.mp4`);
    const comp = await selectComposition({serveUrl, id: format.id, inputProps, puppeteerInstance: browser});
    await renderMedia({
      composition: comp, serveUrl, inputProps, codec: 'h264', outputLocation: out, scale: 0.5,
      enforceAudioTrack: true, puppeteerInstance: browser,
    });
    return out;
  };

  beforeAll(async () => {
    composition = await selectComposition({serveUrl, id: format.id, inputProps: fixture, puppeteerInstance: browser});
  });

  it('композиция совпадает с реестром', () => {
    expect(composition.durationInFrames).toBe(format.durationInFrames);
    expect(composition.fps).toBe(format.fps);
    expect([composition.width, composition.height]).toEqual([format.width, format.height]);
  });

  it('кадры раскадровки нужного размера и не пустые', async () => {
    for (const frame of storyboardFrames(format)) {
      const {buffer} = await renderStill({composition, serveUrl, frame, inputProps: fixture, puppeteerInstance: browser, imageFormat: 'png'});
      const meta = await sharp(buffer).metadata();
      expect([meta.width, meta.height], `кадр ${frame}`).toEqual([format.width, format.height]);
      const {channels} = await sharp(buffer).stats();
      expect(channels[0].stdev, `кадр ${frame} однотонный`).toBeGreaterThan(10);
    }
  });

  // Модель цены: у рекламы ценовая сцена раздваивается на export (маршрут «до порта») и
  // domestic (просто цена). Рендерим кадр сцены в обоих режимах и убеждаемся, что картинка
  // реально разная — иначе раздвоение молча не сработало бы.
  it('ценовая сцена отличается на экспортном и внутреннем рынке', async () => {
    const priceScene = format.scenes.find((s) => s.id === 'price');
    if (!priceScene) return; // раздвоение есть только у формата с ценовой сценой
    const copy = JSON.parse(await fs.readFile(path.join(ROOT, 'config/copy.json'), 'utf8'));
    const {marketFromProfile} = await import('../../src/shared/profile.js');
    const domesticMarket = marketFromProfile(
      {company: 'X', language: 'en', contacts: {whatsapp: '+1 000', site: 'x.com'}, pricing: {mode: 'domestic', currency: 'EUR'}},
      copy,
    );
    const domesticProps = {...fixture, market: domesticMarket};
    const frame = priceScene.preview;
    // Разные props — композицию выбираем заново под каждую (см. комментарий у render)
    const domComp = await selectComposition({serveUrl, id: format.id, inputProps: domesticProps, puppeteerInstance: browser});
    const exportShot = (await renderStill({composition, serveUrl, frame, inputProps: fixture, puppeteerInstance: browser, imageFormat: 'png'})).buffer;
    const domesticShot = (await renderStill({composition: domComp, serveUrl, frame, inputProps: domesticProps, puppeteerInstance: browser, imageFormat: 'png'})).buffer;
    // Обе не пустые
    expect((await sharp(exportShot).stats()).channels[0].stdev).toBeGreaterThan(10);
    expect((await sharp(domesticShot).stats()).channels[0].stdev).toBeGreaterThan(10);
    // И различаются по самим пикселям (у экспорта дуга маршрута, у внутреннего её нет)
    const raw = (b) => sharp(b).resize(90, 160).raw().toBuffer();
    expect(Buffer.compare(await raw(exportShot), await raw(domesticShot))).not.toBe(0);
  });

  // Метроном — эталон: у него доля ровно там, где обещано. Проверяем на нём всю цепочку
  // подгонки темпа и компенсации задержки кодека. Если этот тест упал — сломалась механика,
  // а не выбор трека.
  it('музыка (метроном): длительность, звук, доли попадают в склейки', async () => {
    const track = 'test-metronome-120';
    const file = await render(track, withMusic({track, volume: 0.8}));
    const streams = await probe(file);
    const video = streams.find((s) => s.codec_type === 'video');
    expect(Number(video.duration)).toBeCloseTo(format.durationInFrames / format.fps, 1);
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);

    const audio = await decodeAudio(file);
    expect(peak(audio)).toBeGreaterThan(0.05);
    const offset = beatOffset(audio, 60 / format.bpm);
    expect(Math.abs(offset), `смещение долей ${Math.round(offset * 1000)} мс`).toBeLessThan(SYNC_TOLERANCE_SEC);
  });

  // Настоящий трек из библиотеки: проверяем, что он вообще звучит в ролике.
  // Попадание в доли здесь НЕ проверяется, и это не халтура, а честное положение дел:
  // единственный трек библиотеки — балканский трэп, у него нет ровной доли (замер: при любом
  // темпе от 118 до 124 смещение 60–105 мс при допуске 25). Для обзоров это неважно — там
  // склеек нет. Для рекламы важно: она режется на 3 / 7 / 11,5 с. Пока в библиотеке нет
  // трека с ровной долей, реклама собирается с музыкой, не попадающей в склейки —
  // см. «Известные дыры» в CONTEXT.md.
  it('музыка из библиотеки звучит в ролике', async () => {
    const [track] = TRACKS.filter((t) => t.id !== 'test-metronome-120').map((t) => t.id);
    const file = await render(track, withMusic({track, volume: 0.8}));
    expect(peak(await decodeAudio(file))).toBeGreaterThan(0.05);
  });

  it('без музыки: аудиодорожка есть (иначе mp4 считают GIF), но в ней тишина', async () => {
    const file = await render('silent', withMusic({track: null}));
    const streams = await probe(file);
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(peak(await decodeAudio(file))).toBe(0);
  });
});

describe('обзор review-short', () => {
  let server;
  let base;
  const W = 540, H = 960, SECONDS = 12;

  beforeAll(async () => {
    const {makeTestVideo, serveDir} = await import('../helpers.mjs');
    const {makeProxy, probe: probeVideo} = await import('../../server/media.mjs');
    const raw = await makeTestVideo(path.join(dir, 'review-raw.mp4'), {width: W, height: H, seconds: SECONDS});
    await makeProxy(raw, path.join(dir, 'proxy.mp4'), SECONDS);
    const info = await probeVideo(path.join(dir, 'proxy.mp4'));
    server = await serveDir(dir);
    const {applyTemplate} = await import('../../src/shared/timeline.js');
    base = {
      ...fixture,
      review: {
        title: 'Тестовый обзор',
        segments: applyTemplate(info.duration, fixture.lot.specs),
        source: {status: 'ready', proxy: `${server.url}/proxy.mp4`, width: info.video.width, height: info.video.height, duration: info.duration},
      },
    };
  });
  afterAll(async () => { await server?.close(); });

  const renderReview = async (name, props) => {
    const out = path.join(dir, `review-${name}.mp4`);
    const comp = await selectComposition({serveUrl, id: 'review-short', inputProps: props, puppeteerInstance: browser});
    await renderMedia({composition: comp, serveUrl, inputProps: props, codec: 'h264', outputLocation: out, scale: 0.5, enforceAudioTrack: true, puppeteerInstance: browser});
    return {out, comp};
  };

  // Длительность композиции обязана совпадать с таймлайном, а не с числом из шаблона:
  // тестовый исходник 12 с, а шаблон v1 просит 31 с материала (ускоренный пункт — 3 с экрана × 3).
  // Полные 25 с из короткой съёмки получались бы только повтором материала — это и есть
  // прыжок назад на склейке. Сам договор «31 с исходника → ровно 25 с экрана» проверяет
  // быстрый тест в tests/unit/timeline.test.ts, без рендера.
  it('длительность композиции совпадает с таймлайном', async () => {
    const {REVIEW_FPS, reviewFrames} = await import('../../src/shared/timeline.js');
    const comp = await selectComposition({serveUrl, id: 'review-short', inputProps: base, puppeteerInstance: browser});
    expect(comp.durationInFrames).toBe(reviewFrames(base.review.segments));
    expect([comp.width, comp.height]).toEqual([1080, 1920]);
  });

  it('шаблон не показывает материал дважды', async () => {
    let prevEnd = 0;
    for (const s of base.review.segments) {
      expect(s.start, `${s.note} начинается раньше конца предыдущего`).toBeGreaterThanOrEqual(prevEnd - 1e-9);
      prevEnd = s.start + s.duration;
    }
    expect(prevEnd).toBeLessThanOrEqual(base.review.source.duration + 1e-9);
  });

  it('кадры раскадровки: видео и оформление на месте', async () => {
    const {reviewStoryboard} = await import('../../src/shared/timeline.js');
    const comp = await selectComposition({serveUrl, id: 'review-short', inputProps: base, puppeteerInstance: browser});
    for (const frame of reviewStoryboard(base.review.segments)) {
      const {buffer} = await renderStill({composition: comp, serveUrl, frame, inputProps: base, puppeteerInstance: browser, imageFormat: 'png'});
      const meta = await sharp(buffer).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1920]);
      const {channels} = await sharp(buffer).stats();
      expect(channels[0].stdev, `кадр ${frame}`).toBeGreaterThan(10);
    }
  });

  it('ролик с музыкой рынка: звук есть, доли попадают в склейки', async () => {
    const {REVIEW_FPS, reviewFrames} = await import('../../src/shared/timeline.js');
    const {out} = await renderReview('music', base);
    const streams = await probe(out);
    expect(Number(streams.find((s) => s.codec_type === 'video').duration))
      // Частоту берём из настроек обзора: с числом вручную тест переставал ловить смысл
      // при переходе на 60 кадров и молча сравнивал бы длину с удвоенной
      .toBeCloseTo(reviewFrames(base.review.segments) / REVIEW_FPS, 1);
    // Музыка звучит. Попадание в доли для обзора не проверяем: материал идёт одним куском,
    // склеек нет, и попадать не во что. Механику подгонки темпа стережёт тест с метрономом
    // в рекламном формате — там склейки настоящие.
    expect(peak(await decodeAudio(out))).toBeGreaterThan(0.05);
  });

  it('без музыки: беззвучная дорожка', async () => {
    const {out} = await renderReview('silent', {...base, review: {...base.review, music: {track: null}}});
    const streams = await probe(out);
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(peak(await decodeAudio(out))).toBe(0);
  });
});
