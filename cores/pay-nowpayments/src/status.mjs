// Статусы NOWPayments → общие статусы касс KOK (cores/PAYMENTS.md, раздел 3).
//
// У каждой кассы свои слова; KOK знает только общие. Карта — здесь, в одном месте: новый
// статус у кассы — строка сюда, а не правка KOK.
//
// Статусы NOWPayments (документация «Payment statuses»):
//   waiting         — ждём перевод от клиента
//   confirming      — перевод в блокчейне, ждём подтверждений сети
//   confirmed       — сеть подтвердила, касса ещё не перевела деньги нам
//   sending         — касса переводит деньги на наш кошелёк / баланс
//   partially_paid  — пришло меньше суммы счёта
//   finished        — деньги дошли до нас: можно начислять
//   failed          — ошибка у кассы
//   refunded        — деньги вернули клиенту
//   expired         — время на оплату вышло (обычно 7 дней без перевода)

export const STATUS_MAP = Object.freeze({
  waiting: 'waiting',
  confirming: 'confirming',
  confirmed: 'confirming',
  sending: 'confirming',
  partially_paid: 'partial',
  finished: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
});

/** Общий статус по слову кассы. Незнакомое слово — unknown: не начисляем и пишем в лог */
export const normalizeStatus = (s) => STATUS_MAP[String(s ?? '').toLowerCase()] ?? 'unknown';
