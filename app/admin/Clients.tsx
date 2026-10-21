// Клиенты — они же лиды: поиск, фильтры, «пора продлевать», карточка с начислением.
// На компьютере — таблица, карточка раскрывается под строкой. На телефоне — плитки, карточка
// открывается панелью во весь экран: таблица в 9 колонок на 375 px не читалась (владелец 21.10)
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ClientFilter, ClientList, ClientPatch, ClientQuery, ClientRow, ClientSort, LedgerRow, Pack, api, errorText} from '../api';
import {day, daysLeft} from '../auth';
import {Field} from '../LotForm';
import {useIsPhone} from '../MobileTabs';
import {KIND, RENEW_DAYS, WHAT, when, won} from '../Account';
import {toast} from '../Toast';
import {Sheet} from './Sheet';

const message = errorText;

// Быстрые фильтры: подпись и подсказка. Порядок — как CLIENT_FILTERS в server/accounts.mjs
export const FILTERS: {id: ClientFilter; label: string; hint: string}[] = [
  {id: 'all', label: 'Все', hint: ''},
  {id: 'new', label: 'Новые', hint: 'зарегистрировались за 7 дней'},
  {id: 'trial', label: 'Без оплат', hint: 'ни разу не платили — лиды'},
  {id: 'active', label: 'С подпиской', hint: 'подписка действует'},
  {id: 'renew', label: 'Пора продлевать', hint: `подписка кончается в ближайшие ${RENEW_DAYS} дн.`},
  {id: 'lapsed', label: 'Подписка кончилась', hint: 'платили, но не продлили'},
  {id: 'idle', label: 'Затихли', hint: 'не генерировали 14 дней или ни разу'},
  {id: 'unverified', label: 'Почта не подтверждена', hint: 'бесплатные кредиты не получили'},
  // Только админу: скрывает и возвращает он (server/clients.mjs)
  {id: 'hidden', label: 'Скрытые', hint: 'скрыты админом — вход закрыт, данные целы'},
];
const SORTS: {id: ClientSort; label: string}[] = [
  {id: 'new', label: 'сначала новые'},
  {id: 'seen', label: 'кто недавно заходил'},
  {id: 'generated', label: 'кто недавно генерировал'},
  {id: 'paid', label: 'больше оплатили'},
  {id: 'credits', label: 'больше кредитов'},
  {id: 'plan', label: 'подписка кончается раньше'},
];
// «Заходил»: свежее — словами, давнее — датой. Менеджеру важно «вчера» против «месяц назад»,
// а не точное время
const ago = (iso: string | null) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days < 1 ? 'сегодня' : days < 2 ? 'вчера' : days < 30 ? `${days} дн. назад` : day(iso);
};

/**
 * Список клиентов. Поиск, фильтры и страницы считает сервер (listClients): список растёт, и
 * держать его целиком в браузере — тормоза на каждой букве. «Генераций 0» у свежего — повод
 * позвонить и помочь; «кредитов 0» у активного — повод предложить пакет.
 */
