// Компоненты форматов. Новый формат: папка src/formats/<id>/, запись в config/formats.json и строка здесь.
import type React from 'react';
import type {AdProps} from '../shared/types';
import {PriceAd} from './price-ad/PriceAd';

export const FORMAT_COMPONENTS: Record<string, React.FC<AdProps>> = {
  'price-ad': PriceAd,
};
