// Переходник «ядро Encar → карточка пайплайна» (CarouselCar, src/shared/types.ts).
// Шлюз kmotors отдаёт машину уже в форме карусели, ядро (cores/encar) только проверяет её и
// кладёт в data.card — здесь её достаём. Отдельный файл, как у che168 и Carsensor: пайплайн
// знает переходники, а не устройство ядер.

/**
 * @param {{card: object}} data — data контракта от ядра encar
 * @returns {import('./types').CarouselCar}
 */
export const carFromEncar = (data) => {
  if (!data?.card || typeof data.card !== 'object') throw new Error('У ответа ядра Encar нет карточки (data.card)');
  return data.card;
};
