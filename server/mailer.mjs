// Письма платформы (клиенту она — KOK, внутри — SMMAKER): подтверждение и смена почты, сброс
// пароля, уведомления о смене пароля и почты, удаление аккаунта, подтверждение оплаты.
// Отправляет Resend (resend.com).
//
// Подтверждение оплаты (paymentMail, 13.10) — письмо о деньгах, поэтому правила строже:
//   • кому — только владельцу кабинета (ownerOf в accounts.mjs), а не тому, кто нажал «Оплатить»;
//   • кто зовёт — два места: начисление онлайн-оплаты (receipt в payments.mjs) и ручное начисление
//     пакета менеджером (packMail в accounts.mjs). Оба — ПОСЛЕ транзакции начисления и ловят ошибку
//     сами: письмо никогда не отменяет и не задерживает начисление;
//   • валюта — из заказа кассы, не зашита: письмо одно для всех касс (USDT, рубли AnyPay…);
//   • это подтверждение, не фискальный чек — слова «чек» как названия документа в письме нет.
// Порядок отправки, журнал и тревоги — CONTEXT.md, «Онлайн-оплата», путь денег, шаг 5.
//
// Переменные окружения:
//   RESEND_API_KEY   — ключ Resend. Не задан — письмо не уходит, а пишется в журнал сервера:
//                      так работают тесты и Mac без ключа, код из письма виден в консоли;
//   RESEND_FROM      — отправитель. Resend шлёт только с домена, подтверждённого записями DNS.
//                      Пока своего домена нет — onboarding@resend.dev, и тогда письма доходят
//                      ТОЛЬКО до почты владельца аккаунта Resend (ограничение Resend для проб);
//   SMMAKER_APP_URL  — адрес приложения для ссылок в письмах (на проде — публичный домен).

const DEFAULT_FROM = 'KOK <onboarding@resend.dev>';

/** Адрес приложения без хвостового «/» — ссылки в письмах строятся от него */
export const appUrl = () => (process.env.SMMAKER_APP_URL?.trim() || `http://localhost:${process.env.PORT || 3210}`).replace(/\/+$/, '');

const resend = async ({to, subject, text, html}) => {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.log(`Письмо не отправлено (нет RESEND_API_KEY) → ${to}: ${subject}\n${text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM, to: [to], subject, text, html}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ответил ${res.status}: ${(await res.text()).slice(0, 300)}`);
};

let transport = resend;
/** Для тестов: перехватить письма вместо отправки. Без аргумента — вернуть Resend */
export const setMailTransport = (fn) => { transport = fn ?? resend; };

export const sendMail = (mail) => transport(mail);

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// Вёрстка простая: одна картинка (логотип) и одна кнопка. Сложные письма с множеством
// картинок чаще уходят в спам, а человеку нужны только код или кнопка.
// Логотип — PNG, а не SVG: Gmail и Outlook SVG не показывают. Логотип светлый, поэтому
// полоса под ним тёмная, а тёмный фон зашит и в сам PNG — часть почтовиков выкидывает
// фон ячеек. Если картинки заблокированы, в полосе остаётся подпись «KOK» из alt.
// Тело письма — светлое: тёмные письма почтовики в тёмной теме перекрашивают непредсказуемо.
// footer — приписка внизу: по умолчанию для писем при регистрации; уведомлениям о действиях
// в аккаунте нужна своя — «не регистрировались» там звучит странно
const layout = (title, body, button, footer = 'Если вы не регистрировались в KOK, просто удалите это письмо.') => `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f2ef;font-family:Manrope,Arial,sans-serif;color:#1c1c20">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#0b0b0d;padding:18px 28px"><img src="${escape(appUrl())}/kok/email-logo.png" width="120" height="38" alt="KOK" style="display:block;border:0;color:#f7f2eb;font-size:22px;font-weight:bold"></div>
<div style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
${body}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="background:#8e0d2c;color:#f7f2eb;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">${escape(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#888;margin-top:24px">${escape(footer)}</p>
</div></div></body></html>`;

