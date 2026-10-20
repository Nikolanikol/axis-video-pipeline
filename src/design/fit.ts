// Кегль по длине строки: 0,59 — средняя ширина знака в долях кегля у шрифтов пресетов.
// Не меньше min — мельче текст в ролике с телефона не читается
export const fit = (text: string, width: number, max: number, min = 32) =>
  Math.max(min, Math.min(max, width / (Math.max(1, text.length) * 0.59)));
