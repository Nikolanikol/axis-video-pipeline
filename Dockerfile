# AXIS Video в контейнере.
#
# Главная сложность здесь не Node, а Chrome: Remotion возит с собой свою сборку браузера,
# и ей нужен десяток системных библиотек. Без них рендер падает с невнятной ошибкой вроде
# «Failed to launch browser», и разбираться приходится долго. Контейнер фиксирует это один раз.
#
# Сборка: docker build -t axis-video .
# Запуск: docker run -p 3210:3210 --env-file .env -v axis-data:/app/data axis-video
FROM node:22-bookworm-slim

# Библиотеки для headless Chrome из Remotion. Список взят из их требований для Linux;
# без любой из них браузер не стартует. ca-certificates нужен для запросов к ElevenLabs
# и Encar, fonts-liberation — чтобы на слайдах было чем рисовать латиницу, если свой
# шрифт не подхватится.
#
# fonts-dejavu-core — из-за знака воны (₩) в цене «в Корее». Ни Oswald с Montserrat,
# ни Liberation его не содержат: на Mac подставлялся системный шрифт, а в контейнере
# подставить было нечего, и ₩ выходил квадратом-«тофу» на КАЖДОЙ карусели. DejaVu Sans
# знак воны покрывает, и Chrome берёт из него один этот символ по цепочке подмены.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      fonts-dejavu-core \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Зависимости отдельным слоем: он пересобирается только при правке package.json,
# а не при каждой правке кода
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Браузер кладём в образ заранее. Иначе Remotion качает его при первом рендере —
# 88 МБ на каждый новый контейнер, задержка на ровном месте и зависимость от сети
# в момент, когда пользователь уже нажал кнопку.
RUN node --input-type=module -e "const {ensureBrowser} = await import('@remotion/renderer'); await ensureBrowser();"

# Интерфейс собираем внутрь образа: в бою сервер отдаёт готовую статику,
# а не поднимает сервер разработки
RUN npm run build

# Данные — том снаружи: исходники, рабочие копии, рендеры и логотипы не должны
# исчезать вместе с контейнером при обновлении
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    PORT=3210 \
    # Внутри контейнера слушаем все адреса: наружу порт открывает сам Docker
    HOST=0.0.0.0 \
    # Память растёт линейно по потокам, а скорость почти нет: при 8 рендер занимает
    # 2372 МБ, при 2 — 889 МБ, время 27 против 30 секунд. Замер в CONTEXT.md
    RENDER_CONCURRENCY=2 \
    # Браузер в контейнере запускается от root без песочницы ядра
    OPEN_BROWSER=0

EXPOSE 3210

# Проверка живости: сервер отвечает настройками, когда действительно готов
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3210)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
