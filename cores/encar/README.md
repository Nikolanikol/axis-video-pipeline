# Ядро Encar — как работает

Модуль-ядро источника «Корея» по контракту `cores/CONTRACT.md` (версия 2). Забирает машину с
Encar по ссылке или номеру объявления и отдаёт карточку контракта. Ядро не знает про карусели,
ролики и другие ядра; общее — только `cores/kit/`.

## Откуда данные

Не с Encar напрямую: Encar режет адреса дата-центров, и с сервера в Германии прямые запросы
однажды перестанут работать. Ходим в **шлюз kmotors** — `GET {KMOTORS_API_URL}/api/vehicle/<номер>`
с заголовком `x-vehicle-secret: {KMOTORS_API_SECRET}`. Шлюз живёт в соседнем проекте
`~/Desktop/recup/KMotors-1` (`src/app/api/vehicle/[id]/route.ts`), сам ходит в Encar и умеет
обходить блокировку своим прокси. На Mac шлюз — `http://localhost:3000`.

Шлюз отдаёт машину уже в форме карусели KOK (`CarouselCar`): марка и значения по-английски
(на русский их переводят словари слайдов), цена в вонах и долларах с курсом, история страховых
случаев, опции, фото по ракурсам (по кодам Encar: 001 — перед, 002 — зад, …).

## Устройство

| файл | что делает |
|---|---|
| `src/index.mjs` | точка входа: `core`, `getCar(ref, {signal, log})`, `checkUpstream()` |
| `src/upstream.mjs` | запрос к шлюзу, таймаут, повторы, ограничитель; ответы шлюза → коды контракта |
| `src/parse.mjs` | номер из ссылки, проверка формы карточки, фото по контракту — чистые функции |
| `bin/fetch.mjs` | CLI для проверки руками |

Граница в KOK — `server/encar.mjs` (`fetchEncarCar`): requestId, JSON-логи, CoreError → HttpError.
Переходник в карточку пайплайна — `src/shared/encarCar.js` (достаёт `data.card`).

## Карточка (`data`)

Поля контракта: `source: 'encar'`, `ref` (номер объявления), `fetchedAt`, `urls.listing`,
`price {amount (₩), currency: 'KRW', usd, krwToUsd, quotedAt, rateSource}`, `mileageKm`,
`photos[]` (роли от шлюза — `source: 'listing'`), `byLang.en.car`.
Своё у Encar — `card`: машина в форме карусели, как её отдал шлюз, после проверки.

## Ошибки

| что случилось | code |
|---|---|
| не ссылка encar.com и не номер | `BAD_INPUT` |
| шлюз ответил 404 — объявление снято или номер неверный | `NOT_FOUND` |
| шлюз не принял секрет (401/403) | `UPSTREAM_BLOCKED` |
| 429 | `RATE_LIMITED` |
| сеть, DNS, 5xx шлюза (шлюз не достучался до Encar) | `UPSTREAM_UNAVAILABLE`, 3 попытки |
| нет ответа за `CAROUSEL_TIMEOUT_MS` (60 с) | `UPSTREAM_TIMEOUT`, без повтора — попытка и так до минуты |
| пустая страница 200 (завис kmotors), не JSON, нет марки и модели | `UPSTREAM_BAD_RESPONSE` |
| шлюз не настроен, исключение в коде ядра | `INTERNAL` (клиенту — общий текст, подробности в логе) |

Битая часть карточки (опции, история, фото, цена, отдельные поля не того типа) — не ошибка:
часть заменяется пустой, в `warnings` строка `PART_MISSING` / `PART_FAILED`.

## Где легко ошибиться

- **У объявления два номера.** Номер в ссылке (`carid`) и номер машины (`vehicleId`, под ним
  лежат фото). У перевыставленных объявлений они разные: 42653673 → 42653400. Шлюз отдаёт в
  `card.id` номер машины, и пайплайны всегда получали его — не «чинить». `data.ref` — номер из ссылки.
- **Правильный ответ шлюза проходит без изменений.** Карусели и ролики раньше получали ответ шлюза
  как есть. Любая «нормализация» поля, которое было в порядке, сдвинет готовые слайды. Проверка —
  `tests/unit/encarCore.test.ts` на снимках `tests/fixtures/encar` (12 машин, сняты 12.10 до переделки).
- **Зависший kmotors отдаёт пустую страницу со статусом 200** — лечится перезапуском kmotors.

## Проверка

```bash
node --env-file=.env cores/encar/bin/fetch.mjs 40303537 'https://fem.encar.com/cars/detail/42653673?pageid=x'
KMOTORS_API_URL=http://127.0.0.1:9 node --env-file=.env cores/encar/bin/fetch.mjs 40303537   # UPSTREAM_UNAVAILABLE
CAROUSEL_TIMEOUT_MS=1 node --env-file=.env cores/encar/bin/fetch.mjs 40303537                # UPSTREAM_TIMEOUT
npx vitest run tests/unit/encarCore.test.ts
```

Проверено 12.10: 12 снимков совпали с прежним выводом поле в поле; живые 40303537 (Ford F-150),
42653673 (Palisade, номер машины другой), 41630924, 42790689; 99999999 — `NOT_FOUND`; example.com —
`BAD_INPUT`; мёртвый адрес шлюза — `UPSTREAM_UNAVAILABLE` после 3 попыток; таймаут — `UPSTREAM_TIMEOUT`.
