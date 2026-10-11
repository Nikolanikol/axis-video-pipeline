// Переходник: карточка ядра che168 (cores/che168, Китай) → карточка пайплайна CarouselCar.
//
// Стандарт — CarouselCar (src/shared/types.ts): по ней рисуют карусели и собирается объявление
// ролика. Ядро отдаёт данные Autohome как есть, здесь — приведение к словарю, который уже
// понимают слайды и ролики: топливо, коробка, кузов, цвет — теми же английскими словами, что у
// Encar («Automatic», «Gasoline», «Sedan»). Их переводит общий словарь (src/carousel/i18n), и у
// машины из Китая в карусели то же «Автомат», что у корейской. Слово, которого словарь не знает,
// остаётся английским — лучше, чем длинное «8-ступенчатая коробка передач с ручным режимом».
//
// Решения владельца 11.10: цена — долларовая цена международной версии как есть (маржа — «Ценой в
// ролике»); история и лист осмотра в рекламе не показываются — history: null, слайд истории
// выключен (CHE168_SKIP_SLIDES).
import {CHE168_PREFIX} from './encarLink.js';

/** Слайды, которых у машины из Китая нет: истории (осмотр в рекламу не идёт, решение 11.10) */
export const CHE168_SKIP_SLIDES = ['history'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Топливо: у che168 «Gasoline + 48V Mild Hybrid System» — это бензиновая машина с подкачкой, не
// гибрид в обычном смысле; так и пишем «Бензин». Plug-in и полноценный гибрид — «Hybrid».
export const fuelOf = (en) => {
  const s = str(en).toLowerCase();
  if (!s) return '';
  if (/pure electric|^electric|\bev\b/.test(s)) return 'Electric';
  if (/plug-in|phev|extended range|range extender/.test(s)) return 'Hybrid';
  if (/mild hybrid/.test(s)) return s.includes('diesel') ? 'Diesel' : 'Gasoline';
  if (/hybrid/.test(s)) return 'Hybrid';
  if (/diesel/.test(s)) return 'Diesel';
  if (/gasoline|petrol/.test(s)) return 'Gasoline';
  return str(en);
};

// Коробка: «8-speed automatic with manual shift mode», «7-speed wet dual-clutch», «CVT»,
// «6-speed manual/automatic transmission» — всё, кроме чистой механики, для покупателя «Автомат»
export const transmissionOf = (en) => {
  const s = str(en).toLowerCase();
  if (!s) return '';
  if (/manual/.test(s) && !/automatic|auto|dual-clutch|dct|cvt|shift mode/.test(s)) return 'Manual';
  return 'Automatic';
};

// Кузов: у Autohome «Hardtop Coupe», «Hardtop Convertible», «MPV»; SUV — как есть
export const bodyOf = (en) => {
  const s = str(en).toLowerCase();
  if (!s) return '';
  if (/suv|crossover/.test(s)) return 'SUV';
  if (/convertible|cabrio|roadster/.test(s)) return 'Convertible';
  if (/coupe|fastback/.test(s)) return 'Coupe';
  if (/mpv|minivan|van/.test(s)) return 'MiniVan';
  if (/hatch/.test(s)) return 'Hatchback';
  if (/wagon|estate/.test(s)) return 'Wagon';
  if (/pickup/.test(s)) return 'Pickup Truck';
  if (/sedan/.test(s)) return 'Sedan';
  return str(en);
};

// Цвет: «Dark Gray», «Light Blue» → основной цвет из словаря слайдов
const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green', 'Brown', 'Yellow', 'Beige', 'Gold', 'Orange', 'Purple'];
export const colorOf = (en) => {
  const s = str(en);
  if (!s) return '';
  if (/grey/i.test(s)) return 'Gray';
  return COLORS.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(s)) ?? s;
};

