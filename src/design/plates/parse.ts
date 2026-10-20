// Разбор строки факта для подач «Журнальная строка», «Крупные цифры» и «С иконками» (20.10).
// У фактов ролика нет типа — это готовые строки («67 842 км», «5,0 л · бензин», «Автомат · красный»,
// строки истории), поэтому и число, и иконку узнаём по самому тексту, на русском и английском.
import {Calendar, CircleDot, Cog, Fuel, Gauge, ShieldCheck, Users, Zap, type LucideIcon} from 'lucide-react';

type Icon = LucideIcon;

// Порядок важен: «5,0 л · бензин» — топливо, хотя в нём есть число; электро — до топлива.
// Конец слова — (?!\p{L}), а не \b: в JS \b знает только латиницу, и «67 842 км» не узнавался бы
const ICONS: [RegExp, Icon][] = [
  [/(\d\s*(км|km|mi)(?!\p{L}))|пробег|mileage/iu, Gauge],
  [/электр|electric|(?<!\p{L})ev(?!\p{L})/iu, Zap],
  [/бензин|дизел|гибрид|газ|petrol|gasoline|diesel|hybrid|lpg|\d[.,]\d\s*(л|l)(?!\p{L})/iu, Fuel],
  [/автомат|механ|робот|вариатор|automatic|manual|cvt|dct|коробк|transmission/iu, Cog],
  [/владел|owner/iu, Users],
  [/дтп|авари|страхов|случа|accident|insurance|claim|history|истори/iu, ShieldCheck],
  [/^\s*(19|20)\d{2}\s*(г\.?|год)?\s*$/iu, Calendar],
];

/** Иконка факта; не узнали — нейтральная точка, а не случайный значок */
export const factIcon = (value: string): Icon => ICONS.find(([re]) => re.test(value))?.[1] ?? CircleDot;

/**
 * «67 842 км» → {number: «67 842», rest: «км»}; «2 владельца» → «2» + «владельца».
 * Без числа в начале — null: «Автомат · красный» крупной цифрой не станет
 */
export const splitNumber = (value: string): {number: string; rest: string} | null => {
  const m = value.trim().match(/^([\d][\d\s  .,]*\d|\d)\s*(.*)$/);
  return m ? {number: m[1].trim(), rest: m[2].trim()} : null;
};

/** «5,0 л · бензин» → главное «5,0 л» и подпись «бензин» — как «194 059 км / Бензин · Автомат» в «Журнале» */
export const splitDot = (value: string): {main: string; note: string} => {
  const [main, ...note] = value.split(' · ');
  return {main, note: note.join(' · ')};
};
