// Отсутствие дизайна — прежняя компоновка: сохранённые бренды не меняются сами.
export const DESIGN_IDS = /** @type {const} */ (['cinema', 'editorial', 'catalog']);
export const isDesign = (value) => DESIGN_IDS.includes(value);
