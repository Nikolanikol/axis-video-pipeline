// «Дверь» онлайн-оплаты (решение владельца 12.10): клиент платит сам, касса присылает
// уведомление, кредиты начисляются без менеджера.
//
// Путь денег:
//   1. checkout   — клиент выбрал тариф → заказ в smmaker_payments → счёт у кассы → страница оплаты;
//   2. notify     — касса шлёт уведомление: подпись → запись статуса → если «оплачено» — шаг 3;
//   3. credit     — сверка платежа у самой кассы → партия кредитов + отметка «начислено» одной
//                   транзакцией → сообщение в группу и подтверждение оплаты на почту владельца;
//   4. sync       — страховка от потерянных уведомлений: экран оплаты и фоновая сверка раз в 5 минут
//                   сами переспрашивают кассу.
// Каждый шаг пишет строку в журнал smmaker_payment_events и строку JSON в лог сервера с одним
// requestId — по нему одна операция находится целиком.
//
// Кассы — независимые модули cores/pay-<id> (контракт cores/PAYMENTS.md), ключи и выбор кассы —
// server/payKassa.mjs. Сюда приходят только платежи в общем виде. Кассы две: NOWPayments (USDT,
// счёт в долларах) и AnyPay (карта; счёт в валюте карты — сумы, гривны; рубли касса пока не принимает).
// Касса заказа — его provider.
//
// Правила безопасности (подробно — CONTEXT.md, «Онлайн-оплата», и cores/PAYMENTS.md, раздел 5):
//   • цена — только из базы (тариф по id), клиент присылает лишь id тарифа;
//   • уведомление начисляет только после сверки у кассы: заказ, сумма, валюта, монета;
//   • начисление ровно одно: строка заказа под FOR UPDATE, credited_at в той же транзакции,
//     что и партия; у начисленного заказа статус больше не меняется;
//   • заказ и его платежи видит только своя компания; номер заказа не угадать (80 бит);
//   • песочница на боевом сервере не начисляет ничего.
import crypto from 'node:crypto';
import {db, hasDatabase} from './db/index.mjs';
import {HttpError} from './store.mjs';
import {grantPackIn, inTransaction, ownerOf} from './accounts.mjs';
import {appUrl, paymentMail} from './mailer.mjs';
import {rates, usdKrw} from './rates.mjs';
import {esc, notifyAnypay, notifyPayments} from './telegram.mjs';
import {
  METHOD_PROVIDER, PROVIDER, anypayMethods, anypayOption, isAnypayIp, kassa, kassaHttpError, kassaInfo, kassaReady, sandboxForbidden, sandboxMode,
} from './payKassa.mjs';
import {toCoreError} from '../cores/kit/errors.mjs';
import {createLogger, levelFor} from '../cores/kit/log.mjs';

const log = createLogger('payments');
const PRODUCTION = process.env.NODE_ENV === 'production';

// После этих статусов денег по заказу уже не будет — переспрашивать кассу незачем
const FINAL = new Set(['paid', 'failed', 'expired', 'refunded', 'abandoned']);
// Экран оплаты спрашивает заказ каждые 5 с, а у кассы ограничение частоты: переспрашиваем её
// по одному заказу не чаще раза в 30 с
const SYNC_EVERY_MS = 30_000;
// Счёт выставлен, а касса за 3 дня ни разу не написала — клиент передумал. Помечаем, чтобы в
// истории не висело «ждём оплату» вечно. Придёт уведомление позже — статус обновится, как обычно
const ABANDON_AFTER_DAYS = 3;
// Касса сутки не знает платежа — значит, и не узнает (номер из песочницы, чужой, ошибочный)
const LOST_AFTER_MS = 24 * 60 * 60_000;
// Правдоподобный курс воны для счёта. Общая защита rates.mjs (500–5000) — от явного мусора, а для
// денег она слишком широка: курс 5000 вместо ~1350 продал бы тариф вчетверо дешевле. За последние
// двадцать лет вона ходила в 900–1600 за доллар; вышло за 900–2200 — счёт не выставляем, зовём человека
const RATE_MIN = 900;
const RATE_MAX = 2200;
// То же для валют AnyPay: вон за единицу, коридор с запасом вокруг курса 13.10 (₽ ≈ 15,9 ₩, гривна ≈
// 29,7 ₩, сум ≈ 0,112 ₩, сом ≈ 15,2 ₩). Вышло за коридор — источник курса сломан, счёт не выставляем
const KRW_PER_UNIT = {rub: [8, 35], uah: [15, 60], uzs: [0.05, 0.25], kgs: [8, 30]};
// Знак валюты для группы и экрана: рубль, гривна, сум, сом
const SIGN = {rub: '₽', uah: '₴', uzs: 'сум', kgs: 'сом'};
// Сумы — целыми: копеек (тийинов) на картах Узбекистана не бывает
const WHOLE = new Set(['uzs']);
// Номер заказа у AnyPay: только цифры, до 15 знаков (ANYPAY.md)
const KASSA_ORDER_RE = /^[1-9]\d{0,14}$/;
const OUR_ORDER_RE = /^pay-[a-f0-9]{20}$/;

export const newRequestId = () => crypto.randomUUID();

// ——— Журнал и сообщения ———

/**
 * Строка в журнал событий заказа. Журнал не должен ронять оплату: не записалось — пишем в лог
 * сервера и идём дальше (деньги важнее истории)
 */
const event = async (paymentId, kind, {status = null, data = null, requestId = null} = {}, client = db()) => {
  try {
    await client.query(
      'INSERT INTO smmaker_payment_events (payment_id, kind, status, data, request_id) VALUES ($1, $2, $3, $4, $5)',
      [paymentId, kind, status, data ? JSON.stringify(data) : null, requestId]);
  } catch (e) {
    log.error('event.write_failed', {order: paymentId, kind, requestId, error: e});
  }
};

const won = (n) => `₩${Number(n).toLocaleString('ru-RU')}`;
// Даты — по Сеулу: группа читает их в Корее, а сервер живёт в UTC
const dayKst = (d) => new Date(d).toLocaleDateString('ru-RU', {timeZone: 'Asia/Seoul'});
const tag = (o) => (o.sandbox ? ' · 🧪 <i>тест</i>' : '');
// Разделитель блоков сообщения: на телефоне — во всю ширину пузыря, не переносится
const LINE = '━━━━━━━━━━━━━━';

