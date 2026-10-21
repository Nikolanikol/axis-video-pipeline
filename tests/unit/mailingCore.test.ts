// Ядро рассылок (cores/mailing, 21.10): вёрстка и подстановки, проверка черновика, пачка и
// отказы Resend. Сеть подменена — тест не ходит в Resend
import {afterEach, describe, expect, it, vi} from 'vitest';
// @ts-ignore — модуль ядра без типов
import {createClient, fill, problemsOf, renderMessage, textToHtml} from '../../cores/mailing/src/index.mjs';

const brand = {name: 'KOK', logoUrl: 'https://kok.test/kok/email-logo.png'};
const unsub = 'https://kok.test/api/public/unsubscribe?k=00000000-0000-0000-0000-000000000000';

describe('письмо рассылки', () => {
  it('подставляет {имя} и {компания}, неизвестное оставляет', () => {
    expect(fill('Здравствуйте, {имя}! Для «{ Компания }». {цена}', {name: 'Анна', company: 'Busan Cars'}))
      .toBe('Здравствуйте, Анна! Для «Busan Cars». {цена}');
  });

  it('текст → абзацы, жирный, ссылки; HTML менеджера экранируется', () => {
    const html = textToHtml('Первый **важный**\nвторая строка\n\nСсылка https://kok.test/a?b=1&c=2.\n<script>x</script>');
    expect(html).toContain('<b>важный</b>');
    expect(html).toContain('<br>');
    expect(html.match(/<p /g)).toHaveLength(2);
    // Точка после адреса — не часть ссылки
    expect(html).toContain('href="https://kok.test/a?b=1&amp;c=2"');
    expect(html).not.toContain('<script>');
  });

  it('в письме отписка, кнопка и текстовая версия', () => {
    const m = renderMessage({subject: 'Новое для {компания}', body: 'Привет, {имя}', button: {label: 'Открыть', url: 'https://kok.test'},
      vars: {name: 'Анна', company: 'Busan'}, brand, unsubscribeUrl: unsub});
    expect(m.subject).toBe('Новое для Busan');
    expect(m.html).toContain(unsub);
    expect(m.html).toContain('>Открыть</a>');
    expect(m.text).toContain(`Отписаться: ${unsub}`);
    expect(m.text).toContain('Открыть: https://kok.test');
  });

  it('кнопка без https не попадает в письмо', () => {
    const m = renderMessage({subject: 'a', body: 'b', button: {label: 'Жми', url: 'javascript:alert(1)'}, brand, unsubscribeUrl: unsub});
    expect(m.html).not.toContain('Жми');
  });
});

describe('проверка черновика', () => {
  it('пустое, кривая кнопка и неизвестная подстановка — проблемы словами', () => {
    expect(problemsOf({subject: '', body: '', button: {}})).toEqual(['Нет темы письма', 'Нет текста письма']);
    expect(problemsOf({subject: 'a', body: 'Привет, {имяя}', button: {label: 'x', url: 'ftp://x'}}))
      .toEqual(['Ссылка кнопки должна начинаться с https://', 'Неизвестная подстановка {имяя} — есть только {имя} и {компания}']);
    expect(problemsOf({subject: 'a', body: 'Привет, {имя}', button: {label: '', url: ''}})).toEqual([]);
  });
});

describe('отправка через Resend', () => {
  afterEach(() => vi.unstubAllGlobals());
  const msg = (to: string) => ({to, subject: 's', html: '<p>h</p>', text: 't', unsubscribeUrl: unsub});

  it('пачка — один запрос с заголовками отписки, ответ — id по порядку', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({url, body: JSON.parse(init.body)});
      return new Response(JSON.stringify({data: [{id: 'e1'}, {id: 'e2'}]}), {status: 200});
    });
    const c = createClient({apiKey: 'k', from: 'KOK <news@kok.test>'});
    expect(await c.sendBatch([msg('a@x.test'), msg('b@x.test')])).toEqual(['e1', 'e2']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    expect(calls[0].body[0].headers['List-Unsubscribe']).toBe(`<${unsub}>`);
    expect(calls[0].body[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('429 — RATE_LIMITED и можно повторить; 422 — BAD_INPUT; 403 — UPSTREAM_BLOCKED', async () => {
    const c = createClient({apiKey: 'k', from: 'KOK <news@kok.test>'});
    for (const [status, code, retryable] of [[429, 'RATE_LIMITED', true], [422, 'BAD_INPUT', false], [403, 'UPSTREAM_BLOCKED', false]] as const) {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({message: 'нет'}), {status}));
      await expect(c.send(msg('a@x.test'))).rejects.toMatchObject({code, retryable});
    }
  });

  it('без ключа клиент не готов и не шлёт', async () => {
    const c = createClient({apiKey: '', from: 'KOK <news@kok.test>'});
    expect(c.ready).toBe(false);
    await expect(c.sendBatch([msg('a@x.test')])).rejects.toMatchObject({code: 'BAD_INPUT'});
  });
});
