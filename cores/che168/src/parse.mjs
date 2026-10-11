// Разбор ответов API che168 в карточку ядра. Только чистые функции, без сети.
// Ответу не доверяем: любое поле может пропасть или сменить тип (строка → объект, массив → null),
// поэтому всё читается через obj/arr/clean/num и ни одна функция не бросает TypeError.
// Поля и что они значат — README.md.

export const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const arr = v => (Array.isArray(v) ? v : []);

// «-», «--», пустая строка и пробелы — «нет данных» (в параметрах встречаются оба вида прочерка).
// Названия приходят с ведущим пробелом (« BMW»). Не строка и не число — тоже «нет данных».
export const clean = v => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s === '' || /^-+$/.test(s) ? null : s;
};
export const num = v => {
  const s = clean(v);
  if (s == null || !/\d/.test(s)) return null;
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Номер машины из ссылки любого вида или голого числа; null — не нашли. */
export function parseInfoId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{5,12}$/.test(s)) return s;
  const m = s.match(/[?&#]infoid=(\d{5,12})/i) || s.match(/\/detail\/(\d{5,12})/) || s.match(/\/(\d{5,12})\.html/);
  return m ? m[1] : null;
}

/**
 * Оригинал фото. В API адрес вида …/1400x0_c42_autohomecar__XXX.jpg.webp — уменьшенная webp-копия.
 * Нужна приставка «0x0_»: так CDN отдаёт исходник дилера. Без приставки — тот же размер, но
 * ПЕРЕЖАТЫЙ заново (таблица квантования JPEG 13–16 против 2–6 у «0x0_», файл на 30–150% легче —
 * за счёт деталей). На видео пережатое рябит. Проверено на 6 машинах 11.10.
 * Размер — какой загрузил дилер (2048×1536, 1601×1200, 1024×768; из приложения дилера —
 * 1024 по ширине при любых пропорциях): больше не получить.
 */
export const originalPhotoUrl = url => String(url).replace(/\/(\d+x\d+_[^/]*?)?(autohomecar__)/, '/0x0_$2').replace(/\.webp(\?.*)?$/, '');

// ── Роли фото ─────────────────────────────────────────────────────────────────────────────
// Ракурсы API не размечает: группа фото одна и без названия (проверено на 40 машинах 11.10).
// Распознавание моделями отложено ради бесплатности (варианты на будущее — README «Фото»).
// Бесплатно можно так:
//  • «студийный» набор — экспортные площадки Autohome снимают каждую машину в одном белом зале
//    ровно 24 кадрами в постоянном порядке (сверено на 9 машинах двух площадок): роль по номеру
//    точная. Узнаём по дилеру и числу фото; новая такая площадка — в STUDIO_DEALERS или
//    переменную CHE168_STUDIO_DEALERS через запятую;
//  • дилерский набор — порядок свой: первые кадры почти всегда кузов, дальше вперемешку.
//    Это догадка по положению (source: 'position'), а не знание.
const STUDIO_DEALERS = new Set(['466721', '478339', ...String(process.env.CHE168_STUDIO_DEALERS || '').split(',').map(s => s.trim()).filter(Boolean)]);
const STUDIO_SIZE = 24;
// [ракурс, категория, годится для рекламы]. №1 — перед ¾, но с наклейкой площадки
// («保实表 10年包退», «优信 | 国际车») — в рекламу не берём, обложка — №3
const STUDIO_ORDER = [
  ['front-34', 'exterior', false], ['rear-34', 'exterior', true], ['front', 'exterior', true], ['rear', 'exterior', true],
  ['dashboard', 'interior', true], ['engine', 'engine', false], ['headlight', 'detail', true], ['door-open', 'interior', false],
  ['door-panel', 'detail', false], ['front-seats', 'interior', true], ['steering', 'interior', true], ['screen', 'interior', true],
  ['gear', 'interior', true], ['sunroof', 'interior', true], ['rear-seats', 'interior', true], ['trunk', 'detail', true],
  ['wheel', 'detail', true], ['door-handle', 'detail', false], ['key', 'detail', false], ['seat-detail', 'detail', false],
  ['controls', 'detail', false], ['driver-view', 'interior', true], ['rear-seats-side', 'interior', false], ['tire', 'detail', false],
];
// Сколько первых кадров дилерского набора считаем кузовом (по образцам 11.10: 3–5)
const DEALER_EXTERIOR_HEAD = 4;

/**
 * Роли фото: category — exterior | interior | engine | detail | unknown (словарь контракта),
 * angle — ракурс (только у студийных), ad — годится ли для рекламы, source — studio | position.
 * @returns {{set: 'studio' | 'dealer', photos: object[]}}
 */
export function photoRoles(photos, dealerId) {
  const studio = photos.length === STUDIO_SIZE && STUDIO_DEALERS.has(String(dealerId ?? ''));
  return {
    set: studio ? 'studio' : 'dealer',
    photos: photos.map((p, i) => {
      if (studio) {
        const [angle, category, ad] = STUDIO_ORDER[i];
        return { ...p, category, angle, ad, source: 'studio', ...(i === 0 ? { sticker: true } : {}) };
      }
      return { ...p, category: i < DEALER_EXTERIOR_HEAD ? 'exterior' : 'unknown', angle: null, ad: true, source: 'position' };
    }),
  };
}

// carname = марка + серия + комплектация, но серия то начинается с марки («BMW 5 Series»,
// «Subaru BRZ»), то нет («Levante», «Tiggo 8», «Kodiaq») — отсюда «BMW BMW…» и «Levante…» без
// марки. Собираем сами: марку добавляем, только если её нет в начале серии.
function title(c) {
  const brand = clean(c.brandname), series = clean(c.seriesname), trim = clean(c.specname);
  const head = series && brand && !series.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${series}` : series ?? brand;
  return [head, trim].filter(Boolean).join(' ') || clean(c.carname);
}

/** Основная карточка на одном языке. Без неё машины нет — ошибку разбора наружу бросает index. */
export function parseCar(carinfo) {
  const c = obj(carinfo);
  return {
    title: title(c),
    brand: clean(c.brandname),
    series: clean(c.seriesname),
    trim: clean(c.specname),            // всегда начинается с модельного года: «2018 530Li…»
    modelYear: clean(c.yearname),       // «год модели» производителя, 2019.09
    regDate: clean(c.regdate),          // первая регистрация, 2021.02
    productionDate: clean(c.producedate)?.slice(0, 10) ?? null,
    mileageKm: num(c.mileage),
    fuel: clean(c.fuelname),
    engine: clean(c.engine),            // «2.0T 300hp L4»; у электро null
    transmission: clean(c.gearbox),
    drive: clean(c.drivingmode),
    steering: clean(c.steering),
    body: clean(c.structure),
    class: clean(c.level),
    seats: num(c.setcount),
    doors: num(c.structuredoor),
    color: clean(c.color),
    dimensionsMm: clean(c.dimension),   // Д*Ш*В
    curbWeightKg: num(c.curbweight),
    city: clean(c.cname),
    vinMasked: clean(c.vincode),        // API отдаёт VIN со звёздочками, полного нет
    remark: clean(c.remark),
  };
}

/** Общее для всех языков: цена, сборы, фото, ссылки, id. */
export function parseCommon(carinfo, ref) {
  const c = obj(carinfo);
  const dealer = clean(c.dealeid);
  const { set: photoSet, photos } = photoRoles(arr(c.catepiclist).flatMap(g => arr(obj(g).list).filter(u => typeof u === 'string' && u).map(u => ({
    url: originalPhotoUrl(u),
    preview: u,
  }))), dealer);
  return {
    urls: {
      global: `https://global.che168.com/en/detail/${ref}`,
      cn: dealer ? `https://www.che168.com/dealer/${dealer}/${ref}.html` : null,
    },
    ids: { brandid: c.brandid ?? null, seriesid: c.seriesid ?? null, specid: c.specid ?? null, dealerid: c.dealeid ?? null, cityid: c.cid ?? null },
    // Цена международной версии — в долларах и НЕ равна цене дилера на китайском сайте
    // (BMW 60154824: $17 800 здесь, ¥116 800 там). Решено 11.10: берём её как есть.
    price: { amount: num(c.price), currency: 'USD', exportFee: num(c.export_fee), portFee: num(c.port_fee) },
    mileageKm: num(c.mileage),
    photoSet,                           // studio — роли точные (по номеру), dealer — догадка по положению
    photos,
    certified: c.certification_status === 1 && !!clean(c.report_url),
    reportUrl: clean(c.report_url),
  };
}

