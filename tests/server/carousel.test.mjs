// Удаление собранной карусели: файлы уходят с диска и из списка, кривой id отклоняется.
// Сам сбор (Encar + рендер) тут не запускается — проверяем управление, а не картинки.
import fs from 'node:fs/promises';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useTempEnv} from '../helpers.mjs';

let env;
let CAROUSELS_DIR;
let deleteCarousel;
let listCarousels;

// Подкладываем готовую карусель на диск, как её оставил бы настоящий сбор
const seed = async (id, brand = 'Hyundai') => {
  const dir = path.join(CAROUSELS_DIR, id);
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'slide-1.png'), 'png');
  await fs.writeFile(path.join(dir, 'carousel.json'), JSON.stringify({
    id, car: {id, brand, model: 'Equus'}, slides: [`/data/carousels/${id}/slide-1.png`], updatedAt: new Date().toISOString(),
  }));
};

beforeAll(async () => {
  env = await useTempEnv();
  ({CAROUSELS_DIR, deleteCarousel, listCarousels} = await import('../../server/carousel.mjs'));
});
afterAll(() => env.cleanup());

describe('удаление карусели', () => {
  it('убирает карусель с диска и из списка', async () => {
    await seed('41630924');
    await seed('42636674');
    expect((await listCarousels()).map((c) => c.id).sort()).toEqual(['41630924', '42636674']);

    const res = await deleteCarousel('41630924');
    expect(res).toEqual({id: '41630924', deleted: true});
    // Папки нет
    await expect(fs.access(path.join(CAROUSELS_DIR, '41630924'))).rejects.toBeTruthy();
    // В списке осталась только вторая
    expect((await listCarousels()).map((c) => c.id)).toEqual(['42636674']);
  });

  it('кривой id отклоняется, а не удаляет что попало', async () => {
    await expect(deleteCarousel('..%2F..%2Fetc')).rejects.toMatchObject({status: 400});
  });

  it('удалить несобранную — не ошибка (нечего убирать)', async () => {
    const res = await deleteCarousel('99999999');
    expect(res.deleted).toBe(true);
  });
});
