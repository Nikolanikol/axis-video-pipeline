// Компоненты форматов. Новый формат: папка src/formats/<id>/, запись в config/formats.json и строка здесь.
import React from 'react';
import type {AdProps} from '../shared/types';
import {GalleryAd} from './gallery-ad/GalleryAd';
import {PriceFirst} from './price-first/PriceFirst';
import {PriceAd} from './price-ad/PriceAd';
import {DesignAd} from '../design/DesignAd';
import {isDesign} from '../shared/design.js';
import {applyLook} from '../design/style/look.js';

// Прежняя тема без design остаётся на прежней композиции, в том числе на витрине гостя.
// Оформление объявления (lot.look) накладывается здесь — одно место для превью и серверного рендера
const designed = (Legacy: React.FC<AdProps>, formatId: string): React.FC<AdProps> => (input) => {
  const props = input.lot?.look ? {...input, theme: applyLook(input.theme ?? {}, input.lot.look)} : input;
  return isDesign(props.theme?.design) ? React.createElement(DesignAd, {...props, formatId}) : React.createElement(Legacy, props);
};

export const FORMAT_COMPONENTS: Record<string, React.FC<AdProps>> = {
  'price-ad': designed(PriceAd, 'price-ad'),
  'gallery-ad': designed(GalleryAd, 'gallery-ad'),
  'price-first': designed(PriceFirst, 'price-first'),
};
