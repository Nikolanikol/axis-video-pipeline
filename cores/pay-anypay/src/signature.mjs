// Подписи AnyPay — два разных вида (справка: ANYPAY.md).
//
// 1. Оповещение об оплате (SCI): SHA256 от «currency:amount:pay_id:merchant_id:status:секрет» —
//    склейка через «:», секрет — «Секретный ключ» проекта. Алгоритм SHA256 выбран в кабинете
//    (проект → «Основное» → «Алгоритм подписи»); MD5 не поддерживаем намеренно: он устарел.
// 2. Запросы к API: SHA256 от склейки БЕЗ разделителей: имя метода + API ID + параметры + API-ключ.
//    Ключ здесь другой — API-ключ из профиля, не секрет проекта. Перепутать их — главная ловушка:
//    подпись не сойдётся, а касса ответит одинаковым «Invalid sign» (102).
//
// Значения в подпись оповещения идут строками ровно как пришли: «100.00» и «100» — разные подписи,
// поэтому сумму не переводим в число и обратно.
import crypto from 'node:crypto';

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const s = (v) => (v === null || v === undefined ? '' : String(v));

/** Подпись оповещения. merchantId — наш ID проекта из настроек, а не из тела оповещения */
export const notificationSign = (body, merchantId, secret) =>
  sha256([s(body?.currency), s(body?.amount), s(body?.pay_id), s(merchantId), s(body?.status), s(secret)].join(':'));

/** Подпись запроса к API: метод + API ID + части + API-ключ, без разделителей */
export const apiSign = (method, apiId, parts, apiKey) => sha256(`${method}${apiId}${parts.map(s).join('')}${apiKey}`);

/**
 * Подпись оповещения верна. Сравнение — за постоянное время: по задержке ответа подпись не
 * подобрать посимвольно. Пустой секрет или ID проекта — всегда «нет»: такую подпись посчитает кто угодно
 */
export const verifyNotification = (body, signature, merchantId, secret) => {
  if (!secret || !merchantId || typeof signature !== 'string' || !body || typeof body !== 'object' || Array.isArray(body)) return false;
  const expected = Buffer.from(notificationSign(body, merchantId, secret));
  const got = Buffer.from(signature.trim().toLowerCase());
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
};
