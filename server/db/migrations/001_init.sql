-- SMMAKER: кабинеты компаний, вход, коды активации, тарифы и кредиты.
--
-- Схему здесь не пишем: её задаёт search_path подключения (smmaker на проде, smmaker_dev
-- на Mac — см. server/db/index.mjs). Так один файл миграции годится для обеих.
--
-- У каждой таблицы префикс smmaker_ вдобавок к схеме. В одном Supabase живут kmotors и
-- caranalizer, и таблица должна читаться как наша даже там, где схему не видно:
-- в логах, в дампе, в чужом запросе. Проверяется тестом tests/server/db.test.mjs.

-- Компания — единица кабинета. Тариф, кредиты и файлы принадлежат ей, а не человеку:
-- позже в неё приглашаются сотрудники, и баланс у них общий.
-- brand и profile — те же документы, что сейчас лежат в config/brand.json и
-- config/profiles/*.json; здесь они переживают выкладку, в образе — нет.
CREATE TABLE smmaker_workspaces (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name        text NOT NULL,
  brand       jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Свои пользователи, а не Supabase Auth: auth.users в инстансе один на все проекты,
-- и клиенты SMMAKER оказались бы в одном списке с пользователями kmotors.
CREATE TABLE smmaker_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  -- Владелец платформы: админка, выдача кодов. Не роль в компании — он над всеми
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Почта сравнивается без регистра: Ivan@ и ivan@ — один человек
CREATE UNIQUE INDEX smmaker_users_email_key ON smmaker_users (lower(email));

CREATE TABLE smmaker_memberships (
  workspace_id  text NOT NULL REFERENCES smmaker_workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES smmaker_users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX smmaker_memberships_user_idx ON smmaker_memberships (user_id);

-- В базе хранится хеш токена, а не сам токен: утечка дампа не даёт войти чужой сессией
CREATE TABLE smmaker_sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES smmaker_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX smmaker_sessions_user_idx ON smmaker_sessions (user_id);

-- Тариф. pipelines — какие пайплайны открыты: обзоры на проде съедают полмашины на час,
-- и не каждый тариф должен их включать.
CREATE TABLE smmaker_plans (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  credits     integer NOT NULL CHECK (credits >= 0),
  days        integer NOT NULL CHECK (days > 0),
  pipelines   text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Код активации. Оплату владелец берёт вне системы и выдаёт код; код — это активация,
-- а не логин: вход по ключу раздали бы коллегам. Код расходуется один раз.
-- days и credits копируются из тарифа в момент выдачи: правка тарифа потом не должна
-- менять уже проданное.
CREATE TABLE smmaker_activation_codes (
  code          text PRIMARY KEY,
  plan_id       text NOT NULL REFERENCES smmaker_plans(id),
  days          integer NOT NULL CHECK (days > 0),
  credits       integer NOT NULL CHECK (credits >= 0),
  note          text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES smmaker_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  activated_workspace_id text REFERENCES smmaker_workspaces(id),
  activated_by  uuid REFERENCES smmaker_users(id),
  activated_at  timestamptz,
  -- Активирован целиком или не активирован вовсе: половинчатое состояние — ошибка
  CHECK ((activated_at IS NULL) = (activated_workspace_id IS NULL))
);

-- Период доступа. Продление новым кодом начинается с конца текущего периода, а не
-- с сегодня: ранняя оплата не должна сжигать оплаченные дни. Кредиты периода сгорают
-- с его концом — баланс считается только по текущему периоду.
CREATE TABLE smmaker_subscriptions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES smmaker_workspaces(id) ON DELETE CASCADE,
  plan_id       text NOT NULL REFERENCES smmaker_plans(id),
  code          text REFERENCES smmaker_activation_codes(code),
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE INDEX smmaker_subscriptions_ws_idx ON smmaker_subscriptions (workspace_id, period_end);

-- Журнал кредитов вместо счётчика: баланс = сумма delta по периоду. На вопрос «почему
-- у меня осталось 3» ответ — построчно: что, когда и за сколько.
--   grant   +N  начисление периода по коду
--   charge  −N  запуск генерации (резерв: списан сразу, чтобы с 5 кредитами нельзя было
--               поставить в очередь 50 роликов)
--   refund  +N  генерация упала или отменена — резерв вернулся
--   adjust  ±N  ручная правка владельцем (компенсация, бонус)
CREATE TABLE smmaker_credit_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id    text NOT NULL REFERENCES smmaker_workspaces(id) ON DELETE CASCADE,
  subscription_id bigint NOT NULL REFERENCES smmaker_subscriptions(id) ON DELETE CASCADE,
  delta           integer NOT NULL CHECK (delta <> 0),
  kind            text NOT NULL CHECK (kind IN ('grant', 'charge', 'refund', 'adjust')),
  pipeline        text,
  job_id          text,
  note            text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES smmaker_users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smmaker_credit_ledger_sub_idx ON smmaker_credit_ledger (subscription_id);
-- Один возврат на одно списание: повторный refund по той же задаче вернул бы кредит дважды
CREATE UNIQUE INDEX smmaker_credit_ledger_job_once ON smmaker_credit_ledger (job_id, kind)
  WHERE job_id IS NOT NULL;
