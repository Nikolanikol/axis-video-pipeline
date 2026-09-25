// Профиль клиента: дефолты текстов по (режим × язык) и модель цены (export / domestic).
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {PRICING_MODES, marketFromProfile, priceView, resolveProfile, resolveTexts} from '../../src/shared/profile.js';

const ROOT = path.resolve(__dirname, '../..');
const copy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/copy.json'), 'utf8'));

describe('дефолты платформы (config/copy.json)', () => {
  it('покрывают обе модели цены', () => {
    for (const mode of PRICING_MODES) expect(copy[mode], mode).toBeTruthy();
  });

  it('у каждого набора есть английский — на него падаем при незнакомом языке', () => {
    for (const mode of PRICING_MODES) expect(copy[mode].en, `${mode}.en`).toBeTruthy();
  });

  it('во всех наборах один и тот же набор ключей — иначе на каком-то языке плашка пустая', () => {
    const keysOf = (o: object) => Object.keys(o).sort().join(',');
    const sets = Object.values(copy).flatMap((byLang) => Object.values(byLang as object));
    const first = keysOf(sets[0] as object);
    for (const s of sets) expect(keysOf(s as object)).toBe(first);
  });
});

describe('resolveTexts', () => {
  it('берёт дефолт нужного режима и языка', () => {
    const t = resolveTexts(copy, 'export', 'mk', {});
    expect(t.priceLabel).toBe('Цена до {port}');
    expect(t.hookTagline).toBe('From Korea');
  });

  it('внутренний рынок даёт другие тексты, без «до порта» и фрахта', () => {
    const t = resolveTexts(copy, 'domestic', 'ru', {});
    expect(t.priceLabel).toBe('Цена');
    // на внутреннем рынке приписок про морской фрахт нет
    expect(t.priceNoteIncluded).toBe('');
  });

  it('незнакомый язык откатывается на английский, а не оставляет пусто', () => {
    const t = resolveTexts(copy, 'export', 'zz', {});
    expect(t).toEqual(copy.export.en);
  });

  it('правки клиента накрывают дефолт, но только заданные ключи', () => {
    const t = resolveTexts(copy, 'export', 'mk', {hookTagline: 'Своя строка'});
    expect(t.hookTagline).toBe('Своя строка');
    // остальное осталось из дефолта
    expect(t.priceLabel).toBe('Цена до {port}');
  });

  it('пустой и null в правках игнорируются, а не затирают дефолт пустотой', () => {
    const t = resolveTexts(copy, 'export', 'mk', {priceLabel: undefined, ctaAccent: null as unknown as string});
    expect(t.priceLabel).toBe('Цена до {port}');
    expect(t.ctaAccent).toBe('in 24 hours');
  });
});

// Явный профиль для тестов: default.json правит пользователь (режим, язык), и завязываться
// на его текущее содержимое нельзя — тесты стали бы падать от смены настроек в интерфейсе.
const exportProfile = () => ({
  company: 'K-AXIS MOTORS', language: 'mk',
  contacts: {whatsapp: '+82 10 5865 4344', site: 'kmotors.shop'},
  pricing: {mode: 'export', currency: 'USD',
    export: {origin: 'Инчон', originCountry: 'Кореја', port: 'Драч', portCountry: 'Албанија', freight: 1500}},
  texts: {},
});

describe('resolveProfile', () => {
  it('возвращает профиль с уже полными текстами', () => {
    const resolved = resolveProfile(exportProfile(), copy);
    expect(resolved.company).toBe('K-AXIS MOTORS');
    expect(resolved.texts.priceLabel).toBe('Цена до {port}');
    expect(resolved.texts.whatsappLabel).toBe('WhatsApp');
  });
});

describe('priceView — модель цены', () => {
  it('экспорт добавляет фрахт и просит показать маршрут', () => {
    const v = priceView(6000, {mode: 'export', currency: 'USD', export: {origin: 'a', originCountry: 'a', port: 'b', portCountry: 'b', freight: 1500}});
    expect(v.total).toBe(7500);
    expect(v.freight).toBe(1500);
    expect(v.showRoute).toBe(true);
  });

  it('внутренний рынок отдаёт цену как есть и без маршрута', () => {
    const v = priceView(6000, {mode: 'domestic', currency: 'EUR'});
    expect(v.total).toBe(6000);
    expect(v.freight).toBe(0);
    expect(v.showRoute).toBe(false);
  });

  it('нет цены — total null, а не ноль: это черновик', () => {
    expect(priceView(null, {mode: 'export', currency: 'USD', export: {freight: 1500} as never}).total).toBeNull();
    expect(priceView(undefined, {mode: 'domestic', currency: 'USD'}).total).toBeNull();
  });

  it('неизвестный режим считается экспортом — так безопаснее для старых данных', () => {
    const v = priceView(6000, {mode: 'weird' as never, currency: 'USD', export: {freight: 1000} as never});
    expect(v.mode).toBe('export');
    expect(v.total).toBe(7000);
  });
});

describe('marketFromProfile — мост под старые пайплайны', () => {
  const profile = exportProfile;

  it('экспорт: маршрут, фрахт и тексты на месте, имя = компания', () => {
    const m = marketFromProfile(profile(), copy);
    expect(m.name).toBe('K-AXIS MOTORS');
    expect(m.origin).toBe('Инчон');
    expect(m.port).toBe('Драч');
    expect(m.freightUsd).toBe(1500);
    expect(m.whatsapp).toBe('+82 10 5865 4344');
    expect(m.site).toBe('kmotors.shop');
    expect(m.texts.priceLabel).toBe('Цена до {port}');
    // новые поля для стадии 4
    expect(m.pricingMode).toBe('export');
    expect(m.currency).toBe('USD');
  });

  it('внутренний рынок: ни маршрута, ни фрахта, тексты из domestic', () => {
    const p = profile();
    p.pricing = {mode: 'domestic', currency: 'EUR'};
    p.language = 'ru';
    const m = marketFromProfile(p, copy);
    expect(m.origin).toBe('');
    expect(m.port).toBe('');
    expect(m.freightUsd).toBe(0);
    expect(m.pricingMode).toBe('domestic');
    expect(m.currency).toBe('EUR');
    expect(m.texts.priceLabel).toBe('Цена');
  });

  it('форма совпадает с прежним Market: те же ключи, что читают пайплайны', () => {
    const m = marketFromProfile(profile(), copy);
    for (const k of ['name', 'origin', 'originCountry', 'port', 'portCountry', 'freightUsd', 'whatsapp', 'site', 'texts', 'music']) {
      expect(m, `нет поля ${k}`).toHaveProperty(k);
    }
  });
});