function groups(list, itemsKey, mapItem) {
  return arr(list).map(g => ({
    group: clean(obj(g).name),
    items: arr(obj(g)[itemsKey]).map(x => mapItem(obj(x))).filter(x => x.name && x.value != null),
  })).filter(g => g.items.length);
}

/** Технические параметры (specparam). Цена новой в ¥ — отсюда же. */
export function parseSpecs(specparam) {
  const specs = groups(obj(specparam).paramtypeitems, 'paramitems', p => ({ name: clean(p.name), value: clean(p.value) }));
  const newPriceCny = num(specs.flatMap(g => g.items).find(p => /\(¥\)/.test(p.name))?.value);
  return { specs, newPriceCny };
}

// Опции: «●» — в базе, «○» — за доплату, «-» — нет. Бывают составные: «Перед ●/Зад -».
export function parseOptions(specconfig) {
  return groups(obj(specconfig).configtypeitems, 'configitems', o => {
    const v = obj(arr(o.valueitems)[0]);
    const sub = arr(v.sublist).map(s => clean(obj(s).name ?? obj(s).subname ?? obj(s).value)).filter(Boolean);
    return { name: clean(o.name), value: clean(v.value), ...(sub.length ? { sub } : {}) };
  });
}

// Лист осмотра Autohome (делает 查博士 / chaboshi). ВАЖНО: getcarreport отдаёт 95 точек проверки
// (detectionList) для любого номера, даже несуществующего, — это шаблон «что смотрят», а не
// результат. Настоящий отчёт есть только у сертифицированных машин (certified в parseCommon).
// Категории: серьёзное ДТП (точки 401xxx — лонжероны, стойки, рамка радиатора), наводнение
// (402xxx), пожар (403xxx). Находка (faultList) — какая точка (trdid) и что с ней (showname:
// «Деформация», «Изменение цвета»…); одна находка может прийти дважды. Фото находок (faultPicList) —
// static.chaboshi.cn, привязаны к точке по trdid, адреса повторяются; trdid 0 — общий снимок.
// Проходка 11.10: Subaru BRZ 59462519 — 4 деформации силовых элементов, Evoque 59881962 —
// изменение цвета коврика. В рекламе осмотр НЕ показываем (решение 11.10) — данные для дилера.
export function parseInspection(report, { reportUrl }) {
  const r = obj(report);
  const points = arr(r.detectionList).map(obj);
  const pics = arr(r.faultPicList).map(obj);
  const pointById = new Map(points.map(p => [p.trdid, p]));
  const photosOf = id => [...new Set(pics.filter(f => f.trdid === id).map(f => clean(f.detectionurl)).filter(Boolean))];

  const seen = new Set();
  const faults = [];
  for (const f of arr(r.faultList).map(obj)) {
    if (f.trdid == null && !clean(f.showname) && !clean(f.fname)) continue;   // пустая запись — не находка
    const key = `${f.trdid}|${f.showname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pt = obj(pointById.get(f.trdid));
    faults.push({
      pointId: f.trdid ?? null,
      categoryId: pt.trid ?? null,
      point: clean(pt.cshowname) ?? clean(pt.trdname),
      defect: clean(f.showname) ?? clean(f.fname),
      photos: photosOf(f.trdid),
    });
  }

  return {
    reportUrl,
    clean: faults.length === 0,         // итог для пайплайна: нет находок ни в одной категории
    categories: arr(r.classList).map(obj).map(k => ({
      id: k.trid ?? null,
      name: clean(k.showname) ?? clean(k.trname),
      pointsChecked: points.filter(p => p.trid === k.trid).length,
      faults: faults.filter(f => f.categoryId === k.trid).length,
    })),
    pointsChecked: points.length,
    faults,
    photos: [...new Set(pics.map(f => clean(f.detectionurl)).filter(Boolean))],
    points: points.map(p => ({ id: p.trdid ?? null, categoryId: p.trid ?? null, name: clean(p.cshowname) ?? clean(p.trdname), nameZh: clean(p.trdname) })),
  };
}
