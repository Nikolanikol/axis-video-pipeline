// Разбор HTML страницы машины Carsensor в карточку ядра. Только чистые функции, без сети.
// Вёрстке не доверяем: любой блок может пропасть — всё читается регулярками по устойчивым
// приметам (JSON-LD, пары th/td, data-атрибуты галереи, классы списка опций), и ни одна функция
// не бросает на кривом HTML: нет блока — пусто и предупреждение. Что где лежит — README.md.
import {
  KANA_WORDS, romaji, brandFromSlug, modelFromSlug, BODY, FUEL, FUEL_GRADE, baseColor, prefectureEn,
  PHOTO_ROLES, OPTION_GROUPS, translateOption,
} from './dict.mjs';

// Свой разбор HTML-сущностей вместо библиотеки: ядро без зависимостей (контракт), а на страницах
// Carsensor встречаются только эти именованные и числовые («&#39;», «&#x30FC;»)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
  // Код вне Юникода («&#99999999;» в подписи дилера) — String.fromCodePoint бросил бы RangeError;
  // оставляем как есть. Найдено проверкой на подставном сайте 12.10
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(n) && n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
/** Текст без тегов, с раскрытыми сущностями, в NFKC (полноширинные «ＢＭＷ», «Ｚ» → обычные) */
export const text = html => decode(String(html ?? '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
  .normalize('NFKC').replace(/\s+/g, ' ').trim();
// «－», «-», «—», пусто — «нет данных» (так Carsensor пишет и «нет», и «не указано»)
export const clean = v => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' || /^[-－—―ー]+$/.test(s) ? null : s;
};

/** Номер машины: «AU7375484964», ссылка на страницу (ПК и телефон) или наш id «cs-au7375484964». */
export function parseRef(input) {
  const s = String(input ?? '').trim();
  const own = s.match(/^cs-([a-z]{2}\d{8,12})$/i);
  if (own) return own[1].toUpperCase();
  if (/^[A-Z]{2}\d{8,12}$/i.test(s)) return s.toUpperCase();
  // /usedcar/detail/AU7375484964/index.html, /usedcar/detail/AU7375484964/, ?BKKN=AU7375484964
  const m = s.match(/\/detail\/([A-Z]{2}\d{8,12})\b/i) || s.match(/[?&]BKKN=([A-Z]{2}\d{8,12})\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ── Числа Carsensor ──
/** «4.7万km» → 47000, «116km» → 116, «0.2万km» → 2000; «－»/«不明» → null */
export function mileageKm(v) {
  const s = clean(v)?.replace(/[,\s]/g, '');
  const m = s?.match(/^([\d.]+)(万)?km/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 10_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}
/** «419 .9 万円» (так и вёрстано — с пробелом перед дробью) → 4199000 */
export function manYen(v) {
  const m = clean(v)?.replace(/\s/g, '').match(/^([\d.]+)万円/);
  return m ? Math.round(Number(m[1]) * 10_000) : null;
}
const year = v => { const m = clean(v)?.match(/^((?:19|20)\d{2})/); return m ? Number(m[1]) : null; };
const intOf = v => { const m = clean(v)?.replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };

// ── Блоки страницы ──
/** JSON-LD: продукт (название, цена, цвет, продавец) и хлебные крошки (префектура). */
export function jsonLd(html) {
  const out = { product: null, breadcrumbs: [] };
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let v;
    try { v = JSON.parse(m[1]); } catch { continue; }
    for (const x of Array.isArray(v) ? v : [v]) {
      if (x?.['@type'] === 'Product' && !out.product) out.product = x;
      if (x?.['@type'] === 'BreadcrumbList') out.breadcrumbs = (x.itemListElement ?? []).map(i => decode(i?.item?.name ?? '')).filter(Boolean);
    }
  }
  return out;
}

/** Таблицы характеристик: пары th → td. Первое значение побеждает: «駆動方式» встречается дважды —
 *  сначала 2WD/4WD объявления, потом «前輪駆動(FF)» из каталога. */
export function specTable(html) {
  const map = new Map();
  for (const m of String(html).matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const k = text(m[1]), v = text(m[2]);
    if (k && !map.has(k)) map.set(k, v);
  }
  return map;
}

/** Адрес каталога даёт латиницу самого Carsensor: /catalog/toyota/harrier/F004/… Ищем ссылку с
 *  кодом модели этой машины (JSON-LD model, «F004») — на странице бывают ссылки на чужие модели */
export function catalogSlugs(html, modelCode) {
  const re = /\/catalog\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/([A-Z]\d{3})?/g;
  let first = null;
  for (const m of String(html).matchAll(re)) {
    if (m[1] === 'review' || m[2] === 'review') continue;
    if (modelCode && m[3] === modelCode) return { brand: m[1], model: m[2] };
    first ??= { brand: m[1], model: m[2] };
  }
  return first ?? { brand: null, model: null };
}

// data-атрибуты одного тега галереи: Carsensor пишет их то в одинарных, то в двойных кавычках
// (data-photohq='…' data-no="0"), поэтому кавычка — обратной ссылкой \2
const attrs = tag => Object.fromEntries([...tag.matchAll(/data-([a-z]+)=(['"])([\s\S]*?)\2/gi)].map(m => [m[1].toLowerCase(), decode(m[3])]));

/**
 * Фото галереи. Каждый кадр — <a> c data-photohq (адрес ~2560×1920), data-title (чьё фото:
 * «本体写真» — главное, «基本プラン» — галерея, «Ａプラン»/«Ｂプラン»/«保証» — допродажи дилера,
 * «本体動画» — видео) и data-categoryname — подпись дилера («左斜前», «運転席», «販促用画像»…).
 * Берём главное и галерею. ВАЖНО: на главном фото у всех проверенных дилеров (4 из 4, 12.10)
 * впечатана их плашка с логотипом — в рекламу его не берём, обложка — из галереи.
 */
export function photos(html) {
  const seen = new Set();
  const list = [];
  for (const m of String(html).matchAll(/<a\s[^>]*data-photohq=[^>]*>/gi)) {
    const a = attrs(m[0]);
    const title = (a.title ?? '').normalize('NFKC');
    const main = title === '本体写真';
    if (!main && title !== '基本プラン') continue;
    const url = a.photohq?.startsWith('http') ? a.photohq : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = (a.categoryname ?? '').trim();
    const [angle, category, ad] = PHOTO_ROLES[label] ?? [null, 'unknown', false];
    list.push({
      url, preview: a.photo ?? null, label: label || null,
      category, angle, ad: main ? false : ad, source: 'listing',
      ...(main ? { main: true, sticker: true } : {}),
      caption: clean(a.caption)?.slice(0, 300) ?? null,
    });
  }
  return list;
}

/** Опции: пять групп, у каждой строки отметка «есть» (класс --active). */
export function options(html) {
  const out = [];
  for (const g of String(html).matchAll(/<h3[^>]*equipmentList__title[^>]*>([\s\S]*?)<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi)) {
    const groupJa = text(g[1]);
    for (const li of g[2].matchAll(/<li\s+class="([^"]*equipmentList__item[^"]*)"[^>]*>([\s\S]*?)<\/li>/gi)) {
      const ja = decode(li[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (!ja) continue;
      const has = /--active/.test(li[1]);
      out.push({ group: OPTION_GROUPS[groupJa] ?? 'other', groupJa, ja, has, ...(translateOption(ja) ?? {}) });
    }
  }
  return out;
}

/** «カーセンサー認定» — независимая оценка (только у части машин): балл R…S, дата осмотра. */
export function certification(html) {
  // Заголовок «車両品質評価詳細情報» встречается раньше — в меню вкладок; сам блок начинается фразой
  // «この車は、カーセンサー認定評価を受けた車両です»
  const i = String(html).indexOf('カーセンサー認定評価を受けた');
  if (i < 0) return null;
  const t = text(String(html).slice(i, i + 6000));
  const score = t.match(/総合評価\s*([0-9.]+|[RS])\s*点/)?.[1] ?? null;
  if (!score) return null;
  return {
    score,
    inspectedAt: t.match(/検査日[:：]\s*(\d{4}\/\d{2}\/\d{2})/)?.[1]?.replace(/\//g, '-') ?? null,
    repairHistory: /修復歴[:：]\s*有/.test(t) ? true : /修復歴[:：]\s*無/.test(t) ? false : null,
    summary: t.match(/(内外装に[^。]*。)/)?.[1] ?? null,
  };
}

// ── Комплектация: японское название → английское ──
const KANA_RE = /[゠-ヿ]+/g;
const WORD_KEYS = Object.keys(KANA_WORDS).sort((a, b) => b.length - a.length);
/** Катакана-слово: самые длинные словарные куски слева направо, остаток — по слогам. */
function kanaToEn(word) {
  const parts = [];
  let rest = word, raw = '';
  while (rest) {
    const k = WORD_KEYS.find(w => rest.startsWith(w));
    if (k) {
      if (raw) { parts.push(romaji(raw)); raw = ''; }
      parts.push(KANA_WORDS[k]);
      rest = rest.slice(k.length);
    } else { raw += rest[0]; rest = rest.slice(1); }
  }
  if (raw) parts.push(romaji(raw));
  return parts.filter(Boolean).join(' ');
}
/** «320d xドライブ エディション ジョイプラス» → «320d xDrive Edition Joy Plus». Иероглифы
 *  («後期», «特別仕様車») — словарём, незнакомые выбрасываем: на слайде им не место. */
export function gradeToEn(ja) {
  const s = String(ja ?? '').normalize('NFKC').trim();
  if (!s) return '';
  return s.split(/\s+/).map(tok => {
    if (KANA_WORDS[tok]) return KANA_WORDS[tok];
    // «xドライブ» — латиница вплотную к катакане: «xDrive», без пробела
    // Латиница вплотную к катакане: после строчной — слитно с заглавной («xドライブ» → «xDrive»,
    // как пишет BMW), после заглавной или цифры — через пробел («PZターボ» → «PZ Turbo»,
    // «350ハイウェイスター» → «350 Highway Star»); катакана перед латиницей — тоже через пробел
    // («ティプトロニックS» → «Tiptronic S»)
    const conv = tok.replace(KANA_RE, (w, at) => {
      const en = kanaToEn(w);
      const before = tok.slice(0, at), after = tok.slice(at + w.length);
      const head = !before ? '' : /[a-z]$/.test(before) ? '' : ' ';
      const body = head === '' && before ? en.replace(/^./, c => c.toUpperCase()) : en;
      return head + body + (after && /^[A-Za-z0-9]/.test(after) ? ' ' : '');
    });
    return conv.replace(/[぀-ゟ一-鿿々]+/g, m => KANA_WORDS[m] ?? '').trim();
  }).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Комплектация из названия JSON-LD: «トヨタ ハリアー 2.5 ハイブリッド Z レザーパッケージ　禁煙　JBL…» —
 * марка, модель, комплектация через обычный пробел, дальше реклама дилера через полноширинный
 * «　». Марку и модель отрезаем по их японским названиям из того же JSON-LD (brand[0], brand[1]).
 */
export function gradeJa(name, brandJa, modelJa) {
  let s = String(name ?? '').split('　')[0].normalize('NFKC').trim();
  for (const w of [brandJa, modelJa]) {
    const n = String(w ?? '').normalize('NFKC').trim();
    if (n && s.startsWith(n)) s = s.slice(n.length).trim();
  }
  return s;
}

/**
 * Всё со страницы: общее (цена, фото, ссылки) и по-японски «как есть». Бросает, только если нет
 * основы (JSON-LD Product). Остальные части разбираются каждая в своём try (контракт, раздел 5):
 * сломалась вёрстка опций — пропадут опции, а не машина. onPartError(part, error) — о каждой такой.
 */
export function parsePage(html, ref, { onPartError } = {}) {
  const { product, breadcrumbs } = jsonLd(html);
  if (!product) throw new Error('нет JSON-LD Product');
  const safe = (part, fn, fallback) => {
    try { return fn(); } catch (e) { onPartError?.(part, e); return fallback; }
  };
  const spec = safe('specs', () => specTable(html), new Map());
  const get = k => clean(spec.get(k));
  const slugs = safe('catalog', () => catalogSlugs(html, product.model), { brand: null, model: null });
  const brandJa = clean(text(product.brand?.[0]?.name ?? '')), modelJa = clean(text(product.brand?.[1]?.name ?? ''));
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const amount = Number(offer?.price);
  // Хлебные крошки: «ハリアー・東京都の中古車» — префектура после «・»
  const pref = breadcrumbs.map(b => b.match(/・(.+?[都道府県])の中古車$/)?.[1]).find(Boolean) ?? null;
  const grade = safe('grade', () => gradeJa(product.name, brandJa, modelJa), '');

  const ja = {
    title: [brandJa, modelJa, grade].filter(Boolean).join(' '),
    brand: brandJa, model: modelJa, grade: grade || null,
    year: year(get('年式(初度登録年)')), yearRaw: get('年式(初度登録年)'),
    mileage: get('走行距離'), body: get('ボディタイプ'), drive: get('駆動方式'), color: get('色'),
    steering: get('ハンドル'), transmission: get('ミッション'), displacement: get('排気量'),
    seats: get('乗車定員'), engine: get('エンジン種別'), doors: get('ドア数'), fuelGrade: get('使用燃料'),
    dimensions: get('車体寸法'), weight: get('車両重量'), released: get('発売年月'),
    inspection: get('車検'), maintenance: get('法定整備'), warranty: get('保証'),
    repairHistory: get('修復歴'), oneOwner: get('ワンオーナー'), nonSmoking: get('禁煙車'),
    prefecture: pref, shop: clean(offer?.seller?.name ?? '')?.normalize('NFKC') ?? null,
  };
  const fuelJa = ja.engine ?? '';
  const en = {
    title: null,
    brand: brandFromSlug(slugs.brand) ?? ja.brand,
    model: modelFromSlug(slugs.model, slugs.brand) ?? ja.model,
    grade: safe('grade', () => gradeToEn(grade), '') || null,
    year: ja.year,
    regDate: clean(spec.get('年式(初度登録年)'))?.match(/^(\d{4})/)?.[1] ?? null,
    mileageKm: mileageKm(ja.mileage),
    displacementCc: intOf(ja.displacement),
    fuel: FUEL[fuelJa] ?? FUEL_GRADE[ja.fuelGrade ?? ''] ?? null,
    // «フロアMTモード付CVT», «インパネ7AT», «フロア6MT»: механика — только чистая «MT» без «モード付»
    transmission: ja.transmission ? (/MT/.test(ja.transmission) && !/モード付|AT|CVT|DCT/.test(ja.transmission) ? 'Manual' : 'Automatic') : null,
    body: BODY[ja.body?.normalize('NFKC') ?? ''] ?? null,
    drive: ja.drive?.includes('4WD') ? 'AWD' : ja.drive?.includes('2WD') ? '2WD' : null,
    color: baseColor(ja.color),
    seats: intOf(ja.seats), doors: intOf(ja.doors),
    steering: ja.steering === '右' ? 'Right' : ja.steering === '左' ? 'Left' : null,
    city: prefectureEn(pref),
  };
  en.title = [en.brand, en.model, en.grade].filter(Boolean).join(' ');

  return {
    common: {
      urls: { ad: `https://www.carsensor.net/usedcar/detail/${ref}/index.html` },
      ids: { brandSlug: slugs.brand, modelSlug: slugs.model, catalogModel: product.model ?? null, shopUrl: offer?.seller?.url ?? null },
      // Цена машины («車両本体価格») — без японских сборов за регистрацию; «支払総額» — с ними.
      // Для вывоза нужна первая (машину не регистрируют в Японии). Нет цены («応談», «ASK») — null
      price: {
        amount: Number.isFinite(amount) && amount > 0 ? amount : null, currency: 'JPY',
        totalJpy: manYen(get('支払総額（税込）') ?? get('支払総額(税込)')),
      },
      mileageKm: en.mileageKm,
      photos: safe('photos', () => photos(html), []),
      repairHistory: ja.repairHistory === 'なし' ? false : ja.repairHistory === 'あり' ? true : null,
      certification: safe('certification', () => certification(html), null),
    },
    ja, en,
    options: safe('options', () => options(html), []),
  };
}
