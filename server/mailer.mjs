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

// Язык письма (15.11): язык человека — smmaker_users.lang, его ставит переключатель RU · EN · SQ.
// Не знаем (зарегистрирован до переводов) — по-русски, как было. Албанский — машинный перевод,
// перед запуском вычитывает носитель. Русские тексты не менялись: их проверяют тесты писем
export const mailLang = (lang) => (lang === 'en' || lang === 'sq' ? lang : 'ru');
const DATE_LOCALE = {ru: 'ru-RU', en: 'en-GB', sq: 'sq-AL'};
const dateIn = (lang, d) => new Date(d).toLocaleDateString(DATE_LOCALE[mailLang(lang)]);

// Приветствие с именем и без: «Анна, здравствуйте!» / «Hello Anna,» / «Përshëndetje Anna,»
const HELLO = {
  ru: (name) => `${name ? `${name}, з` : 'З'}дравствуйте!`,
  en: (name) => `Hello${name ? ` ${name}` : ''},`,
  sq: (name) => `Përshëndetje${name ? ` ${name}` : ''},`,
};

const M = {
  ru: {
    footer: 'Если вы не регистрировались в KOK, просто удалите это письмо.',
    verify: {
      subject: (code) => `Код подтверждения KOK: ${code}`, title: 'Подтвердите почту', codeLabel: 'Код подтверждения:',
      textCode: (code, link) => `Код подтверждения почты: ${code}\nИли откройте ссылку: ${link}`,
      credits: (n) => `После подтверждения на счёт придут ${n} бесплатных кредитов.`,
      enter: 'Введите его в KOK или нажмите кнопку.', valid: 'Код действует 24 часа.', button: 'Подтвердить почту',
    },
    reset: {
      subject: 'Сброс пароля KOK', title: 'Сброс пароля',
      text: (link) => `Чтобы задать новый пароль, откройте ссылку: ${link}\n\nСсылка действует час и сработает один раз. Если вы не просили сброс — ничего не делайте, пароль останется прежним.`,
      body: 'Чтобы задать новый пароль, нажмите кнопку. Ссылка действует час и сработает один раз.',
      ignore: 'Если вы не просили сброс — ничего не делайте, пароль останется прежним.', button: 'Задать новый пароль',
    },
    emailChange: {
      subject: (code) => `Код для смены почты KOK: ${code}`, title: 'Новая почта для KOK', codeLabel: 'Код для смены почты:',
      text: (code) => `Код для смены почты в KOK: ${code}\nВведите его в кабинете. Код действует час.\n\nЕсли вы не меняли почту — просто удалите это письмо.`,
      enter: 'Введите его в кабинете. Код действует час.',
      footer: 'Если вы не меняли почту — просто удалите это письмо, адрес останется прежним.',
    },
    noticeFooter: 'Письмо о безопасности аккаунта KOK.',
    notice: {
      password: {title: 'Пароль изменён', text: () => 'Пароль от KOK только что изменили в кабинете. Остальные устройства вышли из аккаунта.\n\nЕсли это были не вы — сбросьте пароль через «Забыли пароль?» на странице входа и напишите нам.'},
      email: {title: 'Почта аккаунта изменена', text: (v) => `Почту для входа в KOK сменили на ${v.email}. Если это были не вы — срочно напишите нам.`},
      restored: {title: 'Аккаунт восстановлен', text: () => 'Удаление аккаунта KOK отменено: всё на месте, можно работать дальше.'},
      deleted: {title: 'Аккаунт удалён', text: () => 'Аккаунт KOK удалён окончательно: файлы и личные данные стёрты. Спасибо, что были с нами.'},
    },
    deletion: {
      subject: 'KOK: аккаунт будет удалён', title: 'Аккаунт будет удалён',
      text: (date, link) => `Аккаунт KOK закрыт и будет удалён окончательно ${date}: ролики, карусели, объявления и настройки сотрутся, `
        + `оставшиеся кредиты сгорят.\n\nПередумали — откройте ссылку до ${date}, и всё вернётся как было: ${link}`,
      body: (date) => `<p>Аккаунт KOK закрыт и будет удалён окончательно <b>${escape(date)}</b>: ролики, карусели, объявления и настройки сотрутся, оставшиеся кредиты сгорят.</p>
<p>Передумали — нажмите кнопку до ${escape(date)}, и всё вернётся как было.</p>`,
      button: 'Восстановить аккаунт', footer: 'Если удаляли не вы — нажмите кнопку и смените пароль.',
    },
    pay: {
      tariff: (price) => `(тариф ${price})`, purchase: 'Покупка', plan: 'Тариф', topup: 'Докупка',
      paid: 'Оплачено', cost: 'Стоимость', viaManager: 'оплата через менеджера', credited: 'Зачислено',
      creditsUntil: (n, until) => `${n} кр. — действуют до ${until}`, date: 'Дата', order: 'Номер заказа',
      test: 'Тестовая оплата из песочницы — настоящих денег не было.', openOrder: 'Открыть заказ', openAccount: 'Открыть кабинет',
      subject: (n) => `KOK: оплата получена, +${n} кр.`, testMark: '[ТЕСТ] ',
      textHead: 'Оплата получена, кредиты зачислены на счёт.', title: 'Оплата получена', body: 'Кредиты зачислены на счёт, можно работать.',
      footer: (order) => `Подтверждение оплаты KOK. Это не фискальный чек. Вопросы по оплате — напишите в поддержку${order ? ' и укажите номер заказа' : ''}.`,
    },
  },
  en: {
    footer: 'If you did not sign up for KOK, just delete this email.',
    verify: {
      subject: (code) => `KOK confirmation code: ${code}`, title: 'Confirm your email', codeLabel: 'Confirmation code:',
      textCode: (code, link) => `Email confirmation code: ${code}\nOr open the link: ${link}`,
      credits: (n) => `Once confirmed, ${n} free credits will be added to your account.`,
      enter: 'Enter it in KOK or press the button.', valid: 'The code is valid for 24 hours.', button: 'Confirm email',
    },
    reset: {
      subject: 'KOK password reset', title: 'Password reset',
      text: (link) => `To set a new password, open the link: ${link}\n\nThe link is valid for one hour and works once. If you did not request a reset, do nothing — your password stays the same.`,
      body: 'To set a new password, press the button. The link is valid for one hour and works once.',
      ignore: 'If you did not request a reset, do nothing — your password stays the same.', button: 'Set a new password',
    },
    emailChange: {
      subject: (code) => `KOK email change code: ${code}`, title: 'New email for KOK', codeLabel: 'Email change code:',
      text: (code) => `Your KOK email change code: ${code}\nEnter it in your account. The code is valid for one hour.\n\nIf you did not change your email, just delete this message.`,
      enter: 'Enter it in your account. The code is valid for one hour.',
      footer: 'If you did not change your email, just delete this message — your address stays the same.',
    },
    noticeFooter: 'KOK account security notice.',
    notice: {
      password: {title: 'Password changed', text: () => 'Your KOK password was just changed in your account. Other devices have been signed out.\n\nIf this was not you, reset your password with “Forgot password?” on the sign-in page and contact us.'},
      email: {title: 'Account email changed', text: (v) => `Your KOK sign-in email was changed to ${v.email}. If this was not you, contact us right away.`},
      restored: {title: 'Account restored', text: () => 'Your KOK account deletion has been cancelled: everything is in place, you can carry on working.'},
      deleted: {title: 'Account deleted', text: () => 'Your KOK account has been permanently deleted: files and personal data are erased. Thank you for being with us.'},
    },
    deletion: {
      subject: 'KOK: your account will be deleted', title: 'Your account will be deleted',
      text: (date, link) => `Your KOK account is closed and will be permanently deleted on ${date}: videos, carousels, listings and settings will be erased, `
        + `and remaining credits will expire.\n\nChanged your mind? Open the link before ${date} and everything will be back: ${link}`,
      body: (date) => `<p>Your KOK account is closed and will be permanently deleted on <b>${escape(date)}</b>: videos, carousels, listings and settings will be erased, and remaining credits will expire.</p>
<p>Changed your mind? Press the button before ${escape(date)} and everything will be back.</p>`,
      button: 'Restore account', footer: 'If it was not you who deleted it, press the button and change your password.',
    },
    pay: {
      tariff: (price) => `(plan ${price})`, purchase: 'Purchase', plan: 'Plan', topup: 'Top-up',
      paid: 'Paid', cost: 'Price', viaManager: 'paid via manager', credited: 'Credited',
      creditsUntil: (n, until) => `${n} cr. — valid until ${until}`, date: 'Date', order: 'Order number',
      test: 'Sandbox test payment — no real money was charged.', openOrder: 'Open order', openAccount: 'Open account',
      subject: (n) => `KOK: payment received, +${n} cr.`, testMark: '[TEST] ',
      textHead: 'Payment received, credits have been added to your account.', title: 'Payment received', body: 'Credits have been added to your account — you can get to work.',
      footer: (order) => `KOK payment confirmation. This is not a fiscal receipt. Questions about the payment? Contact support${order ? ' and include the order number' : ''}.`,
    },
  },
  sq: {
    footer: 'Nëse nuk jeni regjistruar në KOK, thjesht fshijeni këtë email.',
    verify: {
      subject: (code) => `Kodi i konfirmimit KOK: ${code}`, title: 'Konfirmoni email-in', codeLabel: 'Kodi i konfirmimit:',
      textCode: (code, link) => `Kodi i konfirmimit të email-it: ${code}\nOse hapni lidhjen: ${link}`,
      credits: (n) => `Pas konfirmimit do t’ju shtohen ${n} kredite falas.`,
      enter: 'Shkruajeni në KOK ose shtypni butonin.', valid: 'Kodi vlen 24 orë.', button: 'Konfirmo email-in',
    },
    reset: {
      subject: 'Rivendosja e fjalëkalimit KOK', title: 'Rivendosja e fjalëkalimit',
      text: (link) => `Për të vendosur një fjalëkalim të ri, hapni lidhjen: ${link}\n\nLidhja vlen një orë dhe funksionon një herë. Nëse nuk e keni kërkuar rivendosjen, mos bëni asgjë — fjalëkalimi mbetet i njëjtë.`,
      body: 'Për të vendosur një fjalëkalim të ri, shtypni butonin. Lidhja vlen një orë dhe funksionon një herë.',
      ignore: 'Nëse nuk e keni kërkuar rivendosjen, mos bëni asgjë — fjalëkalimi mbetet i njëjtë.', button: 'Vendos fjalëkalim të ri',
    },
    emailChange: {
      subject: (code) => `Kodi për ndryshimin e email-it KOK: ${code}`, title: 'Email i ri për KOK', codeLabel: 'Kodi për ndryshimin e email-it:',
      text: (code) => `Kodi për ndryshimin e email-it në KOK: ${code}\nShkruajeni në llogarinë tuaj. Kodi vlen një orë.\n\nNëse nuk e keni ndryshuar email-in, thjesht fshijeni këtë mesazh.`,
      enter: 'Shkruajeni në llogarinë tuaj. Kodi vlen një orë.',
      footer: 'Nëse nuk e keni ndryshuar email-in, thjesht fshijeni këtë mesazh — adresa mbetet e njëjtë.',
    },
    noticeFooter: 'Njoftim sigurie për llogarinë KOK.',
    notice: {
      password: {title: 'Fjalëkalimi u ndryshua', text: () => 'Fjalëkalimi i KOK sapo u ndryshua në llogari. Pajisjet e tjera dolën nga llogaria.\n\nNëse nuk ishit ju, rivendosni fjalëkalimin me «Keni harruar fjalëkalimin?» në faqen e hyrjes dhe na shkruani.'},
      email: {title: 'Email-i i llogarisë u ndryshua', text: (v) => `Email-i për hyrje në KOK u ndryshua në ${v.email}. Nëse nuk ishit ju, na shkruani menjëherë.`},
      restored: {title: 'Llogaria u rikthye', text: () => 'Fshirja e llogarisë KOK u anulua: gjithçka është në vend, mund të vazhdoni punën.'},
      deleted: {title: 'Llogaria u fshi', text: () => 'Llogaria KOK u fshi përfundimisht: skedarët dhe të dhënat personale u fshinë. Faleminderit që ishit me ne.'},
    },
    deletion: {
      subject: 'KOK: llogaria do të fshihet', title: 'Llogaria do të fshihet',
      text: (date, link) => `Llogaria KOK është mbyllur dhe do të fshihet përfundimisht më ${date}: videot, karuselet, njoftimet dhe cilësimet do të fshihen, `
        + `kreditet e mbetura do të skadojnë.\n\nNdryshuat mendje? Hapni lidhjen para ${date} dhe gjithçka kthehet si më parë: ${link}`,
      body: (date) => `<p>Llogaria KOK është mbyllur dhe do të fshihet përfundimisht më <b>${escape(date)}</b>: videot, karuselet, njoftimet dhe cilësimet do të fshihen, kreditet e mbetura do të skadojnë.</p>
<p>Ndryshuat mendje? Shtypni butonin para ${escape(date)} dhe gjithçka kthehet si më parë.</p>`,
      button: 'Rikthe llogarinë', footer: 'Nëse nuk e fshitë ju, shtypni butonin dhe ndryshoni fjalëkalimin.',
    },
    pay: {
      tariff: (price) => `(plani ${price})`, purchase: 'Blerja', plan: 'Plani', topup: 'Shtesë',
      paid: 'Paguar', cost: 'Çmimi', viaManager: 'pagesë përmes menaxherit', credited: 'Shtuar',
      creditsUntil: (n, until) => `${n} kr. — vlejnë deri më ${until}`, date: 'Data', order: 'Numri i porosisë',
      test: 'Pagesë testuese nga sandbox — nuk u tërhoqën para të vërteta.', openOrder: 'Hap porosinë', openAccount: 'Hap llogarinë',
      subject: (n) => `KOK: pagesa u mor, +${n} kr.`, testMark: '[TEST] ',
      textHead: 'Pagesa u mor, kreditet u shtuan në llogari.', title: 'Pagesa u mor', body: 'Kreditet u shtuan në llogari — mund të filloni punën.',
      footer: (order) => `Konfirmim pagese KOK. Ky nuk është faturë fiskale. Pyetje për pagesën? Shkruani mbështetjes${order ? ' dhe tregoni numrin e porosisë' : ''}.`,
    },
  },
};

