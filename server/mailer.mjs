// Письма SMMAKER: подтверждение почты и сброс пароля. Отправляет Resend (resend.com).
//
// Переменные окружения:
//   RESEND_API_KEY   — ключ Resend. Не задан — письмо не уходит, а пишется в журнал сервера:
//                      так работают тесты и Mac без ключа, код из письма виден в консоли;
//   RESEND_FROM      — отправитель. Resend шлёт только с домена, подтверждённого записями DNS.
//                      Пока своего домена нет — onboarding@resend.dev, и тогда письма доходят
//                      ТОЛЬКО до почты владельца аккаунта Resend (ограничение Resend для проб);
//   SMMAKER_APP_URL  — адрес приложения для ссылок в письмах (на проде — публичный домен).

const DEFAULT_FROM = 'SMMAKER <onboarding@resend.dev>';

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

// Письмо простое, без картинок: картинки и сложная вёрстка поднимают шанс попасть в спам,
// а единственное, что человеку нужно, — код или кнопка
const layout = (title, body, button) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,sans-serif;color:#222">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
${body}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="background:#b87333;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escape(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#888;margin-top:24px">Если вы не регистрировались в SMMAKER, просто удалите это письмо.</p>
</div></body></html>`;

export const verifyMail = ({to, name, code, link, credits}) => sendMail({
  to,
  subject: `Код подтверждения SMMAKER: ${code}`,
  text: `${name ? `${name}, з` : 'З'}дравствуйте!\n\nКод подтверждения почты: ${code}\nИли откройте ссылку: ${link}\n\n`
    + `${credits ? `После подтверждения на счёт придут ${credits} бесплатных кредитов.\n` : ''}Код действует 24 часа.`,
  html: layout('Подтвердите почту',
    `<p>Код подтверждения:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0">${escape(code)}</p>
<p>Введите его в SMMAKER или нажмите кнопку.${credits ? ` После подтверждения на счёт придут ${credits} бесплатных кредитов.` : ''}</p>
<p style="font-size:13px;color:#666">Код действует 24 часа.</p>`,
    {url: link, label: 'Подтвердить почту'}),
});

export const resetMail = ({to, link}) => sendMail({
  to,
  subject: 'Сброс пароля SMMAKER',
  text: `Чтобы задать новый пароль, откройте ссылку: ${link}\n\nСсылка действует час и сработает один раз. Если вы не просили сброс — ничего не делайте, пароль останется прежним.`,
  html: layout('Сброс пароля',
    '<p>Чтобы задать новый пароль, нажмите кнопку. Ссылка действует час и сработает один раз.</p><p style="font-size:13px;color:#666">Если вы не просили сброс — ничего не делайте, пароль останется прежним.</p>',
    {url: link, label: 'Задать новый пароль'}),
});
