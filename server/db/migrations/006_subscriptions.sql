-- Подписки (решение владельца 29 сентября) вместо пакетов на год.
--
-- Клиент платит помесячно за тариф: Базовый 30 кр. — ₩49 000, Стандарт 50 — ₩69 000,
-- Про 90 — ₩89 000. Чем больше тариф, тем дешевле кредит (1 633 → 1 380 → 989 ₩).
-- Это цены запуска на первые два месяца платформы; потом владелец поднимет их в админке —
-- новая цена не меняет уже начисленного, она записана в партию.
--
-- Кредиты подписки сгорают в конце месяца: так клиент делает контент регулярно, а выручка
-- предсказуема. Докупка (если на месяц не хватило) сгорает вместе с подпиской.
--
-- Подписка — не отдельная сущность, а партия кредитов с source = 'subscription': у партий уже
-- есть срок, остаток, цена и журнал, а «до какого числа подписка» — это срок последней
-- такой партии. Оплата по-прежнему вне системы, продление начисляет менеджер.

-- Вид пакета: plan — подписка на месяц, topup — докупка сверх подписки
ALTER TABLE smmaker_packs ADD COLUMN kind text NOT NULL DEFAULT 'topup' CHECK (kind IN ('plan', 'topup'));

ALTER TABLE smmaker_credit_lots DROP CONSTRAINT IF EXISTS smmaker_credit_lots_source_check;
ALTER TABLE smmaker_credit_lots ADD CONSTRAINT smmaker_credit_lots_source_check
  CHECK (source IN ('signup', 'pack', 'bonus', 'legacy', 'subscription'));

INSERT INTO smmaker_packs (id, title, credits, price_krw, valid_days, kind, sort) VALUES
  ('plan-basic', 'Базовый', 30, 49000, 30, 'plan', 1),
  ('plan-standard', 'Стандарт', 50, 69000, 30, 'plan', 2),
  ('plan-pro', 'Про', 90, 89000, 30, 'plan', 3);

-- Прежние пакеты становятся докупкой. Цены — дороже за кредит, чем самый маленький тариф
-- (1 633 ₩): иначе докупка без подписки выгоднее подписки, и никто её не оформит.
-- valid_days у докупки — на случай, если её начислят без действующей подписки
UPDATE smmaker_packs SET title = '+10 кредитов', credits = 10, price_krw = 19000, valid_days = 30, sort = 11 WHERE id = 'start';
UPDATE smmaker_packs SET title = '+25 кредитов', credits = 25, price_krw = 44000, valid_days = 30, sort = 12 WHERE id = 'base';
-- Третий пакет лишний. Продавали — только снимаем с продажи (на него ссылаются партии)
UPDATE smmaker_packs SET active = false, sort = 13 WHERE id = 'pro';
DELETE FROM smmaker_packs p WHERE id = 'pro'
  AND NOT EXISTS (SELECT 1 FROM smmaker_credit_lots l WHERE l.pack_id = p.id);
