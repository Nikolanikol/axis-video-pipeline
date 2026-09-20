// Срок на внешние процессы. Зависший ffmpeg ничем себя не выдаёт: процесс жив, вывода нет,
// промис не завершается — и обзор остаётся «в обработке» навсегда.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {makeTestVideo, useTempEnv} from '../helpers.mjs';

let env;
let dir;
let source;
let run;
let probe;

beforeAll(async () => {
  env = await useTempEnv();
  ({run, probe} = await import('../../server/media.mjs'));
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axis-media-'));
  source = path.join(dir, 'source.mp4');
  await makeTestVideo(source, {width: 180, height: 320, seconds: 3});
}, 120000);
afterAll(async () => {
  await fs.rm(dir, {recursive: true, force: true});
  await env.cleanup();
});

describe('срок на ffmpeg', () => {
  it('не уложившийся процесс снимается, а не висит', async () => {
    const out = path.join(dir, 'never.mp4');
    // Срок в миллисекунду не успеет никто — проверяем, что промис вообще завершается
    await expect(run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', source, '-c:v', 'libx264', out], {timeout: 1}))
      .rejects.toThrow(/не уложился/);
  });

  it('обычная работа сроком не задета', async () => {
    const out = path.join(dir, 'ok.mp4');
    await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', source, '-t', '1', '-c:v', 'libx264', out]);
    expect((await probe(out)).duration).toBeGreaterThan(0.5);
  }, 60000);
});
