// Вёрстка КП (A4, две страницы) — одна на сервер и браузер.
//
// Сервер печатает её в PDF (server/offers.mjs), интерфейс рисует её же живым образцом в
// Настройки → «Коммерческое предложение» (app/settings/OfferSettings.tsx): правка поля видна
// сразу, без Chromium (владелец 16.11: «интерактивное превью, на котором применяются изменения
// настроек»). Поэтому модуль без node и без React — только строки.
//
// Стили привязаны к корню .kp, а не к body/:root: в настройках документ живёт в shadow DOM
// рядом с интерфейсом, и правила страницы не должны протекать ни туда, ни обратно.

import {currencyCode} from './currencies.js';

// Подписи документа на языке компании. Тексты дилера (строки расчёта, условия) не переводим —
// он пишет их сам. Албанский — машинный, вычитывает носитель, как и весь sq
export const OFFER_LABELS = {
  ru: {doc: 'Коммерческое предложение № {n}', date: 'Дата', valid: 'Действительно до', to: 'Кому',
    specs: 'Характеристики', photos: 'Фотографии', calc: 'Расчёт стоимости', model: 'Марка и модель',
    trim: 'Комплектация', year: 'Год выпуска', params: 'Параметры', source: 'Источник',
    purchase: '{amount} по курсу {rate}', stamp: 'М.П.', page: 'Стр. {n} из {total}', from: 'от', sample: 'ОБРАЗЕЦ'},
  en: {doc: 'Commercial offer No. {n}', date: 'Date', valid: 'Valid until', to: 'To',
    specs: 'Specifications', photos: 'Photos', calc: 'Price breakdown', model: 'Make and model',
    trim: 'Trim', year: 'Year', params: 'Details', source: 'Source',
    purchase: '{amount} at {rate}', stamp: 'Seal', page: 'Page {n} of {total}', from: 'of', sample: 'SAMPLE'},
  sq: {doc: 'Ofertë tregtare nr. {n}', date: 'Data', valid: 'E vlefshme deri', to: 'Për',
    specs: 'Karakteristikat', photos: 'Fotot', calc: 'Llogaritja e çmimit', model: 'Marka dhe modeli',
    trim: 'Versioni', year: 'Viti', params: 'Të dhëna', source: 'Burimi',
    purchase: '{amount} me kurs {rate}', stamp: 'V.V.', page: 'Faqja {n} nga {total}', from: 'më', sample: 'SHEMBULL'},
};
const LOCALES = {ru: 'ru-RU', en: 'en-GB', sq: 'sq-AL'};

// Типовая компания образца — явно ненастоящая (нули, «пример»), чтобы её не приняли за данные
// дилера. Ни логотипа, ни данных реальной компании в образце нет (владелец 16.11)
export const SAMPLE_COMPANY = {
  ru: {name: 'Ваша компания', legalName: 'ООО «Ваша компания» (пример)',
    requisites: [{label: 'ИНН', value: '0000000000'}, {label: 'ОГРН', value: '0000000000000'}],
    address: 'Город, улица, дом', phone: '+7 000 000-00-00', email: 'sales@example.com', site: 'example.com',
    signer: {name: 'Иван Иванов', position: 'менеджер по продажам'}, client: 'Имя клиента'},
  en: {name: 'Your Company', legalName: 'Your Company Ltd (sample)',
    requisites: [{label: 'Reg. No.', value: '00000000'}, {label: 'VAT', value: '000000000'}],
    address: 'City, street, building', phone: '+00 000 000 0000', email: 'sales@example.com', site: 'example.com',
    signer: {name: 'John Smith', position: 'sales manager'}, client: 'Client name'},
  sq: {name: 'Kompania Juaj', legalName: 'Kompania Juaj SH.P.K. (shembull)',
    requisites: [{label: 'NIPT', value: 'L00000000X'}, {label: 'IBAN', value: 'AL00 0000 0000 0000'}],
    address: 'Qyteti, rruga, numri', phone: '+355 00 000 0000', email: 'sales@example.com', site: 'example.com',
    signer: {name: 'Arben Hoxha', position: 'menaxher shitjesh'}, client: 'Emri i klientit'},
};
const sampleOf = (language) => SAMPLE_COMPANY[language] || SAMPLE_COMPANY.en;

