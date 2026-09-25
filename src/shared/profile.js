// Профиль клиента: кто он, на каком языке и по какой модели цены продаёт.
//
// Заменяет прежний «рынок», где в одном файле были свалены язык, контакты, цена экспорта
// и все тексты. Здесь клиент держит только СВОЁ (компания, контакты, режим цены), а тексты
// постов приходят готовыми из дефолтов платформы (config/copy.json) под пару «режим × язык».
// Клиент их не пишет с нуля — в этом и смысл «пришёл, нажал пару кнопок, работает».
//
// Модель цены — две:
//   export   — авто из-за рубежа: цена = авто + фрахт, показываем маршрут и «до порта»;
//   domestic — продажа на своём рынке: цена как есть, без фрахта, порта и заграницы.
// Один движок рендера рисует оба — пайплайн смотрит на pricing.mode.

/** @typedef {'export'|'domestic'} PricingMode */

/** Обе модели цены. Всё, что не 'domestic', считаем 'export' — так безопаснее для старых данных. */
export const PRICING_MODES = /** @type {const} */ (['export', 'domestic']);

const isMode = (m) => (m === 'domestic' ? 'domestic' : 'export');

// Правки клиента накрывают дефолт только там, где реально заданы: пустой texts в профиле
// означает «беру всё из дефолтов», а не «сотри тексты».
const defined = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null));

/**
 * Тексты поста: дефолт платформы под (режим, язык), поверх — правки клиента.
 * Нет такого языка в дефолтах — падаем на английский, чтобы пост всё равно собрался,
 * а не вышел с пустыми плашками.
 */
export const resolveTexts = (copy, mode, language, overrides) => {
  const byMode = copy?.[isMode(mode)] || {};
  const base = byMode[language] || byMode.en || {};
  return {...base, ...defined(overrides)};
};

/**
 * Профиль с уже подставленными текстами — то, что отдаём пайплайну.
 * Дальше по коду texts уже полные: не нужно помнить про дефолты в каждой вёрстке.
 */
export const resolveProfile = (profile, copy) => ({
  ...profile,
  texts: resolveTexts(copy, profile?.pricing?.mode, profile?.language, profile?.texts),
});

/**
 * Цена к показу по модели. Экспорт добавляет фрахт и просит показать маршрут; внутренний
 * рынок отдаёт цену как есть. Возвращаем и флаг showRoute, чтобы ценовая сцена не гадала,
 * рисовать ли origin→port.
 * carPriceUsd === null (цена не задана) — это черновик, отдаём total: null, а не ноль.
 */
export const priceView = (carPriceUsd, pricing) => {
  const mode = isMode(pricing?.mode);
  const freight = mode === 'export' ? Number(pricing?.export?.freight ?? 0) : 0;
  const total = carPriceUsd === null || carPriceUsd === undefined ? null : carPriceUsd + freight;
  return {mode, freight, total, showRoute: mode === 'export'};
};

/**
 * Мост «профиль → рынок»: отдаёт объект в форме прежнего Market, чтобы пайплайны, которые
 * пока читают рынок, работали без правок. На нём и держится незаметная замена: сервер
 * подсовывает это вместо market, а вёрстка меняется отдельно, в свой черёд.
 *
 * Сверх полей Market везём и новые — pricingMode, currency, language: старые пайплайны их
 * игнорируют, а обновлённые (стадия 4) читают, чтобы раздвоить ценовую сцену на export/domestic.
 * На внутреннем рынке маршрут и фрахт обнуляются: порта и заграницы там нет.
 */
export const marketFromProfile = (profile, copy) => {
  const p = profile || {};
  const mode = isMode(p.pricing?.mode);
  const ex = p.pricing?.export || {};
  const isExport = mode === 'export';
  return {
    name: p.company ?? '',
    origin: isExport ? (ex.origin ?? '') : '',
    originCountry: isExport ? (ex.originCountry ?? '') : '',
    port: isExport ? (ex.port ?? '') : '',
    portCountry: isExport ? (ex.portCountry ?? '') : '',
    freightUsd: isExport ? Number(ex.freight ?? 0) : 0,
    whatsapp: p.contacts?.whatsapp ?? null,
    site: p.contacts?.site ?? '',
    texts: resolveTexts(copy, p.pricing?.mode, p.language, p.texts),
    music: p.music,
    pricingMode: mode,
    currency: p.pricing?.currency ?? 'USD',
    language: p.language,
  };
};
