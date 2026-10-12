// Источник «Япония» (carsensor): ссылки, разбор и перевод японских значений ядром, переходник
// ядро → CarouselCar, «Япония» в текстах слайдов, цена ¥ → $. Образцы — настоящие ответы ядра
// (tests/fixtures/carsensor, сняты 12.10).
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {encarAdUrl, idFromNote, parseCarLink, sourceName, sourceNote} from '../../src/shared/encarLink.js';
import {carFromCarsensor} from '../../src/shared/carsensorCar.js';
import {lotFieldsFromCar} from '../../src/shared/lotFromCar';
import {carouselText} from '../../src/carousel/i18n';
import {copyFor} from '../../src/carousel/i18n/copy';
import {carouselPrice} from '../../src/carousel/price';
import {parseCarouselSource} from '../../src/shared/kmotorsLot.js';
import {gradeJa, gradeToEn, manYen, mileageKm, parseRef} from '../../cores/carsensor/src/parse.mjs';
import {baseColor, modelFromSlug, prefectureEn, translateOption} from '../../cores/carsensor/src/dict.mjs';

const fixture = (id: string) => JSON.parse(readFileSync(new URL(`../fixtures/carsensor/${id}.json`, import.meta.url), 'utf8'));
const harrier = fixture('AU7375484964');   // Toyota Harrier, гибрид, Токио
const bmw = fixture('AU6777335034');       // BMW 320d xDrive, Фукуока
const rate = {jpyPerUsd: 150, quotedAt: '2026-10-12T00:00:00.000Z'};

describe('ссылки Carsensor', () => {
  it('ссылка, голый номер и наш id дают один номер; id строчными', () => {
    const want = {source: 'carsensor', id: 'cs-au7375484964', ref: 'AU7375484964'};
    expect(parseCarLink('https://www.carsensor.net/usedcar/detail/AU7375484964/index.html?dspn=_CRjs')).toEqual(want);
    expect(parseCarLink('AU7375484964')).toEqual(want);
    expect(parseCarLink('cs-au7375484964')).toEqual(want);
    expect(parseCarLink('https://www.carsensor.net/shop/tokyo/206339138/?BKKN=AU7375484964')).toEqual(want);
    expect(() => parseCarLink('https://www.carsensor.net/')).toThrow(/номера/);
    // Голый номер из цифр — по-прежнему Encar
    expect(parseCarLink('41630924')).toEqual({source: 'encar', id: '41630924'});
  });

  it('пометка лота, адрес объявления и название источника', () => {
    expect(sourceNote('cs-au7375484964')).toBe('carsensor AU7375484964');
    expect(idFromNote('копия carsensor AU7375484964')).toBe('cs-au7375484964');
    expect(encarAdUrl('cs-au7375484964')).toBe('https://www.carsensor.net/usedcar/detail/AU7375484964/index.html');
    expect(sourceName('cs-au7375484964')).toBe('Carsensor');
  });

  it('карусели принимают ссылку Carsensor и свой id при пересборке', () => {
    expect(parseCarouselSource('https://www.carsensor.net/usedcar/detail/AU6777335034/index.html')).toMatchObject({source: 'carsensor', id: 'cs-au6777335034'});
    expect(parseCarouselSource('cs-au6777335034')).toMatchObject({source: 'carsensor', ref: 'AU6777335034'});
  });
});

describe('ядро: японское → числа и английский', () => {
  it('номер из ссылки', () => {
    expect(parseRef('https://www.carsensor.net/usedcar/detail/AU7375484964/index.html')).toBe('AU7375484964');
    expect(parseRef('мусор')).toBeNull();
  });

  it('пробег «万km» и цена «万円» с пробелом перед дробью', () => {
    expect(mileageKm('4.7万km')).toBe(47_000);
    expect(mileageKm('116km')).toBe(116);
    expect(mileageKm('－')).toBeNull();
    expect(manYen('419 .9 万円')).toBe(4_199_000);
  });

  it('комплектация: катакана словарём, латиница слитно только после строчной', () => {
    expect(gradeToEn('320d xドライブ エディション ジョイプラス ディーゼルターボ 4WD')).toBe('320d xDrive Edition Joy Plus Diesel Turbo 4WD');
    expect(gradeToEn('660 PZターボ ハイルーフ 4WD')).toBe('660 PZ Turbo High Roof 4WD');
    expect(gradeToEn('プラチナエディション ティプトロニックS 4WD')).toBe('Platinum Edition Tiptronic S 4WD');
    // Реклама дилера после полноширинного пробела отрезается, марка и модель — тоже
    expect(gradeJa('トヨタ ハリアー 2.5 ハイブリッド Z レザーパッケージ　禁煙　JBLサウンド', 'トヨタ', 'ハリアー')).toBe('2.5 ハイブリッド Z レザーパッケージ');
  });

  it('модель из слага каталога, цвет, префектура', () => {
    expect(modelFromSlug('lexus_ux', 'lexus')).toBe('UX');
    expect(modelFromSlug('cayene', 'porsche')).toBe('Cayenne');
    expect(modelFromSlug('c_class_wgn', 'mercedes-benz')).toBe('C-Class Wagon');
    expect(baseColor('プレシャスブラックパール')).toBe('Black');
    expect(baseColor('パールホワイトIII/ファインミントM')).toBe('White');
    expect(prefectureEn('北海道')).toBe('Hokkaido');
    expect(prefectureEn('東京都')).toBe('Tokyo');
  });

  it('составные опции: «－» — части нет', () => {
    expect(translateOption('エアバッグ：運転席/助手席/サイド/カーテン')?.en).toBe('Airbags (driver, passenger, side, curtain)');
    expect(translateOption('カメラ：－/－/バック')?.ru).toBe('Камеры (задняя)');
    expect(translateOption('TV：－')).toBeNull();
    expect(translateOption('アクセル踏み間違い（誤発進）防止装置')?.en).toBe('Pedal Misapplication Prevention');
  });
});

