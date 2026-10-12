-- Поддержка в Telegram (решение владельца 12 октября).
--
-- Клиент пишет боту @kok_work_bot в личку, а в рабочей группе «KOK — работа» на него заводится
-- своя тема: владелец и Дмитрий отвечают в теме, бот копирует ответ клиенту. Клиент видит только
-- диалог с ботом — ни группы, ни других клиентов, ни личных аккаунтов сотрудников.
--
-- Строка — один человек в Telegram и его тема. Кабинет KOK привязывается кнопкой «Написать в
-- поддержку» в кабинете (ключ в ссылке t.me/<бот>?start=<ключ>): в шапке темы сразу видно, кто это.
CREATE TABLE smmaker_support_threads (
  tg_user_id     bigint PRIMARY KEY,
  -- Номер темы в группе (message_thread_id). Тему могут удалить руками — тогда заводим новую
  topic_id       integer NOT NULL UNIQUE,
  tg_name        text NOT NULL DEFAULT '',
  tg_username    text,
  workspace_id   text REFERENCES smmaker_workspaces(id),
  user_id        uuid REFERENCES smmaker_users(id),
  -- Клиент заблокировал бота: ответ не доставить, в теме об этом сказано
  blocked        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_client_at timestamptz
);

-- Ключ привязки из кабинета: одноразовый, живёт сутки. Не id пользователя в открытую — иначе
-- любой, зная чужой id, привязал бы себе чужой кабинет и увидел его данные в шапке темы
CREATE TABLE smmaker_support_links (
  token        text PRIMARY KEY CHECK (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id      uuid NOT NULL REFERENCES smmaker_users(id),
  workspace_id text NOT NULL REFERENCES smmaker_workspaces(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
