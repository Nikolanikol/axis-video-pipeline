// Статусы AnyPay → общие статусы касс KOK (cores/PAYMENTS.md, раздел 3).
//
// Статусы AnyPay (документация SCI, «Статусы платежей»):
//   waiting         — не оплачен, ждём клиента
//   paid            — оплачен: можно начислять
//   partially-paid  — оплачен частично (через дефис — не как у NOWPayments)
//   refund          — возврат клиенту
//   canceled        — отменён (с одной «l»)
//   expired         — просрочен
//   error           — ошибка

export const STATUS_MAP = Object.freeze({
  waiting: 'waiting',
  paid: 'paid',
  'partially-paid': 'partial',
  refund: 'refunded',
  canceled: 'failed',
  expired: 'expired',
  error: 'failed',
});

/** Общий статус по слову кассы. Незнакомое слово — unknown: не начисляем и пишем в лог */
export const normalizeStatus = (st) => STATUS_MAP[String(st ?? '').toLowerCase()] ?? 'unknown';
