// Переходник: карточка ядра carsensor (cores/carsensor, Япония) → карточка пайплайна CarouselCar.
//
// Ядро уже перевело японское в слова словаря слайдов («Automatic», «Hybrid», «SUV», «Black») —
// здесь только раскладка: цена, опции по корзинам, роли фото.
//
// Решения (12.10): цена — «車両本体価格», цена самой машины без японских сборов за регистрацию
// (её и показывает JSON-LD сайта); в доллары её переводит сервер по курсу дня (server/carsensor.mjs),
// и дальше слайд и ролик считают её как доллары che168. Оценка «カーセンサー認定» и история в рекламу
// не идут, как и лист осмотра Китая (решение владельца 11.10) — history: null, слайд истории выключен.
import {CARSENSOR_PREFIX} from './encarLink.js';
import {optionRank} from './che168Car.js';

/** Слайды, которых у японской машины нет: истории (оценка в рекламу не идёт) */
export const CARSENSOR_SKIP_SLIDES = ['history'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Есть почти у каждой японской машины — на слайд в последнюю очередь (сверх общего списка che168)
const MUNDANE = /power steering|^abs$|air conditioning|etc toll|stability control|safety support|music player|immobilizer|power windows|start\/stop|keyless entry|turbocharged/i;
const rank = (en) => (MUNDANE.test(en) ? 999 : optionRank(en));

/**
 * Опции → три корзины слайдов. Группы Carsensor: 安全装備 → safety, 快適装備 и インテリア → comfort,
 * エクステリア и 福祉車両装備 → other. Важность — по английскому, показ — на языке профиля
 * (ядро отдаёт оба). Без перевода японское на слайд не пускаем.
 */
const optionsOf = (local, en) => {
  const bins = {comfort: [], safety: [], other: []};
  const list = Array.isArray(local) ? local : [];
  list.forEach((o, i) => {
    const name = str(o?.name);
    const enName = str(en?.[i]?.name) || name;
    if (!name || /[぀-ヿ一-鿿]/.test(name)) return;
    const bin = o.group === 'safety' ? 'safety' : o.group === 'comfort' || o.group === 'interior' ? 'comfort' : 'other';
    bins[bin].push({name, rank: rank(enName)});
  });
  const pick = (b) => bins[b].sort((a, z) => a.rank - z.rank).map((x) => x.name);
  const out = {comfort: pick('comfort'), safety: pick('safety'), other: pick('other')};
  return {...out, total: out.comfort.length + out.safety.length + out.other.length};
};

/**
 * Роли фото. Ракурс каждому кадру подписал сам дилер (data-categoryname, ядро — photos в parse.mjs),
 * поэтому выбираем по ракурсу, а не по номеру. Главное фото объявления (main) — с плашкой дилера
 * у всех проверенных (4 из 4, 12.10), ядро пометило его ad: false. Обложка — перед ¾ из галереи.
 * Кадров машины без подписи нет совсем (дилер ничего не подписал) — берём неподписанные по
 * порядку, и лишь в самом конце главное: лучше машина с чужой плашкой, чем пустой слайд.
 */
export const carsensorPhotoRoles = (photos) => {
  const list = (Array.isArray(photos) ? photos : []).filter((p) => typeof p?.url === 'string' && p.url);
  const ad = list.filter((p) => p.ad);
  const by = (...angles) => {
    for (const a of angles) { const p = ad.find((x) => x.angle === a); if (p) return p.url; }
    return null;
  };
  const fallback = [...list.filter((p) => !p.ad && p.category === 'unknown'), ...list.filter((p) => p.main)].map((p) => p.url);
  const hero = by('front-34-left', 'front-34-right', 'front', 'side-left', 'side-right') ?? ad.find((p) => p.category === 'exterior')?.url ?? fallback[0] ?? null;
  const rear = by('rear-34-left', 'rear-34-right', 'rear');
  const ORDER_EXT = ['front', 'front-34-right', 'front-34-left', 'side-left', 'side-right', 'rear-34-left', 'rear-34-right', 'rear', 'headlight', 'wheel', 'roof', 'mirror'];
  const ORDER_INT = ['dashboard', 'front-seats', 'steering', 'screen', 'meter', 'gear', 'rear-seats', 'passenger-seat', 'seat-arrangement', 'ceiling'];
  const sorted = (order) => order.flatMap((a) => ad.filter((p) => p.angle === a).map((p) => p.url));
  const used = new Set([hero, rear].filter(Boolean));
  const exterior = [...new Set(sorted(ORDER_EXT))].filter((u) => !used.has(u)).slice(0, 8);
  const interior = [...new Set(sorted(ORDER_INT))].slice(0, 8);
  const taken = new Set([...used, ...exterior, ...interior]);
  return {
    hero, rear: rear ?? exterior[0] ?? null,
    interiorShot: by('front-seats', 'rear-seats') ?? interior[0] ?? null,
    dashboard: by('dashboard', 'steering') ?? interior[0] ?? null,
    exterior, interior,
    other: ad.filter((p) => !taken.has(p.url) && ['trunk', 'exhaust'].includes(p.angle)).map((p) => p.url).slice(0, 6),
  };
};

/**
 * Карточка ядра → CarouselCar.
 * @param {Record<string, any>} data — data ядра (byLang.en и язык профиля)
 * @param {string} [language] — язык постов профиля: названия опций берём на нём (en или ru)
 * @param {{jpyPerUsd?: number | null, quotedAt?: string | null}} [rate] — курс дня ¥ за $1
 * @returns {import('./types').CarouselCar}
 */
export const carFromCarsensor = (data, language = 'en', rate = {}) => {
  const en = data?.byLang?.en ?? {};
  const local = data?.byLang?.[language] ?? en;
  const c = en.car ?? {};
  const jpy = num(data?.price?.amount);
  const jpyPerUsd = num(rate?.jpyPerUsd);
  // Не округляем до сотен: клиенты вписывают круглую цену сами (решение 11.10)
  const usd = jpy && jpyPerUsd ? Math.round(jpy / jpyPerUsd) : null;
  return {
    id: `${CARSENSOR_PREFIX}${String(data?.ref ?? '').toLowerCase()}`,
    source: 'carsensor',
    origin: 'JP',
    brand: str(c.brand), model: str(c.model),
    grade: str(c.grade), trim: '',
    year: num(c.year),
    firstRegistered: str(c.regDate) || null,
    mileageKm: num(c.mileageKm) ?? num(data?.mileageKm),
    displacementCc: num(c.displacementCc),
    transmission: str(c.transmission), fuel: str(c.fuel), body: str(c.body), color: str(c.color),
    seats: num(c.seats),
    // Номер кузова Carsensor показывает только последними тремя цифрами — VIN нет; номерного знака нет
    vin: null, plate: null,
    price: jpy ? {krw: null, usd, krwToUsd: null, quotedAt: rate?.quotedAt ?? data?.fetchedAt ?? null, rateSource: 'carsensor', jpy} : null,
    history: null,
    options: optionsOf(local.options, en.options),
    photos: carsensorPhotoRoles(data?.photos),
    // Префектура латиницей («Tokyo») — точка отправления в маршруте ролика
    city: str(c.city),
  };
};
