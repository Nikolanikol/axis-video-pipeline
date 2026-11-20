// Рассылки в админке (21.10): служебные новости клиентам. Делает менеджер — для него и делали.
// Список → черновик (кому, тема, текст, кнопка) → предпросмотр и тест себе → «Отправить» →
// страница рассылки с ходом отправки. Сервер — server/mailing.mjs, вёрстка письма — cores/mailing.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ClientFilter, Mailing, MailingDraft, MailingSegment, Recipient, api, errorText} from '../api';
import {day, useSession} from '../auth';
import {useConfig} from '../config';
import {useDeviceDraft, writeDeviceDraft} from '../deviceDraft';
import {FRESH, mailingDraftKey, validMailingScratch, type MailingScratch} from './mailingDraft';
import {Field} from '../LotForm';
import {useIsPhone} from '../MobileTabs';
import {toast} from '../Toast';
import {when} from '../Account';
import {FILTERS} from './Clients';
import {Sheet} from './Sheet';

// Кому можно слать: фильтры клиентов без «Скрытых» (им не шлём) и «Почта не подтверждена» (на
// непроверенные адреса сервер не шлёт — сегмент всегда пустой, выбор только путал бы)
const SEGMENTS = FILTERS.filter((f) => f.id !== 'hidden' && f.id !== 'unverified');
const segmentLabel = (id: MailingSegment) => (id === 'pick' ? 'Выбранные вручную' : FILTERS.find((f) => f.id === id)?.label ?? id);

const STATUS: Record<Mailing['status'], string> = {draft: 'Черновик', sending: 'Отправляется', done: 'Отправлена', cancelled: 'Остановлена'};

