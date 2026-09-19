// Реестр пайплайнов и инструментов: config/pipelines.json
import pipelines from '../config/pipelines.json';

export type ToolStatus = 'ready' | 'soon';
export type ToolMeta = {id: string; title: string; description: string; status: ToolStatus};
export type Pipeline = {id: string; title: string; description: string; kind?: 'settings'; tools: ToolMeta[]};

export const PIPELINES = pipelines as Pipeline[];
export const findPipeline = (id?: string) => PIPELINES.find((p) => p.id === id);
export const toolKey = (pipeline: string, tool: string) => `${pipeline}/${tool}`;
