-- Подтверждение почты и сброс пароля (решение владельца 28 сентября).
--
-- Бесплатные кредиты теперь начисляются только после подтверждения почты: иначе их можно
-- собирать, придумывая адреса. Кто зарегистрировался до этой миграции — считается
-- подтверждённым.

ALTER TABLE smmaker_users ADD COLUMN email_verified_at timestamptz;
UPDATE smmaker_users SET email_verified_at = now();

-- Ключ почтового ящика для уникальности: gmail не различает точки в имени и всё после «+»,
-- так что ivan+1@gmail.com и i.van@gmail.com — тот же ящик и те же бесплатные кредиты.
-- «+метку» отбрасываем у всех адресов, точки — только у gmail. Та же формула — emailKey()
-- в server/accounts.mjs; меняешь одну — меняй и другую
ALTER TABLE smmaker_users ADD COLUMN email_key text;
UPDATE smmaker_users SET email_key = CASE
    WHEN split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || split_part(lower(email), '@', 2)
  END;
ALTER TABLE smmaker_users ALTER COLUMN email_key SET NOT NULL;
CREATE UNIQUE INDEX smmaker_users_email_box_key ON smmaker_users (email_key);

-- Одноразовые ключи из писем: подтверждение почты (6-значный код и ссылка) и сброс пароля
-- (только ссылка). В базе — хеши: утёкший дамп не даёт ни подтвердить чужую почту, ни
-- сменить чужой пароль. attempts — неверные вводы кода: после пятого код сгорает, иначе
-- миллион вариантов перебирался бы за минуты
CREATE TABLE smmaker_email_tokens (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES smmaker_users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('verify', 'reset')),
  code_hash   text,
  link_hash   text NOT NULL UNIQUE,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smmaker_email_tokens_user_idx ON smmaker_email_tokens (user_id, kind, created_at);
