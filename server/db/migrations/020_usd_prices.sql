-- Цены тарифов — в долларах (решение владельца 23 октября).
--
-- До этого тариф стоил в вонах, а платят клиенты не в вонах: USDT пересчитывал воны в доллары по
-- курсу дня, AnyPay — воны в доллар и дальше в гривны и сумы. Клиент из-за этого видел каждый день
-- новую сумму вроде $17,23, а прайс в вонах иностранцу непонятен. Теперь цена тарифа — ровно в
-- долларах, USDT берёт её без курса, AnyPay пересчитывает на шаг меньше. Вон в интерфейсе нет совсем.
--
-- Сетка (владелец 23.10, по курсу дня 1 $ = 1 325 ₩, стоимость сохранена в пределах ±4%):
--   подписка  Базовый 25 кр. — $19, Стандарт 50 — $29, Про 90 — $39 ($10 шагом, кредит дешевле
--             с каждым тарифом: 0,76 → 0,58 → 0,43);
--   докупка   +20 — $16, +50 — $32: кредит докупки всегда дороже, чем в подписке того же размера,
--             иначе докупка без подписки выгоднее подписки.
-- «Квартал» (135 кр. на год, снят с продажи, кредит дороже, чем в «Про») — в архив.
--
-- price_krw не удаляем: в нём записано, сколько стоило проданное до перехода. Код его больше не
-- читает. Проданное раньше пересчитано в доллары по курсу 1 325 — чтобы «Оплачено» и история
-- считались в одной валюте; оплаты USDT — точной суммой счёта, она и была в долларах.

ALTER TABLE smmaker_packs ADD COLUMN price_usd numeric(10, 2);
-- Тариф, которого нет в сетке (свой, архивный), — по тому же курсу; админ поправит в админке
UPDATE smmaker_packs SET price_usd = round(price_krw / 1325.0, 2);
-- Сетка — по виду и числу кредитов, не по id: тарифы заводили в админке, id на проде свои
UPDATE smmaker_packs SET price_usd = 19 WHERE kind = 'plan'  AND credits = 25 AND valid_days <= 31;
UPDATE smmaker_packs SET price_usd = 29 WHERE kind = 'plan'  AND credits = 50 AND valid_days <= 31;
UPDATE smmaker_packs SET price_usd = 39 WHERE kind = 'plan'  AND credits = 90 AND valid_days <= 31;
UPDATE smmaker_packs SET price_usd = 16 WHERE kind = 'topup' AND credits = 20;
UPDATE smmaker_packs SET price_usd = 32 WHERE kind = 'topup' AND credits = 50;
UPDATE smmaker_packs SET active = false, archived_at = COALESCE(archived_at, now())
 WHERE kind = 'plan' AND credits = 135 AND valid_days > 31;
ALTER TABLE smmaker_packs ALTER COLUMN price_usd SET NOT NULL;
ALTER TABLE smmaker_packs ADD CONSTRAINT smmaker_packs_price_usd_check CHECK (price_usd >= 0);
-- Новый тариф цены в вонах больше не получает
ALTER TABLE smmaker_packs ALTER COLUMN price_krw SET DEFAULT 0;

-- Заказ: цена тарифа в момент заказа, в долларах
ALTER TABLE smmaker_payments ADD COLUMN price_usd numeric(10, 2) CHECK (price_usd >= 0);
UPDATE smmaker_payments SET price_usd = CASE WHEN lower(currency) = 'usd' THEN amount ELSE round(price_krw / 1325.0, 2) END;
ALTER TABLE smmaker_payments ALTER COLUMN price_usd SET NOT NULL;
ALTER TABLE smmaker_payments ALTER COLUMN price_krw DROP NOT NULL;

-- Партия: сколько заплачено, в долларах. Оплаченная USDT — суммой счёта, остальные — по курсу
ALTER TABLE smmaker_credit_lots ADD COLUMN price_usd numeric(10, 2);
UPDATE smmaker_credit_lots t SET price_usd = round(t.price_krw / 1325.0, 2) WHERE t.price_krw IS NOT NULL;
UPDATE smmaker_credit_lots t SET price_usd = p.amount
  FROM smmaker_payments p WHERE p.lot_id = t.id AND lower(p.currency) = 'usd';
