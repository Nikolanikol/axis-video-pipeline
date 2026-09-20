#!/bin/sh
# Перезапуск сервера с проверкой, что старый процесс действительно умер.
#
# Правки в server/ подхватываются только перезапуском (Vite держит на лету лишь src/ и app/).
# Без проверки легко намерить старое поведение: порт остаётся занят, новый процесс падает
# с EADDRINUSE в фоне, а health-check отвечает — потому что отвечает прежний сервер.
set -e
cd "$(dirname "$0")/.."

PORT="${PORT:-3210}"
LOG="${LOG:-/tmp/axis-video-server.log}"

pid=$(pgrep -f 'server/index.mjs' || true)
if [ -n "$pid" ]; then
  kill $pid 2>/dev/null || true
  for _ in $(seq 1 20); do
    pgrep -f 'server/index.mjs' >/dev/null 2>&1 || break
    sleep 0.5
  done
  # Не отпустил по-хорошему — значит завис
  pgrep -f 'server/index.mjs' >/dev/null 2>&1 && kill -9 $(pgrep -f 'server/index.mjs') 2>/dev/null || true
  sleep 0.5
fi

if pgrep -f 'server/index.mjs' >/dev/null 2>&1; then
  echo "не удалось остановить прежний сервер: $(pgrep -f 'server/index.mjs' | tr '\n' ' ')" >&2
  exit 1
fi

npm run app >"$LOG" 2>&1 &
for _ in $(seq 1 40); do
  sleep 0.5
  if curl -sf --max-time 1 "http://localhost:$PORT/api/config" >/dev/null 2>&1; then
    echo "сервер поднят (pid $(pgrep -f 'server/index.mjs' | head -1)), журнал: $LOG"
    exit 0
  fi
done

echo "сервер не поднялся, последние строки журнала:" >&2
tail -5 "$LOG" >&2
exit 1
