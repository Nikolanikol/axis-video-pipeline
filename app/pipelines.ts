// Реестр пайплайнов и инструментов: config/pipelines.json
import pipelines from '../config/pipelines.json';

export type ToolStatus = 'ready' | 'soon';
export type ToolMeta = {id: string; title: string; description: string; status: ToolStatus};
export type Pipeline = {id: string; title: string; description: string; kind?: 'settings'; tools: ToolMeta[]};

export const PIPELINES = pipelines as Pipeline[];
export const findPipeline = (id?: string) => PIPELINES.find((p) => p.id === id);
export const toolKey = (pipeline: string, tool: string) => `${pipeline}/${tool}`;

// Пайплайны, закрытые на проде. Обзоры (монтаж, распознавание речи, перевод, озвучка)
// там не работают: не решён их рендер на общей машине — час работы сервера на обзор
// вытеснил бы карусели и ролики остальных клиентов. Код остаётся, на Mac всё открыто.
// Закрыто в два слоя: пайплайна нет в навигации (visiblePipelines), а прямая ссылка или
// старая закладка ведут на экран «недоступно» (isClosed в Shell) — раньше по ссылке
// инструмент открывался, и клиент мог упереться в неработающую кнопку.
// Это закрытие интерфейса, не сервера: API обзоров на проде по-прежнему отвечает.
const HIDDEN_ON_PROD = new Set(['reviews']);
export const isClosed = (pipelineId: string, production: boolean) => production && HIDDEN_ON_PROD.has(pipelineId);
export const visiblePipelines = (production: boolean) =>
  PIPELINES.filter((p) => !isClosed(p.id, production));
