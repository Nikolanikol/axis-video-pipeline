// Подтверждение оплаты (server/mailer.mjs, 13.10): одно письмо для всех касс — сумма и валюта берутся
// из заказа. Новая касса (рубли AnyPay) не должна требовать правки письма, незнакомая валюта — не ронять его
import {afterEach, describe, expect, it} from 'vitest';
// @ts-ignore — модуль сервера без типов
import {money, paymentMail, setMailTransport} from '../../server/mailer.mjs';

const base = {to: 'a@kok.test', name: 'Иван', plan: true, title: 'Базовый', credits: 30, until: '2026-11-13T00:00:00Z',
  priceKrw: 49000, paidAt: '2026-10-13T00:00:00Z', link: 'https://kok.test/#/account/pay-1'};
const send = async (over: object) => {
  const out: any[] = [];
  setMailTransport(async (m: any) => { out.push(m); });
  await paymentMail({...base, ...over});
  return out[0];
};

describe('подтверждение оплаты', () => {
  afterEach(() => setMailTransport());

  it('суммы — в своей валюте', () => {
    expect(money(36.51, 'usd')).toBe('$36,51');
    expect(money(49000, 'krw')).toMatch(/^₩49\s000$/);
    expect(money(4500, 'rub')).toMatch(/^4\s500 ₽$/);
    expect(money(12.5, 'usdt')).toBe('12,50 USDT');
  });

  it('USDT: доллары, способ и цена тарифа в вонах', async () => {
    const m = await send({paid: {amount: 36.51, currency: 'usd', method: 'USDT TRC20'}, orderId: 'pay-1'});
    expect(m.text).toMatch(/Оплачено: \$36,51 · USDT TRC20 \(тариф ₩49\s000\)/);
    expect(m.text).toContain('Номер заказа: pay-1');
  });

  it('рубли (будущая касса): рубли, без правки письма', async () => {
    const m = await send({paid: {amount: 3200, currency: 'rub', method: 'СБП'}, orderId: 'pay-2'});
    expect(m.text).toMatch(/Оплачено: 3\s200 ₽ · СБП \(тариф ₩49\s000\)/);
  });

  it('оплата в вонах — без повтора цены в скобках', async () => {
    const m = await send({paid: {amount: 49000, currency: 'krw'}, orderId: 'pay-3'});
    expect(m.text).toMatch(/Оплачено: ₩49\s000\n/);
  });

  it('ручное начисление: цена тарифа, без номера заказа, кнопка в кабинет', async () => {
    const m = await send({link: 'https://kok.test/#/account'});
    expect(m.text).toMatch(/Стоимость: ₩49\s000 · оплата через менеджера/);
    expect(m.text).not.toContain('Номер заказа');
    expect(m.html).toContain('Открыть кабинет');
  });

  it('песочница помечена в теме и тексте; имя и название экранируются в HTML', async () => {
    const m = await send({paid: {amount: 1, currency: 'usd'}, orderId: 'pay-4', sandbox: true, title: '<b>x</b>'});
    expect(m.subject).toMatch(/^\[ТЕСТ\] /);
    expect(m.text).toContain('песочниц');
    expect(m.html).not.toContain('<b>x</b>');
  });
});
