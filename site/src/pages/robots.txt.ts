// robots.txt витрины. Старые адреса магазина (/headlights/…) не закрываем здесь: им отвечает
// 410 сервер (site/nginx.conf), и робот должен это увидеть, чтобы убрать их из индекса.
import type {APIRoute} from 'astro';
import {SITE} from '../lib/site';

export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`, {
  headers: {'Content-Type': 'text/plain; charset=utf-8'},
});
