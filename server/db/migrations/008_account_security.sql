-- Профиль и безопасность в кабинете (решение владельца 12 октября): человек сам меняет имя,
-- телефон, почту и пароль, видит, где открыт вход, и закрывает чужие входы.

-- Откуда сессия: браузер и адрес при входе, когда последний раз была в деле. Без этого
-- список «где выполнен вход» — ряд одинаковых строк, и чужой вход в нём не узнать.
-- У сессий до миграции полей нет — в списке они «неизвестное устройство»
ALTER TABLE smmaker_sessions ADD COLUMN user_agent text NOT NULL DEFAULT '';
ALTER TABLE smmaker_sessions ADD COLUMN ip text NOT NULL DEFAULT '';
ALTER TABLE smmaker_sessions ADD COLUMN seen_at timestamptz;

-- Смена почты: код уходит на НОВЫЙ адрес, и адрес меняется только после ввода кода —
-- иначе опечатка в почте закрыла бы человеку вход и сброс пароля. Новый адрес ждёт
-- подтверждения в самом ключе письма
ALTER TABLE smmaker_email_tokens ADD COLUMN new_email text;
ALTER TABLE smmaker_email_tokens DROP CONSTRAINT IF EXISTS smmaker_email_tokens_kind_check;
ALTER TABLE smmaker_email_tokens ADD CONSTRAINT smmaker_email_tokens_kind_check
  CHECK (kind IN ('verify', 'reset', 'email'));
