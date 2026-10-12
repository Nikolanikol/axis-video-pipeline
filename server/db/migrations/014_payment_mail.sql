-- Подтверждение оплаты на почту владельца кабинета (13 октября). В журнале заказа видно, ушло ли
-- письмо и на какой адрес: в споре «мне ничего не пришло» ответ находится по номеру заказа.
-- mail — письмо-подтверждение отправлено (data.to — адрес); не ушло — строка alarm с причиной
ALTER TABLE smmaker_payment_events DROP CONSTRAINT IF EXISTS smmaker_payment_events_kind_check;
ALTER TABLE smmaker_payment_events ADD CONSTRAINT smmaker_payment_events_kind_check
  CHECK (kind IN ('checkout', 'notify', 'sync', 'credit', 'reject', 'alarm', 'error', 'mail'));
