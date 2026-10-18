// Движения роликов (пакет KOK_STYLE_MOTION_PACK): выбор и тайминги, от которых зависит вид ролика
import {describe, expect, it} from 'vitest';
import {DEFAULT_MOTION, DESIGN_IDS, SLIDE_MOTIONS, TEXT_MOTIONS} from '../../src/shared/design.js';
import {applyLook, pickLook} from '../../src/shared/look.js';
import brand from '../../config/brand.json';
import {SLIDE_MOTION_TITLES, TEXT_MOTION_TITLES, easeOut, motionOf, pushOffset, sceneOverlap, smooth, textDelay} from '../../src/design/motion';

describe('движения роликов', () => {
  it('все 18 приёмов пакета на месте и у каждого есть название', () => {
    expect(TEXT_MOTIONS.length + SLIDE_MOTIONS.length + 1).toBe(18); // +1 — въезд цены, он без выбора
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

  it('нахлёст сцен в секундах, а не в кадрах', () => {
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
});
