// Реестр стиля ролика — единственное место, где перечислены выборы оформления пресетов:
// появление текста, движение фото, переход между сценами и подача данных.
// Его читают рендер (motion/, plates/), интерфейс (app/StyleChoices.tsx) и сервер (checkBrand,
// checkLotLook), поэтому файл на JS с JSDoc: сервер импортирует его без сборки.
//
// Новый приём = строка в нужном списке ниже + его реализация в motion/ или plates/.
// Порядок строк — порядок кнопок; main — виден сразу, остальное — под «Ещё».
//
// Источники: появления текста и движения фото — пакет дизайнера KOK_STYLE_MOTION_PACK
// (data/motions.json); переходы — KOK Motion Studio V3 (lib/transition-core.js, «KOK Originals»);
// подачи данных — макеты KOK_VISUAL_KIT («Паспорт», «Ценник», «Две колонки», «Журнал»),
// «Крупные цифры» и «С иконками» — предложение 20.10, не из макетов.
import {DESIGN_IDS} from '../../shared/design.js';

/** @typedef {{id: string, title: string, main?: boolean}} StyleOption */

/** Появление заголовка сцены. Цена всегда въезжает целиком (motion/text.tsx) — выбора нет:
 *  счётчик цифр пакет запрещает */
export const TEXT_MOTIONS = /** @type {const} */ ([
  {id: 'line_lift', title: 'Из-под строки', main: true},
  {id: 'word_steps', title: 'Слова по очереди', main: true},
  {id: 'wipe', title: 'Открыть слева', main: true},
  {id: 'tracking', title: 'Собрать трекинг'},
  {id: 'focus', title: 'Навести резкость'},
  {id: 'underline', title: 'Подчеркнуть'},
  {id: 'highlight', title: 'Акцентная плашка'},
  {id: 'label', title: 'Собрать табличку'},
  {id: 'letters', title: 'Буквы волной'},
  {id: 'crossfade', title: 'Смена надписи'},
  {id: 'weight', title: 'Набрать вес'},
]);

/** Движение фото внутри сцены. still — фото стоит (у «Кино» остаётся его лёгкий наезд) */
export const PHOTO_MOTIONS = /** @type {const} */ ([
  {id: 'pan', title: 'Тихий проезд', main: true},
  {id: 'window', title: 'Окно раскрывается', main: true},
  {id: 'match', title: 'Общий объект', main: true},
  {id: 'still', title: 'Без эффекта', main: true},
  {id: 'stack', title: 'Стопка снимков'},
  {id: 'detail', title: 'Крупнее о деталях'},
]);

/** Переход между сценами: в кадре одновременно уходящая и входящая сцена.
 *  fade — прежнее растворение за 0,4 с, push — «Вертикальная смена» из пакета, остальные — студия */
export const SCENE_TRANSITIONS = /** @type {const} */ ([
  {id: 'fade', title: 'Растворение', main: true},
  {id: 'push', title: 'Вертикальная смена', main: true},
  {id: 'dissolve', title: 'Мягкое растворение', main: true},
  {id: 'iris', title: 'Диафрагма', main: true},
  {id: 'push_side', title: 'Толчок вбок'},
  {id: 'wipe_cut', title: 'Строгая шторка'},
  {id: 'diagonal', title: 'Диагональный срез'},
  {id: 'depth_zoom', title: 'Наезд вглубь'},
  {id: 'whip', title: 'Резкая панорама'},
  {id: 'shutters', title: 'Шторки от центра'},
]);

/** Подача характеристик и подписей под ними — в роликах и на слайдах карусели пресета */
export const PLATES = /** @type {const} */ ([
  {id: 'lines', title: 'Линии', main: true},
  {id: 'tiles', title: 'Плитки', main: true},
  {id: 'pills', title: 'Таблетки', main: true},
  {id: 'column', title: 'Колонка на подложке', main: true},
  {id: 'row', title: 'Журнальная строка'},
  {id: 'big', title: 'Крупные цифры'},
  {id: 'icons', title: 'С иконками'},
]);

/**
 * Все выборы стиля: поле темы → подпись в интерфейсе и варианты. Поле с этим именем лежит
 * в бренде (theme) и в снимке объявления (lot.look) — одно и то же имя везде
 */
export const STYLE_CHOICES = /** @type {const} */ ({
  textMotion: {title: 'Появление текста', options: TEXT_MOTIONS},
  photoMotion: {title: 'Движение фото', options: PHOTO_MOTIONS},
  sceneTransition: {title: 'Переход между сценами', options: SCENE_TRANSITIONS},
  plates: {title: 'Подача данных', options: PLATES},
});
/** Поля стиля, которые относятся к движению — их нет у неподвижных слайдов карусели */
export const MOTION_FIELDS = /** @type {const} */ (['textMotion', 'photoMotion', 'sceneTransition']);

/**
 * Не выбрано вручную — берётся от компоновки: подачи «Спокойно» / «Редакционно» из пакета,
 * разложенные по нашим дизайнам. Так сохранённый бренд получает задуманную для его дизайна
 * подачу, а не случайную
 */
export const STYLE_DEFAULTS = /** @type {const} */ ({
  cinema: {textMotion: 'line_lift', photoMotion: 'pan', sceneTransition: 'fade', plates: 'lines'},
  editorial: {textMotion: 'line_lift', photoMotion: 'window', sceneTransition: 'fade', plates: 'lines'},
  catalog: {textMotion: 'wipe', photoMotion: 'match', sceneTransition: 'fade', plates: 'lines'},
});

const ids = (field) => STYLE_CHOICES[field].options.map((o) => o.id);
/** Есть ли такой вариант у выбора */
export const isStyleOption = (field, value) => ids(field).includes(value);
/** Подпись варианта для интерфейса; неизвестный — как есть */
export const optionTitle = (field, id) => STYLE_CHOICES[field].options.find((o) => o.id === id)?.title ?? id;

/**
 * Действующий стиль темы: выбранное, а чего нет или что не из списка — по компоновке.
 * Чужая строка не ломает ролик — просто даёт умолчание
 * @param {Record<string, unknown>} theme
 * @param {string} design
 * @returns {Required<import('../../shared/types').StyleFields>}
 */
export const resolveStyle = (theme, design) => {
  const defaults = STYLE_DEFAULTS[DESIGN_IDS.includes(design) ? design : 'catalog'];
  return /** @type {any} */ (Object.fromEntries(Object.keys(STYLE_CHOICES).map((field) =>
    [field, isStyleOption(field, theme?.[field]) ? theme[field] : defaults[field]])));
};

/**
 * Проверка полей стиля для сервера: бренд и снимок объявления проверяются одним правилом.
 * Поле может отсутствовать (тогда — умолчание), но если есть — только из списка.
 * @returns {string | null} текст ошибки для клиента или null
 */
export const styleError = (obj) => {
  for (const [field, choice] of Object.entries(STYLE_CHOICES)) {
    if (obj?.[field] !== undefined && !isStyleOption(field, obj[field])) return `${choice.title}: выберите вариант из списка`;
  }
  return null;
};
