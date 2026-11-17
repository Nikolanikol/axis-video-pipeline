# Витрина KOK — axis-beauty.com

Статический сайт на Astro: витрина и (позже) блог. План, решения и журнал —
[docs/projects/site/](../docs/projects/site/plan.md).

```bash
cd site
npm install
npm run dev      # http://localhost:4321 — русский /, английский /en/, албанский /sq/
npm run build    # готовый сайт в site/dist
```

Тексты — словари приложения (`app/i18n`, `config/seo.json`): правятся там, витрина подхватывает
при сборке. Перед сборкой `scripts/shared.mjs` копирует логотипы и образцы в `public/shared`
и берёт свежие условия и тарифы из приложения.
