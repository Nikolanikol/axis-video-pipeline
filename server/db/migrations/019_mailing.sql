-- Служебные рассылки (решение владельца 21 октября): менеджер пишет письмо — новости сервиса,
-- новые функции, — выбирает, кому, и отправляет. Только служебные новости, не реклама.
--
-- Согласие. В регистрации галочка «Получать новости KOK», отмечена заранее; клиенты, которые
-- зарегистрировались раньше, считаются согласными (владелец 21.10: для служебных писем закон
-- согласия не требует, а отписка есть в каждом письме и в кабинете). Поэтому храним не «согласен»,
-- а «отказался»: NULL — новости идут.
ALTER TABLE smmaker_users ADD COLUMN news_off_at timestamptz;
-- Когда согласился при регистрации (галочка). NULL у прежних клиентов — они до галочки
ALTER TABLE smmaker_users ADD COLUMN news_consent_at timestamptz;
-- Ключ ссылки «Отписаться»: в письме не должно быть ни почты, ни id — по ссылке из пересланного
-- письма чужой отписал бы человека, зная только адрес. Случайный ключ на каждого
ALTER TABLE smmaker_users ADD COLUMN news_key uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX smmaker_users_news_key_idx ON smmaker_users (news_key);

-- Рассылка. Текст хранится как написал менеджер (с {имя} и {компания}), письмо каждому
-- собирается при отправке. segment — фильтр клиентов админки (CLIENT_FILTERS в accounts.mjs)
CREATE TABLE smmaker_mailings (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject      text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  -- Одна кнопка в письме (как у остальных писем KOK): подпись и ссылка, обе пустые — без кнопки
  button_label text NOT NULL DEFAULT '',
  button_url   text NOT NULL DEFAULT '',
  segment      text NOT NULL DEFAULT 'all',
  -- segment = 'pick' — получатели выбраны поимённо (владелец 21.10): их id. У сегментов — пусто
  user_ids     uuid[] NOT NULL DEFAULT '{}',
  -- draft — черновик; sending — получатели записаны, очередь идёт; done — все обработаны;
  -- cancelled — остановили, неотправленным не ушло
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'done', 'cancelled')),
  created_by   uuid REFERENCES smmaker_users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

-- Получатели: список снимается в момент «Отправить» и дальше не меняется — кто зарегистрировался
-- или отписался после, на эту рассылку не влияет. Почта — снимок: по ней видно, куда ушло
CREATE TABLE smmaker_mailing_recipients (
  mailing_id   bigint NOT NULL REFERENCES smmaker_mailings(id),
  user_id      uuid NOT NULL REFERENCES smmaker_users(id),
  email        text NOT NULL,
  -- queued — ждёт очереди; sent — принято почтовым сервисом; failed — отказ (error);
  -- skipped — к моменту отправки отписался или кабинет закрыли
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error        text,
  provider_id  text,
  sent_at      timestamptz,
  PRIMARY KEY (mailing_id, user_id)
);
CREATE INDEX smmaker_mailing_recipients_queue_idx ON smmaker_mailing_recipients (mailing_id) WHERE status = 'queued';
