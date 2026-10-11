-- Онлайн-оплата (решение владельца 12 октября).
--
-- До этого тариф подключал менеджер руками после оплаты вне системы. Теперь клиент платит сам,
-- касса присылает уведомление, и кредиты начисляются без человека. Первая касса — NOWPayments
-- (USDT в сети TRON): владелец — физлицо в Корее, российские кассы его не верифицируют.
-- Рубли (AnyPay) придут второй кассой в ту же таблицу — поэтому provider, а не таблица на кассу.
--
-- Строка — один заказ: клиент нажал «Оплатить», мы попросили у кассы счёт. Кредиты — партия
-- кредитов, как от менеджера; здесь только путь денег. credited_at ставится в той же
-- транзакции, что и партия, — касса шлёт уведомление повторно, и двойного начисления быть
-- не должно.
CREATE TABLE smmaker_payments (
  -- Наш номер заказа (pay-<случайное>): его видит касса как order_id и возвращает в уведомлении.
  -- Не порядковый: по номеру не должно быть видно, сколько у нас продаж
  id             text PRIMARY KEY CHECK (id ~ '^pay-[a-z0-9]{8,32}$'),
  workspace_id   text NOT NULL REFERENCES smmaker_workspaces(id),
  created_by     uuid REFERENCES smmaker_users(id),
  provider       text NOT NULL CHECK (provider IN ('nowpayments')),
  -- Песочница кассы: тестовые деньги. На боевом сервере песочница не включается (server/payKassa.mjs)
  sandbox        boolean NOT NULL DEFAULT false,
  pack_id        text NOT NULL REFERENCES smmaker_packs(id),
  -- Цена тарифа в момент заказа: правка прайса после не меняет того, что клиент уже оплачивает
  price_krw      integer NOT NULL CHECK (price_krw >= 0),
  -- Сумма счёта в валюте кассы (доллары по курсу дня) и чем платит клиент
  amount         numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency       text NOT NULL,
  pay_currency   text,
  -- created — счёт выставлен, клиент ещё не платил; дальше — общие статусы касс (cores/PAYMENTS.md:
  -- waiting, confirming, paid, partial, failed, expired, refunded, unknown) и abandoned — брошенный счёт
  status         text NOT NULL DEFAULT 'created',
  invoice_id     text,
  payment_id     text,
  actually_paid  numeric(24, 8),
  -- Последнее уведомление кассы целиком: разбирать спор с клиентом без него нечем
  raw            jsonb,
  error          text,
  credited_at    timestamptz,
  lot_id         bigint REFERENCES smmaker_credit_lots(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Начислено целиком или не начислено вовсе
  CHECK ((credited_at IS NULL) = (lot_id IS NULL))
);
CREATE INDEX smmaker_payments_workspace_idx ON smmaker_payments (workspace_id, created_at DESC);
CREATE UNIQUE INDEX smmaker_payments_invoice_idx ON smmaker_payments (provider, invoice_id) WHERE invoice_id IS NOT NULL;
