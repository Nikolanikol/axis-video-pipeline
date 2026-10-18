// Отсутствие дизайна — прежняя компоновка: сохранённые бренды не меняются сами.
export const DESIGN_IDS = /** @type {const} */ (['cinema', 'editorial', 'catalog']);
export const isDesign = (value) => DESIGN_IDS.includes(value);

// Движения роликов из пакета KOK_STYLE_MOTION_PACK — все 18. Не выбрано — берётся от компоновки
// (DEFAULT_MOTION): подачи «Спокойно» / «Редакционно» из пакета, разложенные по нашим дизайнам.
// Цена всегда въезжает целиком (price) — отдельного выбора нет, счётчик цифр пакет запрещает
// Порядок — как в выборе: сначала первый релиз пакета, затем расширенный выбор
export const TEXT_MOTIONS = /** @type {const} */ (['line_lift', 'word_steps', 'wipe', 'tracking', 'focus', 'underline',
  'highlight', 'label', 'letters', 'crossfade', 'weight']);
export const SLIDE_MOTIONS = /** @type {const} */ (['pan', 'window', 'match', 'push', 'stack', 'detail']);
export const DEFAULT_MOTION = /** @type {const} */ ({
  cinema: {text: 'line_lift', slide: 'pan'},
  editorial: {text: 'line_lift', slide: 'window'},
  catalog: {text: 'wipe', slide: 'match'},
});
export const isTextMotion = (value) => TEXT_MOTIONS.includes(value);
export const isSlideMotion = (value) => SLIDE_MOTIONS.includes(value);
