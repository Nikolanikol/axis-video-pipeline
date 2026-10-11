// Логика без React: склейка настроек, цена, форматы, треки. Покрыта тестами (tests/unit).
import brandTheme from '../../config/brand.json';
import formats from '../../config/formats.json';
import musicLibrary from '../../config/music.json';
import type {Ad, AdProps, FormatMeta, Lot, Market, Requirement, Texts, Theme, Track} from './types';

export const BRAND: Theme = brandTheme;
export const TRACKS: Track[] = musicLibrary;
export const FORMATS = formats as FormatMeta[];
export const DEFAULT_FORMAT = FORMATS[0].id;

export const getFormat = (id?: string | null): FormatMeta => FORMATS.find((f) => f.id === id) ?? FORMATS[0];
export const storyboardFrames = (format: FormatMeta) => format.scenes.map((s) => s.preview);

// Незаполненные поля (undefined) не перекрывают рынок; null — перекрывает (например, скрыть WhatsApp)
export const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const resolveAd = ({lot, market}: AdProps): Ad => ({
  ...market,
  ...defined(lot),
  texts: {...market.texts, ...(defined(lot.texts ?? {}) as Texts)},
  music: {...market.music, ...defined(lot.music ?? {})},
});

export const themeOf = (theme?: Partial<Theme>): Theme => ({...BRAND, ...theme});

export const priceUsd = (lot: Pick<Lot, 'carPriceUsd' | 'carPriceKrw' | 'krwPerUsd'>): number | null => {
  if (lot.carPriceUsd) return lot.carPriceUsd;
  if (lot.carPriceKrw && lot.krwPerUsd) return Math.round(lot.carPriceKrw / lot.krwPerUsd);
  return null;
};

// Цена до порта = авто + фрахт
export const totalUsd = (ad: Pick<Ad, 'carPriceUsd' | 'carPriceKrw' | 'krwPerUsd' | 'freightUsd'>): number | null => {
  const car = priceUsd(ad);
  return car === null ? null : car + ad.freightUsd;
};

// Поля объявления и рынка, из которых складывается цена ролика
type PriceInput = Pick<Ad, 'carPriceUsd' | 'carPriceKrw' | 'krwPerUsd' | 'freightUsd' | 'currency' | 'priceOverride'
  | 'krwPerUnit' | 'fxCurrency' | 'krwPerUnitToday'>;

/** Курс, по которому считаем цену в валюте компании: свой из объявления, иначе сегодняшний */
export const unitRate = (ad: Pick<Ad, 'currency' | 'krwPerUnit' | 'fxCurrency' | 'krwPerUnitToday'>): number | null =>
  (ad.krwPerUnit && ad.fxCurrency === ad.currency ? ad.krwPerUnit : null) ?? ad.krwPerUnitToday ?? null;

/**
 * Цена к показу в валюте профиля, по порядку:
 *   • «Цена в ролике» руками (priceOverride) — как есть: так клиент закладывает маржу (11.10);
 *   • $ — цена авто в долларах по курсу ₩/$ объявления плюс фрахт;
 *   • ₩ — цена авто как на Encar плюс фрахт, пересчитанный по курсу объявления;
 *   • ₽, ₸, € и прочие (с 11.10) — из вон по курсу «₩ за единицу» (unitRate); без курса —
 *     черновик null, а не доллары под чужим значком. До 11.10 здесь были доллары со значком
 *     валюты, и «9 868 ₽» выдавало себя за рубли.
 * Раньше ролик всегда считал в долларах, а значок брал из профиля: у профиля с KRW выходило
 * «18 646 ₩» при цене машины 25 340 000 ₩ (нашли на раскадровке 30.09).
 * Экраны интерфейса зовут не её, а lotTotal ниже — он подмешивает поля рынка, как рендер.
 */
export const totalInCurrency = (ad: PriceInput): number | null => {
  // Цена, вписанная руками, — ровно то, что покажем: без фрахта и пересчёта по курсу
  if (ad.priceOverride) return ad.priceOverride;
  if (ad.currency === 'USD' || !ad.currency) return totalUsd(ad);
  if (ad.currency !== 'KRW') {
    // Другая валюта (₽, ₸, €…): вона → валюта по курсу объявления. Фрахт задан в долларах —
    // переводим через вону курсом ₩/$. Без курса валюты — черновик, а не доллары под ₽
    const per = unitRate(ad);
    if (!per) return null;
    const rate = ad.krwPerUsd ?? null;
    const krw = ad.carPriceKrw ?? (ad.carPriceUsd && rate ? ad.carPriceUsd * rate : null);
    if (krw === null) return null;
    return Math.round((krw + (ad.freightUsd && rate ? ad.freightUsd * rate : 0)) / per);
  }
  const rate = ad.krwPerUsd ?? null;
  // Цена в вонах: из лота, иначе из долларовой по курсу
  const car = ad.carPriceKrw ?? (ad.carPriceUsd && rate ? Math.round(ad.carPriceUsd * rate) : null);
  if (car === null) return null;
  // Фрахт задан в долларах. Без курса его не пересчитать — показываем цену без фрахта,
  // а не падаем: курс в лоте теперь подставляется сам, пустым он бывает редко
  return car + (ad.freightUsd && rate ? Math.round(ad.freightUsd * rate) : 0);
};

/**
 * Цена объявления в ролике для экранов интерфейса (форма, карточка): те же поля рынка, что
 * подмешивает resolveAd в рендере, — фрахт, валюта, курс дня. Раньше каждый экран собирал их
 * сам и забыл курс дня: при ₽ форма писала «цены нет», а ролик цену считал
 */
export const lotTotal = (lot: Lot, market: Pick<Market, 'freightUsd' | 'currency' | 'krwPerUnitToday'>, patch: Partial<Lot> = {}): number | null =>
  totalInCurrency({...lot, ...patch, freightUsd: patch.freightUsd ?? lot.freightUsd ?? market.freightUsd,
    currency: market.currency, krwPerUnitToday: market.krwPerUnitToday} as PriceInput);

// 12345 → «12 345» (Chrome ставит неразрывные пробелы — меняем на обычные)
export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ');

export const findTrack = (id?: string | null) => TRACKS.find((t) => t.id === id);

// Что лоту не хватает для формата
export const missing = (lot: Lot, format: FormatMeta): Requirement[] =>
  format.requires.filter((r) =>
    r === 'photos' ? lot.photos.length === 0
      : r === 'specs' ? lot.specs.filter(Boolean).length === 0
        : priceUsd(lot) === null && !lot.priceOverride);
