// Логика без React: склейка настроек, цена, форматы, треки. Покрыта тестами (tests/unit).
import brandTheme from '../../config/brand.json';
import formats from '../../config/formats.json';
import musicLibrary from '../../config/music.json';
import type {Ad, AdProps, FormatMeta, Lot, Requirement, Texts, Theme, Track} from './types';

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

/**
 * Цена к показу в валюте профиля. KRW — в вонах: цена авто как на Encar плюс фрахт,
 * пересчитанный по курсу лота. Любая другая валюта — прежняя цена в долларах.
 * Раньше ролик всегда считал в долларах, а значок брал из профиля: у профиля с KRW выходило
 * «18 646 ₩» при цене машины 25 340 000 ₩ (нашли на раскадровке 30.09).
 * Конвертации в евро и прочее нет: там дилер вводит своё число, и считаем его долларами.
 */
export const totalInCurrency = (ad: Pick<Ad, 'carPriceUsd' | 'carPriceKrw' | 'krwPerUsd' | 'freightUsd' | 'currency'>): number | null => {
  if (ad.currency !== 'KRW') return totalUsd(ad);
  const rate = ad.krwPerUsd ?? null;
  // Цена в вонах: из лота, иначе из долларовой по курсу
  const car = ad.carPriceKrw ?? (ad.carPriceUsd && rate ? Math.round(ad.carPriceUsd * rate) : null);
  if (car === null) return null;
  // Фрахт задан в долларах. Без курса его не пересчитать — показываем цену без фрахта,
  // а не падаем: курс в лоте теперь подставляется сам, пустым он бывает редко
  return car + (ad.freightUsd && rate ? Math.round(ad.freightUsd * rate) : 0);
};

// 12345 → «12 345» (Chrome ставит неразрывные пробелы — меняем на обычные)
export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ');

export const findTrack = (id?: string | null) => TRACKS.find((t) => t.id === id);

// Что лоту не хватает для формата
export const missing = (lot: Lot, format: FormatMeta): Requirement[] =>
  format.requires.filter((r) =>
    r === 'photos' ? lot.photos.length === 0
      : r === 'specs' ? lot.specs.filter(Boolean).length === 0
        : priceUsd(lot) === null);
