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

# Агент может перезапустить только свой изолированный сервер, не затрагивая другие порты.
# Без явного PID прежнее поведение сохранено для обычного запуска владельцем.
target_pid="${SMMAKER_RESTART_PID:-}"
if [ -n "$target_pid" ]; then
  case "$target_pid" in *[!0-9]*) echo "неверный PID сервера" >&2; exit 1;; esac
  case "$(ps -p "$target_pid" -o command=)" in
    *server/index.mjs*) ;;
    *) echo "указанный PID не принадлежит серверу SMMAKER" >&2; exit 1;;
  esac
fi
server_pids() {
  if [ -n "$target_pid" ]; then
    kill -0 "$target_pid" 2>/dev/null && printf '%s\n' "$target_pid"
  else
    pgrep -f 'server/index.mjs'
  fi
}

pid=$(server_pids || true)
if [ -n "$pid" ]; then
  kill $pid 2>/dev/null || true
  for _ in $(seq 1 20); do
    server_pids >/dev/null 2>&1 || break
    sleep 0.5
  done
  # Не отпустил по-хорошему — значит завис
  server_pids >/dev/null 2>&1 && kill -9 $(server_pids) 2>/dev/null || true
  sleep 0.5
fi

if server_pids >/dev/null 2>&1; then
  echo "не удалось остановить прежний сервер: $(server_pids | tr '\n' ' ')" >&2
  exit 1
fi

# PTY держит процесс Vite живым: фон оболочки агента может потерять esbuild после выхода.
if [ "${SMMAKER_RESTART_FOREGROUND:-}" = "1" ]; then
  exec npm run app
fi

npm run app >"$LOG" 2>&1 &
started_pid=$!
# Живость — по /healthz: /api/config с базой закрыт входом и отвечает 401, и скрипт
# считал бы живой сервер мёртвым. Ждём до минуты: на старте сервер применяет миграции
# и заводит компанию — через туннель к базе это секунды
for _ in $(seq 1 120); do
  sleep 0.5
  if curl -sf --max-time 1 "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
    echo "сервер поднят (pid ${started_pid}), журнал: $LOG"
    exit 0
  fi
done

echo "сервер не поднялся, последние строки журнала:" >&2
tail -5 "$LOG" >&2
exit 1