// Комплектация у che168 всегда начинается с модельного года: «2018 530Li Leading M Sport Package»
const yearOf = (trim, modelYear) => {
  const m = str(trim).match(/^(19|20)\d{2}\b/) || str(modelYear).match(/^(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
};

/** Параметр по английскому названию из таблицы specs (числа берём из en: названия стабильнее) */
const spec = (specs, re) => {
  for (const g of Array.isArray(specs) ? specs : []) {
    for (const i of g?.items ?? []) if (re.test(i?.name ?? '')) return i.value;
  }
  return null;
};

// Опции: «●» — в базе, «○» — за доплату (не наша — не пишем), «-» — нет. Составные «Перед ●/Зад -»
// считаем: часть есть. Группы Autohome → три корзины слайдов.
// На слайд идут первые пять, а Autohome начинает со стеклоподъёмников и защиты от защемления —
// поэтому сначала то, что продаёт машину (по английскому названию, оно стабильнее перевода)
const SAFETY = /safety/i;
const COMFORT = /seat|air condition|sunroof|glass|audio|steering|connectivity|charging/i;
const NOTABLE = [
  /panoram|sunroof|moonroof/i, /ventilat/i, /massage/i, /heated.*seat|seat.*heat/i, /memory/i,
  /head-?up|hud/i, /360|panoramic (view|camera)|surround view/i, /adaptive cruise|full-speed/i,
  /lane (keep|centering)|lane departure/i, /blind spot/i, /automatic emergency|aeb|active braking/i,
  /night vision/i, /air suspension/i, /matrix|adaptive (head|light)|laser/i, /led head/i,
  /keyless|smart key/i, /power (lift|tail)gate|electric tailgate/i, /wireless charg/i,
  /carplay|android auto/i, /premium|harman|bose|burmester|bowers|meridian|b&o|surround sound/i,
  /leather/i, /dual-zone|tri-zone|four-zone|automatic (climate|air)/i, /parking assist|auto(matic)? park/i,
  /reversing camera|rear camera/i, /cruise/i, /power-adjustable.*seat|power seat|electric seat/i,
  /full lcd|digital (instrument|cluster)/i, /navigation/i, /paddle/i, /multi-function steering/i,
  /auto hold/i, /parking sensor/i, /rear (independent )?climate|rear air/i,
];
// Есть почти у всех — на слайд в последнюю очередь
const MUNDANE = /power windows|anti-pinch|wiper|cup holder|immobilizer|central locking|privacy glass|armrest|start\/stop|hill start|roadside|isofix|adjustable headlight height/i;
const rank = (en) => {
  if (MUNDANE.test(en)) return NOTABLE.length + 1;
  const i = NOTABLE.findIndex((re) => re.test(en));
  return i < 0 ? NOTABLE.length : i;
};
/** Важность опции по английскому названию (меньше — важнее) — ею же сортирует Carsensor (carsensorCar.js) */
export const optionRank = rank;
const optionsOf = (groupsLocal, groupsEn) => {
  const bins = {comfort: [], safety: [], other: []};
  const list = Array.isArray(groupsLocal) ? groupsLocal : [];
  list.forEach((g, gi) => {
    // Корзину и важность решаем по-английски; показываем на языке профиля. Порядок групп и
    // строк у языков один (ядро берёт их одним запросом на язык из той же комплектации)
    const ge = groupsEn?.[gi];
    const enGroup = str(ge?.group) || str(g?.group);
    const bin = SAFETY.test(enGroup) ? 'safety' : COMFORT.test(enGroup) ? 'comfort' : 'other';
    (g?.items ?? []).forEach((i, ii) => {
      if (!str(i?.value).includes('●') || !str(i?.name)) return;
      const enName = str(ge?.items?.[ii]?.name) || str(i.name);
      bins[bin].push({name: str(i.name), rank: rank(enName)});
    });
  });
  // Сортировка устойчивая: равные по важности остаются в порядке Autohome
  const pick = (b) => bins[b].sort((a, z) => a.rank - z.rank).map((x) => x.name);
  const out = {comfort: pick('comfort'), safety: pick('safety'), other: pick('other')};
  return {...out, total: out.comfort.length + out.safety.length + out.other.length};
};

/**
 * Роли фото для слайдов и ролика. Ядро размечает каждое фото (cores/che168, photoRoles):
 *  • студийный набор Autohome (photoSet: 'studio') — ракурс точный, по номеру кадра. Обложка — «перед»
 *    (№3), а не «перед ¾» (№1): на №1 наклейка площадки с иероглифами. Ключ, ручки, шина, кнопки
 *    помечены ad: false — в рекламу не идут;
 *  • дилерский (photoSet: 'dealer') — ракурсов нет, только догадка ядра: первые кадры — кузов.
 *    Остальное — по положению, владелец смотрит слайды перед публикацией.
 * Распознавание по картинке отложено ради бесплатности (варианты — cores/che168/README.md «Фото»).
 */
export const che168PhotoRoles = (photos, photoSet) => {
  const list = (Array.isArray(photos) ? photos : []).filter((p) => typeof p?.url === 'string' && p.url);
  if (photoSet === 'studio') {
    const by = (angle) => list.find((p) => p.angle === angle)?.url ?? null;
    const many = (...angles) => angles.map(by).filter(Boolean);
    return {
      hero: by('front'), rear: by('rear-34') ?? by('rear'),
      interiorShot: by('front-seats'), dashboard: by('dashboard'),
      exterior: many('front', 'rear-34', 'rear', 'headlight', 'wheel'),
      interior: many('dashboard', 'front-seats', 'steering', 'screen', 'rear-seats', 'sunroof', 'gear', 'driver-view'),
      other: many('trunk'),
    };
  }
  const usable = list.filter((p) => p.ad !== false);
  const u = usable.map((p) => p.url);
  const outside = usable.filter((p) => p.category === 'exterior').map((p) => p.url);
  const n = u.length;
  const rest = u.filter((x) => !outside.includes(x));
  const interior = rest.slice(0, 6);
  const taken = new Set([...outside, ...interior]);
  return {
    hero: outside[0] ?? u[0] ?? null,
    rear: outside[1] ?? u[1] ?? null,
    interiorShot: interior[1] ?? interior[0] ?? null,
    dashboard: interior[0] ?? null,
    exterior: outside.slice(1), interior,
    other: n ? u.filter((x) => !taken.has(x)).slice(0, 6) : [],
  };
};

/**
 * Карточка ядра → CarouselCar.
 * @param {Record<string, any>} data — data из ответа ядра GET /v1/car (с byLang.en и языком профиля)
 * @param {string} [language] — язык постов профиля: названия опций берём на нём (ядро отдаёт их
 *   переведёнными самим Autohome), остальное — английскими словами словаря слайдов
 * @returns {import('./types').CarouselCar}
 */
export const carFromChe168 = (data, language = 'en') => {
  const en = data?.byLang?.en ?? {};
  const local = data?.byLang?.[language] ?? en;
  const c = en.car ?? {};
  const brand = str(c.brand);
  const series = str(c.series);
  // Серия то с маркой («BMW 5 Series»), то без («Levante») — модель без марки
  const model = brand && series.toLowerCase().startsWith(brand.toLowerCase()) ? series.slice(brand.length).trim() : series;
  const trim = str(c.trim);
  const displacementMl = Number(spec(en.specs, /^Displacement \(mL\)/i));
  const usd = num(data?.price?.amount);
  return {
    id: `${CHE168_PREFIX}${data?.ref}`,
    source: 'che168',
    origin: 'CN',
    brand, model: model || series,
    // grade — комплектация без года впереди («530Li Leading M Sport Package»); trim у Encar —
    // поколение, у che168 его нет
    grade: trim.replace(/^(19|20)\d{2}\s+/, ''), trim: '',
    year: yearOf(trim, c.modelYear),
    firstRegistered: str(c.regDate).replace('.', '-') || null,
    mileageKm: num(c.mileageKm) ?? num(data?.mileageKm),
    displacementCc: Number.isFinite(displacementMl) && displacementMl > 0 ? displacementMl : null,
    transmission: transmissionOf(c.transmission),
    fuel: fuelOf(c.fuel),
    body: bodyOf(c.body),
    color: colorOf(c.color),
    seats: num(c.seats),
    // Полного VIN Autohome не отдаёт — только со звёздочками; номерного знака нет
    vin: null, plate: null,
    // Цена в долларах, вон нет: слайд и ролик пересчитают доллары в валюту профиля по курсу дня
    price: usd ? {krw: null, usd, krwToUsd: null, quotedAt: data?.fetchedAt ?? null, rateSource: 'che168'} : null,
    history: null,
    options: optionsOf(local.options, en.options),
    photos: che168PhotoRoles(data?.photos, data?.photoSet),
    // Город машины — точка отправления в маршруте ролика (объявление подставляет его в origin)
    city: str(c.city),
  };
};