export const Mailings: React.FC<{onError: (e: string) => void}> = ({onError}) => {
  const {email} = useSession();
  const {config} = useConfig();
  const scope = `${config.workspace.id}:${email ?? 'local'}`;
  const {value: scratch} = useDeviceDraft(mailingDraftKey(scope), FRESH, validMailingScratch);
  const hasScratch = JSON.stringify(scratch.draft) !== scratch.savedAs;
  const [list, setList] = useState<Mailing[] | null>(null);
  // Что открыто: id рассылки, «new» — новый черновик, null — список
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const load = useCallback(() => { api.admin.mailings().then(setList).catch((e) => onError(errorText(e))); }, [onError]);
  useEffect(load, [load]);
  const back = () => { setOpen(null); load(); };

  if (open !== null) {
    const m = open === 'new' ? null : list?.find((x) => x.id === open) ?? null;
    if (open !== 'new' && !m) return <p role="status">Загружаю черновик…</p>;
    return m && m.status !== 'draft'
      ? <MailingReport id={m.id} onBack={back} onCopy={(id) => { load(); setOpen(id); }} onError={onError} />
      : <MailingEditor key={m?.id ?? 'new'} scope={scope} id={m?.id} onBack={back} onSaved={(id) => { load(); setOpen(id); }} onError={onError} />;
  }

  return (
    <section className="card mailings">
      <div className="section-head">
        <h2>Рассылки</h2>
        <button type="button" className="btn primary" onClick={() => setOpen('new')}>{hasScratch ? 'Продолжить черновик на устройстве' : '+ Новая рассылка'}</button>
      </div>
      <p className="hint">Только служебные новости: новые функции, изменения, плановые работы. Письма уходят клиентам с подтверждённой почтой, кто не отписался; в каждом есть «Отписаться».</p>
      {list && !list.length && <p className="muted">Рассылок пока не было.</p>}
      <div className="mail-list">
        {list?.map((m) => (
          <button key={m.id} type="button" className="mail-row" onClick={() => setOpen(m.id)}>
            <span className="mr-top">
              <b>{m.subject || 'Без темы'}</b>
              <span className={`mail-status ${m.status}`}>{STATUS[m.status]}</span>
            </span>
            <span className="muted">
              {segmentLabel(m.segment)}
              {m.status === 'draft' ? ` · изменён ${when(m.updated_at)}` : ` · ${m.started_at ? day(m.started_at) : ''} · ушло ${m.counts.sent} из ${m.counts.total}`}
              {m.counts.failed > 0 && ` · не ушло ${m.counts.failed}`}
              {m.author ? ` · ${m.author}` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

/**
 * Черновик. Сохраняем перед тестом и отправкой сами — менеджер не должен помнить про «Сохранить»,
 * чтобы тест ушёл с последней правкой. Проблемы (нет темы, неизвестная {подстановка}) считает
 * сервер тем же кодом, что проверяет перед отправкой
 */
const MailingEditor: React.FC<{scope: string; id?: number; onBack: () => void; onSaved: (id: number) => void; onError: (e: string) => void}> = (
  {scope, id, onBack, onSaved, onError},
) => {
  const phone = useIsPhone();
  const key = mailingDraftKey(scope, id);
  const {value: scratch, setValue: setScratch, persisted} = useDeviceDraft(key, FRESH, validMailingScratch);
  const {draft, savedAs, picked} = scratch;
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState('');
  const [conflict, setConflict] = useState<{server: MailingScratch; local: MailingScratch} | null>(null);
  const [audience, setAudience] = useState<Record<ClientFilter, number> | null>(null);
  const [preview, setPreview] = useState<{to: string; html: string; problems: string[]} | null>(null);
  // Выбранные поимённо — целиком (имя, почта, причина), в черновик уходят только их id
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState('');
  const body = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<MailingDraft>) => setScratch((s) => ({...s, draft: {...s.draft, ...patch}}));
  const dirty = JSON.stringify(draft) !== savedAs;

  useEffect(() => {
    api.admin.audience().then(setAudience).catch((e) => onError(errorText(e)));
    if (!id) return;
    let current = true;
    setLoading(true); setLoadError('');
    api.admin.mailing(id).then((m) => {
      if (!current) return;
      const d = {subject: m.subject, body: m.body, button_label: m.button_label, button_url: m.button_url, segment: m.segment, user_ids: m.user_ids ?? []};
      const server = {draft: d, picked: m.picked ?? [], savedAs: JSON.stringify(d)};
      // Другой сотрудник мог изменить серверный черновик. Обе версии сохраняем до выбора.
      if (JSON.stringify(scratch.draft) !== scratch.savedAs) {
        if (scratch.savedAs !== server.savedAs) setConflict({server, local: scratch});
      } else setScratch(server);
    }).catch((e) => { if (current) setLoadError(errorText(e)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Предпросмотр и проблемы — после паузы в наборе: сборка письма на каждую букву гоняла бы сервер
  useEffect(() => {
    let current = true;
    const t = setTimeout(() => { api.admin.previewMailing(draft).then((p) => { if (current) setPreview(p); }).catch(() => { if (current) setPreview(null); }); }, 500);
    return () => { current = false; clearTimeout(t); };
  }, [draft]);

  /** Сохранить, если есть что, и вернуть id. Новый черновик получает id при первом сохранении */
  const save = async (): Promise<number> => {
    if (id && !dirty) return id;
    const snapshot = {draft, picked, savedAs: JSON.stringify(draft)};
    const m = await api.admin.saveMailing(draft, id);
    writeDeviceDraft(mailingDraftKey(scope, m.id), snapshot);
    if (!id) { setScratch(FRESH); onSaved(m.id); }
    else setScratch(snapshot);
    return m.id;
  };
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } catch (err) { onError(errorText(err)); } finally { setBusy(''); }
  };

  const insert = (token: string) => {
    const el = body.current;
    const at = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? at;
    set({body: draft.body.slice(0, at) + token + draft.body.slice(end)});
    // Курсор — после вставки, как при наборе руками
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };

  const pick = draft.segment === 'pick';
  const count = pick ? picked.filter((r) => r.ok).length : audience?.[draft.segment as ClientFilter] ?? 0;
  const setPick = (picked: Recipient[]) => setScratch((s) => ({...s, picked, draft: {...s.draft, user_ids: picked.map((r) => r.user_id)}}));
  const problems = preview?.problems ?? [];
  const send = () => run('send', async () => {
    const mid = await save();
    // Отправку не отменить: ушедшие письма не вернуть. Число получателей — в вопросе, чтобы
    // «всем» вместо «пора продлевать» было видно до нажатия
    if (!window.confirm(`Отправить «${draft.subject}» — ${count} получ. (${segmentLabel(draft.segment)})?\nУшедшие письма не вернуть.`)) return;
    await api.admin.sendMailing(mid);
    toast('Рассылка пошла — ход отправки на её странице');
    onSaved(mid);
  });

  const frame = preview && <iframe className="mail-frame" title="Предпросмотр письма" srcDoc={preview.html} sandbox="" />;

  return (
    <div className="mail-editor">
      <button type="button" className="btn ghost mail-back" disabled={!!busy} onClick={onBack}>‹ Все рассылки</button>
      <p className="hint" role="status">{dirty
        ? persisted ? 'Правки сохранены на этом устройстве. «Сохранить» записывает черновик на сервер.' : 'Запись на устройство недоступна. Правки только в памяти до закрытия страницы — сохраните на сервер.'
        : id ? 'Черновик совпадает с сохранённой версией.' : 'Новый черновик. Правки сохраняются на этом устройстве.'}</p>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {conflict && <div className="note" role="alert">
        <p>Сохранённая версия изменилась после ваших правок. Выберите, с каким черновиком продолжить.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => { setScratch({...conflict.local, savedAs: conflict.server.savedAs}); setConflict(null); }}>Мои правки на устройстве</button>
          <button type="button" className="btn" onClick={() => { setScratch(conflict.server); setConflict(null); }}>Сохранённая версия</button>
        </div>
      </div>}
      <div className="mail-grid">
        <section className="card">
          <h2>{id ? 'Черновик' : 'Новая рассылка'}{dirty && <span className="muted"> · не сохранено</span>}</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); run('save', async () => { await save(); toast('Черновик сохранён'); }); }}>
            <fieldset className="draft-fields" disabled={!!busy || loading || !!loadError || !!conflict}>
            <Field label="Кому" hint={audience ? `получат ${count} — с подтверждённой почтой и без отписки` : undefined}>
              <select value={draft.segment} onChange={(e) => set({segment: e.target.value as MailingSegment})}>
                {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label}{audience ? ` — ${audience[s.id] ?? 0}` : ''}</option>)}
                <option value="pick">Выбрать вручную…</option>
              </select>
            </Field>
            {pick && <PeoplePicker picked={picked} onChange={setPick} onError={onError} />}
            <Field label="Тема письма"><input value={draft.subject} onChange={(e) => set({subject: e.target.value})} placeholder="Например: В KOK появились карусели из Японии" maxLength={150} /></Field>
            <label className="field">
              <span className="label">Текст</span>
              <div className="mail-tokens">
                <span className="muted">Вставить:</span>
                <button type="button" className="chip" onClick={() => insert('{имя}')}>{'{имя}'}</button>
                <button type="button" className="chip" onClick={() => insert('{компания}')}>{'{компания}'}</button>
              </div>
              <textarea ref={body} rows={phone ? 10 : 14} value={draft.body} onChange={(e) => set({body: e.target.value})}
                placeholder={'Здравствуйте, {имя}!\n\nКоротко — что нового и чем это поможет.'} />
              <span className="hint">Пустая строка — новый абзац, **так** — жирным, ссылки https://… станут ссылками сами.</span>
            </label>
            <div className="row">
              <Field label="Кнопка" hint="необязательно"><input value={draft.button_label} onChange={(e) => set({button_label: e.target.value})} placeholder="Открыть KOK" maxLength={60} /></Field>
              <Field label="Ссылка кнопки"><input type="url" value={draft.button_url} onChange={(e) => set({button_url: e.target.value})} placeholder="https://app.axis-beauty.com" /></Field>
            </div>
            {problems.length > 0 && <ul className="mail-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            <div className="btn-row mail-actions">
              <button className="btn" disabled={!!busy || !dirty}>{busy === 'save' ? 'Сохраняю…' : 'Сохранить'}</button>
              {phone && <button type="button" className="btn" disabled={!preview} onClick={() => setShowPreview(true)}>Предпросмотр</button>}
              <button type="button" className="btn" disabled={!!busy || problems.length > 0}
                onClick={() => run('test', async () => { const r = await api.admin.testMailing(await save()); toast(`Тестовое письмо ушло на ${r.to}`); })}>
                {busy === 'test' ? 'Отправляю…' : 'Тест себе'}
              </button>
              <button type="button" className="btn primary" disabled={!!busy || problems.length > 0 || !count} onClick={send}>
                {busy === 'send' ? 'Запускаю…' : `Отправить ${count}`}
              </button>
              {id && (
                <button type="button" className="btn ghost danger" disabled={!!busy}
                  onClick={() => window.confirm('Удалить черновик?') && run('del', async () => { await api.admin.deleteMailing(id); setScratch(FRESH); toast('Черновик удалён'); onBack(); })}>
                  Удалить
                </button>
              )}
            </div>
            </fieldset>
          </form>
        </section>
        {/* На компьютере письмо видно сразу справа и меняется при наборе; на телефоне — по кнопке, панелью */}
        {!phone && (
          <section className="card mail-preview">
            <h2>Так увидит клиент</h2>
            {preview && <p className="muted">Пример для {preview.to}</p>}
            {frame}
          </section>
        )}
      </div>
      {phone && showPreview && preview && (
        <Sheet title="Так увидит клиент" onClose={() => setShowPreview(false)}>
          <p className="muted">Пример для {preview.to}</p>
          {frame}
        </Sheet>
      )}
    </div>
  );
};

/**
 * «Выбрать вручную» (владелец 21.10): поиск по базе клиентов — тем же поиском, что список клиентов
 * (компания, имя, почта, телефон). Кому письмо не уйдёт, видно сразу с причиной, а не после отправки
 */
const PeoplePicker: React.FC<{picked: Recipient[]; onChange: (list: Recipient[]) => void; onError: (e: string) => void}> = (
  {picked, onChange, onError},
) => {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Recipient[] | null>(null);
  // Ответы могут прийти не по порядку — показываем только последний (как в списке клиентов)
  const seq = useRef(0);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound(null); return; }
    const t = setTimeout(() => {
      const n = ++seq.current;
      api.admin.findPeople(text).then((r) => { if (n === seq.current) setFound(r); }).catch((e) => onError(errorText(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [q, onError]);
  const has = (id: string) => picked.some((r) => r.user_id === id);

  return (
    <div className="people-picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти: компания, имя, почта, телефон" />
      {found && (
        <ul className="pp-found">
          {!found.length && <li className="muted">Никого не нашлось.</li>}
          {found.map((r) => (
            <li key={r.user_id}>
              <span className="pp-who"><b>{r.name}</b><span className="muted">{[r.person, r.email].filter(Boolean).join(' · ')}{r.ok ? '' : ` · ${r.why}`}</span></span>
              {has(r.user_id)
                ? <span className="muted">добавлен</span>
                : <button type="button" className="btn ghost" disabled={!r.ok} title={r.ok ? '' : `не уйдёт: ${r.why}`}
                    onClick={() => onChange([...picked, r])}>+ Добавить</button>}
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <ul className="pp-picked">
          {picked.map((r) => (
            <li key={r.user_id} className={r.ok ? '' : 'off'}>
              <span className="pp-who"><b>{r.name}</b><span className="muted">{r.email}{r.ok ? '' : ` · не уйдёт: ${r.why}`}</span></span>
              <button type="button" className="btn ghost" aria-label={`Убрать ${r.name}`} onClick={() => onChange(picked.filter((x) => x.user_id !== r.user_id))}>×</button>
            </li>
          ))}
        </ul>
      )}
      {!picked.length && <p className="hint">Найдите клиента и нажмите «+ Добавить» — можно нескольких.</p>}
    </div>
  );
};

/** Отправленная рассылка: ход отправки (обновляется, пока идёт), отказы, остановить, копия */
const MailingReport: React.FC<{id: number; onBack: () => void; onCopy: (id: number) => void; onError: (e: string) => void}> = (
  {id, onBack, onCopy, onError},
) => {
  const [m, setM] = useState<Mailing | null>(null);
  const [preview, setPreview] = useState<string>('');
  const load = useCallback(() => { api.admin.mailing(id).then(setM).catch((e) => onError(errorText(e))); }, [id, onError]);
  useEffect(load, [load]);
  // Пока идёт — перечитываем раз в 3 секунды: пачка уходит раз в полторы, цифры живые
  useEffect(() => {
    if (m?.status !== 'sending') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [m?.status, load]);
  useEffect(() => {
    if (!m) return;
    api.admin.previewMailing(m).then((p) => setPreview(p.html)).catch(() => setPreview(''));
  // Письмо отправленной рассылки не меняется — собираем один раз
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);
  if (!m) return null;
  const c = m.counts;
  const done = c.sent + c.failed + c.skipped;
  const pct = c.total ? Math.round((done / c.total) * 100) : 0;

  return (
    <div className="mail-editor">
      <button type="button" className="btn ghost mail-back" onClick={onBack}>‹ Все рассылки</button>
      <section className="card">
        <div className="section-head">
          <h2>{m.subject}</h2>
          <span className={`mail-status ${m.status}`}>{STATUS[m.status]}</span>
        </div>
        <p className="muted">{segmentLabel(m.segment)}{m.started_at ? ` · начата ${when(m.started_at)}` : ''}{m.finished_at ? ` · закончена ${when(m.finished_at)}` : ''}</p>
        <div className="mail-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{width: `${c.total ? (c.sent / c.total) * 100 : 0}%`}} className="ok" />
          <span style={{width: `${c.total ? (c.failed / c.total) * 100 : 0}%`}} className="bad" />
          <span style={{width: `${c.total ? (c.skipped / c.total) * 100 : 0}%`}} className="skip" />
        </div>
        <dl className="rows mail-counts">
          <dt>Получателей</dt><dd>{c.total}</dd>
          <dt>Ушло</dt><dd>{c.sent}</dd>
          {c.queued > 0 && <><dt>В очереди</dt><dd>{c.queued}</dd></>}
          {c.failed > 0 && <><dt>Не ушло</dt><dd>{c.failed}</dd></>}
          {c.skipped > 0 && <><dt>Пропущено</dt><dd>{c.skipped} <span className="muted">· отписались, закрыли кабинет или рассылку остановили</span></dd></>}
        </dl>
        {m.failed && m.failed.length > 0 && (
          <details className="mail-failed">
            <summary>Кому не ушло ({m.failed.length})</summary>
            <ul>{m.failed.map((f) => <li key={f.email}><b>{f.email}</b> <span className="muted">{f.error}</span></li>)}</ul>
          </details>
        )}
        <div className="btn-row">
          {m.status === 'sending' && (
            <button type="button" className="btn danger"
              onClick={() => window.confirm('Остановить рассылку? Кому ещё не ушло — не уйдёт.') && api.admin.cancelMailing(id).then(setM).catch((e) => onError(errorText(e)))}>
              Остановить
            </button>
          )}
          <button type="button" className="btn" onClick={() => api.admin.copyMailing(id).then((c2) => { toast('Копия — новым черновиком'); onCopy(c2.id); }).catch((e) => onError(errorText(e)))}>
            Копировать в черновик
          </button>
        </div>
      </section>
      {preview && (
        <section className="card mail-preview">
          <h2>Письмо</h2>
          <iframe className="mail-frame" title="Письмо рассылки" srcDoc={preview} sandbox="" />
        </section>
      )}
    </div>
  );
};
