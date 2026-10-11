// Граница модулей-касс в KOK: какие кассы есть, с какими ключами, и перевод их ошибок в ответы
// интерфейсу. Сами кассы — независимые модули cores/pay-<id> (контракт cores/PAYMENTS.md); здесь
// KOK читает ключи из окружения и отдаёт их модулю. Что делать с деньгами — server/payments.mjs.
//
// Сейчас касса одна — NOWPayments (USDT TRC20). Рубли (AnyPay) встанут сюда второй строкой.
import {createClient as nowpayments, core as nowpaymentsCore} from '../cores/pay-nowpayments/src/index.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {previewId} from './db/index.mjs';
import {HttpError} from './store.mjs';

const PRODUCTION = process.env.NODE_ENV === 'production';
const env = (k) => process.env[k]?.trim() || '';

// Имя кассы в базе (smmaker_payments.provider) — короткое и неизменное: заказы хранятся годами,
// а модуль могут переименовать
export const PROVIDER = 'nowpayments';
export const kassaInfo = nowpaymentsCore;

/** Включена ли песочница (тестовые деньги) для новых заказов: NOWPAYMENTS_SANDBOX=1 */
export const sandboxMode = () => Boolean(env('NOWPAYMENTS_SANDBOX'));

/**
 * Клиент кассы для заказа: боевой или песочница — по признаку самого заказа, а не по текущей
 * настройке. Переключили режим, а уведомление о вчерашнем тестовом заказе пришло сегодня —
 * подпись проверится тестовым секретом, сверка пойдёт в песочницу, а не наоборот.
 */
export const kassa = (sandbox) => nowpayments(sandbox
  ? {apiKey: env('NOWPAYMENTS_SANDBOX_API_KEY'), ipnSecret: env('NOWPAYMENTS_SANDBOX_IPN_SECRET'), sandbox: true}
  : {apiKey: env('NOWPAYMENTS_API_KEY'), ipnSecret: env('NOWPAYMENTS_IPN_SECRET'), sandbox: false});

/**
 * Можно ли принимать оплату прямо сейчас. Песочница на боевом сервере (не превью) — нельзя:
 * тестовые «деньги» давали бы настоящие кредиты, а забытая в Coolify переменная — дыра, которую
 * никто не заметит
 */
export const kassaReady = () => {
  if (sandboxMode() && PRODUCTION && !previewId()) return false;
  return kassa(sandboxMode()).ready;
};

/** Заказ из песочницы на боевом сервере не начисляется ни при каких условиях — та же причина */
export const sandboxForbidden = (sandbox) => sandbox && PRODUCTION && !previewId();

// Ошибка кассы → ответ клиенту. Подробности (что сказала касса, стек) — только в лог: клиенту
// они ничего не дадут, а нам по requestId всё видно
const CLIENT_TEXT = {
  BAD_INPUT: 'Касса отказала в счёте — напишите нам, разберёмся',
  UPSTREAM_BLOCKED: 'Оплата временно недоступна — напишите нам, подключим вручную',
  RATE_LIMITED: 'Касса перегружена — попробуйте через минуту',
  UPSTREAM_TIMEOUT: 'Касса не ответила — попробуйте ещё раз через минуту',
  UPSTREAM_UNAVAILABLE: 'Касса не ответила — попробуйте ещё раз через минуту',
  OVERLOADED: 'Касса перегружена — попробуйте через минуту',
};
export const kassaHttpError = (e) => {
  const err = toCoreError(e);
  return new HttpError(err.retryable ? 503 : 502, CLIENT_TEXT[err.code] ?? 'Касса дала сбой — попробуйте позже или напишите нам');
};
