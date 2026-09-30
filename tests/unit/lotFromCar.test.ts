// Лот по машине из Encar: поля формы на языке профиля и порядок фото
import {describe, expect, it} from 'vitest';
import {SPEC_MAX, TAGLINE_MAX, carPhotos, lotFieldsFromCar, lotIsBlank, taglineFromCar} from '../../src/shared/lotFromCar';
import type {CarouselCar} from '../../src/shared/types';

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const pic = (n: string) => `https://ci.encar.com/carpicture09/pic4099/40990828_${n}.jpg?impolicy=heightRate&rh=1080`;
// Карточка как её отдаёт шлюз kmotors (снята с реального объявления Audi A6)
const car: CarouselCar = {
  id: '40990828', source: 'encar', brand: 'Audi', model: 'A6', grade: '40 TFSI Premium', trim: 'C7', year: 2018,
  firstRegistered: null, mileageKm: 89656, displacementCc: 1984, transmission: 'Automatic', fuel: 'Gasoline',
  body: '', color: 'Black', seats: null, vin: null, plate: null,
  price: {krw: 15040000, usd: 11171, krwToUsd: 0.00074, quotedAt: '2026.09.23 05:48:07', rateSource: 'kb'},
  history: null, options: {comfort: [], safety: [], other: [], total: 0},
  photos: {hero: pic('001'), rear: pic('003'), interiorShot: pic('007'), dashboard: pic('008'),
    exterior: [pic('001'), pic('002'), pic('003')], interior: [pic('007'), pic('009')], other: [pic('020')]},
} as CarouselCar;

describe('поля лота из Encar', () => {
  it('по-русски — словами из словаря карусели, цена в вонах', () => {
    const f = lotFieldsFromCar(car, 'ru');
    expect(f).toMatchObject({brand: 'Audi', model: 'A6', trim: '40 TFSI Premium', year: 2018, carPriceKrw: 15040000});
    // Пробелы в числах неразрывные (как в карусели): «89 656 км» не должно разрываться переносом
    expect(f.specs.map(plain)).toEqual(['89 656 км', '2,0 л · бензин', 'Автомат · чёрный']);
  });

  it('язык без словаря получает английский, как карусель', () => {
    expect(lotFieldsFromCar(car, 'mk').specs.map(plain)).toEqual(['89,656 km', '2.0 L · gasoline', 'Automatic · black']);
  });

  it('строки не длиннее безопасной зоны; пустые данные не дают «—»', () => {
    const f = lotFieldsFromCar({...car, mileageKm: null, displacementCc: null, color: '', price: null}, 'ru');
    expect(f.specs).toEqual(['бензин', 'Автомат']);
    expect(f.carPriceKrw).toBeNull();
    for (const s of lotFieldsFromCar(car, 'ru').specs) expect(s.length).toBeLessThanOrEqual(SPEC_MAX);
  });
});

describe('фото объявления', () => {
  it('сначала опознанные ракурсы (рекомендованные), без повторов', () => {
    const list = carPhotos(car);
    expect(list.filter((p) => p.recommended).map((p) => p.label)).toEqual(['перед', 'зад', 'салон', 'приборы']);
    expect(list.slice(0, 4).every((p) => p.recommended)).toBe(true);
    // hero совпадает с первым фото экстерьера — второй раз не показываем
    expect(new Set(list.map((p) => p.url)).size).toBe(list.length);
    expect(list).toHaveLength(7);
  });
});

describe('пустой ли лот', () => {
  it('новый лот пуст, хоть год и стоит; любое заполненное поле — уже нет', () => {
    const blank = {brand: '', model: '', trim: '', year: 2026, specs: ['', '', ''], carPriceKrw: null, carPriceUsd: null};
    expect(lotIsBlank(blank)).toBe(true);
    expect(lotIsBlank({...blank, specs: ['', '90 000 км']})).toBe(false);
    expect(lotIsBlank({...blank, carPriceUsd: 9000})).toBe(false);
  });
});

describe('подзаголовок из данных', () => {
  const clean = {accidentsOwn: 0, accidentsOther: 0, accidentsTotal: 0, accidentYears: [], maxPayoutKrw: null, claims: [],
    ownerChanges: 0, theft: 0, flood: 0, totalLoss: 0};
  it('чистая история и один владелец — оба факта, точными словами (не «без ДТП»)', () => {
    expect(taglineFromCar({...car, history: clean}, 'ru')).toBe('Без страховых случаев');
    // Вместе не влезают в строку — остаётся первый, он сильнее
    expect(`Без страховых случаев · Один владелец`.length).toBeGreaterThan(TAGLINE_MAX);
    expect(taglineFromCar({...car, history: clean}, 'en')).toBe('No insurance claims');
  });
  it('были случаи — о них молчим; малый пробег — пишем', () => {
    const hit = {...clean, accidentsTotal: 3, accidentsOwn: 3, ownerChanges: 0};
    // По-русски два факта не влезают (33 знака) — первый; по-английски короче — оба
    expect(taglineFromCar({...car, history: hit, mileageKm: 31500}, 'ru')).toBe('Один владелец');
    expect(taglineFromCar({...car, history: hit, mileageKm: 31500}, 'en')).toBe('One owner · Only 32k km');
    expect(taglineFromCar({...car, history: null, mileageKm: 31500}, 'ru')).toBe('Пробег 32 тыс. км');
  });
  it('истории нет и пробег обычный — пусто: ролик возьмёт фразу профиля', () => {
    expect(taglineFromCar({...car, history: null}, 'ru')).toBe('');
    expect(lotFieldsFromCar({...car, history: null}, 'ru')).toMatchObject({history: null, hookTagline: ''});
  });
});

