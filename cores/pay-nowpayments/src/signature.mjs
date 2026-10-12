// Подпись уведомлений NOWPayments (IPN).
//
// Касса подписывает каждое уведомление: HMAC-SHA512 от JSON тела, где ключи отсортированы по
// алфавиту на всех уровнях вложенности, ключ подписи — «IPN secret» из кабинета кассы. Подпись
// приходит заголовком x-nowpayments-sig (hex). Так считает сам NOWPayments (документация IPN,
// пример sortObject) — повторяем ровно это.
//
// Почему сортируем сами, а не подписываем тело как пришло: порядок полей в JSON не гарантирован,
// а express отдаёт уже разобранный объект. JSON.stringify числа пишет так же, как пишет их сама
// касса (у неё тоже JavaScript), поэтому разбор и обратная сборка подпись не ломают.
import crypto from 'node:crypto';

/** Объект с ключами по алфавиту на всех уровнях. Массивы — как есть, их элементы — сортируем */
export const sortDeep = (v) => {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = sortDeep(v[k]); return o; }, {});
  return v;
};

/** Подпись тела уведомления (hex, строчными) */
export const sign = (body, secret) => crypto.createHmac('sha512', secret).update(JSON.stringify(sortDeep(body))).digest('hex');

/**
 * Подпись верна. Сравнение — за постоянное время (timingSafeEqual): по задержке ответа подпись
 * не подобрать посимвольно. Пустой секрет — всегда «нет»: иначе HMAC с пустым ключом можно
 * посчитать без всякого секрета
 */
export const verify = (body, signature, secret) => {
  if (!secret || typeof signature !== 'string' || !body || typeof body !== 'object' || Array.isArray(body)) return false;
  const expected = Buffer.from(sign(body, secret));
  const got = Buffer.from(signature.trim().toLowerCase());
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
};
