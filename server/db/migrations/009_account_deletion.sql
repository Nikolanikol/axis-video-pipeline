-- Удаление аккаунта самим клиентом (решение владельца 12 октября).
--
-- Отложенное, как у GitHub и Google: по запросу аккаунт сразу закрывается (входы сброшены,
-- войти нельзя), а через 14 дней удаляются файлы и личные данные. До этого — ссылка
-- «восстановить» в письме. Кредиты сгорают без возврата денег.

-- Когда удалить окончательно. NULL — аккаунт живой
ALTER TABLE smmaker_users ADD COLUMN delete_after timestamptz;
CREATE INDEX smmaker_users_delete_after_idx ON smmaker_users (delete_after) WHERE delete_after IS NOT NULL;

-- Компания удалена: строку НЕ удаляем. На ней висят партии кредитов и журнал — это расчёты,
-- которые закон об электронной торговле Кореи велит хранить 5 лет. Название и настройки
-- стираются, остаётся обезличенный «удалённый клиент» с оплатами
ALTER TABLE smmaker_workspaces ADD COLUMN deleted_at timestamptz;

-- Ключ письма «восстановить аккаунт»
ALTER TABLE smmaker_email_tokens DROP CONSTRAINT IF EXISTS smmaker_email_tokens_kind_check;
ALTER TABLE smmaker_email_tokens ADD CONSTRAINT smmaker_email_tokens_kind_check
  CHECK (kind IN ('verify', 'reset', 'email', 'restore'));

-- Следы удалённых: хеши ящика и телефона, без самих данных. Удалить аккаунт и зарегистрироваться
-- снова можно, но бесплатные кредиты второй раз не придут — иначе удаление стало бы способом
-- получать подарок по кругу
CREATE TABLE smmaker_deleted_identities (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash  text NOT NULL,
  phone_hash  text,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smmaker_deleted_identities_email_idx ON smmaker_deleted_identities (email_hash);
CREATE INDEX smmaker_deleted_identities_phone_idx ON smmaker_deleted_identities (phone_hash);
