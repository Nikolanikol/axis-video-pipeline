// Экраны инструментов: «пайплайн/инструмент» → компонент (грузится при открытии).
// Новый инструмент: запись в config/pipelines.json со status "ready" и строка здесь.
import {lazyNamed} from './errorReport';

export const TOOLS = {
  'ads/lot': lazyNamed(() => import('./ads/LotTool'), 'LotTool'),
  'carousels/build': lazyNamed(() => import('./carousels/CarouselTool'), 'CarouselTool'),
  'offers/build': lazyNamed(() => import('./offers/OfferTool'), 'OfferTool'),
  'reviews/edit': lazyNamed(() => import('./reviews/ReviewTool'), 'ReviewTool'),
  'settings/profile': lazyNamed(() => import('./settings/SettingsTool'), 'ProfileTool'),
  'settings/ads': lazyNamed(() => import('./settings/SettingsTool'), 'AdTextsTool'),
  'settings/offer': lazyNamed(() => import('./settings/OfferSettings'), 'OfferTool'),
  'settings/brand': lazyNamed(() => import('./settings/SettingsTool'), 'BrandTool'),
} as const;

export type ToolKey = keyof typeof TOOLS;
export const hasTool = (key: string): key is ToolKey => key in TOOLS;
