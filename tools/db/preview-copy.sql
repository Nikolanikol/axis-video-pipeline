-- Копия боевых данных SMMAKER в базу превью: схема smmaker → smmaker_preview (владелец 11.10:
-- «тесты ближе к жизни»). Запускает владелец в Supabase Studio → SQL Editor. Повтор безопасен —
-- превью целиком заменяется свежей копией.
--
-- Почему не прямо боевая схема в превью: при старте превью накатывает миграции своего PR (на
-- прод до merge), начисления и письма стали бы настоящими. Прод здесь только читается.
-- Не копируются: сессии и ключи из писем (живых людей), миграции (у PR свои), файлы компаний
-- (они в томе прода). Войти в превью — своим боевым паролем.
--
-- ПЕРЕД ЗАПУСКОМ: в переменных Preview Deployments не должно быть RESEND_API_KEY — в копии
-- почты клиентов, без ключа письма пишутся в журнал Coolify. Таблицы smmaker_preview создаёт
-- превью при первом старте; новая таблица в миграциях — добавь её в оба списка ниже.
-- Проверено 11.10 на временном Postgres, в том числе когда у превью колонок больше, чем у прода.
BEGIN;
TRUNCATE smmaker_preview.smmaker_sessions, smmaker_preview.smmaker_email_tokens,
         smmaker_preview.smmaker_credit_ledger, smmaker_preview.smmaker_subscriptions,
         smmaker_preview.smmaker_memberships, smmaker_preview.smmaker_credit_lots,
         smmaker_preview.smmaker_activation_codes, smmaker_preview.smmaker_workspaces,
         smmaker_preview.smmaker_users, smmaker_preview.smmaker_plans, smmaker_preview.smmaker_packs
  RESTART IDENTITY CASCADE;
DO $$
DECLARE t text; cols text; c record;
BEGIN
  -- Порядок — сначала те, на кого ссылаются внешние ключи
  FOREACH t IN ARRAY ARRAY['smmaker_packs', 'smmaker_plans', 'smmaker_users', 'smmaker_workspaces',
    'smmaker_activation_codes', 'smmaker_credit_lots', 'smmaker_memberships', 'smmaker_subscriptions', 'smmaker_credit_ledger'] LOOP
    -- только общие колонки: у превью могут быть новые из его PR
    SELECT string_agg(quote_ident(p.column_name), ', ' ORDER BY p.ordinal_position) INTO cols
      FROM information_schema.columns p
      JOIN information_schema.columns s ON s.table_schema = 'smmaker' AND s.table_name = t AND s.column_name = p.column_name
     WHERE p.table_schema = 'smmaker_preview' AND p.table_name = t AND p.is_generated <> 'ALWAYS';
    EXECUTE format('INSERT INTO smmaker_preview.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM smmaker.%I', t, cols, cols, t);
    -- счётчики identity — дальше максимума, иначе первая новая строка в превью упадёт на дубле
    FOR c IN SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'smmaker_preview' AND table_name = t AND identity_generation IS NOT NULL LOOP
      EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), (SELECT COALESCE(max(%I), 0) + 1 FROM smmaker_preview.%I), false)',
        'smmaker_preview.' || t, c.column_name, c.column_name, t);
    END LOOP;
  END LOOP;
END $$;
COMMIT;
