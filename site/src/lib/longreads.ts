// Длинные статьи в Markdown (18.11, владелец: «адекватная вёрстка, чтобы хорошо читалось, и изображения
// из свободных источников с указанием источника»). Файл — src/content/articles/<язык>/<адрес>.md, без правок
// кода под каждую статью: адрес страницы — имя файла, языки — папки (один адрес на всех языках, чтобы
// hreflang связал версии). Вёрстка — components/Longread.astro, стили — .longread в styles/global.css.
//
// Frontmatter (обязательное): title, description — для поиска (до ~60 и ~160 знаков); h1, eyebrow, lead;
// updated — дата «актуально на» (YYYY-MM-DD); image {src, alt, author, source, license, licenseUrl} —
// заглавная картинка с подписью. Необязательное: faq [{q, a}] — показывается в конце и уходит в FAQPage;
// sources [{title, url}] — источники цифр и новостей. Картинки в тексте — <figure> с <figcaption>,
// подпись автора и лицензии обязательна (CC BY / BY-SA требуют указать автора и лицензию).
import type {Lang} from './i18n';

/** sourceName — подпись ссылки на источник (по умолчанию Wikimedia Commons); license пустая — своя картинка KOK */
export type Credit = {author: string; source: string; sourceName?: string; license: string; licenseUrl?: string};
export type LongreadMeta = {
  title: string; description: string; h1: string; eyebrow: string; lead: string; updated: string;
  /** fit: 'contain' — показать картинку целиком (квадратный слайд), а не обрезать под широкую рамку */
  image: {src: string; alt: string; fit?: 'contain'} & Credit;
  faq?: {q: string; a: string}[];
  sources?: {title: string; url: string}[];
};
type Module = {frontmatter: LongreadMeta; Content: unknown; getHeadings: () => {depth: number; slug: string; text: string}[]; rawContent: () => string};

const files = import.meta.glob<Module>('../content/articles/*/*.md', {eager: true});

export type Longread = {lang: Lang; slug: string; page: string; meta: LongreadMeta; mod: Module};
export const LONGREADS: Longread[] = Object.entries(files).map(([file, mod]) => {
  const [, lang, slug] = file.match(/articles\/(\w+)\/([\w-]+)\.md$/)!;
  return {lang: lang as Lang, slug, page: `/${slug}/`, meta: mod.frontmatter, mod};
});

/** Адрес → языки, на которых статья есть (для PAGES в lib/site.ts) */
export const longreadPages = (): Record<string, Lang[]> => {
  const out: Record<string, Lang[]> = {};
  for (const l of LONGREADS) (out[l.page] ??= []).push(l.lang);
  return out;
};

/** Минуты чтения: ~180 слов в минуту — с запасом на таблицы и словари */
export const readingMinutes = (l: Longread) => Math.max(2, Math.round(l.mod.rawContent().split(/\s+/).length / 180));
