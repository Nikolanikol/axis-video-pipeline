// Письма платформы (клиенту она — KOK, внутри — SMMAKER): подтверждение почты и сброс пароля. Отправляет Resend (resend.com).
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
const layout = (title, body, button) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f2ef;font-family:Manrope,Arial,sans-serif;color:#1c1c20">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#0b0b0d;padding:18px 28px"><img src="${escape(appUrl())}/kok/email-logo.png" width="120" height="38" alt="KOK" style="display:block;border:0;color:#f7f2eb;font-size:22px;font-weight:bold"></div>
<div style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
${body}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="background:#8e0d2c;color:#f7f2eb;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">${escape(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#888;margin-top:24px">Если вы не регистрировались в KOK, просто удалите это письмо.</p>
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
