-- Журнал событий оплаты и защита от двойного платежа (12 октября, проверка безопасности).
--
-- В smmaker_payments — только последнее состояние заказа. Чтобы разобрать спор с клиентом
-- («я заплатил, где кредиты») или сбой, нужна вся история: какое уведомление пришло и когда,
-- что ответила касса при сверке, почему не начислили, о чём сообщили в группу. Журнал только
-- дописывается — строки не правятся и не удаляются.
CREATE TABLE smmaker_payment_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id  text NOT NULL REFERENCES smmaker_payments(id),
  -- checkout — счёт выставлен или нет; notify — уведомление кассы; sync — переспросили кассу сами;
  -- credit — начислено; reject — сверка не сошлась; alarm — сообщили в группу; error — сбой у нас
  kind        text NOT NULL CHECK (kind IN ('checkout', 'notify', 'sync', 'credit', 'reject', 'alarm', 'error')),
  status      text,
  data        jsonb,
  -- Номер операции в логах сервера (requestId): по нему находится всё остальное об этом событии
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smmaker_payment_events_payment_idx ON smmaker_payment_events (payment_id, id);

-- Один платёж кассы — один заказ. Начисление и так сверяет номер заказа у самой кассы, но
-- если сверку когда-нибудь сломают, база не даст привязать один перевод к двум заказам
CREATE UNIQUE INDEX smmaker_payments_payment_idx ON smmaker_payments (provider, payment_id) WHERE payment_id IS NOT NULL;

-- Статус заказа — общими словами касс (cores/PAYMENTS.md, раздел 3), а не словами NOWPayments:
-- интерфейс и сверка не должны знать, какая касса ответила. Слово кассы — отдельно, для журнала
ALTER TABLE smmaker_payments ADD COLUMN provider_status text;
UPDATE smmaker_payments SET provider_status = status, status = CASE status
  WHEN 'finished' THEN 'paid' WHEN 'partially_paid' THEN 'partial'
  WHEN 'confirmed' THEN 'confirming' WHEN 'sending' THEN 'confirming' ELSE status END;
