-- Новая модель доступа (решение владельца 28 сентября): вместо кодов активации и месячных
-- периодов — самостоятельная регистрация с бесплатными кредитами и пакеты кредитов, которые
-- начисляет менеджер после оплаты.
--
-- Старые таблицы (smmaker_plans, smmaker_activation_codes, smmaker_subscriptions) не удаляем:
-- в них история первых дней. Код их больше не читает; остатки действующих периодов
-- переезжают в партии ниже.

-- Кто человек: имя и телефон — чтобы с лидом можно было связаться. Телефон уникален: без
-- этого бесплатные кредиты собирались бы регистрациями на новые почты с одним номером
ALTER TABLE smmaker_users ADD COLUMN name text NOT NULL DEFAULT '';
ALTER TABLE smmaker_users ADD COLUMN phone text;
CREATE UNIQUE INDEX smmaker_users_phone_key ON smmaker_users (phone) WHERE phone IS NOT NULL;

-- Роль на платформе: admin — владелец (всё), manager — продажи (лиды и начисление пакетов,
-- без цен и сотрудников). Обычный клиент — без роли
ALTER TABLE smmaker_users ADD COLUMN platform_role text CHECK (platform_role IN ('admin', 'manager'));
UPDATE smmaker_users SET platform_role = 'admin' WHERE is_platform_admin;
ALTER TABLE smmaker_users DROP COLUMN is_platform_admin;

-- Пакет кредитов. Цена — для менеджера и прайса в кабинете: платят вне системы, но сумма
-- записывается в партию, чтобы по журналу было видно, кто сколько заплатил
CREATE TABLE smmaker_packs (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  title       text NOT NULL,
  credits     integer NOT NULL CHECK (credits > 0),
  price_krw   integer NOT NULL CHECK (price_krw >= 0),
  valid_days  integer NOT NULL DEFAULT 365 CHECK (valid_days > 0),
  active      boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Черновые цены: владелец пересчитает их в админке
INSERT INTO smmaker_packs (id, title, credits, price_krw, sort) VALUES
  ('start', 'Старт', 30, 39000, 1),
  ('base', 'Базовый', 100, 100000, 2),
  ('pro', 'Про', 300, 250000, 3),
  ('business', 'Бизнес', 1000, 700000, 4);

-- Партия кредитов: сколько начислено, сколько осталось и до какого числа. Сроки у партий
-- разные (бесплатные — 30 дней, пакет — год), поэтому один общий счётчик не годится:
-- списание берёт из партии, которая раньше сгорает, и помнит, откуда взяло, — возврат
-- кладёт туда же
CREATE TABLE smmaker_credit_lots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES smmaker_workspaces(id) ON DELETE CASCADE,
  credits       integer NOT NULL CHECK (credits > 0),
  remaining     integer NOT NULL CHECK (remaining >= 0 AND remaining <= credits),
  expires_at    timestamptz NOT NULL,
  source        text NOT NULL CHECK (source IN ('signup', 'pack', 'bonus', 'legacy')),
  pack_id       text REFERENCES smmaker_packs(id),
  price_krw     integer,
  note          text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES smmaker_users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smmaker_credit_lots_ws_idx ON smmaker_credit_lots (workspace_id, expires_at);

-- Журнал теперь привязан к партиям, а не к периоду: начисление — к своей партии, списание
-- помнит, из каких партий и сколько взяло (lots: [{id, n}])
ALTER TABLE smmaker_credit_ledger ALTER COLUMN subscription_id DROP NOT NULL;
ALTER TABLE smmaker_credit_ledger ADD COLUMN lot_id bigint REFERENCES smmaker_credit_lots(id);
ALTER TABLE smmaker_credit_ledger ADD COLUMN lots jsonb;
ALTER TABLE smmaker_credit_ledger DROP CONSTRAINT IF EXISTS smmaker_credit_ledger_kind_check;
ALTER TABLE smmaker_credit_ledger ADD CONSTRAINT smmaker_credit_ledger_kind_check
  CHECK (kind IN ('grant', 'charge', 'refund', 'adjust'));

-- Остатки действующих периодов — в партии до конца периода: ни кредита не теряем
INSERT INTO smmaker_credit_lots (workspace_id, credits, remaining, expires_at, source, note)
SELECT s.workspace_id, b.bal, b.bal, s.period_end, 'legacy', 'остаток периода по коду активации'
  FROM smmaker_subscriptions s
  CROSS JOIN LATERAL (SELECT COALESCE(sum(delta), 0)::int AS bal FROM smmaker_credit_ledger l WHERE l.subscription_id = s.id) b
 WHERE s.period_start <= now() AND s.period_end > now() AND b.bal > 0;
