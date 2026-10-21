-- Скрытие клиента админом (решение владельца 21 октября) вместо удаления.
--
-- Админ «удаляет» клиента из админки, но в базе ничего не стирается: данные нужны всегда —
-- расчёты, контакты, история. Скрытый кабинет закрыт (войти, сбросить пароль нельзя, входы
-- сброшены) и не виден в списке клиентов, кроме фильтра «Скрытые», откуда его можно вернуть.
-- Это не удаление по просьбе клиента (009_account_deletion): там свой срок и своя чистка.
ALTER TABLE smmaker_workspaces ADD COLUMN hidden_at timestamptz;
-- Кто и почему скрыл: через месяц иначе не понять, куда делся клиент
ALTER TABLE smmaker_workspaces ADD COLUMN hidden_by uuid REFERENCES smmaker_users(id);
ALTER TABLE smmaker_workspaces ADD COLUMN hidden_note text NOT NULL DEFAULT '';