export const Clients: React.FC<{packs: Pack[]; isAdmin: boolean; onError: (e: string) => void}> = ({packs, isAdmin, onError}) => {
  const phone = useIsPhone();
  const [query, setQuery] = useState<ClientQuery>({q: '', filter: 'all', sort: 'new', page: 1});
  const [typed, setTyped] = useState('');
  const [list, setList] = useState<ClientList | null>(null);
  // Храним id, а не строку: после начисления список перечитывается, и карточка должна
  // показать новый остаток, а не снимок на момент открытия
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<ClientQuery>) => setQuery((cur) => ({...cur, page: 1, ...patch}));
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  // Поиск — после паузы в наборе: запрос на каждую букву гонял бы базу впустую
  useEffect(() => {
    // Тот же текст (пробел в конце, первый запуск) — не трогаем: новая страница 1 и лишний запрос
    const t = setTimeout(() => setQuery((cur) => (cur.q === typed.trim() ? cur : {...cur, q: typed.trim(), page: 1})), 300);
    return () => clearTimeout(t);
  }, [typed]);

  // Ответы могут прийти не по порядку (быстро набрал и стёр) — показываем только последний
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    api.admin.clients(query).then((l) => { if (n === seq.current) setList(l); }).catch((e) => onError(message(e)));
  }, [query, onError]);
  useEffect(load, [load]);

  const rows = list?.rows ?? [];
  const from = list && list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = list ? Math.min(list.page * list.pageSize, list.total) : 0;
  const card = (c: ClientRow) => <ClientCard key={c.id} client={c} packs={packs} isAdmin={isAdmin} onChanged={load} onError={onError} />;
  // Открытый клиент — из текущей страницы или из «Пора продлевать» (там бывают не с этой страницы)
  const open = openId ? rows.find((c) => c.id === openId) ?? list?.renew.find((c) => c.id === openId) : undefined;
  const openOutside = !phone && open && !rows.some((c) => c.id === open.id) ? open : undefined;
  const close = useCallback(() => setOpenId(null), []);

  return (
    <>
      {list && list.renew.length > 0 && (
        <section className="card wide renew">
          <h2>Пора продлевать <span className="muted">{list.renew.length}</span></h2>
          {phone ? (
            <div className="client-tiles">{list.renew.map((c) => <ClientTile key={c.id} client={c} onOpen={() => setOpenId(c.id)} renew />)}</div>
          ) : (
            <table className="table">
              <tbody>
                {list.renew.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}<br /><span className="muted">{c.person ?? ''} {c.phone ?? ''}</span></td>
                    <td>«{c.plan_title}» до {day(c.plan_until)}<br /><span className="muted">через {daysLeft(c.plan_until)} дн. · осталось {c.credits} кр.</span></td>
                    <td><button className="btn ghost" onClick={() => toggle(c.id)}>{openId === c.id ? 'Скрыть' : 'Открыть'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {openOutside && card(openOutside)}
      <section className="card wide clients">
        <div className="clients-head">
          <h2>Клиенты <span className="muted">{list?.counts.all ?? ''}</span></h2>
          <input type="search" placeholder="Поиск: компания, имя, почта, телефон" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <select value={query.sort} onChange={(e) => set({sort: e.target.value as ClientSort})} aria-label="Сортировка">
            {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="chips">
          {FILTERS.filter((f) => isAdmin || f.id !== 'hidden').map((f) => (
            <button key={f.id} type="button" title={f.hint} className={`chip${query.filter === f.id ? ' active' : ''}`}
              onClick={() => set({filter: f.id})}>
              {f.label} <span className="chip-n">{list?.counts[f.id] ?? ''}</span>
            </button>
          ))}
        </div>
        {phone ? (
          <div className="client-tiles">{rows.map((c) => <ClientTile key={c.id} client={c} onOpen={() => setOpenId(c.id)} />)}</div>
        ) : (
          <table className="table">
            <thead><tr><th>Компания</th><th>Контакт</th><th>С нами с</th><th>Заходил</th><th>Генерации</th><th>Подписка</th><th>Кредитов</th><th>Оплачено</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <React.Fragment key={c.id}>
                  <tr className={openId === c.id ? 'active' : ''}>
                    <td>
                      {c.name}
                      <RoleBadge client={c} />
                      {!c.verified && <><br /><span className="muted">почта не подтверждена</span></>}
                      {/* Клиент сам удаляет аккаунт: до даты его ещё можно вернуть ссылкой из письма */}
                      {c.delete_after && <><br /><span className="muted">удаляет аккаунт — до {day(c.delete_after)}</span></>}
                    </td>
                    <td>{c.person ?? '—'}<br /><span className="muted">{c.phone ?? ''} {c.email ?? ''}</span></td>
                    <td>{day(c.created_at)}</td>
                    <td>{ago(c.last_seen_at)}</td>
                    <td>
                      {c.generations}{c.generations > 0 && <span className="muted"> · за 30 дн. {c.generations_30d}</span>}
                      {c.last_generation && <><br /><span className="muted">последняя {ago(c.last_generation)}</span></>}
                    </td>
                    <td>{c.plan_until ? <>{c.plan_title}<br /><span className="muted">до {day(c.plan_until)}</span></>
                      : <span className="muted">{c.had_plan ? 'кончилась' : '—'}</span>}</td>
                    <td>{c.credits}</td>
                    <td>{c.paid_krw ? won(c.paid_krw) : <span className="muted">—</span>}</td>
                    <td><button className="btn ghost" onClick={() => toggle(c.id)}>{openId === c.id ? 'Скрыть' : 'Открыть'}</button></td>
                  </tr>
                  {/* Карточка — прямо под строкой: внизу длинной страницы её приходилось искать */}
                  {openId === c.id && <tr className="client-open"><td colSpan={9}>{card(c)}</td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
        {list && !rows.length && <p className="muted">{query.q ? `По «${query.q}» никого.` : 'Здесь пока никого.'}</p>}
        {list && list.total > 0 && (
          <div className="pager">
            <span className="muted">{from}–{to} из {list.total}</span>
            {list.pages > 1 && (
              <>
                <button className="btn ghost" disabled={list.page <= 1} onClick={() => set({page: list.page - 1})}>‹ Назад</button>
                <span>стр. {list.page} из {list.pages}</span>
                <button className="btn ghost" disabled={list.page >= list.pages} onClick={() => set({page: list.page + 1})}>Вперёд ›</button>
              </>
            )}
          </div>
        )}
      </section>
      {phone && open && <Sheet title={open.name} onClose={close}>{card(open)}</Sheet>}
    </>
  );
};

const RoleBadge: React.FC<{client: ClientRow}> = ({client: c}) =>
  c.platform_role ? <span className="badge">{c.platform_role === 'admin' ? 'админ' : 'менеджер'}</span> : null;

/**
 * Клиент плиткой на телефоне: компания и кредиты — первой строкой (их ищут глазами), контакт —
 * второй, подписка и активность — третьей. Вся плитка — кнопка: попасть пальцем в «Открыть»
 * на краю строки труднее, чем в саму строку
 */
const ClientTile: React.FC<{client: ClientRow; onOpen: () => void; renew?: boolean}> = ({client: c, onOpen, renew}) => (
  <button type="button" className="client-tile" onClick={onOpen}>
    <span className="ct-top">
      <b>{c.name}</b><RoleBadge client={c} />
      <span className="ct-credits">{c.credits} кр.</span>
    </span>
    <span className="muted">{[c.person, c.phone].filter(Boolean).join(' · ') || c.email || '—'}</span>
    <span className="ct-meta">
      {renew
        ? <>«{c.plan_title}» — через {daysLeft(c.plan_until)} дн.</>
        : <>
          {c.plan_until ? `«${c.plan_title}» до ${day(c.plan_until)}` : c.had_plan ? 'подписка кончилась' : 'без подписки'}
          {' · '}генераций {c.generations}{' · '}заходил {ago(c.last_seen_at)}
        </>}
    </span>
    {!c.verified && <span className="ct-flag">почта не подтверждена</span>}
    {c.delete_after && <span className="ct-flag">удаляет аккаунт — до {day(c.delete_after)}</span>}
  </button>
);

/** Журнал кредитов клиента: каждое движение строкой. На вопрос «почему осталось 3» ответ здесь */
const Ledger: React.FC<{rows: LedgerRow[] | null; title?: string}> = ({rows, title}) => {
  const phone = useIsPhone();
  if (!rows?.length) return null;
  const details = (r: LedgerRow) => <>
    {r.note || '—'}
    {r.kind === 'grant' && r.expires_at && ` · до ${day(r.expires_at)}`}
    {r.price_krw ? ` · ${won(r.price_krw)}` : ''}
  </>;
  const what = (r: LedgerRow) => `${KIND[r.kind]}${r.pipeline ? ` · ${WHAT[r.pipeline] ?? r.pipeline}` : ''}`;
  const delta = (r: LedgerRow) => (r.delta > 0 ? `+${r.delta}` : r.delta);
  return (
    <section className="card wide">
      <h2>{title ?? 'История кредитов'}</h2>
      {/* На телефоне четыре колонки не помещались: строка — что и сколько, под ней когда и подробности */}
      {phone ? (
        <ul className="ledger-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="ll-top"><span>{what(r)}</span><b className={r.delta > 0 ? 'plus' : 'minus'}>{delta(r)}</b></span>
              <span className="muted">{when(r.created_at)} · {details(r)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <table className="table">
          <thead><tr><th>Когда</th><th>Что</th><th>Кредиты</th><th>Подробности</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td>{what(r)}</td>
                <td className={r.delta > 0 ? 'plus' : 'minus'}>{delta(r)}</td>
                <td className="muted">{details(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

// Дата через n дней — подсказка менеджеру, до какого числа продлится подписка. Считает
// сервер (от конца действующей подписки); здесь только то же правило для подписи
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * 864e5).toISOString();

const ClientCard: React.FC<{client: ClientRow; packs: Pack[]; isAdmin: boolean; onChanged: () => void; onError: (e: string) => void}> = (
  {client, packs, isAdmin, onChanged, onError},
) => {
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'gift' | 'take'>('gift');
  const [amount, setAmount] = useState(5);
  const [reason, setReason] = useState('');
  const [hideNote, setHideNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const reload = useCallback(() => { api.admin.clientLedger(client.id).then(setRows).catch((e) => onError(message(e))); }, [client.id, onError]);
  useEffect(reload, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); setNote(''); setReason(''); reload(); onChanged(); } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };
  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pack) return;
    // Подтверждение: начисление — это деньги, которые клиент уже заплатил. Промах по строке
    // в длинном списке лидов начислил бы пакет не тому
    if (!window.confirm(`Начислить «${pack.title}» (${pack.credits} кр., ${won(pack.price_krw)}) компании «${client.name}»?`)) return;
    run(() => api.admin.grantPack(client.id, pack.id, note));
  };
  const adjust = (e: React.FormEvent) => {
    e.preventDefault();
    const why = reason.trim();
    if (!why) return;
    // Подтверждение: промах по клиенту или лишний ноль в числе — это кредиты не тому
    if (mode === 'gift') {
      if (!window.confirm(`Подарить ${amount} кр. компании «${client.name}» на год, бесплатно?\nЗа что: ${why}`)) return;
      run(() => api.admin.grantBonus(client.id, amount, why));
    } else {
      if (!window.confirm(`Списать ${amount} кр. у компании «${client.name}»?\nЗа что: ${why}`)) return;
      run(() => api.admin.takeCredits(client.id, amount, why));
    }
  };
  const hide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`Скрыть «${client.name}»?\nКабинет закроется сразу, данные останутся. Вернуть можно из фильтра «Скрытые».`)) return;
    run(async () => {
      await api.admin.hideClient(client.id, hideNote.trim());
      toast(`«${client.name}» скрыт — он в фильтре «Скрытые»`);
    });
  };
  const unhide = () => run(async () => {
    await api.admin.unhideClient(client.id);
    toast(`«${client.name}» снова в работе`);
  });

  const hidden = Boolean(client.hidden_at);
  return (
    <>
      <section className="card wide client-card">
        <h2>{client.name} <span className="muted">{client.credits} кр.</span></h2>
        {hidden && (
          <div className="notice warn client-hidden">
            <span>Скрыт {day(client.hidden_at)}{client.hidden_note ? ` — ${client.hidden_note}` : ''}. Войти не может, данные целы.</span>
            {isAdmin && <button type="button" className="btn" disabled={busy} onClick={unhide}>Вернуть</button>}
          </div>
        )}
        {/* Контакты — первым делом: менеджер открывает карточку, чтобы позвонить или написать */}
        {editing
          ? <ContactForm client={client} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} onError={onError} />
          : (
            <>
              <dl className="rows client-contacts">
                <dt>Контакт</dt><dd>{client.person || '—'}</dd>
                <dt>Телефон</dt><dd>{client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : '—'}</dd>
                <dt>Почта</dt><dd>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd>
                <dt>С нами с</dt><dd>{day(client.created_at)} <span className="muted">· заходил {ago(client.last_seen_at)}</span></dd>
                <dt>Оплачено</dt><dd>{client.paid_krw ? won(client.paid_krw) : '—'}</dd>
              </dl>
              {/* Данные сотрудника платформы правит только админ — сервер ответит так же */}
              {(isAdmin || !client.platform_role) && (
                <button type="button" className="btn ghost client-edit" onClick={() => setEditing(true)}>Изменить данные</button>
              )}
            </>
          )}
        {/* Скрытому начислять нечего: войти он не может. Вернут — начислят */}
        {!hidden && (
          <form className="form client-grant" onSubmit={grant}>
            <div className="row">
              <Field label="Что начислить" hint={pack?.kind === 'plan'
                ? (client.plan_until ? `продлится до ${day(addDays(client.plan_until, pack.valid_days))}` : `месяц с сегодняшнего дня`)
                : (client.plan_until ? `сгорит вместе с подпиской ${day(client.plan_until)}` : `подписки нет — сгорит через ${pack?.valid_days ?? 30} дн.`)}>
                <select value={pack?.id} onChange={(e) => setPackId(e.target.value)}>
                  <optgroup label="Подписка на месяц">
                    {packs.filter((p) => p.kind === 'plan').map((p) => <option key={p.id} value={p.id}>{p.title} · {p.credits} кр. · {won(p.price_krw)}</option>)}
                  </optgroup>
                  <optgroup label="Докупка">
                    {packs.filter((p) => p.kind === 'topup').map((p) => <option key={p.id} value={p.id}>{p.title} · {won(p.price_krw)}</option>)}
                  </optgroup>
                </select>
              </Field>
              <Field label="Заметка" hint="как оплатил, номер перевода"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <div className="btn-row">
              <button className="btn primary" disabled={busy || !pack}>{pack?.kind === 'plan' ? 'Начислить подписку' : 'Начислить докупку'}</button>
            </div>
          </form>
        )}
        {/* Подарок и списание — отдельно от «Начислить»: владелец 11.10 принял безымянное «Бонус
            на год» с цифрой за часть подписки. Причина обязательна у обоих — её же требует сервер */}
        {isAdmin && !hidden && (
          <form className="form gift" onSubmit={adjust}>
            <h3>Кредиты вручную</h3>
            <p className="hint">Подарок — бесплатно, вне прайса (компенсация, акция): живёт год, в «Оплачено» не попадает. Списание — ошибочное начисление или возврат денег; берётся из того, что сгорает раньше.</p>
            <div className="admin-toggle" role="radiogroup" aria-label="Подарить или списать">
              <button type="button" role="radio" aria-checked={mode === 'gift'} className={mode === 'gift' ? 'on' : ''} onClick={() => setMode('gift')}>Подарить</button>
              <button type="button" role="radio" aria-checked={mode === 'take'} className={mode === 'take' ? 'on' : ''} onClick={() => setMode('take')}>Списать</button>
            </div>
            <div className="row">
              <Field label="Кредитов"><input type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></Field>
              <Field label="За что" hint="будет в истории клиента">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'gift' ? 'например, упал рендер 10.10' : 'например, начислили не тот тариф'} required />
              </Field>
            </div>
            <button className={mode === 'take' ? 'btn danger' : 'btn'} disabled={busy || !reason.trim()}>{mode === 'gift' ? `Подарить ${amount} кр.` : `Списать ${amount} кр.`}</button>
          </form>
        )}
        {isAdmin && !hidden && !client.platform_role && (
          <form className="form client-hide" onSubmit={hide}>
            <h3>Скрыть клиента</h3>
            <p className="hint">Кабинет закроется сразу: войти и сбросить пароль будет нельзя. В базе ничего не стирается — клиент уйдёт в фильтр «Скрытые», оттуда его можно вернуть.</p>
            <div className="row">
              <Field label="Почему" hint="видно в карточке скрытого"><input value={hideNote} onChange={(e) => setHideNote(e.target.value)} placeholder="например, дубль кабинета" /></Field>
            </div>
            <button className="btn danger" disabled={busy}>Скрыть клиента</button>
          </form>
        )}
      </section>
      <Ledger rows={rows} title={`История «${client.name}»`} />
    </>
  );
};

/**
 * Правка контактов клиента: компания, имя, телефон, почта. Отправляем только изменённое —
 * сервер не трогает остальное, и случайно стёртое поле, которое не меняли, не уйдёт
 */
const ContactForm: React.FC<{client: ClientRow; onDone: () => void; onCancel: () => void; onError: (e: string) => void}> = (
  {client, onDone, onCancel, onError},
) => {
  const start = {company: client.name, person: client.person ?? '', phone: client.phone ?? '', email: client.email ?? ''};
  const [form, setForm] = useState(start);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({...form, ...patch});
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: ClientPatch = {};
    for (const k of Object.keys(form) as (keyof typeof form)[]) if (form[k].trim() !== start[k]) patch[k] = form[k].trim();
    if (!Object.keys(patch).length) return onCancel();
    // Почта — это вход клиента: сменили — входить он будет с новой. Переспрашиваем
    if (patch.email && !window.confirm(`Сменить почту клиента на ${patch.email}?\nВходить он будет с новой почтой, старая перестанет работать.`)) return;
    setBusy(true);
    try {
      await api.admin.updateClient(client.id, patch);
      toast('Данные клиента сохранены');
      onDone();
    } catch (err) { onError(message(err)); } finally { setBusy(false); }
  };
  return (
    <form className="form client-contact-form" onSubmit={save}>
      <div className="row">
        <Field label="Компания"><input value={form.company} onChange={(e) => set({company: e.target.value})} required /></Field>
        <Field label="Контакт"><input value={form.person} onChange={(e) => set({person: e.target.value})} required /></Field>
      </div>
      <div className="row">
        <Field label="Телефон" hint="с кодом страны"><input type="tel" value={form.phone} onChange={(e) => set({phone: e.target.value})} /></Field>
        <Field label="Почта" hint="с неё клиент входит"><input type="email" value={form.email} onChange={(e) => set({email: e.target.value})} required /></Field>
      </div>
      <div className="btn-row">
        <button className="btn primary" disabled={busy}>Сохранить</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
};