export const verifyMail = ({to, name, code, link, credits}) => sendMail({
  to,
  subject: `Код подтверждения KOK: ${code}`,
  text: `${name ? `${name}, з` : 'З'}дравствуйте!\n\nКод подтверждения почты: ${code}\nИли откройте ссылку: ${link}\n\n`
    + `${credits ? `После подтверждения на счёт придут ${credits} бесплатных кредитов.\n` : ''}Код действует 24 часа.`,
  html: layout('Подтвердите почту',
    `<p>Код подтверждения:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0">${escape(code)}</p>
<p>Введите его в KOK или нажмите кнопку.${credits ? ` После подтверждения на счёт придут ${credits} бесплатных кредитов.` : ''}</p>
<p style="font-size:13px;color:#666">Код действует 24 часа.</p>`,
    {url: link, label: 'Подтвердить почту'}),
});

export const resetMail = ({to, link}) => sendMail({
  to,
  subject: 'Сброс пароля KOK',
  text: `Чтобы задать новый пароль, откройте ссылку: ${link}\n\nСсылка действует час и сработает один раз. Если вы не просили сброс — ничего не делайте, пароль останется прежним.`,
  html: layout('Сброс пароля',
    '<p>Чтобы задать новый пароль, нажмите кнопку. Ссылка действует час и сработает один раз.</p><p style="font-size:13px;color:#666">Если вы не просили сброс — ничего не делайте, пароль останется прежним.</p>',
    {url: link, label: 'Задать новый пароль'}),
});

// Смена почты из кабинета: код на НОВЫЙ адрес. Только код, без кнопки — вводят его в кабинете,
// где человек уже вошёл; ссылка, открытая на другом устройстве, сменила бы почту без входа
export const emailChangeMail = ({to, name, code}) => sendMail({
  to,
  subject: `Код для смены почты KOK: ${code}`,
  text: `${name ? `${name}, з` : 'З'}дравствуйте!\n\nКод для смены почты в KOK: ${code}\nВведите его в кабинете. Код действует час.\n\n`
    + 'Если вы не меняли почту — просто удалите это письмо.',
  html: layout('Новая почта для KOK',
    `<p>Код для смены почты:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0">${escape(code)}</p>
<p>Введите его в кабинете. Код действует час.</p>`,
    null, 'Если вы не меняли почту — просто удалите это письмо, адрес останется прежним.'),
});

// Уведомление о действии в аккаунте (сменили пароль, почту): если делал не владелец — узнает сразу
export const noticeMail = ({to, title, text}) => sendMail({
  to,
  subject: `KOK: ${title.toLowerCase()}`,
  text,
  html: layout(title, text.split('\n\n').map((p) => `<p>${escape(p)}</p>`).join('\n'), null, 'Письмо о безопасности аккаунта KOK.'),
});

// Сумма в валюте заказа. Валюта — код ISO строчными, как пишет её касса в заказ (usd у NOWPayments,
// у рублёвой кассы будет rub). Знак — для привычных валют, остальные — кодом: письмо не должно
// падать из-за новой валюты новой кассы
const SIGNS = {usd: '$', krw: '₩', rub: '₽', eur: '€', jpy: '¥', cny: '¥'};
// Вона, иена и рубль — целыми (копейки в рублёвой кассе — редкость, а «49 000,00 ₩» читается как ошибка)
const WHOLE = new Set(['krw', 'jpy', 'rub']);
export const money = (amount, currency) => {
  const c = String(currency ?? '').toLowerCase();
  const n = Number(amount);
  const digits = WHOLE.has(c) && Number.isInteger(n) ? 0 : 2;
  const num = n.toLocaleString('ru-RU', {minimumFractionDigits: digits, maximumFractionDigits: 2});
  if (c === 'usd') return `$${num}`;
  if (c === 'krw') return `₩${num}`;
  return SIGNS[c] ? `${num} ${SIGNS[c]}` : `${num} ${c.toUpperCase()}`;
};