/**
 * Кто платит — компания и контакты человека: Дмитрий (общение с клиентами) связывается сразу из
 * сообщения, не открывая админку (владелец 12.10). Человек — тот, кто нажал «Оплатить»; если его
 * нет (заказ без автора) — владелец кабинета, первый по времени вступления. Телефон и почту
 * Telegram сам делает нажимаемыми. Сообщение уходит только во внутреннюю группу — клиентов в ней нет
 */
const whoPays = async (o) => {
  const {rows: [r]} = await db().query(
    `SELECT w.name AS company, u.name, u.email, u.phone FROM smmaker_workspaces w
       LEFT JOIN LATERAL (
         SELECT u.* FROM smmaker_users u
          WHERE u.id = $2 OR u.id = (SELECT m.user_id FROM smmaker_memberships m WHERE m.workspace_id = w.id ORDER BY m.created_at LIMIT 1)
          ORDER BY (u.id = $2) DESC LIMIT 1
       ) u ON true
      WHERE w.id = $1`,
    [o.workspace_id, o.created_by ?? null]);
  return [
    `🏢 <b>${esc(r?.company ?? o.workspace_id)}</b>`,
    r?.name && `👤 ${esc(r.name)}`,
    `📞 ${r?.phone ? esc(r.phone) : '<i>телефон не указан</i>'}`,
    `✉️ ${r?.email ? esc(r.email) : '<i>почта не указана</i>'}`,
  ].filter(Boolean).join('\n');
};
// Сумма счёта со знаком валюты: $18.56 USDT или 1 990,00 ₽ · СБП
const sum = (o) => {
  const c = String(o.currency).toLowerCase();
  if (c === 'usd') return `$${Number(o.amount).toFixed(2)} USDT`;
  const d = WHOLE.has(c) ? 0 : 2;
  return `${Number(o.amount).toLocaleString('ru-RU', {minimumFractionDigits: d, maximumFractionDigits: d})} ${SIGN[c] ?? c.toUpperCase()} · ${payMethod(o.pay_currency) ?? 'AnyPay'}`;
};
// Что купили и за сколько
const what = (o) => [
  `💳 ${o.kind === 'plan' ? `Тариф «${esc(o.title)}»` : `Докупка «${esc(o.title ?? o.pack_id)}»`}`,
  `💵 <b>${esc(sum(o))}</b> · ${won(o.price_krw)}`,
].join('\n');
// Номер заказа — моноширинным: в Telegram копируется одним нажатием, с ним ищут журнал заказа
const orderLine = (o) => `🧾 <code>${esc(o.id)}</code>`;

/**
 * Тревога в группу «⚠️ нужен человек» — один раз на заказ и причину: касса повторяет
 * уведомления, сверка переспрашивает каждые 5 минут, и без этого группу засыпало бы одинаковыми
 * сообщениями. Не ждём отправки: тревога не держит ответ кассе
 */
const alarm = async (o, reason, requestId) => {
  const {rowCount} = await db().query(
    `SELECT 1 FROM smmaker_payment_events WHERE payment_id = $1 AND kind = 'alarm' AND data->>'reason' = $2`, [o.id, reason]);
  if (rowCount) return;
  await event(o.id, 'alarm', {data: {reason}, requestId});
  log.warn('alarm', {order: o.id, reason, requestId});
  void whoPays(o)
    .then((who) => notifyPayments([`⚠️ <b>Нужен человек</b>${tag(o)}`, LINE, `❗️ ${esc(reason)}`, LINE, who, LINE, what(o), orderLine(o)].join('\n')))
    .catch((e) => log.error('alarm.send_failed', {order: o.id, requestId, error: e}));
};

// Сбой у нас самих (база, баг) во время уведомления — в группу, но не чаще раза в 10 минут на
// одинаковую ошибку: упавшая база дала бы сообщение на каждое повторное уведомление кассы
const lastCrash = new Map();
const crashAlarm = (where, e, requestId) => {
  const key = `${where}:${e?.message}`;
  if (Date.now() - (lastCrash.get(key) ?? 0) < 10 * 60_000) return;
  lastCrash.set(key, Date.now());
  void notifyPayments([`🔥 <b>Сбой оплаты у нас</b>`, LINE, esc(where), `<i>${esc(String(e?.message ?? e).slice(0, 300))}</i>`, LINE, `🔎 <code>${esc(requestId)}</code>`].join('\n')).catch(() => {});
};

/**
 * Журнал AnyPay в Telegram (13.10, просьба владельца): касса не проверена живым платежом, в отличие
 * от USDT, поэтому каждый шаг оплаты через AnyPay — строкой в тему «AnyPay — журнал оплат»: заказ,
 * ответ кассы, оповещения (и отклонённые), сверка, начисление. Это хроника, а не тревоги: тревоги
 * «нужен человек» по-прежнему идут в «Оплаты». Заказы других касс сюда не пишутся.
 * o — заказ (или null, если оповещение не нашло заказа), details — строки HTML (текст людей — через esc).
 * Не ждём отправки и не роняем оплату: notify сам ловит ошибки Telegram, а сбой сборки строки — в лог
 */
const trace = (o, title, details = [], {who = false} = {}) => {
  if (o && o.provider !== 'anypay') return;
  void (async () => {
    const head = [`${title}${o?.sandbox ? ' · 🧪' : ''}`];
    const order = o ? [
      `🧾 <code>${esc(o.id)}</code>${o.kassa_order ? ` · у кассы <code>${esc(o.kassa_order)}</code>` : ''}`,
      `💳 ${esc(o.title ?? o.pack_id ?? '')} · ${esc(sum(o))}`,
    ] : [];
    // Компания и контакты — только на первом шаге (заказ): дальше по номеру заказа и так понятно, кто это
    const company = o && who ? [await whoPays(o)] : [];
    await notifyAnypay([...head, ...company, ...order, ...details.filter(Boolean)].join('\n'));
  })().catch((e) => log.warn('trace.failed', {order: o?.id ?? null, error: e}));
};

// ——— Заказ ———

const SELECT = `SELECT p.*, k.title, k.credits, k.kind FROM smmaker_payments p LEFT JOIN smmaker_packs k ON k.id = p.pack_id`;
const readOrder = async (where, args, client = db()) => (await client.query(`${SELECT} WHERE ${where}`, args)).rows[0] ?? null;

