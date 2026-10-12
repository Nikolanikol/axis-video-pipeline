-- Название докупки вида «+25 кредитов» — это её число. На превью PR 13 (копия прода) у пакета
-- было «+25 кредитов», а начислялось +50: кредиты в админке поменяли, название — нет.
-- Выравниваем названия по числу; своё, не числовое название не трогаем. Дальше то же
-- самое делает savePack при каждом сохранении (server/accounts.mjs).
UPDATE smmaker_packs
   SET title = '+' || credits || ' ' || CASE
         WHEN credits % 10 = 1 AND credits % 100 <> 11 THEN 'кредит'
         WHEN credits % 10 BETWEEN 2 AND 4 AND credits % 100 NOT BETWEEN 12 AND 14 THEN 'кредита'
         ELSE 'кредитов' END
 WHERE title ~ '^\+\s*\d+\s+кредит'
   AND title !~ ('^\+\s*' || credits || '\s');