// Вёрстка простая: одна картинка (логотип) и одна кнопка. Сложные письма с множеством
// картинок чаще уходят в спам, а человеку нужны только код или кнопка.
// Логотип — PNG, а не SVG: Gmail и Outlook SVG не показывают. Логотип светлый, поэтому
// полоса под ним тёмная, а тёмный фон зашит и в сам PNG — часть почтовиков выкидывает
// фон ячеек. Если картинки заблокированы, в полосе остаётся подпись «KOK» из alt.
// Тело письма — светлое: тёмные письма почтовики в тёмной теме перекрашивают непредсказуемо.
// footer — приписка внизу: по умолчанию для писем при регистрации; уведомлениям о действиях
// в аккаунте нужна своя — «не регистрировались» там звучит странно
const layout = (title, body, button, footer, lang = 'ru') => `<!doctype html><html lang="${mailLang(lang)}"><body style="margin:0;padding:24px;background:#f4f2ef;font-family:Manrope,Arial,sans-serif;color:#1c1c20">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#0b0b0d;padding:18px 28px"><img src="${escape(appUrl())}/kok/email-logo.png" width="120" height="38" alt="KOK" style="display:block;border:0;color:#f7f2eb;font-size:22px;font-weight:bold"></div>
<div style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
${body}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="background:#8e0d2c;color:#f7f2eb;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">${escape(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#888;margin-top:24px">${escape(footer ?? M[mailLang(lang)].footer)}</p>
</div></div></body></html>`;