/** Заказ для интерфейса: без служебного (сырые уведомления, ошибки сверки, номер платежа) */
const view = (o) => ({
  id: o.id, status: o.status, credited: Boolean(o.credited_at), packId: o.pack_id, title: o.title ?? o.pack_id,
  credits: o.credits ?? null, priceKrw: o.price_krw, amount: Number(o.amount), currency: o.currency,
  payCurrency: o.pay_currency, sandbox: o.sandbox, createdAt: o.created_at, creditedAt: o.credited_at,
});

/** Какие способы оплаты включены — интерфейс показывает только их */
export const paymentMethods = () => {
  const any = hasDatabase() && kassaReady('anypay') ? anypayMethods() : [];
  return {usdt: hasDatabase() && kassaReady('nowpayments'), ...Object.fromEntries(any.map((m) => [m, true]))};
};

/**
 * Адрес сайта для кассы: куда вернуть клиента и куда слать уведомления. Берём хост запроса —
 * у превью свой адрес, и уведомление о платеже превью иначе ушло бы на прод, — но только из
 * списка своих адресов: подставной Host не должен увести уведомления на чужой сервер
 */
export const publicOrigin = (req) => {
  const host = String(req.get('host') ?? '').toLowerCase();
  const own = new Set([appUrl(), ...String(process.env.COOLIFY_FQDN ?? '').split(',')]
    .map((u) => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.toLowerCase(); } catch { return ''; } })
    .filter(Boolean));
  const port = process.env.PORT || 3210;
  own.add(`localhost:${port}`);
  own.add(`127.0.0.1:${port}`);
  // Превью Coolify: <номер>.preview.<домен>. Номер — свой (из имени контейнера), чужое превью не подойдёт
  const pr = process.env.COOLIFY_CONTAINER_NAME?.match(/-pr-(\d+)$/)?.[1];
  const preview = Boolean(pr) && host.startsWith(`${pr}.preview.`);
  if (own.has(host) || preview) return `${PRODUCTION ? 'https' : req.protocol}://${host}`;
  log.warn('origin.not_own', {host});
  return appUrl();
};

/**
 * Заказ: счёт у кассы на тариф или докупку. Возвращает {id, url} — url страницы оплаты кассы.
 * Цена — из базы по id тарифа; от клиента приходят только id тарифа и способ оплаты
 * (usdt — NOWPayments, sbp/card — AnyPay).
 */
