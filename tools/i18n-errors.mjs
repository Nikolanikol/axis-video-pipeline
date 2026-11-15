// Сверка словаря ошибок (server/i18n/errors.mjs) с кодом: каких текстов HttpError/CoreError нет
// в словаре и какие ключи словаря в коде больше не встречаются (опечатка или текст поменяли).
// Запуск: node tools/i18n-errors.mjs. Ничего не меняет.
// Тексты без перевода — не ошибка: админка, кассы и обзоры остаются по-русски намеренно.
import fs from 'node:fs';
import path from 'node:path';
import {ERROR_KEYS} from '../server/i18n/errors.mjs';

const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'i18n' ? [] : walk(p);
  return p.endsWith('.mjs') ? [p] : [];
});

const lit = /new (?:HttpError|CoreError)\([^,]+,\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
// Тексты в тернарниках и переменных регулярка выше не видит — ищем ключи и просто как строки
const source = new Map();
let all = '';
for (const f of [...walk('server'), ...walk('cores')]) {
  const s = fs.readFileSync(f, 'utf8');
  all += s;
  for (const m of s.matchAll(lit)) source.set(m[1].slice(1, -1).replace(/\$\{[^}]*\}/g, '{}'), f);
}
const keys = new Set(ERROR_KEYS);
const plain = (k) => k.split('{}').every((part) => all.includes(part));

console.log('В словаре, но в коде не найдено:');
for (const k of ERROR_KEYS) if (!source.has(k) && !plain(k)) console.log('  ', k);
console.log('\nВ коде, без перевода:');
for (const [k, f] of source) if (!keys.has(k)) console.log('  ', path.relative('.', f), '—', k);
