// Sitemap со всеми языковыми версиями: у каждого адреса — ссылки на соседей по языку (xhtml:link),
// так Google связывает версии одной страницы даже без чтения самих страниц.
import type {APIRoute} from 'astro';
import {PAGES, alternates, defaultLang, urlFor} from '../lib/site';

export const GET: APIRoute = () => {
  const urls = Object.entries(PAGES).flatMap(([page, langs]) => langs.map((lang) => {
    const links = [...alternates(page).map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(defaultLang(page), page)}"/>`].join('');
    return `<url><loc>${urlFor(lang, page)}</loc>${links}</url>`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, {headers: {'Content-Type': 'application/xml; charset=utf-8'}});
};