export const startCheckout = async ({workspaceId, userId, packId, method = 'usdt', origin, requestId = newRequestId()}) => {
  if (!hasDatabase()) throw new HttpError(400, 'Оплата работает только с базой');
  if (!workspaceId) throw new HttpError(400, 'Оплата — из кабинета компании');
  const provider = METHOD_PROVIDER[method];
  if (!provider) throw new HttpError(400, 'Нет такого способа оплаты');
  if (provider === 'anypay') return startAnypay({workspaceId, userId, packId, method, origin, requestId});
  if (!kassaReady()) throw new HttpError(503, 'Оплата USDT пока не подключена — напишите нам, подключим вручную');
  const {rows: [pack]} = await db().query('SELECT * FROM smmaker_packs WHERE id = $1 AND active', [String(packId ?? '').slice(0, 40)]);
  if (!pack) throw new HttpError(404, 'Нет такого тарифа');
  if (!(pack.price_krw > 0)) throw new HttpError(400, 'У тарифа нет цены — напишите нам');
  const rlog = log.child({requestId});

  // Тариф в вонах → доллары по курсу дня, до цента: точнее касса не принимает, а округлять до
  // целых — менять цену тарифа на глазах у клиента. Курс без источника старше суток — берём,
  // но отмечаем в логе: цена по вчерашнему курсу лучше, чем закрытая касса
  const rate = await usdKrw();
  if (rate.stale) rlog.warn('rate.stale', {fetchedAt: rate.fetchedAt});
  if (!(rate.krwPerUsd >= RATE_MIN && rate.krwPerUsd <= RATE_MAX)) {
    rlog.error('rate.implausible', {krwPerUsd: rate.krwPerUsd, fetchedAt: rate.fetchedAt});
    crashAlarm(`курс воны ${rate.krwPerUsd} за $1 — неправдоподобный, счета не выставляются`, new Error('проверьте open.er-api и data/rates.json'), requestId);
    throw new HttpError(503, 'Оплата временно недоступна — напишите нам, подключим вручную');
  }
  const amount = Math.round((pack.price_krw / rate.krwPerUsd) * 100) / 100;
  if (!(amount >= 1)) throw new HttpError(400, 'Сумма тарифа слишком мала для оплаты USDT — напишите нам');

  const sandbox = sandboxMode();
  // 80 случайных бит: номер заказа не угадать и не перебрать, по нему ничего не видно о продажах
  const id = `pay-${crypto.randomBytes(10).toString('hex')}`;
  await db().query(
    `INSERT INTO smmaker_payments (id, workspace_id, created_by, provider, sandbox, pack_id, price_krw, amount, currency, pay_currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, workspaceId, userId ?? null, PROVIDER, sandbox, pack.id, pack.price_krw, amount, kassaInfo().priceCurrency, kassaInfo().payCurrency]);
  const order = {id, workspace_id: workspaceId, created_by: userId, sandbox, pack_id: pack.id, price_krw: pack.price_krw, amount, title: pack.title, kind: pack.kind};

  try {
    const {invoiceId, url} = await kassa(sandbox).createInvoice({
      orderId: id, amount, description: `KOK · ${pack.title} · ${pack.credits} кр.`,
      // Сегментом, не «?pay=»: роутер интерфейса режет адрес по «/» (app/router.ts)
      notifyUrl: `${origin}/api/payments/${PROVIDER}/notify`, returnUrl: `${origin}/#/account/${id}`,
    });
    await db().query('UPDATE smmaker_payments SET invoice_id = $2, updated_at = now() WHERE id = $1', [id, invoiceId]);
    await event(id, 'checkout', {status: 'created', data: {invoiceId, amount, rate: rate.krwPerUsd, origin}, requestId});
    rlog.info('checkout.ok', {order: id, pack: pack.id, amount, sandbox});
    return {id, url};
  } catch (e) {
    const err = toCoreError(e);
    rlog[levelFor(err.code)]('checkout.failed', {order: id, code: err.code, error: err});
    await db().query(`UPDATE smmaker_payments SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, `${err.code}: ${err.message}`.slice(0, 500)]);
    await event(id, 'checkout', {status: 'failed', data: {code: err.code, message: err.message, details: err.details}, requestId});
    // Временный сбой кассы — клиент просто нажмёт ещё раз; ключ не принят или касса отказала —
    // сам не пройдёт, нужен человек
    if (!err.retryable) await alarm(order, `касса не выставила счёт: ${err.message}`, requestId);
    throw kassaHttpError(err);
  }
};

/** Активный тариф по id из запроса — или 404. Цена — только отсюда */
const activePack = async (packId) => {
  const {rows: [pack]} = await db().query('SELECT * FROM smmaker_packs WHERE id = $1 AND active', [String(packId ?? '').slice(0, 40)]);
  if (!pack) throw new HttpError(404, 'Нет такого тарифа');
  if (!(pack.price_krw > 0)) throw new HttpError(400, 'У тарифа нет цены — напишите нам');
  return pack;
};

/**
 * Заказ через AnyPay (13.10): рубли (СБП, карта) или карта в гривнах, сумах, сомах (card_uah …) —
 * рубли касса пока не принимает. Отличия от USDT — номер заказа у кассы
 * только цифрами (kassa_order), касса требует почту плательщика, а платёж сразу получает номер у
 * кассы — его сразу пишем в payment_id, и сверка может переспрашивать кассу, не дожидаясь оповещения.
 * Адрес оповещений AnyPay берёт из своего кабинета, а не из запроса (ANYPAY.md)
 */
const startAnypay = async ({workspaceId, userId, packId, method, origin, requestId}) => {
  const option = anypayOption(method);
  if (!option || !kassaReady('anypay') || !anypayMethods().includes(method)) {
    throw new HttpError(503, 'Этот способ оплаты пока не подключён — напишите нам, подключим вручную');
  }
  const {method: kassaMethod, currency} = option;
  const pack = await activePack(packId);
  const rlog = log.child({requestId});

  // Тариф в вонах → валюта счёта по курсу дня: вон за единицу = (вон за $1) / (единиц за $1)
  const r = await rates();
  const krwPerUnit = Number(r.usdRates?.KRW) / Number(r.usdRates?.[currency.toUpperCase()]);
  const [lo, hi] = KRW_PER_UNIT[currency];
  if (r.stale) rlog.warn('rate.stale', {fetchedAt: r.fetchedAt});
  if (!(krwPerUnit >= lo && krwPerUnit <= hi)) {
    rlog.error('rate.implausible', {currency, krwPerUnit, fetchedAt: r.fetchedAt});
    crashAlarm(`курс воны ${krwPerUnit} за 1 ${currency.toUpperCase()} — неправдоподобный, счета в этой валюте не выставляются`, new Error('проверьте open.er-api и data/rates.json'), requestId);
    throw new HttpError(503, 'Оплата временно недоступна — напишите нам, подключим вручную');
  }
  const amount = WHOLE.has(currency) ? Math.round(pack.price_krw / krwPerUnit) : Math.round((pack.price_krw / krwPerUnit) * 100) / 100;
  if (!(amount >= 1)) throw new HttpError(400, 'Сумма тарифа слишком мала для оплаты — напишите нам');

  // Почта плательщика — обязательна у AnyPay: того, кто нажал «Оплатить», иначе владельца кабинета
  const {rows: [me]} = userId ? await db().query('SELECT email FROM smmaker_users WHERE id = $1', [userId]) : {rows: []};
  const email = me?.email ?? (await ownerOf(workspaceId))?.email;
  if (!email) throw new HttpError(400, 'Для оплаты нужна почта в профиле — напишите нам');

  const id = `pay-${crypto.randomBytes(10).toString('hex')}`;
  // 15 цифр без ведущего нуля: ~50 бит, не угадать и не перебрать. Совпадение с прежним номером
  // поймает уникальный индекс — тогда просто ошибка, клиент нажмёт ещё раз
  const kassaOrder = (100_000_000_000_000n + crypto.randomBytes(8).readBigUInt64BE() % 900_000_000_000_000n).toString();
  await db().query(
    `INSERT INTO smmaker_payments (id, workspace_id, created_by, provider, sandbox, pack_id, price_krw, amount, currency, pay_currency, kassa_order)
     VALUES ($1, $2, $3, 'anypay', false, $4, $5, $6, $7, $8, $9)`,
    [id, workspaceId, userId ?? null, pack.id, pack.price_krw, amount, currency, kassaMethod, kassaOrder]);
  const order = {id, provider: 'anypay', kassa_order: kassaOrder, workspace_id: workspaceId, created_by: userId, sandbox: false,
    pack_id: pack.id, price_krw: pack.price_krw, amount, currency, pay_currency: kassaMethod, title: pack.title, kind: pack.kind};
  trace(order, '🟡 <b>Клиент начал оплату</b>', [`📈 курс: ${krwPerUnit.toFixed(4)} ₩ за 1 ${currency.toUpperCase()} · ${won(pack.price_krw)}`, `🌐 ${esc(origin)}`], {who: true});

  // Куда вернуть клиента. AnyPay принимает адрес только на домене проекта (зарегистрирован боевой
  // сайт) и, видимо, без «#»: 13.10 на http://localhost:3210/#/account/… касса ответила 213 «Incorrect
  // success url». Поэтому адрес — путь /pay-return/<заказ> (сервер перенаправит на экран заказа) и
  // только с боевого сайта; с Mac и превью не передаём — касса вернёт на адрес из своего кабинета
  const prodSite = /^https:\/\//.test(appUrl()) && origin === appUrl();
  try {
    const {invoiceId, paymentId, url} = await kassa(false, 'anypay').createInvoice({
      orderId: kassaOrder, amount, currency, method: kassaMethod, email, description: `KOK · ${pack.title} · ${pack.credits} кр.`,
      returnUrl: prodSite ? `${origin}/pay-return/${id}` : undefined,
    });
    await db().query('UPDATE smmaker_payments SET invoice_id = $2, payment_id = $3, updated_at = now() WHERE id = $1', [id, invoiceId, paymentId]);
    await event(id, 'checkout', {status: 'created', data: {invoiceId, kassaOrder, amount, currency, method: kassaMethod, krwPerUnit, origin}, requestId});
    rlog.info('checkout.ok', {order: id, provider: 'anypay', pack: pack.id, amount, currency, method: kassaMethod});
    trace(order, '🔗 <b>Касса выдала ссылку на оплату</b> — клиент ушёл платить', [`🏦 платёж кассы <code>${esc(paymentId)}</code>`]);
    return {id, url};
  } catch (e) {
    const err = toCoreError(e);
    rlog[levelFor(err.code)]('checkout.failed', {order: id, provider: 'anypay', code: err.code, error: err});
    await db().query(`UPDATE smmaker_payments SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, `${err.code}: ${err.message}`.slice(0, 500)]);
    await event(id, 'checkout', {status: 'failed', data: {code: err.code, message: err.message, details: err.details}, requestId});
    trace(order, '❌ <b>Касса отказала в счёте</b>', [`${esc(err.message)}${err.details?.kassaCode ? ` (код ${err.details.kassaCode})` : ''}`, `🔎 <code>${esc(requestId)}</code>`]);
    // Сумма вне лимитов и «способ недоступен» клиент обходит сам — другим способом; остальное
    // постоянное (ключи, проект, API выключен) — нужен человек
    if (!err.retryable && ![204, 205, 208, 311].includes(err.details?.kassaCode)) await alarm(order, `касса не выставила счёт: ${err.message}`, requestId);
    throw kassaHttpError(err);
  }
};

