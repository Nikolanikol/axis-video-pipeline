// Тарифы: подписки на месяц и докупка. Правка — формой прямо у тарифа (раньше «Изменить»
// заполнял форму под таблицей, и на телефоне она оказывалась в самом низу страницы — владелец
// 21.10: «их нельзя ни удалить, ни отредактировать»). Удаление: не продавался — совсем,
// продавался — в архив (removePack в server/accounts.mjs), архив свёрнут внизу.
import React, {useState} from 'react';
import {Pack, api, errorText} from '../api';
import {Field} from '../LotForm';
import {toast} from '../Toast';
import {won} from '../Account';

// Новый тариф по умолчанию — подписка «Базовый»: чаще всего добавляют тариф, а не докупку
const EMPTY_PACK: Pack = {id: '', title: '', credits: 30, price_krw: 49000, valid_days: 30, active: true, sort: 0, kind: 'plan'};

export const Packs: React.FC<{packs: Pack[]; onSaved: () => void; onError: (e: string) => void}> = ({packs, onSaved, onError}) => {
  // Что открыто в форме: id тарифа, «new» — новый, null — ничего. Одна форма за раз: две
  // открытые правки разных тарифов легко перепутать при сохранении
  const [open, setOpen] = useState<string | null>(null);
  const live = packs.filter((p) => !p.archived_at);
  const archived = packs.filter((p) => p.archived_at);
  const done = () => { setOpen(null); onSaved(); };

  const remove = async (p: Pack) => {
    if (!window.confirm(`Удалить тариф «${p.title}»?\nЕсли его уже покупали, он уйдёт в архив: снимется с продажи, а история клиентов и оплаты останутся.`)) return;
    try {
      const {result} = await api.admin.removePack(p.id);
      toast(result === 'deleted' ? `«${p.title}» удалён` : `«${p.title}» покупали — убран в архив`);
      done();
    } catch (err) { onError(errorText(err)); }
  };
  const restore = async (p: Pack) => {
    try {
      await api.admin.restorePack(p.id);
      toast(`«${p.title}» вернулся в прайс — снят с продажи, включите «продаётся», когда проверите цену`);
      onSaved();
    } catch (err) { onError(errorText(err)); }
  };

  const group = (kind: Pack['kind'], title: string) => {
    const list = live.filter((p) => p.kind === kind);
    return (
      <div className="pack-group">
        <h3>{title}</h3>
        {!list.length && <p className="muted">Пока нет.</p>}
        {list.map((p) => (
          <div key={p.id} className={`pack-item${p.active ? '' : ' off'}${open === p.id ? ' editing' : ''}`}>
            <div className="pi-main">
              <div className="pi-info">
                <b>{p.title}</b>
                <span className="muted">{p.credits} кр. · {p.valid_days} дн.{p.active ? '' : ' · не продаётся'}</span>
              </div>
              <div className="pi-price">
                {won(p.price_krw)}
                <span className="muted">{won(Math.round(p.price_krw / p.credits))} за кр.</span>
              </div>
            </div>
            {open === p.id ? (
              <PackForm pack={p} editing onDone={done} onCancel={() => setOpen(null)} onError={onError} taken={packs} />
            ) : (
              <div className="pi-actions">
                <button type="button" className="btn ghost" onClick={() => setOpen(p.id)}>Изменить</button>
                <button type="button" className="btn ghost danger" onClick={() => remove(p)}>Удалить</button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="card packs">
      <div className="section-head">
        <h2>Тарифы</h2>
        {open !== 'new' && <button type="button" className="btn" onClick={() => setOpen('new')}>+ Добавить</button>}
      </div>
      {open === 'new' && (
        <div className="pack-item editing">
          <PackForm pack={EMPTY_PACK} onDone={done} onCancel={() => setOpen(null)} onError={onError} taken={packs} />
        </div>
      )}
      {group('plan', 'Подписка на месяц')}
      {group('topup', 'Докупка')}
      {archived.length > 0 && (
        <details className="pack-archive">
          <summary>Архив <span className="muted">{archived.length}</span></summary>
          <p className="hint">Эти тарифы покупали, поэтому их нельзя стереть: на них ссылаются оплаты и история клиентов. Не продаются.</p>
          {archived.map((p) => (
            <div key={p.id} className="pack-item off">
              <div className="pi-main">
                <div className="pi-info"><b>{p.title}</b><span className="muted">{p.kind === 'plan' ? 'подписка' : 'докупка'} · {p.credits} кр. · {won(p.price_krw)}</span></div>
                <button type="button" className="btn ghost" onClick={() => restore(p)}>Вернуть</button>
              </div>
            </div>
          ))}
        </details>
      )}
      <p className="hint">Правка цены не меняет уже начисленное: цена записывается в партию в момент начисления.</p>
    </section>
  );
};

const PackForm: React.FC<{pack: Pack; editing?: boolean; taken: Pack[]; onDone: () => void; onCancel: () => void; onError: (e: string) => void}> = (
  {pack: initial, editing = false, taken, onDone, onCancel, onError},
) => {
  const [pack, setPack] = useState<Pack>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Pack>) => setPack({...pack, ...patch});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Новый с занятым id не сохраняем — сервер молча перезаписал бы другой тариф
    if (!editing && taken.some((p) => p.id === pack.id)) return onError(`Тариф с id «${pack.id}» уже есть — нажмите «Изменить» у него`);
    setBusy(true);
    try {
      await api.admin.savePack(pack);
      toast(editing ? 'Тариф сохранён' : 'Тариф добавлен');
      onDone();
    } catch (err) { onError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <form className="form pack-form" onSubmit={save}>
      <div className="row">
        <Field label="Название"><input value={pack.title} onChange={(e) => set({title: e.target.value})} required /></Field>
        {/* id — ключ в оплатах и партиях, поэтому у существующего не меняется */}
        <Field label="id" hint={editing ? 'не меняется' : 'латиницей, например plan-max'}>
          <input value={pack.id} onChange={(e) => set({id: e.target.value.toLowerCase()})} disabled={editing} required />
        </Field>
      </div>
      <div className="row">
        <Field label="Вид">
          <select value={pack.kind} onChange={(e) => set({kind: e.target.value as Pack['kind']})}>
            <option value="plan">подписка на месяц</option>
            <option value="topup">докупка</option>
          </select>
        </Field>
        <Field label="Кредитов"><input type="number" inputMode="numeric" min={1} value={pack.credits} onChange={(e) => set({credits: Number(e.target.value)})} /></Field>
      </div>
      <div className="row">
        {/* step={1}: любая сумма в вонах. Был step={1000}, и браузер не давал сохранить 24 900 —
            «ближайшие допустимые 24 000 и 25 000» (владелец 04.10). Сервер всегда принимал любое целое */}
        <Field label="Цена, ₩"><input type="number" inputMode="numeric" min={0} step={1} value={pack.price_krw} onChange={(e) => set({price_krw: Number(e.target.value)})} /></Field>
        <Field label="Действует, дней" hint="у подписки — длина месяца; у докупки — если подписки нет">
          <input type="number" inputMode="numeric" min={1} value={pack.valid_days} onChange={(e) => set({valid_days: Number(e.target.value)})} />
        </Field>
      </div>
      <div className="checks">
        <label><input type="checkbox" checked={pack.active} onChange={(e) => set({active: e.target.checked})} /> продаётся</label>
      </div>
      <div className="btn-row">
        <button className="btn primary" disabled={busy}>{editing ? 'Сохранить' : 'Добавить тариф'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
};
