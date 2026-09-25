// Экраны инструментов: «пайплайн/инструмент» → компонент (грузится при открытии).
// Новый инструмент: запись в config/pipelines.json со status "ready" и строка здесь.
import {lazy} from 'react';

export const TOOLS = {
  'ads/lot': lazy(() => import('./ads/LotTool').then((m) => ({default: m.LotTool}))),
  'carousels/build': lazy(() => import('./carousels/CarouselTool').then((m) => ({default: m.CarouselTool}))),
  'reviews/edit': lazy(() => import('./reviews/ReviewTool').then((m) => ({default: m.ReviewTool}))),
  'settings/profile': lazy(() => import('./settings/SettingsTool').then((m) => ({default: m.ProfileTool}))),
  'settings/brand': lazy(() => import('./settings/SettingsTool').then((m) => ({default: m.BrandTool}))),
  'settings/markets': lazy(() => import('./settings/SettingsTool').then((m) => ({default: m.MarketsTool}))),
} as const;

export type ToolKey = keyof typeof TOOLS;
export const hasTool = (key: string): key is ToolKey => key in TOOLS;