/**
 * Записать то, что касса сказала о платеже. Статус начисленного заказа не трогаем —
 * уведомления приходят не по порядку, и запоздавшее «подтверждается» не должно затереть «оплачено»
 */
const record = (orderId, p, raw) => db().query(
  `UPDATE smmaker_payments SET
     status = CASE WHEN credited_at IS NULL THEN $2 ELSE status END,
     provider_status = CASE WHEN credited_at IS NULL THEN $3 ELSE provider_status END,
     payment_id = COALESCE(payment_id, $4), actually_paid = COALESCE($5, actually_paid),
     raw = COALESCE($6, raw), updated_at = now()
   WHERE id = $1`,
  [orderId, p.status, p.providerStatus, p.paymentId, p.actuallyPaid, raw ? JSON.stringify(raw) : null]);

/**
 * Почему этот платёж нельзя начислить этому заказу — или null, если можно. Сверяем всё, что
 * касса знает о платеже, с тем, что мы выставили в счёте
 */
const mismatch = (o, live) => {
  // У AnyPay номер заказа у кассы — свой, числовой (kassa_order)
  const orderKey = o.kassa_order ?? o.id;
  if (live.status !== 'paid') return `касса говорит «${live.providerStatus}»`;
  if (live.orderId !== orderKey) return `платёж ${live.paymentId} от другого заказа (${live.orderId})`;
  if (Math.round(Number(live.priceAmount) * 100) !== Math.round(Number(o.amount) * 100)) return `сумма счёта у кассы ${live.priceAmount}, у нас ${o.amount}`;
  if (live.priceCurrency !== o.currency) return `валюта счёта у кассы ${live.priceCurrency}, у нас ${o.currency}`;
  // Монета важна только для USDT: другая монета — другие деньги. У AnyPay сумма и валюта счёта уже сверены, и способ
  // (СБП или карта) на сумму, которую мы получаем, не влияет — его не сверяем, чтобы не держать оплату
  if (o.provider !== 'anypay' && live.payCurrency !== o.pay_currency) return `оплачено в ${live.payCurrency}, а ждали ${o.pay_currency}`;
  return null;
};

/**
 * Начислить оплаченный заказ — только после сверки у кассы. Повторный вызов ничего не делает.
 * Временный сбой кассы при сверке — бросаем: уведомление получит ошибку и придёт снова, а фоновая
 * сверка переспросит сама
 */
const credit = async (o, paymentId, requestId) => {
  const rlog = log.child({requestId, order: o.id});
  if (sandboxForbidden(o.sandbox)) {
    await alarm(o, 'оплата из песочницы пришла на боевой сервер — не начисляю', requestId);
    return false;
  }
  let live;
  try {
    live = await kassa(o.sandbox, o.provider).getPayment(paymentId);
  } catch (e) {
    const err = toCoreError(e);
    rlog[levelFor(err.code)]('verify.failed', {paymentId, code: err.code, error: err});
    if (err.retryable) throw err;
    await event(o.id, 'reject', {data: {reason: 'сверка с кассой не удалась', code: err.code, message: err.message}, requestId});
    trace(o, '⛔ <b>Сверка с кассой не удалась</b> — кредиты не начислены', [esc(err.message)]);
    await alarm(o, `не смог сверить платёж ${paymentId} с кассой: ${err.message}`, requestId);
    return false;
  }
  const problem = mismatch(o, live);
  if (problem) {
    rlog.error('verify.mismatch', {paymentId, problem});
    await db().query('UPDATE smmaker_payments SET error = $2, updated_at = now() WHERE id = $1', [o.id, problem]);
    await event(o.id, 'reject', {status: live.status, data: {reason: problem, live}, requestId});
    trace(o, '⛔ <b>Сверка не сошлась</b> — кредиты не начислены', [esc(problem)]);
    await alarm(o, `оплата не сходится с заказом: ${problem}`, requestId);
    return false;
  }

  const done = await inTransaction(async (client) => {
    const {rows: [row]} = await client.query('SELECT * FROM smmaker_payments WHERE id = $1 FOR UPDATE', [o.id]);
    if (row.credited_at) return null;
    // Тариф могли снять с продажи, пока клиент платил, — оплаченное всё равно начисляем
    const {rows: [pack]} = await client.query('SELECT * FROM smmaker_packs WHERE id = $1', [row.pack_id]);
    const lot = await grantPackIn(client, {
      workspaceId: row.workspace_id, pack, priceKrw: row.price_krw, createdBy: row.created_by,
      note: `оплата ${row.provider === 'anypay' ? `AnyPay · ${payMethod(row.pay_currency)}, ${String(row.currency).toUpperCase()}` : 'USDT'}${row.sandbox ? ' (песочница)' : ''} · ${paymentId}`,
    });
    await client.query(
      `UPDATE smmaker_payments SET status = 'paid', provider_status = $4, credited_at = now(), lot_id = $2,
         payment_id = COALESCE(payment_id, $3), error = NULL, updated_at = now() WHERE id = $1`,
      [row.id, lot.id, paymentId, live.providerStatus]);
    await event(row.id, 'credit', {status: 'paid', data: {paymentId, lotId: Number(lot.id), credits: pack.credits, until: lot.expires_at}, requestId}, client);
    return {pack, lot};
  });
  if (!done) return false;
  rlog.info('credit.ok', {paymentId, pack: done.pack.id, credits: done.pack.credits});
  trace(o, '✅ <b>Кредиты начислены</b>', [`🎟 +${done.pack.credits} кр. до ${dayKst(done.lot.expires_at)}`, `🏦 платёж кассы <code>${esc(paymentId)}</code>`]);
  // Сообщение — после фиксации транзакции: откатившееся начисление не должно успеть «прийти»
  void whoPays(o)
    .then((who) => notifyPayments([`✅ <b>Оплата пришла</b>${tag(o)}`, LINE, who, LINE, what({...o, title: done.pack.title, kind: done.pack.kind}),
      `🎟 +${done.pack.credits} кр. до ${dayKst(done.lot.expires_at)}`, LINE, orderLine(o)].join('\n')))
    .catch((e) => rlog.error('notify.send_failed', {error: e}));
  void receipt(o, done, paymentId, requestId);
  return true;
};

