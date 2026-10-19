// Движения роликов (пакет KOK_STYLE_MOTION_PACK): выбор и тайминги, от которых зависит вид ролика
import {describe, expect, it} from 'vitest';
import {DEFAULT_MOTION, DESIGN_IDS, PLATES, SCENE_TRANSITIONS, SLIDE_MOTIONS, TEXT_MOTIONS} from '../../src/shared/design.js';
import {applyLook, pickLook} from '../../src/shared/look.js';
import {factIcon, splitDot, splitNumber} from '../../src/design/plates';
import {Calendar, CircleDot, Cog, Fuel, Gauge, ShieldCheck, Users, Zap} from 'lucide-react';
import brand from '../../config/brand.json';
import {SLIDE_MOTION_TITLES, TEXT_MOTION_TITLES, easeOut, isSceneTransition, motionOf, pushOffset, sceneLayer, sceneOverlap, smooth, textDelay} from '../../src/design/motion';

describe('движения роликов', () => {
  it('18 приёмов пакета и 8 переходов студии на месте, у каждого есть название', () => {
    expect(TEXT_MOTIONS.length + SLIDE_MOTIONS.length - SCENE_TRANSITIONS.length + 1).toBe(18); // +1 — въезд цены, он без выбора
    expect(SCENE_TRANSITIONS).toHaveLength(8);
    for (const id of SCENE_TRANSITIONS) expect(SLIDE_MOTIONS).toContain(id);
    expect(PLATES).toEqual(['lines', 'tiles', 'pills', 'column', 'row', 'big', 'icons']);
    for (const id of TEXT_MOTIONS) expect(TEXT_MOTION_TITLES[id]).toBeTruthy();
    for (const id of SLIDE_MOTIONS) expect(SLIDE_MOTION_TITLES[id]).toBeTruthy();
  });

  it('без выбора — подача компоновки, чужое значение не ломает ролик', () => {
    for (const design of DESIGN_IDS) expect(motionOf({}, design)).toEqual(DEFAULT_MOTION[design]);
    expect(motionOf({textMotion: 'bounce' as never, slideMotion: 'push'}, 'catalog')).toEqual({text: 'wipe', slide: 'push'});
  });

  it('кривые доходят ровно до конца и не выскакивают за него', () => {
    for (const f of [easeOut, smooth]) { expect(f(0)).toBe(0); expect(f(1)).toBe(1); expect(f(2)).toBe(1); expect(f(-1)).toBe(0); }
  });

  it('вертикальная смена: сцены едут вместе и встают ровно на место', () => {
    expect(pushOffset(0, 0)).toBe(100);
    expect(pushOffset(1, 0)).toBe(0);
    expect(pushOffset(1, 1)).toBe(-100);
    // Уходящая и входящая на одном кадре разнесены ровно на экран — без щели и наезда
    for (const p of [.2, .5, .8]) expect(pushOffset(p, 0) - pushOffset(1, p)).toBeCloseTo(100);
  });

  it('переходы студии: входящая сцена в конце открыта целиком, уходящая в начале — на месте', () => {
    for (const id of SCENE_TRANSITIONS) {
      expect(isSceneTransition(id)).toBe(true);
      const end = sceneLayer(id, 'in', 1);
      const start = sceneLayer(id, 'out', 0);
      for (const s of [end, start]) {
        expect(s.opacity ?? 1, id).toBeCloseTo(1);
        expect(s.filter, id).toBeUndefined();
        expect(String(s.transform ?? 'translateX(0%)'), id).toMatch(/^(translateX\((-?0)%\)|scale\(1\))$/);
      }
      // Обрезка в конце не оставляет закрытой ни полосы кадра (у диагонали студия оставляла 35% снизу)
      const clip = String(end.clipPath ?? '');
      if (clip.startsWith('inset')) expect(clip.match(/[\d.]+/g)!.map(Number).every((n) => n === 0), clip).toBe(true);
      if (clip.startsWith('polygon')) expect(clip).toBe('polygon(0 0, 135% 0, 100% 100%, 0 100%)');
      if (clip.startsWith('circle')) expect(clip).toBe('circle(75% at 50% 50%)');
    }
  });

  it('нахлёст сцен в секундах, а не в кадрах', () => {
    expect(sceneOverlap('whip', 30)).toBe(20);
    expect(sceneOverlap('iris', 60)).toBe(48);
    expect(sceneOverlap('pan', 30)).toBe(12);
    expect(sceneOverlap('pan', 60)).toBe(24);
    expect(sceneOverlap('push', 30)).toBe(23);
    expect(textDelay('pan')).toBe(0);
    expect(textDelay('window')).toBeGreaterThan(0);
  });

  it('оформление объявления: снимок поверх бренда, «Исходный» снимает пресет, без снимка — бренд', () => {
    const designed = {...brand, design: 'cinema' as const, designVariant: 1 as const, name: 'Компания'};
    expect(applyLook(designed, undefined)).toBe(designed);
    const look = pickLook({...designed, design: 'catalog', bg: '#FFFFFF'});
    const next = applyLook(designed, look);
    expect([next.design, next.bg, next.name, next.assets]).toEqual(['catalog', '#FFFFFF', 'Компания', brand.assets]);
    const original = applyLook(designed, {...look, design: null});
    expect('design' in original).toBe(false);
    expect('designVariant' in original).toBe(false);
  });

  it('подачи данных разбирают факт по тексту: иконка, число, подпись', () => {
    expect(factIcon('67 842 км')).toBe(Gauge);
    expect(factIcon('67,842 km')).toBe(Gauge);
    expect(factIcon('5,0 л · бензин')).toBe(Fuel);
    expect(factIcon('2.0 L · diesel')).toBe(Fuel);
    expect(factIcon('Электро')).toBe(Zap);
    expect(factIcon('Автомат · красный')).toBe(Cog);
    expect(factIcon('2 владельца')).toBe(Users);
    expect(factIcon('Без страховых случаев')).toBe(ShieldCheck);
    expect(factIcon('2018')).toBe(Calendar);
    expect(factIcon('Панорамная крыша')).toBe(CircleDot);
    expect(splitNumber('67\u00a0842 км')).toEqual({number: '67\u00a0842', rest: 'км'});
    expect(splitNumber('5,0 л · бензин')).toEqual({number: '5,0', rest: 'л · бензин'});
    expect(splitNumber('Автомат · красный')).toBeNull();
    expect(splitDot('5,0 л · бензин')).toEqual({main: '5,0 л', note: 'бензин'});
    expect(splitDot('67 842 км')).toEqual({main: '67 842 км', note: ''});
  });
});