/** Реквизиты образца: что дилер вписал — его, пустое — примером */
export const sampleDealer = (dealer, language) => {
  const x = sampleOf(language);
  const filled = (dealer.requisites || []).some((r) => String(r.value ?? '').trim());
  return {...dealer,
    legalName: dealer.legalName || x.legalName,
    requisites: filled ? dealer.requisites : x.requisites,
    address: dealer.address || x.address,
    phone: dealer.phone || x.phone,
    email: dealer.email || x.email,
    signer: {name: dealer.signer?.name || x.signer.name, position: dealer.signer?.position || x.signer.position}};
};

/** Компания образца: типовое название, без логотипа, контакты — из реквизитов и примерный сайт */
export const sampleCompany = (dealer, language) => {
  const x = sampleOf(language);
  return {name: x.name, logo: null, contacts: [dealer.phone, dealer.email, x.site].filter(Boolean)};
};
export const sampleClient = (language) => sampleOf(language).client;

/** Контакты в шапке настоящего КП: телефон и почта из реквизитов, мессенджеры и сайт из профиля */
export const companyContacts = (dealer, contacts = {}) => [dealer.phone,
  contacts.whatsapp && `WhatsApp ${contacts.whatsapp}`, contacts.telegram && `Telegram ${contacts.telegram}`,
  dealer.email, contacts.site].filter(Boolean);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const fill = (s, vars) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
// Метка поля настроек у части документа: клик по ней в живом образце ставит курсор в это поле
// формы (app/settings/OfferSettings.tsx, владелец 16.11). В PDF атрибут ничего не делает
const f = (key) => ` data-f="${key}"`;
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

