# Витрина KOK (axis-beauty.com) — статика за nginx. Отдельный ресурс в Coolify, не приложение:
# падение или выкладка приложения витрину не трогают (docs/projects/site/plan.md).
#
# Собирается из КОРНЯ репозитория (контекст — корень, файл — site/Dockerfile): витрина берёт
# у приложения словари (app/i18n), тексты для поиска (config/seo.json), логотипы и образцы
# (public/). Копируем только их — изменения в коде приложения образ витрины не меняют.

FROM node:22-alpine AS build
WORKDIR /repo
COPY app/i18n app/i18n
COPY config/seo.json config/seo.json
COPY public/kok public/kok
COPY public/favicon.ico public/favicon.ico
COPY public/sources public/sources
COPY public/landing/samples.json public/landing/samples.json
COPY public/landing/video public/landing/video
COPY public/landing/carousel public/landing/carousel
COPY site/package.json site/package-lock.json site/
RUN cd site && npm ci --no-audit --no-fund
COPY site site
# Перед сборкой scripts/shared.mjs берёт свежие тарифы у приложения; не ответило — снимок из репозитория
ENV ASTRO_TELEMETRY_DISABLED=1
RUN cd site && npm run build

FROM nginx:1.27-alpine
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/site/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
