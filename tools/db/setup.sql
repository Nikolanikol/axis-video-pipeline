-- Разовая настройка SMMAKER в общем Supabase. Запускает владелец от админа базы (postgres):
--
--   psql "$ADMIN_DATABASE_URL" -v app_password='…' -f tools/db/setup.sql
--
-- Создаёт своего пользователя smmaker_app и две схемы, которыми он владеет:
--   smmaker      — прод (контейнер на сервере)
--   smmaker_dev  — разработка на Mac
-- Приложение ходит в базу только под smmaker_app. У него нет прав на public и на схемы
-- kmotors и caranalizer: ошибка в нашем коде физически не может задеть соседей.
-- Повторный запуск безопасен.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE smmaker_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smmaker_app') \gexec

CREATE SCHEMA IF NOT EXISTS smmaker AUTHORIZATION smmaker_app;
CREATE SCHEMA IF NOT EXISTS smmaker_dev AUTHORIZATION smmaker_app;

-- Снимаем явные права на public, если их кто-то выдавал. Право CREATE «для всех» (PUBLIC)
-- так не отобрать, но в Postgres 15, на котором стоит Supabase, его у public уже нет
REVOKE ALL ON SCHEMA public FROM smmaker_app;

-- PostgREST (REST API Supabase) эти схемы не видит, пока их не добавить в его настройки.
-- Так и задумано: SMMAKER ходит в базу своим сервером, а не через публичный API.
