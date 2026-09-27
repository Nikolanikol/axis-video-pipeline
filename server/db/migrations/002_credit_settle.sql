-- Списание кредита закрывается одним из двух исходов: задание выполнено (settled_at) или
-- кредит вернули (строка refund). Незакрытое списание после перезапуска сервера — это
-- задание, которое пропало вместе с очередью в памяти: при старте за него возвращают кредит.
ALTER TABLE smmaker_credit_ledger ADD COLUMN settled_at timestamptz;

-- Поиск незакрытых списаний при старте — без прохода по всему журналу
CREATE INDEX smmaker_credit_ledger_open_idx ON smmaker_credit_ledger (created_at)
  WHERE kind = 'charge' AND settled_at IS NULL;