// Подтверждение пополнения кредитов владельцу кабинета: что куплено, сколько и как заплачено, сколько
// кредитов и до какого числа. Это подтверждение, а не чек — фискальных документов KOK не выдаёт,
// слово «чек» в письме не пишем.
//   paid    — {amount, currency, method}: онлайн-оплата через кассу, любую (USDT, рубли AnyPay…).
//             Нет — пакет начислил менеджер в админке после оплаты мимо кассы: сколько и в какой валюте
//             клиент заплатил на самом деле, мы не знаем, поэтому пишем цену тарифа, а не «оплачено»;
//   priceKrw — цена тарифа в вонах (по ней считается счёт), в скобках, если валюта оплаты другая;
//   orderId — номер заказа кассы; у ручного начисления его нет;
//   sandbox — оплата из песочницы (превью): помечаем, чтобы тестовое письмо не приняли за настоящее
export const paymentMail = ({to, name, plan, title, credits, until, paid = null, priceKrw, orderId = null, paidAt, link, sandbox = false}) => {
  const date = (d) => new Date(d).toLocaleDateString('ru-RU');
  const price = money(priceKrw, 'krw');
  const sum = paid && [money(paid.amount, paid.currency), paid.method && `· ${paid.method}`,
    String(paid.currency).toLowerCase() !== 'krw' && `(тариф ${price})`].filter(Boolean).join(' ');
  const rows = [
    ['Покупка', `${plan ? 'Тариф' : 'Докупка'} «${title}»`],
    paid ? ['Оплачено', sum] : ['Стоимость', `${price} · оплата через менеджера`],
    ['Зачислено', `${credits} кр. — действуют до ${date(until)}`],
    ['Дата', date(paidAt)],
    orderId && ['Номер заказа', orderId],
  ].filter(Boolean);
  const test = sandbox ? 'Тестовая оплата из песочницы — настоящих денег не было.' : '';
  const button = orderId ? 'Открыть заказ' : 'Открыть кабинет';
  return sendMail({
    to,
    subject: `${sandbox ? '[ТЕСТ] ' : ''}KOK: оплата получена, +${credits} кр.`,
    text: `${name ? `${name}, з` : 'З'}дравствуйте!\n\nОплата получена, кредиты зачислены на счёт.\n\n`
      + rows.map(([k, v]) => `${k}: ${v}`).join('\n')
      + `\n\n${button}: ${link}${test ? `\n\n${test}` : ''}`,
    html: layout('Оплата получена',
      `<p>Кредиты зачислены на счёт, можно работать.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows.map(([k, v]) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;font-weight:bold">${escape(v)}</td></tr>`).join('')}</table>
${test ? `<p style="font-size:13px;color:#8e0d2c">${escape(test)}</p>` : ''}`,
      {url: link, label: button},
      `Подтверждение оплаты KOK. Это не фискальный чек. Вопросы по оплате — напишите в поддержку${orderId ? ' и укажите номер заказа' : ''}.`),
  });
};

// Аккаунт поставлен на удаление: до какого числа и кнопка «восстановить». Кнопка ведёт на страницу
// приложения, а та шлёт POST — GET-ссылку почтовые сканеры открыли бы сами и отменили удаление
export const deletionMail = ({to, name, link, until}) => {
  const date = new Date(until).toLocaleDateString('ru-RU');
  return sendMail({
    to,
    subject: 'KOK: аккаунт будет удалён',
    text: `${name ? `${name}, з` : 'З'}дравствуйте!\n\nАккаунт KOK закрыт и будет удалён окончательно ${date}: ролики, карусели, объявления и настройки сотрутся, `
      + `оставшиеся кредиты сгорят.\n\nПередумали — откройте ссылку до ${date}, и всё вернётся как было: ${link}`,
    html: layout('Аккаунт будет удалён',
      `<p>Аккаунт KOK закрыт и будет удалён окончательно <b>${escape(date)}</b>: ролики, карусели, объявления и настройки сотрутся, оставшиеся кредиты сгорят.</p>
<p>Передумали — нажмите кнопку до ${escape(date)}, и всё вернётся как было.</p>`,
      {url: link, label: 'Восстановить аккаунт'}, 'Если удаляли не вы — нажмите кнопку и смените пароль.'),
  });
};
