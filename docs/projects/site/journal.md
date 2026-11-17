# Витрина и блог — журнал

> Проект из [карты документов](../../README.md). Новое — сверху. В записи: дата, что сделано,
> где (ветка, PR, коммит), что не проверено.

## 17.11

- **Индексация `app.axis-beauty.com` включена.** Coolify → KOK → Domains → `app.axis-beauty.com`:
  «Search engine indexing» переключено с Noindex на Indexable, Redeploy. Проверено запросами
  от имени Googlebot: `/`, `/offer`, `/privacy`, `/robots.txt`, `/sitemap.xml` — 200 без
  `X-Robots-Tag`. Осталось владельцу: в Search Console запросить индексацию и заново отправить
  sitemap. Подробно — [decisions.md](decisions.md).
- **Разведка корня:** `axis-beauty.com` → 308 на `www`, Vercel, немецкий магазин фар,
  sitemap на 384 адреса `/headlights/…`, DNS в Cloudflare.
- **План утверждён** — [plan.md](plan.md), с поправками по внешней рецензии.
- **Заведена папка проекта** и карта документов `docs/README.md` (ветка `docs/context`).
- Этап P0 не начат.