export const OFFER_CSS = `
.kp{--accent:#16161a;--ink:#16161a;--muted:#6b6660;--line:#e4ded6;--tint:#f5f2ee;font-family:Manrope,sans-serif;color:var(--ink);font-size:9.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kp *{box-sizing:border-box;margin:0;padding:0}
.kp .page{width:210mm;height:297mm;padding:14mm 16mm 12mm;position:relative;page-break-after:always;overflow:hidden;background:#fff}
.kp .page:last-child{page-break-after:auto}
.kp .head{display:flex;justify-content:space-between;gap:10mm;padding-bottom:5mm;border-bottom:1.6pt solid var(--accent)}
.kp .brand{display:flex;gap:4mm;align-items:center;min-width:0}
/* Широкий логотип съедал место, и юр. название ложилось столбиком по слову — с логотипом текст под ним */
.kp .brand.with-logo{flex-direction:column;align-items:flex-start;gap:2mm}
.kp .logo{width:15mm;height:15mm;flex:none;border-radius:3mm;background:var(--accent);color:#fff;font-weight:700;font-size:14pt;display:grid;place-items:center}
.kp .logo-img{border-radius:2mm;flex:none}
.kp .logo-img img{height:13mm;max-width:45mm;object-fit:contain;display:block}
.kp .co{font-size:14pt;font-weight:700;letter-spacing:-.2pt}
.kp .legal{color:var(--muted);font-size:8.5pt}
.kp .req{text-align:right;font-size:7.8pt;color:var(--muted);line-height:1.55;max-width:95mm}
.kp .req span{color:var(--ink);font-weight:600}
.kp .meta{display:flex;justify-content:space-between;align-items:flex-end;margin:7mm 0 5mm;gap:8mm}
.kp .meta h1{font-size:19pt;font-weight:700;letter-spacing:-.4pt;line-height:1.15}
.kp .meta .no{color:var(--accent);font-weight:600;font-size:9pt;margin-bottom:1.5mm;text-transform:uppercase;letter-spacing:.6pt}
.kp .meta .dates{text-align:right;font-size:8.5pt;color:var(--muted);white-space:nowrap}
.kp .meta .dates b{color:var(--ink);font-weight:600}
.kp .to{display:flex;gap:3mm;align-items:baseline;font-size:9pt;margin-bottom:5mm}
.kp .to .blank{flex:1;border-bottom:.6pt solid var(--ink);min-height:4mm;font-weight:600}
.kp .hero{width:100%;height:98mm;object-fit:cover;border-radius:2.5mm;display:block;background:var(--tint)}
.kp .car{display:flex;justify-content:space-between;align-items:flex-end;margin-top:5mm;gap:8mm}
.kp .car h2{font-size:17pt;font-weight:700;letter-spacing:-.3pt}
.kp .car .sub{color:var(--muted);margin-top:1mm}
.kp .chips{display:flex;gap:2mm;margin-top:3mm;flex-wrap:wrap}
.kp .chips span{background:var(--tint);border-radius:5mm;padding:1mm 3.2mm;font-size:8.5pt;font-weight:500}
.kp .price{background:var(--accent);color:#fff;border-radius:2.5mm;padding:4mm 6mm;text-align:right;min-width:58mm}
.kp .price small{display:block;font-size:7.8pt;opacity:.8;text-transform:uppercase;letter-spacing:.5pt}
.kp .price b{font-size:21pt;font-weight:700;letter-spacing:-.4pt;white-space:nowrap}
.kp .price i{display:block;font-style:normal;font-size:7.8pt;opacity:.8}
.kp .lead{margin-top:6mm;color:#38353a;max-width:150mm}
.kp h3{font-size:10.5pt;font-weight:700;margin:6mm 0 2.5mm;text-transform:uppercase;letter-spacing:.6pt;color:var(--accent)}
.kp table{width:100%;border-collapse:collapse}
.kp td{padding:1.8mm 0;border-bottom:.5pt solid var(--line);vertical-align:top}
.kp .spec td:first-child{color:var(--muted);width:40%}
.kp .spec td:last-child{font-weight:600}
.kp .cols{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.kp .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}
.kp .grid img{width:100%;height:30mm;object-fit:cover;border-radius:1.5mm;display:block}
.kp .cost td:nth-child(2){color:var(--muted);font-size:8.3pt;padding:1.8mm 3mm}
.kp .cost td:last-child{text-align:right;font-weight:600;white-space:nowrap;width:28mm}
.kp .cost tr.total td{border-bottom:none;border-top:1.2pt solid var(--ink);padding-top:2.5mm;font-size:11pt;font-weight:700}
.kp .note{font-size:8pt;color:var(--muted);margin-top:2mm;white-space:pre-line}
.kp ul{padding-left:4mm}
.kp li{margin-bottom:1.2mm}
.kp .sign{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:8mm;align-items:end}
.kp .sign .line{border-bottom:.6pt solid var(--ink);height:14mm}
.kp .sign .cap{font-size:8pt;color:var(--muted);margin-top:1mm}
.kp .stamp{width:32mm;height:32mm;border:.8pt dashed var(--line);border-radius:50%;display:grid;place-items:center;color:#bbb;font-size:8pt}
.kp .foot{position:absolute;left:16mm;right:16mm;bottom:8mm;display:flex;justify-content:space-between;gap:4mm;font-size:7.3pt;color:var(--muted);border-top:.5pt solid var(--line);padding-top:2mm}
/* Листы с крупными фото в конце: по два на лист. Высота — то, что остаётся между шапкой и подвалом
   (271 мм поля − ~22 шапка − ~14 подвал − отступы), пополам с запасом: иначе второе фото уезжает под подвал */
.kp .gal{display:flex;flex-direction:column;gap:6mm;margin-top:6mm}
.kp .gal img{width:100%;height:108mm;object-fit:cover;border-radius:2.5mm;display:block;background:var(--tint)}
/* Водяной знак образца: жирнее и темнее (владелец 16.11) — при 6% его на светлом фото почти не было видно.
   Светлый контур — чтобы знак читался и поверх тёмных фото салона, где серая заливка пропадает */
.kp .sample{position:absolute;inset:0;z-index:5;display:grid;place-items:center;pointer-events:none;font-size:84pt;font-weight:800;letter-spacing:4pt;color:rgba(0,0,0,.13);-webkit-text-stroke:1.2pt rgba(255,255,255,.35);transform:rotate(-30deg)}
`;

/**
 * Тело документа (две .page внутри .kp).
 * @param {object} p
 * @param {string} p.language @param {string} p.currency
 * @param {{name: string, contacts: string[], logo: {src: string, plate: string|null}|null}} p.company
 * @param {{dealer: any, template: any}} p.settings
 * @param {any} p.lot — brand, model, trim, year, specs, note, carPriceKrw
 * @param {{lines: any[], total: number, showPurchase: boolean}} p.calc
 * @param {string} p.number @param {Date} p.date @param {string} p.client
 * @param {{hero: string|null, grid: string[], gallery?: string[]}} p.images — gallery: крупные фото в конце, по два на лист @param {boolean} [p.sample]
 * @param {string} [p.accent] — цвет бренда, если дилер не задал свой
 */
