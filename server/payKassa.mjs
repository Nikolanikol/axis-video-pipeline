// Граница модулей-касс в KOK: какие кассы есть, с какими ключами, и перевод их ошибок в ответы
// интерфейсу. Сами кассы — независимые модули cores/pay-<id> (контракт cores/PAYMENTS.md); здесь
// KOK читает ключи из окружения и отдаёт их модулю. Что делать с деньгами — server/payments.mjs.
//
// Кассы (имя в базе — smmaker_payments.provider):
//   nowpayments — USDT TRC20 (12.10), есть песочница;
//   anypay      — карта в сумах и гривнах (13.10; рубли и СБП касса пока не принимает), песочницы нет.
import {createClient as nowpayments, core as nowpaymentsCore} from '../cores/pay-nowpayments/src/index.mjs';
import {createClient as anypay, core as anypayCore, isKassaIp as anypayIp} from '../cores/pay-anypay/src/index.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {previewId} from './db/index.mjs';
import {HttpError} from './store.mjs';

const PRODUCTION = process.env.NODE_ENV === 'production';
const env = (k) => process.env[k]?.trim() || '';

// Имена касс в базе — короткие и неизменные: заказы хранятся годами, а модули могут переименовать
export const PROVIDERS = Object.freeze(['nowpayments', 'anypay']);
// Прежнее имя для кода, который знает только NOWPayments (уведомления, админка)
export const PROVIDER = 'nowpayments';
const INFO = {nowpayments: nowpaymentsCore, anypay: anypayCore};
export const kassaInfo = (provider = PROVIDER) => INFO[provider];

// Способ оплаты, который выбирает клиент → касса. usdt — NOWPayments; остальное — AnyPay:
// sbp и card — рубли, card_uah / card_uzs / card_kgs — карта в гривнах, сумах, сомах (13.10: рубли
// AnyPay не принимает, а эти три валюты у проекта открыты)
export const METHOD_PROVIDER = Object.freeze({
  usdt: 'nowpayments', sbp: 'anypay', card: 'anypay', card_uah: 'anypay', card_uzs: 'anypay', card_kgs: 'anypay',
});
/** Способ клиента → способ и валюта AnyPay: card_uah → {method: 'card', currency: 'uah'} */
export const anypayOption = (key) => {
  const [method, currency = 'rub'] = String(key).split('_');
  return anypayCore.currencies[method]?.includes(currency) ? {method, currency} : null;
};

/** Включена ли песочница NOWPayments для новых заказов: NOWPAYMENTS_SANDBOX=1. У AnyPay песочницы нет */
export const sandboxMode = (provider = PROVIDER) => provider === 'nowpayments' && Boolean(env('NOWPAYMENTS_SANDBOX'));

/**
 * Клиент кассы для заказа. У NOWPayments боевой или песочница — по признаку самого заказа, а не
 * по текущей настройке: переключили режим, а уведомление о вчерашнем тестовом заказе пришло
 * сегодня — подпись проверится тестовым секретом, сверка пойдёт в песочницу, а не наоборот.
 */
export const kassa = (sandbox, provider = PROVIDER) => {
  if (provider === 'anypay') {
    return anypay({projectId: env('ANYPAY_PROJECT_ID'), secret: env('ANYPAY_SECRET'), apiId: env('ANYPAY_API_ID'), apiKey: env('ANYPAY_API_KEY')});
  }
  return nowpayments(sandbox
    ? {apiKey: env('NOWPAYMENTS_SANDBOX_API_KEY'), ipnSecret: env('NOWPAYMENTS_SANDBOX_IPN_SECRET'), sandbox: true}
    : {apiKey: env('NOWPAYMENTS_API_KEY'), ipnSecret: env('NOWPAYMENTS_IPN_SECRET'), sandbox: false});
};

/**
 * Можно ли принимать оплату этой кассой прямо сейчас. Песочница на боевом сервере (не превью) —
 * нельзя: тестовые «деньги» давали бы настоящие кредиты, а забытая в Coolify переменная — дыра,
 * которую никто не заметит
 */
export const kassaReady = (provider = PROVIDER) => {
  if (sandboxMode(provider) && PRODUCTION && !previewId()) return false;
  return kassa(sandboxMode(provider), provider).ready;
};

/**
 * Какие способы AnyPay показывать клиенту: ANYPAY_METHODS=card_uah,card_uzs,card_kgs (или sbp,card — рубли). Список — руками, а не по ответу
 * кассы: рубли и СБП в проекте открывает менеджер AnyPay (13.10 их ещё не было), и спрашивать кассу
 * на каждом открытии тарифов — лишняя задержка. Пусто — рублёвых кнопок нет, даже с ключами
 */
export const anypayMethods = () => env('ANYPAY_METHODS').split(',').map((m) => m.trim().toLowerCase())
  .filter((m) => METHOD_PROVIDER[m] === 'anypay' && anypayOption(m));

/** Оповещение пришло с адреса кассы AnyPay */
export const isAnypayIp = anypayIp;

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
// Отказы AnyPay, которые клиент может обойти сам — другим способом оплаты (коды: ANYPAY.md)
const ANYPAY_TEXT = {
  204: 'Сумма меньше минимальной для этого способа — выберите другой способ оплаты',
  205: 'Сумма больше допустимой для этого способа — выберите другой способ или напишите нам',
  208: 'Этот способ оплаты сейчас недоступен — выберите другой или напишите нам',
  311: 'Этот способ оплаты сейчас недоступен — выберите другой или напишите нам',
  // «Не удалось сгенерировать ссылку»: 13.10 так касса отвечала на любые счета в сомах (KGS) — у неё
  // не было реквизитов. Повтор через минуту не помогает, поэтому не «попробуйте ещё раз», а другой способ
  215: 'Этот способ оплаты сейчас недоступен — выберите другой или напишите нам',
};
export const kassaHttpError = (e) => {
  const err = toCoreError(e);
  const text = ANYPAY_TEXT[err.details?.kassaCode] ?? CLIENT_TEXT[err.code] ?? 'Касса дала сбой — попробуйте позже или напишите нам';
  return new HttpError(err.retryable ? 503 : 502, text);
};
