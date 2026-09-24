#!/bin/sh
# Выкладка на VPS: код отсюда, сборка образа там, запуск контейнера.
#
# Образ собирается НА СЕРВЕРЕ, а не здесь: Mac это arm64, сервер x86_64, и образ
# с Mac там просто не запустится. Кросс-сборка через эмуляцию заняла бы десятки минут
# и всё равно потребовала бы залить полтора гигабайта. Вместо этого уезжает сам код
# (git archive, ~6 МБ), а собирается нативно за минуту — в дата-центре сеть быстрая.
#
#   tools/vps-deploy.sh              # выложить текущий HEAD
#   HOST=axis-vps tools/vps-deploy.sh
#
# Окружение (.env с ключами) на сервере живёт отдельно и этим скриптом не трогается:
# ключи не должны ездить туда-сюда при каждой выкладке.
set -e
cd "$(dirname "$0")/.."

HOST="${HOST:-axis-vps}"
DIR="${DIR:-axis-video}"
NAME="${NAME:-axis-video}"
PORT="${PORT:-3210}"

echo "Отправляю код на $HOST…"
# git archive, а не rsync: уезжает ровно то, что закоммичено — без data/, .env и мусора
git archive --format=tar HEAD | gzip | ssh "$HOST" "mkdir -p $DIR && tar xzf - -C $DIR"

echo "Собираю образ на сервере…"
ssh "$HOST" "cd $DIR && docker build -t $NAME:latest ."

echo "Перезапускаю контейнер…"
ssh "$HOST" "docker rm -f $NAME >/dev/null 2>&1 || true; docker run -d --name $NAME \
  --restart unless-stopped \
  -p 127.0.0.1:$PORT:3210 \
  -v axis-data:/app/data \
  --env-file \$HOME/$DIR/.env \
  --memory=2g --memory-swap=2g --cpus=2 \
  $NAME:latest >/dev/null"

# Пояснения к флагам, которые выглядят произвольно:
#
# 127.0.0.1 — логина в инструменте нет, наружу его выставлять нельзя. Ходим туннелем:
#   ssh -L 3210:127.0.0.1:3210 axis-vps
#
# --memory=2g --memory-swap=2g — потолок и полный запрет подкачки. Рендер рекламы ест
#   950 МБ с пиком 1,07 ГБ, так что 2 ГБ с запасом. Подкачка на машине занята на 91%
#   ещё до нас, и рендер не должен её добивать: при выходе за потолок пусть умрёт
#   контейнер, а не Postgres соседнего проекта.
#
# --cpus=2 — половина машины. Столько же берёт RENDER_CONCURRENCY=2 из образа;
#   больше отдавать нельзя, рядом живёт боевой сайт.
#
# axis-data — том снаружи: исходники, рендеры и логотипы переживают обновление образа.

echo "Жду готовности…"
i=0
while [ "$i" -lt 30 ]; do
  state=$(ssh "$HOST" "docker inspect $NAME --format '{{.State.Health.Status}}'" 2>/dev/null || echo "нет")
  [ "$state" = "healthy" ] && { echo "Готово: $NAME здоров на $HOST:$PORT"; exit 0; }
  i=$((i + 1))
  sleep 2
done

echo "Контейнер не дошёл до healthy за минуту. Логи:" >&2
ssh "$HOST" "docker logs --tail 40 $NAME" >&2
exit 1