export const offerBody = ({language, currency, company, settings, lot, calc, number, date, client, images, sample = false, accent: brandAccent}) => {
  const {dealer, template} = settings;
  const lang = OFFER_LABELS[language] ? language : 'en';
  const t = OFFER_LABELS[lang];
  const locale = LOCALES[lang];
  const cur = currencyCode(currency);
  const money = (n, c = cur) => (n === null || n === undefined ? '—'
    : new Intl.NumberFormat(locale, {style: 'currency', currency: c, maximumFractionDigits: 0}).format(n));
  const fDate = (d) => d.toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: 'numeric'});
  const validTo = new Date(date.getTime() + (Number(template.validityDays) || 0) * 864e5);
  const vars = {brand: lot.brand, model: lot.model, year: lot.year, trim: lot.trim || ''};
  const show = template.show || {};
  const accent = isHex(dealer.accent) ? dealer.accent : (isHex(brandAccent) ? brandAccent : '#16161a');
  const name = company.name || '';
  // Реквизиты можно не указывать (владелец 16.11): тогда в шапке и подвале нет юр. названия, рег.
  // данных и адреса — только логотип, название и контакты. Вписанное в настройках не стирается
  const withReq = show.requisites !== false;
  const legalName = withReq ? dealer.legalName : '';
  const address = withReq ? dealer.address : '';
  const requisites = withReq ? (dealer.requisites || []).filter((r) => String(r.value ?? '').trim()) : [];
  const monogram = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const first = requisites[0];
  const logo = company.logo;
  const gallery = images.gallery || [];
  const total = 2 + Math.ceil(gallery.length / 2);

  const header = `
<header class="head">
  <div class="brand${logo ? ' with-logo' : ''}">
    ${logo ? `<div class="logo-img"${logo.plate ? ` style="background:${logo.plate};padding:2mm 3mm"` : ''}><img src="${logo.src}"></div>`
      : `<div class="logo">${esc(monogram)}</div>`}
    <div><div class="co">${esc(name)}</div>${legalName ? `<div class="legal"${f('legalName')}>${esc(legalName)}</div>` : ''}</div>
  </div>
  <div class="req">
    ${requisites.map((r, i) => `<div${f(`req:${i}`)}><span>${esc(r.label)}</span> ${esc(r.value)}</div>`).join('')}
    ${address ? `<div${f('address')}>${esc(address)}</div>` : ''}
    ${company.contacts?.length ? `<div${f('phone')}>${company.contacts.map(esc).join(' · ')}</div>` : ''}
  </div>
</header>`;
  const footer = (n) => `
<footer class="foot">
  <span${f(withReq ? 'legalName' : 'show:requisites')}>${esc(legalName || name)}${first ? ` · ${esc(first.label)} ${esc(first.value)}` : ''}</span>
  <span${f('prefix')}>${esc(number)} ${t.from} ${fDate(date)}</span>
  <span>${fill(t.page, {n, total})}</span>
</footer>`;
  const mark = sample ? `<div class="sample">${t.sample}</div>` : '';

  const source = String(lot.note || '').trim();
  const specRows = [
    [t.model, esc(`${lot.brand} ${lot.model}`)],
    lot.trim ? [t.trim, esc(lot.trim)] : null,
    [t.year, esc(lot.year)],
    lot.specs?.filter(Boolean).length ? [t.params, lot.specs.filter(Boolean).map(esc).join('<br>')] : null,
    source ? [t.source, esc(source)] : null,
  ].filter(Boolean);
  const costRows = template.showBreakdown ? calc.lines.map((l) => {
    let note = l.note;
    if (l.type === 'car' && calc.showPurchase && lot.carPriceKrw && cur !== 'KRW' && l.amount) {
      note = fill(t.purchase, {amount: money(lot.carPriceKrw, 'KRW'),
        rate: `${(lot.carPriceKrw / l.amount).toLocaleString(locale, {maximumFractionDigits: 2})} ₩`});
    }
    return `<tr${f(`line:${l.id}`)}><td>${esc(l.label)}</td><td>${esc(note)}</td><td>${money(l.amount)}</td></tr>`;
  }).join('') : '';
  const sections = (template.sections || []).filter((s) => s.title || s.items?.some((i) => String(i).trim()));

  return `<div class="kp" style="--accent:${accent}">
<section class="page">
  ${mark}
  ${header}
  <div class="meta">
    <div><div class="no"${f('prefix')}>${esc(fill(t.doc, {n: number}))}</div><h1${f('title')}>${nl(fill(template.title, vars))}</h1></div>
    <div class="dates"${f('valid')}>${t.date}: <b>${fDate(date)}</b><br>${t.valid}: <b>${fDate(validTo)}</b></div>
  </div>
  ${show.recipient ? `<div class="to"${f('show:recipient')}><b>${t.to}:</b><div class="blank">${esc(client)}</div></div>` : ''}
  ${images.hero ? `<img class="hero" src="${images.hero}">` : ''}
  <div class="car">
    <div>
      <h2>${esc(`${lot.brand} ${lot.model} ${lot.trim || ''}`.trim())}, ${esc(lot.year)}</h2>
      ${source ? `<div class="sub">${esc(source)}</div>` : ''}
      <div class="chips">${(lot.specs || []).filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
    </div>
    <div class="price"${f('totalLabel')}><small>${esc(template.totalLabel)}</small><b>${money(calc.total)}</b>${template.totalNote ? `<i${f('totalNote')}>${esc(template.totalNote)}</i>` : ''}</div>
  </div>
  ${template.intro ? `<p class="lead"${f('intro')}>${nl(fill(template.intro, vars))}</p>` : ''}
  ${footer(1)}
</section>
<section class="page">
  ${mark}
  ${header}
  ${show.specs || images.grid.length ? `<div class="cols">
    ${show.specs ? `<div${f('show:specs')}><h3>${t.specs}</h3><table class="spec">${specRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></div>` : '<div></div>'}
    ${images.grid.length ? `<div${f('photos')}><h3>${t.photos}</h3><div class="grid">${images.grid.map((g) => `<img src="${g}">`).join('')}</div></div>` : ''}
  </div>` : ''}
  <h3>${t.calc}</h3>
  <table class="cost">
    ${costRows}
    <tr class="total"${f('totalLabel')}><td>${esc(template.totalLabel)}</td><td></td><td>${money(calc.total)}</td></tr>
  </table>
  ${template.disclaimer ? `<p class="note"${f('disclaimer')}>${esc(template.disclaimer)}</p>` : ''}
  ${sections.length ? `<div class="cols">${sections.map((s) => `<div${f(`section:${(template.sections || []).indexOf(s)}`)}><h3>${esc(s.title)}</h3><ul>${(s.items || []).filter((i) => String(i).trim()).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
  ${show.signature || show.stamp ? `<div class="sign">
    ${show.signature ? `<div${f('signer')}><div class="line"></div><div class="cap">${esc([dealer.signer?.name, dealer.signer?.position].filter(Boolean).join(', '))}</div></div>` : '<div></div>'}
    ${show.stamp ? `<div class="stamp"${f('show:stamp')}>${t.stamp}</div>` : ''}
  </div>` : ''}
  ${footer(2)}
</section>
${Array.from({length: Math.ceil(gallery.length / 2)}, (_, i) => `<section class="page">
  ${mark}
  ${header}
  <div class="gal"${f('gallery')}>${gallery.slice(i * 2, i * 2 + 2).map((src) => `<img src="${src}">`).join('')}</div>
  ${footer(3 + i)}
</section>`).join('')}
</div>`;
};

/** Целый HTML-документ для печати в PDF (шрифт встроен: у сервера нет сети к Google Fonts) */
export const offerDocument = (p, fontCss = '') => `<!doctype html><html lang="${OFFER_LABELS[p.language] ? p.language : 'en'}"><head><meta charset="utf-8"><title>${esc(p.number)}</title>
<style>${fontCss}
@page{size:A4;margin:0}
html,body{margin:0;padding:0}
${OFFER_CSS}</style></head><body>${offerBody(p)}</body></html>`;
