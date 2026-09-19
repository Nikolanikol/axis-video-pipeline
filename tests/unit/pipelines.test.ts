// Реестр пайплайнов и инструментов интерфейса
import {describe, expect, it} from 'vitest';
import {PIPELINES, toolKey} from '../../app/pipelines';
import {TOOLS} from '../../app/tools';

describe('реестр пайплайнов', () => {
  it('id пайплайнов и инструментов уникальны и годятся для адреса', () => {
    expect(new Set(PIPELINES.map((p) => p.id)).size).toBe(PIPELINES.length);
    for (const p of PIPELINES) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.title).toBeTruthy();
      expect(p.tools.length, `у «${p.id}» нет инструментов`).toBeGreaterThan(0);
      expect(new Set(p.tools.map((t) => t.id)).size).toBe(p.tools.length);
      for (const t of p.tools) {
        expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(['ready', 'soon']).toContain(t.status);
        expect(t.title).toBeTruthy();
      }
    }
  });

  it('у каждого готового инструмента есть экран, и каждый экран описан в реестре', () => {
    const ready = PIPELINES.flatMap((p) => p.tools.filter((t) => t.status === 'ready').map((t) => toolKey(p.id, t.id)));
    expect(Object.keys(TOOLS).sort()).toEqual(ready.sort());
  });

  it('есть «Реклама авто», «Обзоры авто» и раздел настроек', () => {
    expect(PIPELINES.map((p) => p.id)).toEqual(expect.arrayContaining(['ads', 'reviews']));
    expect(PIPELINES.filter((p) => p.kind === 'settings')).toHaveLength(1);
  });
});
