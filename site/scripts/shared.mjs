// Перед сборкой витрины: общие файлы из приложения и свежие условия.
//
// Витрина берёт из приложения только данные (решение 17.11, docs/projects/site/decisions.md):
// логотипы KOK, логотипы площадок, образцы роликов и каруселей. Копируем их в public/shared,
// а не ссылаемся на app.axis-beauty.com: витрина обязана открываться, даже когда приложение лежит.
//
// Условия (подарок, цены, тарифы) — из публичного GET /api/public/offer боевого приложения:
// тарифы правит админка, и при каждой сборке витрина берёт актуальные. Не ответило — остаётся
// прошлый снимок src/snapshot/offer.json (не data/ — её игнорирует .gitignore проекта) (он в репозитории), сборка не падает.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(site);
const out = path.join(site, 'public', 'shared');

await fs.rm(out, {recursive: true, force: true});
for (const [from, to] of [
  ['public/kok', 'kok'],
  ['public/sources', 'sources'],
  ['public/landing/video', 'landing/video'],
  ['public/landing/carousel', 'landing/carousel'],
]) {
  await fs.cp(path.join(repo, from), path.join(out, to), {recursive: true});
}

// Браузеры сами просят /favicon.ico в корне, даже при значке в <head> — тот же файл, что у приложения
await fs.copyFile(path.join(repo, 'public', 'favicon.ico'), path.join(site, 'public', 'favicon.ico'));

const API = process.env.KOK_OFFER_URL ?? 'https://app.axis-beauty.com/api/public/offer';
const file = path.join(site, 'src', 'snapshot', 'offer.json');
try {
  const r = await fetch(API, {signal: AbortSignal.timeout(8000)});
  const o = await r.json();
  if (!o?.signup || !o?.costs || !Array.isArray(o?.packs)) throw new Error('ответ не похож на условия');
  // Берём только то, что показывает витрина: реквизиты владельца на страницы не выводим (PR #41)
  const keep = {
    signup: o.signup,
    costs: {ads: o.costs.ads, carousels: o.costs.carousels, offers: o.costs.offers},
    packs: o.packs.map(({id, title, credits, price_usd, valid_days, kind, sort}) => ({id, title, credits, price_usd, valid_days, kind, sort})),
    contacts: {telegram: o.contacts?.telegram ?? '', instagram: o.contacts?.instagram ?? ''},
  };
  await fs.writeFile(file, JSON.stringify(keep, null, 2) + '\n');
  console.log('условия: свежие с', API);
} catch (e) {
  console.warn(`условия: ${API} не ответил (${e.message}) — остаётся прошлый снимок`);
}
