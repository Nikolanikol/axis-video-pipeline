-- Вторая касса — AnyPay, рубли картой и по СБП (13 октября). Модуль cores/pay-anypay.
--
-- Номер 016, а не 015: 015 занят партнёркой (ветка feat/referrals) — при слиянии веток номера не
-- должны совпасть. Пропуск в нумерации миграциям не мешает (server/db/index.mjs применяет по списку).
--
-- AnyPay принимает номер заказа (pay_id) только цифрами, до 15 знаков, — наш «pay-…» ему не подходит.
-- Заказу AnyPay заводится свой числовой номер у кассы: kassa_order. Случайный, как и наш id: по
-- порядковому было бы видно, сколько у нас продаж. По нему находится заказ из оповещения кассы.
ALTER TABLE smmaker_payments DROP CONSTRAINT IF EXISTS smmaker_payments_provider_check;
ALTER TABLE smmaker_payments ADD CONSTRAINT smmaker_payments_provider_check CHECK (provider IN ('nowpayments', 'anypay'));

ALTER TABLE smmaker_payments ADD COLUMN kassa_order text CHECK (kassa_order ~ '^[1-9][0-9]{0,14}$');
CREATE UNIQUE INDEX smmaker_payments_kassa_order_idx ON smmaker_payments (provider, kassa_order) WHERE kassa_order IS NOT NULL;