/**
 * Подтверждение оплаты на почту владельца кабинета (решение владельца 13.10: адрес — почта, с которой
 * кабинет зарегистрирован, а не того, кто нажал «Оплатить», — ownerOf). Сумма и валюта — из заказа, как
 * их записала касса: письмо одно для всех касс (USDT, AnyPay в любой валюте). Зовётся один раз на заказ: credit доходит сюда только
 * у того вызова, который сам начислил.
 *
 * Письмо не держит оплату: кредиты уже зачислены, ответ кассе не ждёт Resend. Не ушло — повторять не
 * пытаемся (повтор после частичной доставки дал бы два письма), а зовём человека в тему «Оплаты»:
 * журнал модуля payments в «Сбои» не идёт (server/alarm.mjs), поэтому тревога — своя, alarm()
 */
// Чем платил клиент — словами для письма. Касса пишет в заказ свой код способа (pay_currency); новая
// касса — новые строки сюда, незнакомый код выйдет в письме как есть, заглавными
const PAY_METHODS = {usdttrc20: 'USDT TRC20', sbp: 'СБП', card: 'банковская карта'};
const payMethod = (code) => (code ? PAY_METHODS[code] ?? String(code).toUpperCase() : null);

const receipt = async (o, {pack, lot}, paymentId, requestId) => {
  const rlog = log.child({requestId, order: o.id});
  try {
    const u = await ownerOf(o.workspace_id);
    if (!u?.email) {
      rlog.warn('mail.no_owner', {ws: o.workspace_id});
      await alarm(o, 'подтверждение оплаты не отправлено: у кабинета нет владельца с почтой', requestId);
      return;
    }
    await paymentMail({
      to: u.email, name: u.name, plan: pack.kind === 'plan', title: pack.title ?? pack.id, credits: pack.credits,
      until: lot.expires_at, paid: {amount: o.amount, currency: o.currency, method: payMethod(o.pay_currency)}, priceKrw: o.price_krw, orderId: o.id, paidAt: new Date(),
      link: `${appUrl()}/#/account/${o.id}`, sandbox: o.sandbox,
    });
    await event(o.id, 'mail', {status: 'paid', data: {to: u.email, paymentId}, requestId});
    rlog.info('mail.sent', {paymentId});
  } catch (e) {
    rlog.error('mail.failed', {paymentId, error: e});
    await alarm(o, `подтверждение оплаты не ушло клиенту на почту: ${String(e?.message ?? e).slice(0, 200)}`, requestId)
      .catch((err) => rlog.error('mail.alarm_failed', {error: err}));
  }
};

/**
 * Что-то новое о платеже: записать, сообщить, если нужен человек, начислить, если оплачено.
 * Общая часть уведомления кассы и переспроса (sync)
 */
const apply = async (o, p, source, raw, requestId) => {
  if (o.payment_id && o.payment_id !== p.paymentId) {
    // К заказу уже привязан другой платёж: клиент оплатил счёт дважды (открыл страницу кассы
    // повторно) — второй перевод не теряем, но и сам не начисляем: решает человек
    await event(o.id, 'reject', {status: p.status, data: {reason: 'второй платёж по заказу', paymentId: p.paymentId}, requestId});
    await alarm(o, `второй платёж ${p.paymentId} по заказу (первый ${o.payment_id}) — проверьте, не заплатил ли клиент дважды`, requestId);
    return;
  }
  try {
    await record(o.id, p, raw);
  } catch (e) {
    // Уникальный индекс (provider, payment_id): этот перевод уже привязан к другому заказу. Касса
    // так не делает — значит, подлог или её сбой. Не начисляем, не роняем (повторы бессмысленны) —
    // зовём человека
    if (e?.code !== '23505') throw e;
    log.error('notify.payment_taken', {requestId, order: o.id, paymentId: p.paymentId});
    await event(o.id, 'reject', {status: p.status, data: {reason: 'платёж уже привязан к другому заказу', paymentId: p.paymentId}, requestId});
    await alarm(o, `платёж ${p.paymentId} уже привязан к другому заказу — не начисляю`, requestId);
    return;
  }
  await event(o.id, source, {status: p.status, data: {paymentId: p.paymentId, providerStatus: p.providerStatus, actuallyPaid: p.actuallyPaid}, requestId});
  if (p.status === 'partial') await alarm(o, `недоплата: пришло ${p.actuallyPaid ?? '?'} из ${p.payAmount ?? '?'} ${String(p.payCurrency ?? '').toUpperCase()}`, requestId);
  if (p.status === 'unknown') await alarm(o, `касса прислала незнакомый статус «${p.providerStatus}»`, requestId);
  if (p.status === 'refunded' && o.credited_at) await alarm(o, 'касса вернула деньги клиенту, а кредиты уже начислены — снимите их вручную', requestId);
  if (p.status === 'paid' && !o.credited_at) await credit(o, p.paymentId, requestId);
};

/**
 * Уведомление кассы. Неверная подпись — 400 (касса не станет повторять, подделка — тем более).
 * Заказ не наш (заказ превью пришёл на прод) — спокойно игнорируем. Сбой у нас — 500: касса
 * повторит уведомление, а фоновая сверка подстрахует.
 * provider — какая касса пишет (адрес /api/payments/<касса>/notify). У AnyPay подпись — в теле,
 * номер заказа — свой числовой (kassa_order), а адрес отправителя обязан быть из списка кассы
 */
