// Стиль ролика: реестр выборов, движения (пакет KOK_STYLE_MOTION_PACK, KOK Motion Studio),
// подачи данных и снимок оформления объявления — то, от чего зависит вид ролика
import {describe, expect, it} from 'vitest';
import type React from 'react';
import {DESIGN_IDS} from '../../src/shared/design.js';
import {MOTION_FIELDS, PHOTO_MOTIONS, PLATES, SCENE_TRANSITIONS, STYLE_CHOICES, STYLE_DEFAULTS, TEXT_MOTIONS, isStyleOption, resolveStyle, styleError} from '../../src/design/style/registry.js';
import {applyLook, pickLook} from '../../src/design/style/look.js';
import {factIcon, splitDot, splitNumber} from '../../src/design/plates/parse';
import {Calendar, CircleDot, Cog, Fuel, Gauge, ShieldCheck, Users, Zap} from 'lucide-react';
import brand from '../../config/brand.json';
import {easeOut, smooth} from '../../src/design/motion/easing';
import {sceneLayer, sceneOverlap} from '../../src/design/motion/scene';
import {photoFallback, textDelay} from '../../src/design/motion/photo';

const idsOf = (list: readonly {id: string}[]) => list.map((o) => o.id);

describe('стиль ролика', () => {
  it('все приёмы на месте: 11 появлений текста, 6 движений фото, 10 переходов, 7 подач; ни одного без названия', () => {
    expect(TEXT_MOTIONS).toHaveLength(11);
    // 5 из пакета + «Без эффекта»; переходы — растворение, вертикальная смена пакета и 8 студии
    expect(idsOf(PHOTO_MOTIONS)).toEqual(['pan', 'window', 'match', 'still', 'stack', 'detail']);
    expect(SCENE_TRANSITIONS).toHaveLength(10);
    expect(idsOf(PLATES)).toEqual(['lines', 'tiles', 'pills', 'column', 'row', 'big', 'icons']);
    for (const choice of Object.values(STYLE_CHOICES)) {
      expect(new Set(idsOf(choice.options)).size).toBe(choice.options.length);
      for (const o of choice.options) expect(o.title).toBeTruthy();
    }
    expect(MOTION_FIELDS).toEqual(['textMotion', 'photoMotion', 'sceneTransition']);
  });

  it('без выбора — подача компоновки, чужое значение не ломает ролик', () => {
    for (const design of DESIGN_IDS) {
      expect(resolveStyle({}, design)).toEqual(STYLE_DEFAULTS[design]);
      for (const [field, id] of Object.entries(STYLE_DEFAULTS[design])) expect(isStyleOption(field, id)).toBe(true);
    }
    expect(resolveStyle({textMotion: 'bounce', sceneTransition: 'iris'}, 'catalog'))
      .toEqual({textMotion: 'wipe', photoMotion: 'match', sceneTransition: 'iris', plates: 'lines'});
  });

  it('сервер проверяет стиль одним правилом: отсутствующее можно, чужое — нет', () => {
    expect(styleError({})).toBeNull();
    expect(styleError({photoMotion: 'stack', sceneTransition: 'iris', plates: 'big'})).toBeNull();
    expect(styleError({photoMotion: 'iris'})).toMatch(/Движение фото/);
    expect(styleError({plates: '<script>'})).toMatch(/Подача данных/);
  });

  it('кривые доходят ровно до конца и не выскакивают за него', () => {
    for (const f of [easeOut, smooth]) { expect(f(0)).toBe(0); expect(f(1)).toBe(1); expect(f(2)).toBe(1); expect(f(-1)).toBe(0); }
  });

  it('вертикальная смена и толчок вбок: сцены едут вместе, без щели и наезда', () => {
    const shift = (s: React.CSSProperties) => Number(String(s.transform).match(/\((-?[\d.e-]+)%\)/)![1]);
    for (const id of ['push', 'push_side'] as const) {
      expect(shift(sceneLayer(id, 'in', 0))).toBe(100);
      expect(shift(sceneLayer(id, 'out', 1))).toBe(-100);
      // На одном кадре входящая и уходящая разнесены ровно на экран
      for (const p of [.2, .5, .8]) expect(shift(sceneLayer(id, 'in', p)) - shift(sceneLayer(id, 'out', p))).toBeCloseTo(100);
    }
  });

  it('переходы: входящая сцена в конце открыта целиком, уходящая в начале — на месте', () => {
    for (const id of idsOf(SCENE_TRANSITIONS) as Parameters<typeof sceneLayer>[0][]) {
      const end = sceneLayer(id, 'in', 1);
      const start = sceneLayer(id, 'out', 0);
      for (const s of [end, start]) {
        expect(s.opacity ?? 1, id).toBeCloseTo(1);
        expect(s.filter, id).toBeUndefined();
        expect(String(s.transform ?? 'translateX(0%)'), id).toMatch(/^(translate[XY]\((-?0)%\)|scale\(1\))$/);
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
    expect(sceneOverlap('fade', 30)).toBe(12);
    expect(sceneOverlap('fade', 60)).toBe(24);
    expect(sceneOverlap('push', 30)).toBe(23);
  });

  it('движение фото: подписи ждут раскрытия, без нужных фото — «Окно»', () => {
    expect(textDelay('pan')).toBe(0);
    expect(textDelay('still')).toBe(0);
    expect(textDelay('window')).toBeGreaterThan(0);
    expect(photoFallback('stack', {single: true, spare: 1})).toBe('window');
    expect(photoFallback('stack', {single: true, spare: 2})).toBe('stack');
    expect(photoFallback('detail', {single: false, spare: 3})).toBe('window');
    expect(photoFallback('pan', {single: false, spare: 0})).toBe('pan');
  });

  it('оформление объявления: снимок поверх бренда, «Исходный» снимает пресет, без снимка — бренд', () => {
    const designed = {...brand, design: 'cinema' as const, designVariant: 1 as const, name: 'Компания'};
    expect(applyLook(designed, undefined)).toBe(designed);
    const look = pickLook({...designed, design: 'catalog', bg: '#FFFFFF', sceneTransition: 'iris'});
    // Движение и подача — в том же снимке, действующими значениями: умолчания потом его не поменяют
    expect([look.textMotion, look.photoMotion, look.sceneTransition, look.plates]).toEqual(['wipe', 'match', 'iris', 'lines']);
    const next = applyLook(designed, look);
    expect([next.design, next.bg, next.name, next.assets, next.sceneTransition]).toEqual(['catalog', '#FFFFFF', 'Компания', brand.assets, 'iris']);
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
