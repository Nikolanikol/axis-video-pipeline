// Реестр пайплайнов и инструментов: config/pipelines.json
import pipelines from '../config/pipelines.json';

export type ToolStatus = 'ready' | 'soon';
export type ToolMeta = {id: string; title: string; description: string; status: ToolStatus};
export type Pipeline = {id: string; title: string; description: string; kind?: 'settings'; tools: ToolMeta[]};

export const PIPELINES = pipelines as Pipeline[];
export const findPipeline = (id?: string) => PIPELINES.find((p) => p.id === id);
export const toolKey = (pipeline: string, tool: string) => `${pipeline}/${tool}`;

// Пайплайны, скрытые из интерфейса на проде. Код и экраны остаются — прячется только
// вход в навигации, поэтому findPipeline и роутинг работают по-прежнему (прямая ссылка
// откроет инструмент). Обзоры прячем, пока не решён их рендер на общей машине.
const HIDDEN_ON_PROD = new Set(['reviews']);
// allowed — пайплайны тарифа компании; null — без ограничений (владелец, вход выключен,
// доступ закончился — тогда смотреть готовое можно во всех разделах). Настройки видны всегда
export const visiblePipelines = (production: boolean, allowed: string[] | null = null) =>
  PIPELINES.filter((p) => !(production && HIDDEN_ON_PROD.has(p.id)))
    .filter((p) => p.kind === 'settings' || !allowed || allowed.includes(p.id));