export const handleNotification = async ({provider = PROVIDER, body, signature, ip, requestId = newRequestId()}) => {
  const rlog = log.child({requestId, provider});
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Пустое уведомление');
  const anypay = provider === 'anypay';
  // На Mac оповещения кассы не доходят вовсе — проверяем вручную с 127.0.0.1, поэтому IP только в бою
  if (anypay && PRODUCTION && !isAnypayIp(ip)) {
    rlog.warn('notify.foreign_ip', {ip});
    trace(null, '🚫 <b>Оповещение с чужого адреса</b> — отклонено', [`IP ${esc(ip)} · заказ у кассы ${esc(body.pay_id ?? '—')}`]);
    throw new HttpError(403, 'Уведомление отклонено');
  }
  const orderId = String((anypay ? body.pay_id : body.order_id) ?? '');
  let o = null;
  try {
    if (anypay ? KASSA_ORDER_RE.test(orderId) : OUR_ORDER_RE.test(orderId)) {
      o = await readOrder(anypay ? 'p.kassa_order = $1 AND p.provider = $2' : 'p.id = $1 AND p.provider = $2', [orderId, provider]);
    }
    // Подпись проверяем ключами того режима, в котором выставлен заказ; чужой заказ — ключами
    // текущего режима: так подделка и «чужое» различаются в логе
    let p;
    try {
      p = await kassa(o ? o.sandbox : sandboxMode(provider), provider).readNotification(body, signature);
    } catch (e) {
      const err = toCoreError(e);
      rlog.warn('notify.rejected', {order: o?.id ?? (orderId || null), code: err.code, error: err});
      if (o) await event(o.id, 'reject', {data: {reason: `уведомление отклонено: ${err.message}`}, requestId});
      if (anypay) trace(o, '🚫 <b>Оповещение отклонено</b>', [esc(err.message), !o && `заказ у кассы ${esc(orderId || '—')} — у нас такого нет`]);
      throw new HttpError(400, 'Уведомление отклонено');
    }
    // Тестовое оповещение из кабинета AnyPay («Тестирование»): подпись и адрес проверены — этого и
    // ждали. Заказ не трогаем: настоящего платежа за ним нет, сверка бы не сошлась и позвала человека
    if (p.test) {
      rlog.info('notify.test', {order: o?.id ?? null, kassaOrder: orderId, status: p.status});
      if (o) await event(o.id, 'notify', {status: p.status, data: {test: true, paymentId: p.paymentId}, requestId});
      trace(o, '🧪 <b>Тестовое оповещение из кабинета AnyPay</b> — подпись и адрес верны, заказ не трогаем',
        [`статус «${esc(p.providerStatus)}» · ${esc(p.priceAmount)} ${esc(String(p.priceCurrency ?? '').toUpperCase())}`, !o && `заказ у кассы ${esc(orderId || '—')}`]);
      return {ok: true, test: true};
    }
    if (!o) {
      rlog.warn('notify.foreign_order', {order: orderId, paymentId: p.paymentId});
      if (anypay) trace(null, '❔ <b>Оповещение по незнакомому заказу</b> — подпись верна, пропускаем',
        [`заказ у кассы ${esc(orderId || '—')} · платёж ${esc(p.paymentId)} · «${esc(p.providerStatus)}»`, 'Обычно это заказ превью или Mac: адрес оповещений у AnyPay один']);
      return {ok: true};
    }
    if (o.invoice_id && p.invoiceId && p.invoiceId !== o.invoice_id) {
      rlog.error('notify.wrong_invoice', {order: o.id, invoiceId: p.invoiceId});
      await event(o.id, 'reject', {data: {reason: 'уведомление от другого счёта', invoiceId: p.invoiceId}, requestId});
      throw new HttpError(400, 'Уведомление отклонено');
    }
    rlog.info('notify', {order: o.id, paymentId: p.paymentId, status: p.status});
    trace(o, `📩 <b>Оповещение кассы:</b> «${esc(p.providerStatus)}»`,
      [p.profit != null && `💰 к зачислению нам: ${esc(p.profit)} ₽`, p.status === 'paid' && !o.credited_at && 'Сверяю с кассой и начисляю…',
        o.credited_at && 'Уже начислено раньше — повтор, ничего не делаем']);
    await apply(o, p, 'notify', body, requestId);
    return {ok: true};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // Касса не ответила на сверку — временно, не наш сбой: 503, касса повторит уведомление
    if (e?.name === 'CoreError' && e.retryable) {
      rlog.warn('notify.retry_later', {order: o?.id ?? (orderId || null), code: e.code});
      throw new HttpError(503, 'Касса недоступна для сверки — повторите');
    }
    rlog.error('notify.crashed', {order: o?.id ?? (orderId || null), error: e});
    if (anypay) trace(o, '🔥 <b>Сбой у нас при разборе оповещения</b> — касса повторит', [esc(String(e?.message ?? e).slice(0, 200)), `🔎 <code>${esc(requestId)}</code>`]);
    crashAlarm('уведомление кассы', e, requestId);
    const ours = o?.id ?? (OUR_ORDER_RE.test(orderId) ? orderId : null);
    if (ours) await event(ours, 'error', {data: {message: String(e?.message ?? e)}, requestId});
    throw new HttpError(500, 'Сбой обработки — повторите');
  }
};

/**
 * Переспросить кассу о заказе — на случай, если уведомление потерялось (сервер перезапускался,
 * сеть). Только если касса уже назвала номер платежа хоть одним уведомлением: без номера спросить
 * нечего. Не чаще раза в 30 с на заказ. Сбой не бросает — это страховка, а не основной путь
 */
