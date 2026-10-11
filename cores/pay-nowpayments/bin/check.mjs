#!/usr/bin/env node
// Проверка кассы руками: связь, ключ, включена ли USDT TRC20; с номером — что касса знает о платеже.
//
//   node --env-file=.env cores/pay-nowpayments/bin/check.mjs            — боевой режим
//   node --env-file=.env cores/pay-nowpayments/bin/check.mjs --sandbox  — песочница
//   node --env-file=.env cores/pay-nowpayments/bin/check.mjs --sandbox 5194530281
//
// Ключи берутся из тех же переменных, что у KOK. Сами ключи не печатаются.
import { createClient } from '../src/index.mjs';
import { errorPayload } from '../../kit/errors.mjs';

const sandbox = process.argv.includes('--sandbox');
const paymentId = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const env = (k) => process.env[k]?.trim();
const client = createClient(sandbox
  ? { apiKey: env('NOWPAYMENTS_SANDBOX_API_KEY'), ipnSecret: env('NOWPAYMENTS_SANDBOX_IPN_SECRET'), sandbox: true }
  : { apiKey: env('NOWPAYMENTS_API_KEY'), ipnSecret: env('NOWPAYMENTS_IPN_SECRET') });

try {
  console.log(sandbox ? 'Песочница' : 'Боевой режим', JSON.stringify(await client.checkUpstream()));
  if (paymentId) console.log(JSON.stringify(await client.getPayment(paymentId), null, 2));
} catch (e) {
  console.error('Ошибка:', JSON.stringify(errorPayload(e)));
  process.exitCode = 1;
}
