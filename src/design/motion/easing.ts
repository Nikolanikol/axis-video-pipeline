// Кривые движения. Всё — чистые функции от доли 0…1: время задаёт номер кадра, а не часы,
// поэтому превью и серверный рендер дают одну картинку.

/** Обрезка доли в 0…1 */
export const cut = (v: number) => Math.max(0, Math.min(1, v));

/** ease-out = 1−(1−t)³ — как в motion-engine.js пакета KOK_STYLE_MOTION_PACK */
export const easeOut = (v: number) => 1 - Math.pow(1 - cut(v), 3);

/** smoothstep = t²(3−2t) — для взаимной смены и вертикальной смены сцен (пакет) */
export const smooth = (v: number) => { const x = cut(v); return x * x * (3 - 2 * x); };

/**
 * Кубическая Безье тем же двоичным поиском, что в KOK Motion Studio (transition-core.js):
 * кривые переходов совпадают с её превью. Концы — ровно 0 и 1: поиск сходится к 0,99999…,
 * и сцена недоезжала бы на долю пикселя
 */
export const bezier = (x: number, a: number, b: number, c: number, d: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const f = (t: number, p1: number, p2: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (f(m, a, c) < x) lo = m; else hi = m; }
  return f((lo + hi) / 2, b, d);
};

/** Именованные кривые студии: «плавно», «вход-выход», «рывок» */
export const STUDIO_EASE = {
  smooth: (t: number) => bezier(t, .22, 1, .36, 1),
  inOut: (t: number) => bezier(t, .65, 0, .35, 1),
  snap: (t: number) => bezier(t, .18, .84, .17, 1),
};
