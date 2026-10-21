// Сборка письма рассылки: подстановки, текст → HTML, вёрстка. Чистые функции без сети —
// их же зовёт предпросмотр в админке (через KOK), поэтому то, что менеджер видит перед
// отправкой, собрано тем же кодом, что уйдёт клиенту.

// Подстановки, которые понимает текст. Пишутся по-русски: текст набирает менеджер, а не
// программист, и «{имя}» он не перепутает. Ключ — то, что KOK передаёт в vars
export const PLACEHOLDERS = Object.freeze({ 'имя': 'name', 'компания': 'company' });

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** {имя} и {компания} → значения. Регистр и пробелы внутри скобок не важны: «{ Имя }» тоже сработает */
export const fill = (text, vars = {}) => String(text ?? '').replace(/\{\s*([а-яё]+)\s*\}/gi, (whole, word) => {
  const key = PLACEHOLDERS[word.toLowerCase()];
  return key ? String(vars[key] ?? '') : whole;
});

// Ссылка в тексте: только http(s). «javascript:» и прочее в письмо не пускаем — его бы и так
// вырезал почтовик, но ссылка без схемы ещё и выглядела бы рабочей в предпросмотре
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/**
 * Текст менеджера → HTML письма. Разметка нарочно бедная: абзацы (пустая строка), перенос
 * строки, **жирный** и ссылки. Без картинок и таблиц: письмо со сложной вёрсткой чаще уходит
 * в спам, а у служебной новости главное — текст и одна кнопка
 */
export const textToHtml = (text) => String(text ?? '').trim().split(/\n\s*\n/).filter(Boolean).map((para) => {
  const html = escape(para)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    // Ищем ссылки в уже экранированном тексте: &amp; внутри адреса — та же ссылка, браузер поймёт
    .replace(URL_RE, (url) => `<a href="${url}" style="color:#8e0d2c">${url}</a>`)
    .replace(/\n/g, '<br>');
  return `<p style="margin:0 0 14px;line-height:1.55">${html}</p>`;
}).join('\n');

/** Текстовая версия: тот же текст без разметки. Её показывают почтовики без HTML и читают фильтры спама */
const textOf = (text) => String(text ?? '').trim().replace(/\*\*(.+?)\*\*/g, '$1');

export const isHttpUrl = (url) => /^https?:\/\/[^\s]+$/i.test(String(url ?? '').trim());

/**
 * Письмо целиком.
 * @param {{subject: string, body: string, button?: {label: string, url: string}, vars?: object,
 *   brand: {name: string, logoUrl?: string}, unsubscribeUrl: string, reason?: string}} m
 * reason — почему человек получил письмо (строка внизу рядом с «Отписаться»)
 */
export const renderMessage = ({ subject, body, button, vars = {}, brand, unsubscribeUrl, reason }) => {
  const s = fill(subject, vars).trim();
  const b = fill(body, vars);
  const btn = button && button.label?.trim() && isHttpUrl(button.url) ? { label: fill(button.label, vars).trim(), url: button.url.trim() } : null;
  const why = reason || `Вы получили это письмо, потому что зарегистрированы в ${brand.name}.`;
  // Вёрстка — как у остальных писем KOK (server/mailer.mjs, layout): тёмная полоса с логотипом PNG,
  // светлое тело, одна винная кнопка. Подробно, почему так, — там же
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f2ef;font-family:Manrope,Arial,sans-serif;color:#1c1c20">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#0b0b0d;padding:18px 28px">${brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" width="120" height="38" alt="${escape(brand.name)}" style="display:block;border:0;color:#f7f2eb;font-size:22px;font-weight:bold">`
    : `<span style="color:#f7f2eb;font-size:22px;font-weight:bold">${escape(brand.name)}</span>`}</div>
<div style="padding:28px;font-size:15px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(s)}</h1>
${textToHtml(b)}
${btn ? `<p style="margin:24px 0"><a href="${escape(btn.url)}" style="background:#8e0d2c;color:#f7f2eb;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">${escape(btn.label)}</a></p>` : ''}
<p style="font-size:12px;color:#888;margin-top:28px;line-height:1.5">${escape(why)}<br><a href="${escape(unsubscribeUrl)}" style="color:#888">Отписаться от новостей</a></p>
</div></div></body></html>`;
  const text = [s, '', textOf(b), btn ? `\n${btn.label}: ${btn.url}` : '', '', '—', why, `Отписаться: ${unsubscribeUrl}`].join('\n');
  return { subject: s, html, text };
};

/**
 * Проверка черновика перед отправкой. Возвращает список проблем словами (пусто — можно слать):
 * админка показывает их у кнопки «Отправить», а KOK не даёт отправить с ними
 */
export const problemsOf = ({ subject, body, button }) => {
  const out = [];
  if (!String(subject ?? '').trim()) out.push('Нет темы письма');
  else if (String(subject).length > 150) out.push('Тема длиннее 150 знаков — почтовики её обрежут');
  if (!String(body ?? '').trim()) out.push('Нет текста письма');
  const label = String(button?.label ?? '').trim();
  const url = String(button?.url ?? '').trim();
  if (label && !url) out.push('У кнопки есть подпись, но нет ссылки');
  if (url && !isHttpUrl(url)) out.push('Ссылка кнопки должна начинаться с https://');
  if (url && !label) out.push('У кнопки есть ссылка, но нет подписи');
  // Неизвестная подстановка ушла бы клиенту как есть: «Здравствуйте, {имяя}!»
  for (const m of `${subject} ${body} ${label}`.matchAll(/\{\s*([^{}\s]+)\s*\}/g)) {
    if (!PLACEHOLDERS[m[1].toLowerCase()]) out.push(`Неизвестная подстановка {${m[1]}} — есть только {имя} и {компания}`);
  }
  return out;
};
