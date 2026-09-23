// Разбор ссылки на объявление. Формы взяты из настоящих ссылок, которыми делятся с телефона.
import {describe, expect, it} from 'vitest';
import {parseCarLink} from '../../src/shared/encarLink.js';

describe('ссылка → номер машины', () => {
  it('десктопная карточка: номер в параметре', () => {
    expect(parseCarLink('https://www.encar.com/dc/dc_cardetailview.do?carid=41630924'))
      .toEqual({source: 'encar', id: '41630924'});
  });

  it('мобильная карточка: номер в пути', () => {
    expect(parseCarLink('https://fem.encar.com/cars/detail/41694826?listAdvType=share'))
      .toEqual({source: 'encar', id: '41694826'});
  });

  it('ссылка «поделиться» с хвостом параметров — берём carid', () => {
    const long = 'https://fem.encar.com/cars/detail/41630924?pageid=dc_carsearch&listAdvType=pic'
      + '&carid=41630924&view_type=checked&wtClick_korList=015&advClickPosition=kor_pic_p1_g5';
    expect(parseCarLink(long).id).toBe('41630924');
  });

  it('без протокола и с пробелами по краям', () => {
    expect(parseCarLink('  www.encar.com/dc/dc_cardetailview.do?carid=41630924  ').id).toBe('41630924');
  });

  it('голый номер принимаем: его удобно скопировать из переписки', () => {
    expect(parseCarLink('41630924')).toEqual({source: 'encar', id: '41630924'});
  });

  it('чужая площадка — говорим какая, а не «неверная ссылка»', () => {
    expect(() => parseCarLink('https://kbchachacha.com/public/car/detail.kbc?carSeq=123'))
      .toThrow(/kbchachacha\.com/);
  });

  it('ссылка на каталог без номера — просим скопировать целиком', () => {
    expect(() => parseCarLink('https://www.encar.com/dc/dc_carsearchlist.do')).toThrow(/номера/);
  });

  it('пусто и мусор', () => {
    expect(() => parseCarLink('')).toThrow(/Вставь ссылку/);
    expect(() => parseCarLink('   ')).toThrow(/Вставь ссылку/);
    expect(() => parseCarLink('не ссылка вовсе')).toThrow(/не похоже на ссылку/);
  });
});
