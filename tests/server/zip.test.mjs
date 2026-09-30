// Архив «Скачать все» у карусели: без библиотеки, поэтому проверяем, что его читают
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {makeZip} from '../../server/zip.mjs';

// Прочитать архив обратно по оглавлению: имя, данные, контрольная сумма
const readZip = (buf) => {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const local = buf.readUInt32LE(at + 42);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({name, crc, data: buf.subarray(dataAt, dataAt + size)});
    at += 46 + nameLen;
  }
  return out;
};

describe('архив слайдов', () => {
  const files = [
    {name: 'bmw-5-series-42403328-1.png', data: Buffer.from('первый слайд')},
    {name: 'хендэ-экус-2.png', data: Buffer.alloc(100_000, 7)},
  ];
  const zip = makeZip(files);

  it('оглавление, имена в UTF-8, данные и контрольные суммы на месте', () => {
    const back = readZip(zip);
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    back.forEach((f, i) => {
      expect(f.data.equals(files[i].data)).toBe(true);
      expect(f.crc).toBe(zlib.crc32(files[i].data));
    });
  });

  it('системный unzip проверяет архив без ошибок', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
    const file = path.join(dir, 'slides.zip');
    await fs.writeFile(file, zip);
    const {stdout} = await promisify(execFile)('unzip', ['-t', file]).catch((e) => ({stdout: String(e.stdout ?? e)}));
    await fs.rm(dir, {recursive: true, force: true});
    expect(stdout).toMatch(/No errors detected/);
  });
});