const syncOrder = async (o, requestId = newRequestId(), {force = false} = {}) => {
  if (o.credited_at || !o.payment_id || FINAL.has(o.status)) return;
  if (!force && Date.now() - new Date(o.updated_at).getTime() < SYNC_EVERY_MS) return;
  try {
    const p = await kassa(o.sandbox, o.provider).getPayment(o.payment_id);
    if (p.status !== o.status) {
      log.info('sync.changed', {requestId, order: o.id, from: o.status, to: p.status});
      trace(o, `🔄 <b>Сверка:</b> статус «${esc(o.status)}» → «${esc(p.status)}»`, [p.status === 'paid' && !o.credited_at && 'Оповещения не было — начисляю по сверке']);
    }
    await apply(o, p, 'sync', null, requestId);
  } catch (e) {
    const err = toCoreError(e);
    log[levelFor(err.code)]('sync.failed', {requestId, order: o.id, code: err.code, error: err});
    // Касса не знает платежа, а заказу больше суток: спрашивать дальше бессмысленно — сверка
    // переспрашивала такие каждые 5 минут все 14 дней (12.10: пять заказов песочницы). Закрываем
    // брошенным. Начисление это не закрывает: придёт уведомление «оплачено» — apply начислит.
    // Боевой платёж, о котором касса не знает, — повод для человека; песочница — нет
    if (err.code === 'NOT_FOUND' && Date.now() - new Date(o.created_at).getTime() > LOST_AFTER_MS) {
      try {
        await db().query(`UPDATE smmaker_payments SET status = 'abandoned', updated_at = now() WHERE id = $1 AND credited_at IS NULL`, [o.id]);
        await event(o.id, 'sync', {status: 'abandoned', data: {reason: 'касса не знает платежа', paymentId: o.payment_id}, requestId});
        log.warn('sync.lost', {requestId, order: o.id, paymentId: o.payment_id, sandbox: o.sandbox});
        trace(o, '❔ <b>Касса не знает платёж</b> — заказ закрыт брошенным', [`платёж кассы <code>${esc(o.payment_id)}</code>`]);
        if (!o.sandbox) await alarm(o, `касса не знает платёж ${o.payment_id} — заказ закрыт брошенным, проверьте в кабинете ${o.provider === 'anypay' ? 'AnyPay' : 'NOWPayments'}`, requestId);
        return;
      } catch (e2) {
        log.error('sync.abandon_failed', {requestId, order: o.id, error: e2});
      }
    }
    // Отметка времени — чтобы следующая попытка была не раньше чем через 30 с. Не вышло — ничего:
    // сверка просто спросит раньше
    await db().query('UPDATE smmaker_payments SET updated_at = now() WHERE id = $1', [o.id])
      .catch((e2) => log.warn('sync.touch_failed', {requestId, order: o.id, error: e2}));
  }
};

/**
 * Фоновая сверка (таймер в server/index.mjs): все зависшие заказы — переспросить кассу; брошенные
 * счета — пометить. По одному заказу за раз: касса ограничивает частоту. Заказы старше 2 минут
 * (свежие ещё ждут уведомления) и моложе 14 дней (касса закрывает неоплаченное за 7)
 */
export const reconcilePayments = async () => {
  if (!hasDatabase()) return {checked: 0, abandoned: 0};
  const requestId = newRequestId();
  const {rows} = await db().query(
    `${SELECT} WHERE p.credited_at IS NULL AND p.payment_id IS NOT NULL
       AND p.status NOT IN ('paid', 'failed', 'expired', 'refunded', 'abandoned')
       AND p.updated_at < now() - interval '2 minutes' AND p.created_at > now() - interval '14 days'
     ORDER BY p.created_at LIMIT 50`);
  for (const o of rows) await syncOrder(o, requestId, {force: true});
  const {rowCount: abandoned} = await db().query(
    `UPDATE smmaker_payments SET status = 'abandoned', updated_at = now()
      WHERE status = 'created' AND payment_id IS NULL AND credited_at IS NULL
        AND created_at < now() - $1 * interval '1 day'`, [ABANDON_AFTER_DAYS]);
  if (rows.length || abandoned) log.info('reconcile', {requestId, checked: rows.length, abandoned});
  return {checked: rows.length, abandoned};
};

/** Заказ компании — экран «ждём оплату» опрашивает его, пока кредиты не придут */
export const paymentOf = async (workspaceId, id) => {
  const where = 'p.id = $1 AND p.workspace_id = $2';
  const o = await readOrder(where, [String(id ?? '').slice(0, 40), workspaceId]);
  if (!o) throw new HttpError(404, 'Нет такой оплаты');
  await syncOrder(o);
  return view(await readOrder(where, [o.id, workspaceId]));
};

/** Последние заказы компании — «История оплат» в кабинете. Счёт так и не выставлен — не показываем */
export const paymentsOf = async (workspaceId) => {
  const {rows} = await db().query(`${SELECT} WHERE p.workspace_id = $1 AND p.invoice_id IS NOT NULL ORDER BY p.created_at DESC LIMIT 20`, [workspaceId]);
  return rows.map(view);
};

/**
 * Жива ли касса и принимает ли наш ключ — для сотрудников (server/app.mjs). Поля NOWPayments — как
 * раньше, на верхнем уровне; AnyPay — в поле anypay (включённые способы, баланс, настоящие ставки)
 */
const healthOf = async (provider) => {
  const sandbox = sandboxMode(provider);
  try {
    return {sandbox, ready: kassaReady(provider), ...(await kassa(sandbox, provider).checkUpstream())};
  } catch (e) {
    const err = toCoreError(e);
    return {sandbox, ready: kassaReady(provider), ok: false, code: err.code, message: err.message};
  }
};
export const kassaHealth = async () => {
  const [now, any] = await Promise.all([healthOf('nowpayments'), healthOf('anypay')]);
  return {...now, anypay: {...any, methods: anypayMethods()}};
};

/** Журнал заказа — для разбора спора или сбоя (сотрудникам, см. server/app.mjs) */
export const paymentEvents = async (id) => {
  const {rows} = await db().query(
    'SELECT kind, status, data, request_id, created_at FROM smmaker_payment_events WHERE payment_id = $1 ORDER BY id', [String(id ?? '').slice(0, 40)]);
  return rows;
};

// ——— Ограничители частоты ———
// Заказы: 10 счетов за 10 минут на человека — больше не нужно никому, а перебор засорял бы кассу
// и базу. Уведомления: 120 в минуту с адреса — касса столько не шлёт, а мусорный поток не дойдёт
// до базы. В памяти процесса, как ограничитель входа (server/session.mjs)
const windows = new Map();
const limiter = (name, max, windowMs, keyOf, text) => (req, _res, next) => {
  const key = `${name}|${keyOf(req)}`;
  const now = Date.now();
  const w = windows.get(key);
  if (w && w.until > now && w.count >= max) return next(new HttpError(429, text));
  windows.set(key, w && w.until > now ? {...w, count: w.count + 1} : {count: 1, until: now + windowMs});
  if (windows.size > 10_000) for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
  next();
};
export const checkoutLimiter = limiter('checkout', 10, 10 * 60_000, (req) => req.user?.id ?? req.ip, 'Слишком много счетов подряд — подождите несколько минут');
export const notifyLimiter = limiter('notify', 120, 60_000, (req) => req.ip, 'Слишком много уведомлений');
