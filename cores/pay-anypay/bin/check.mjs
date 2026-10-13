#!/usr/bin/env node
// Проверка кассы руками: связь, API, подпись, баланс, какие способы открыты для рублей; с номером —
// что касса знает о платеже. Только чтение: платежей не создаёт.
//
//   node --env-file=.env cores/pay-anypay/bin/check.mjs                    — связь и способы
//   node --env-file=.env cores/pay-anypay/bin/check.mjs 4950030            — платёж по номеру кассы
//   node --env-file=.env cores/pay-anypay/bin/check.mjs --order 1335       — платёж по нашему pay_id
//
// Ключи — из тех же переменных, что у KOK. Сами ключи не печатаются.
import { createClient } from '../src/index.mjs';
import { errorPayload } from '../../kit/errors.mjs';

const args = process.argv.slice(2);
const byOrder = args.includes('--order');
const id = args.find((a) => /^\d+$/.test(a));
const env = (k) => process.env[k]?.trim();
const client = createClient({
  projectId: env('ANYPAY_PROJECT_ID'), secret: env('ANYPAY_SECRET'), apiId: env('ANYPAY_API_ID'), apiKey: env('ANYPAY_API_KEY'),
});

try {
  console.log('AnyPay', JSON.stringify(await client.checkUpstream()));
  if (id) console.log(JSON.stringify(await (byOrder ? client.findByOrder(id) : client.getPayment(id)), null, 2));
} catch (e) {
  console.error('Ошибка:', JSON.stringify(errorPayload(e)));
  process.exitCode = 1;
}
