// Русский словарь карусели из словарей kmotors: node tools/sync-kmotors-dict.mjs <путь к KMotors-1>
//
// Данные карусели приходят от шлюза kmotors уже по-английски: опции — OPTION_EN по коду
// Encar, топливо, коробка и цвет — через src/locales/en/cars.json (корейское → английское).
// У kmotors есть и русские версии тех же словарей: catalog[].translatedValue по тому же коду
// опции и src/locales/ru/cars.json с теми же корейскими ключами. Сводим их в пары
// «английское → русское» — по коду и по корейскому ключу, а не по догадке переводчика:
// на слайде будет ровно то же слово, что на сайте kmotors.shop/ru.
//
// Результат — src/carousel/i18n/ru-values.json, едет в сборку Remotion. Перезапускать,
// когда в kmotors добавились опции или слова.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Укажи путь к проекту kmotors: node tools/sync-kmotors-dict.mjs ../KMotors-1');
  process.exit(1);
}

// data.ts — TypeScript с двумя литералами; вытаскиваем их текстом, без компиляции
const dataTs = await fs.readFile(path.join(root, 'src/components/Catalog/CarDetail/OptionsRow/data.ts'), 'utf8');
const ruByCode = {};
for (const m of dataTs.matchAll(/code:\s*"(\d+)"\s*,\s*translatedValue:\s*"([^"]+)"/g)) ruByCode[m[1]] = m[2];
const enBlock = dataTs.slice(dataTs.indexOf('export const OPTION_EN'));
const enByCode = {};
for (const m of enBlock.matchAll(/"(\d{3})"\s*:\s*"([^"]+)"/g)) enByCode[m[1]] = m[2];

const options = {};
const missing = [];
for (const [code, en] of Object.entries(enByCode)) {
  if (ruByCode[code]) options[en] = ruByCode[code];
  else missing.push(`${code} ${en}`);
}

// Топливо, коробка, цвет, кузов: корейский ключ общий у en и ru
const en = JSON.parse(await fs.readFile(path.join(root, 'src/locales/en/cars.json'), 'utf8'));
const ru = JSON.parse(await fs.readFile(path.join(root, 'src/locales/ru/cars.json'), 'utf8'));
const values = {};
const conflicts = [];
for (const [ko, enWord] of Object.entries(en)) {
  const ruWord = ru[ko];
  if (!ruWord || ruWord === enWord) continue;
  if (values[enWord] && values[enWord] !== ruWord) conflicts.push(`${enWord}: «${values[enWord]}» / «${ruWord}»`);
  else values[enWord] = ruWord;
}

const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/carousel/i18n/ru-values.json');
await fs.writeFile(decodeURIComponent(out), JSON.stringify({
  _note: 'Сгенерировано tools/sync-kmotors-dict.mjs из словарей kmotors. Руками не править — перегенерировать.',
  options, values,
}, null, 2) + '\n');
console.log(`опций: ${Object.keys(options).length}, слов: ${Object.keys(values).length}`);
if (missing.length) console.log(`без русского (${missing.length}):`, missing.join('; '));
if (conflicts.length) console.log(`разночтения (${conflicts.length}, взято первое):`, conflicts.slice(0, 15).join('; '));
