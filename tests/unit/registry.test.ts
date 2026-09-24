// Целостность реестров: форматы, рынки, музыка, бренд. Ловит «забыл добавить» при новых форматах и треках.
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import brand from '../../config/brand.json';
import fontPairs from '../../config/fonts.json';
import {FORMAT_COMPONENTS} from '../../src/formats';
import {tempoRate} from '../../src/shared/music';
import {FORMATS, TRACKS} from '../../src/shared/model';

const ROOT = path.resolve(__dirname, '../..');
const marketsDir = path.join(ROOT, 'config/markets');
const markets = fs.readdirSync(marketsDir).filter((f) => f.endsWith('.json'))
  .map((f) => ({id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(marketsDir, f), 'utf8'))}));

describe('реестр форматов', () => {
  it('id уникальны и годятся для имени композиции', () => {
    const ids = FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('у каждого формата есть компонент, и наоборот', () => {
    expect(Object.keys(FORMAT_COMPONENTS).sort()).toEqual(FORMATS.map((f) => f.id).sort());
  });

  for (const f of FORMATS) {
    describe(f.id, () => {
      it('сцены идут подряд без дыр и покрывают весь ролик', () => {
        let at = 0;
        for (const s of f.scenes) {
          expect(s.from, `сцена ${s.id}`).toBe(at);
          expect(s.frames).toBeGreaterThan(0);
          at += s.frames;
        }
        expect(at).toBe(f.durationInFrames);
      });

      it('кадр раскадровки лежит внутри своей сцены', () => {
        for (const s of f.scenes) {
          expect(s.preview).toBeGreaterThanOrEqual(s.from);
          expect(s.preview).toBeLessThan(s.from + s.frames);
        }
      });

      it('склейки попадают в доли темпа формата', () => {
        const beat = (60 / f.bpm) * f.fps; // кадров на долю
        for (const s of f.scenes.slice(1)) {
          const r = s.from % beat;
          expect(Math.min(r, beat - r), `склейка на кадре ${s.from}`).toBeLessThanOrEqual(1);
        }
      });

      it('все тексты формата заполнены во всех рынках', () => {
        for (const m of markets) {
          for (const {key} of f.texts) {
            expect(m.texts?.[key], `рынок ${m.id}, ключ ${key}`).toBeTruthy();
          }
        }
      });

      it('размер кадра — вертикальный 9:16', () => {
        expect(f.width / f.height).toBeCloseTo(9 / 16, 3);
      });
    });
  }
});

describe('рынки', () => {
  it('есть хотя бы один рынок, и у каждого заполнены основные поля', () => {
    expect(markets.length).toBeGreaterThan(0);
    for (const m of markets) {
      expect(m.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      for (const key of ['name', 'origin', 'originCountry', 'port', 'portCountry', 'site']) {
        expect(m[key], `рынок ${m.id}: ${key}`).toBeTruthy();
      }
      expect(m.freightUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it('музыка рынка ссылается на существующий трек', () => {
    for (const m of markets) {
      if (m.music?.track) expect(TRACKS.map((t) => t.id), `рынок ${m.id}`).toContain(m.music.track);
    }
  });
});

describe('музыкальная библиотека', () => {
  it('id уникальны, файлы на месте, источник и лицензия записаны', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    for (const t of TRACKS) {
      const file = path.join(ROOT, 'public', t.file);
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(10_000);
      expect(t.source).toBeTruthy();
      expect(t.license).toBeTruthy();
    }
  });

  it('темп, старт и громкость в разумных пределах', () => {
    for (const t of TRACKS) {
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(200);
      expect(t.startSec).toBeGreaterThanOrEqual(0);
      expect(t.gain).toBeGreaterThan(0);
      expect(t.gain).toBeLessThanOrEqual(3);
    }
  });

  it('подгонка темпа под любой формат не больше ±20 % (иначе слышно)', () => {
    for (const t of TRACKS) {
      for (const f of FORMATS) {
        const rate = tempoRate(t.bpm, f.bpm);
        expect(rate, `${t.id} → ${f.id}`).toBeGreaterThanOrEqual(0.8);
        expect(rate, `${t.id} → ${f.id}`).toBeLessThanOrEqual(1.2);
      }
    }
  });
});

describe('бренд', () => {
  // В теме кроме цветов есть имя, шрифты и файлы — проверяем цвета отдельно от остального
  const COLORS = ['bg', 'panel', 'line', 'grey', 'white', 'copper', 'copperLight', 'copperDark'] as const;

  it('все цвета — #RRGGBB', () => {
    for (const key of COLORS) expect((brand as unknown as Record<string, string>)[key], key).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('имя бренда задано: оно печатается в шапке слайдов', () => {
    expect(brand.name).toBeTruthy();
  });

  it('шрифты заданы семействами, а не пустыми строками', () => {
    expect(brand.fonts.head).toMatch(/\w/);
    expect(brand.fonts.body).toMatch(/\w/);
  });

  it('каждый файл бренда из темы лежит на диске', () => {
    // Путь может быть и полной ссылкой — такие пропускаем, проверять нечего
    for (const [key, value] of Object.entries(brand.assets)) {
      if (String(value).startsWith('http')) continue;
      expect(fs.existsSync(path.join(ROOT, 'public', String(value))), `${key}: ${value}`).toBe(true);
    }
  });
});

describe('пары шрифтов', () => {
  it('id уникальны', () => {
    const ids = fontPairs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('первая пара встроена в проект и не требует сети', () => {
    // Порядок важен: это запасной вариант, если своя пара не загрузится, и он
    // приходит пакетами @fontsource вместе со сборкой
    expect(fontPairs[0].url).toBe('');
    expect(fontPairs[0].head).toContain('Oswald');
    expect(fontPairs[0].body).toContain('Montserrat');
  });

  for (const pair of fontPairs) {
    describe(pair.id, () => {
      it('заголовок, подпись и оба семейства заданы', () => {
        // \S, а не \w: подписи по-русски, и \w без флага u кириллицу не ловит
        for (const [field, value] of Object.entries({title: pair.title, note: pair.note, head: pair.head, body: pair.body})) {
          expect(value, field).toMatch(/\S/);
        }
      });

      it('у семейства есть запасное: не загрузился шрифт — кадр рисуется системным', () => {
        for (const stack of [pair.head, pair.body]) {
          expect(stack, stack).toMatch(/,\s*(sans-serif|serif|monospace)$/);
        }
      });

      it('адрес таблицы стилей перечисляет ровно те семейства, что заданы в паре', () => {
        if (!pair.url) return;
        expect(pair.url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
        // Имя семейства в адресе и в стеке должны совпадать: разойдутся — браузер
        // загрузит один шрифт, а нарисует другим
        const inUrl = [...pair.url.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' '));
        const wanted = [...new Set([pair.head, pair.body].map((s) => s.split(',')[0].replace(/"/g, '').trim()))];
        expect(inUrl.sort()).toEqual(wanted.sort());
      });

      it('запрошены веса, которыми рисуют вёрстка и образец', () => {
        if (!pair.url) return;
        // Заголовки идут 700 и 600, основной текст 500 — синтезировать их браузером нельзя,
        // иначе вместо настоящего начертания выйдет искусственно утолщённое
        for (const weight of ['500', '600', '700']) expect(pair.url, weight).toContain(weight);
      });
    });
  }
});
