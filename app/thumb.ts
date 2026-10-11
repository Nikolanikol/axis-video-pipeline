// Адрес миниатюры своей картинки (/data/…) для плашек и лент — сервер нарезает её сам
// (server/thumbs.mjs). Чужие адреса (фото Encar, CDN площадок) — как есть: их не уменьшить у нас.
export const thumb = (url: string | null | undefined, width: 160 | 240 | 480 = 240): string => {
  if (!url) return '';
  if (!url.startsWith('/data/')) return url;
  const [file, query] = url.split('?');
  return `/thumbs/${file.slice('/data/'.length)}?w=${width}${query ? `&${query}` : ''}`;
};