export const verifyMail = ({to, name, code, link, credits, lang = 'ru'}) => {
  const L = mailLang(lang);
  const w = M[L].verify;
  return sendMail({
    to,
    subject: w.subject(code),
    text: `${HELLO[L](name)}\n\n${w.textCode(code, link)}\n\n${credits ? `${w.credits(credits)}\n` : ''}${w.valid}`,
    html: layout(w.title,
      `<p>${escape(w.codeLabel)}</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0">${escape(code)}</p>
<p>${escape(w.enter)}${credits ? ` ${escape(w.credits(credits))}` : ''}</p>
<p style="font-size:13px;color:#666">${escape(w.valid)}</p>`,
      {url: link, label: w.button}, undefined, L),
  });
};

export const resetMail = ({to, link, lang = 'ru'}) => {
  const L = mailLang(lang);
  const w = M[L].reset;
  return sendMail({
    to,
    subject: w.subject,
    text: w.text(link),
    html: layout(w.title, `<p>${escape(w.body)}</p><p style="font-size:13px;color:#666">${escape(w.ignore)}</p>`,
      {url: link, label: w.button}, undefined, L),
  });
};

// Смена почты из кабинета: код на НОВЫЙ адрес. Только код, без кнопки — вводят его в кабинете,
// где человек уже вошёл; ссылка, открытая на другом устройстве, сменила бы почту без входа
export const emailChangeMail = ({to, name, code, lang = 'ru'}) => {
  const L = mailLang(lang);
  const w = M[L].emailChange;
  return sendMail({
    to,
    subject: w.subject(code),
    text: `${HELLO[L](name)}\n\n${w.text(code)}`,
    html: layout(w.title,
      `<p>${escape(w.codeLabel)}</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0">${escape(code)}</p>
<p>${escape(w.enter)}</p>`,
      null, w.footer, L),
  });
};

