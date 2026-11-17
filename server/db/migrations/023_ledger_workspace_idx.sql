-- Списания компании по её номеру (18.11): баланс (server/billing.mjs, balanceOf) теперь каждый раз
-- спрашивает, была ли у компании хоть одна генерация, — для события first_generation в счётчиках.
-- Баланс читается при каждом переходе между разделами; без индекса это полный просмотр журнала.
CREATE INDEX smmaker_credit_ledger_ws_idx ON smmaker_credit_ledger (workspace_id, kind);
