// Отсутствие дизайна — прежняя компоновка: сохранённые бренды не меняются сами.
export const DESIGN_IDS = /** @type {const} */ (['cinema', 'editorial', 'catalog']);
export const isDesign = (value) => DESIGN_IDS.includes(value);

// Движения роликов из пакета KOK_STYLE_MOTION_PACK — все 18. Не выбрано — берётся от компоновки
// (DEFAULT_MOTION): подачи «Спокойно» / «Редакционно» из пакета, разложенные по нашим дизайнам.
// Цена всегда въезжает целиком (price) — отдельного выбора нет, счётчик цифр пакет запрещает
// Порядок — как в выборе: сначала первый релиз пакета, затем расширенный выбор
export const TEXT_MOTIONS = /** @type {const} */ (['line_lift', 'word_steps', 'wipe', 'tracking', 'focus', 'underline',
  'highlight', 'label', 'letters', 'crossfade', 'weight']);
// Последние 8 — переходы между сценами из KOK Motion Studio V3 (transition-core.js, «KOK Originals»)
export const SLIDE_MOTIONS = /** @type {const} */ (['pan', 'window', 'match', 'push', 'stack', 'detail',
  'dissolve', 'push_side', 'wipe_cut', 'diagonal', 'iris', 'depth_zoom', 'whip', 'shutters']);
// Смена сцен целиком (две сцены в кадре одновременно), а не движение фото внутри сцены
export const SCENE_TRANSITIONS = /** @type {const} */ (['dissolve', 'push_side', 'wipe_cut', 'diagonal', 'iris', 'depth_zoom', 'whip', 'shutters']);
export const DEFAULT_MOTION = /** @type {const} */ ({
  cinema: {text: 'line_lift', slide: 'pan'},
  editorial: {text: 'line_lift', slide: 'window'},
  catalog: {text: 'wipe', slide: 'match'},
});
// Подача данных в пресетах — плашки из KOK_VISUAL_KIT: «Паспорт» (плитки), «Ценник» (таблетки),
// «Две колонки» (колонка на подложке). Нет поля — прежние линии
// «Журнальная строка» (row) — из макета «Журнал»; «Крупные цифры» (big) и «С иконками» (icons) — 20.10
export const PLATES = /** @type {const} */ (['lines', 'tiles', 'pills', 'column', 'row', 'big', 'icons']);
export const isPlates = (value) => PLATES.includes(value);
export const isTextMotion = (value) => TEXT_MOTIONS.includes(value);
export const isSlideMotion = (value) => SLIDE_MOTIONS.includes(value);