/**
 * Уведомление о действии в аккаунте (сменили пароль, почту): если делал не владелец — узнает сразу.
 * kind — password | email | restored | deleted; vars — подстановки (email — новый адрес)
 */
export const noticeMail = ({to, kind, vars = {}, lang = 'ru'}) => {
  const L = mailLang(lang);
  const {title, text: make} = M[L].notice[kind];
  const text = make(vars);
  return sendMail({
    to,
    subject: `KOK: ${title.toLowerCase()}`,
    text,
    html: layout(title, text.split('\n\n').map((p) => `<p>${escape(p)}</p>`).join('\n'), null, M[L].noticeFooter, L),
  });
};

// Сумма в валюте заказа. Валюта — код ISO строчными, как пишет её касса в заказ (usd у NOWPayments,
// у рублёвой кассы будет rub). Знак — для привычных валют, остальные — кодом: письмо не должно
// падать из-за новой валюты новой кассы
const SIGNS = {usd: '$', krw: '₩', rub: '₽', eur: '€', jpy: '¥', cny: '¥', uah: '₴', uzs: 'сум', kgs: 'сом'};
// Вона, иена и рубль — целыми (копейки в рублёвой кассе — редкость, а «49 000,00 ₩» читается как ошибка).
// Доллары тоже, если сумма целая: тарифы — ровные $19 / $29 / $39 (23.10), «$29,00» выглядит как счёт
const WHOLE = new Set(['krw', 'jpy', 'rub', 'uzs', 'usd']);
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
//   priceUsd — цена тарифа в долларах (по ней считается счёт), в скобках, если валюта оплаты другая;
//   orderId — номер заказа кассы; у ручного начисления его нет;
//   sandbox — оплата из песочницы (превью): помечаем, чтобы тестовое письмо не приняли за настоящее
export const paymentMail = ({to, name, plan, title, credits, until, paid = null, priceUsd, orderId = null, paidAt, link, sandbox = false, lang = 'ru'}) => {
  const L = mailLang(lang);
  const w = M[L].pay;
  const date = (d) => dateIn(L, d);
  const price = money(priceUsd, 'usd');
  const sum = paid && [money(paid.amount, paid.currency), paid.method && `· ${paid.method}`,
    String(paid.currency).toLowerCase() !== 'usd' && w.tariff(price)].filter(Boolean).join(' ');
  const rows = [
    [w.purchase, `${plan ? w.plan : w.topup} «${title}»`],
    paid ? [w.paid, sum] : [w.cost, `${price} · ${w.viaManager}`],
    [w.credited, w.creditsUntil(credits, date(until))],
    [w.date, date(paidAt)],
    orderId && [w.order, orderId],
  ].filter(Boolean);
  const test = sandbox ? w.test : '';
  const button = orderId ? w.openOrder : w.openAccount;
  return sendMail({
    to,
    subject: `${sandbox ? w.testMark : ''}${w.subject(credits)}`,
    text: `${HELLO[L](name)}\n\n${w.textHead}\n\n`
      + rows.map(([k, v]) => `${k}: ${v}`).join('\n')
      + `\n\n${button}: ${link}${test ? `\n\n${test}` : ''}`,
    html: layout(w.title,
      `<p>${escape(w.body)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows.map(([k, v]) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;font-weight:bold">${escape(v)}</td></tr>`).join('')}</table>
${test ? `<p style="font-size:13px;color:#8e0d2c">${escape(test)}</p>` : ''}`,
      {url: link, label: button},
      w.footer(orderId), L),
  });
};

// Аккаунт поставлен на удаление: до какого числа и кнопка «восстановить». Кнопка ведёт на страницу
// приложения, а та шлёт POST — GET-ссылку почтовые сканеры открыли бы сами и отменили удаление
export const deletionMail = ({to, name, link, until, lang = 'ru'}) => {
  const L = mailLang(lang);
  const w = M[L].deletion;
  const date = dateIn(L, until);
  return sendMail({
    to,
    subject: w.subject,
    text: `${HELLO[L](name)}\n\n${w.text(date, link)}`,
    html: layout(w.title, w.body(date), {url: link, label: w.button}, w.footer, L),
  });
};