describe('карточка ядра → CarouselCar', () => {
  it('поля, Япония, цена ¥ → $ по курсу дня', () => {
    const car = carFromCarsensor(harrier, 'ru', rate);
    expect(car).toMatchObject({
      id: 'cs-au7375484964', source: 'carsensor', origin: 'JP', brand: 'Toyota', model: 'Harrier',
      grade: '2.5 Hybrid Z Leather Package', year: 2023, displacementCc: 2500, transmission: 'Automatic',
      fuel: 'Hybrid', body: 'SUV', color: 'Black', city: 'Tokyo', history: null,
    });
    expect(car.price).toMatchObject({krw: null, jpy: harrier.price.amount, usd: Math.round(harrier.price.amount / 150)});
  });

  it('курса иены нет — иены остаются, долларов нет (на слайде прочерк, а не выдумка)', () => {
    const car = carFromCarsensor(harrier, 'en', {});
    expect(car.price).toMatchObject({jpy: harrier.price.amount, usd: null});
  });

  it('главное фото (с плашкой дилера) в рекламу не идёт; обложка — подписанный кадр машины', () => {
    for (const data of [harrier, bmw]) {
      const car = carFromCarsensor(data, 'en', rate);
      const main = data.photos.find((p: {main?: boolean}) => p.main).url;
      const all = [car.photos.hero, car.photos.rear, ...car.photos.exterior, ...car.photos.interior, ...car.photos.other];
      expect(all).not.toContain(main);
      const hero = data.photos.find((p: {url: string}) => p.url === car.photos.hero);
      expect(hero).toMatchObject({category: 'exterior', ad: true});
      // Баннеры дилера и неподписанные — мимо
      const promo = data.photos.filter((p: {label: string}) => p.label === '販促用画像').map((p: {url: string}) => p.url);
      expect(all.filter((u) => promo.includes(u))).toEqual([]);
    }
  });

  it('опции на языке профиля, японское на слайд не попадает', () => {
    const ru = carFromCarsensor(harrier, 'ru', rate);
    expect(ru.options.total).toBeGreaterThan(10);
    expect(JSON.stringify(ru.options)).not.toMatch(/[぀-ヿ一-鿿]/);
    expect(ru.options.comfort[0]).toMatch(/[А-Яа-я]/);
    const en = carFromCarsensor(harrier, 'en', rate);
    expect(en.options.comfort.slice(0, 3).join(' ')).not.toMatch(/Air Conditioning|Power Windows/);
  });

  it('поля объявления ролика: доллары, маршрут из Японии, подзаголовок без Кореи', () => {
    const f = lotFieldsFromCar(carFromCarsensor(bmw, 'ru', rate), 'ru');
    expect(f).toMatchObject({carPriceKrw: null, carPriceUsd: Math.round(bmw.price.amount / 150), originCountry: 'ЯПОНИЯ', origin: 'Fukuoka'});
    expect(f.hookTagline).not.toMatch(/Коре/);
  });

  it('пустой ответ не роняет переходник', () => {
    const car = carFromCarsensor({ref: 'AU1'}, 'ru', rate);
    expect(car.brand).toBe('');
    expect(car.photos.hero).toBeNull();
    expect(car.price).toBeNull();
  });
});

describe('тексты и цена слайдов для машины из Японии', () => {
  it('«Цена в Японии», «Импорт из Японии» — и Корея для Encar как была', () => {
    expect(carouselText('ru', 'JP').s.priceInKorea).toBe('Цена в Японии');
    expect(carouselText('en', 'JP').s.priceInKorea).toBe('Price in Japan');
    expect(carouselText('ru').s.priceInKorea).toBe('Цена в Корее');
    const jp = JSON.stringify(copyFor('ru', 'JP'));
    expect(jp).not.toMatch(/Коре/);
    expect(jp).toMatch(/из Японии/);
    expect(JSON.stringify(copyFor('en', 'JP'))).not.toMatch(/Korea/);
  });

  it('цена: доллары из иен — как у Китая, ₩ через курс дня', () => {
    const car = carFromCarsensor(harrier, 'en', rate);
    const usd = car.price!.usd!;
    expect(carouselPrice(car, {currency: 'USD'})).toBe(usd);
    expect(carouselPrice(car, {currency: 'KRW', krwPerUsdToday: 1341.69})).toBe(Math.round(usd * 1341.69));
  });
});
