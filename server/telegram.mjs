// Сообщения в рабочую группу «KOK — работа» в Telegram (12.10): владелец и Дмитрий (общение
// с клиентами) — в одной группе с темами, бот пишет в нужную тему. Сейчас — тема «Оплаты».
//
// Почему Telegram, а не письмо: о недоплате или несошедшейся сверке надо узнать сразу, а не
// когда клиент напишет «я заплатил, где кредиты». Письма читают реже.
//
// Отправка никогда не ломает то, о чём сообщает: оплата начислена — она начислена, даже если
// Telegram не ответил. Ошибка — только строка в журнал сервера.
//
// .env: TELEGRAM_BOT_TOKEN (бот @kok_work_bot), TELEGRAM_CHAT_ID (группа), TELEGRAM_PAYMENTS_TOPIC
// (номер темы «Оплаты» — второй сегмент её ссылки t.me/c/<группа>/<тема>). Нет токена или
// группы — молчим: на Mac без бота и в тестах.
const TIMEOUT_MS = 10_000;

const settings = () => ({
  token: process.env.TELEGRAM_BOT_TOKEN?.trim(),
  chat: process.env.TELEGRAM_CHAT_ID?.trim(),
});

let transport = null;
/** Для тестов: перехватить сообщения вместо отправки. Без аргумента — снова настоящая отправка */
export const setTelegramTransport = (fn = null) => { transport = fn; };

/**
 * Написать в тему группы. topic — номер темы; пусто — в общую ленту группы.
 * Обычный текст без разметки: имена компаний клиенты пишут как хотят, и звёздочка или
 * угловая скобка в названии иначе сломали бы сообщение
 */
export const notify = async (text, {topic} = {}) => {
  const {token, chat} = settings();
  const thread = Number(topic) || undefined;
  if (transport) return transport({text, topic: thread});
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: chat, message_thread_id: thread, text, disable_web_page_preview: true}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error(`Telegram не принял сообщение: ${data.description ?? res.status}`);
  } catch (e) {
    console.error(`Telegram недоступен: ${e.message}`);
  }
};

/** В тему «Оплаты» */
export const notifyPayments = (text) => notify(text, {topic: process.env.TELEGRAM_PAYMENTS_TOPIC});
