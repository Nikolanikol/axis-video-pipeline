// Сотрудники платформы: кто админ, кто менеджер. Роль дают по почте уже зарегистрированному —
// так у менеджера свой пароль, которого владелец не знает
import React, {useEffect, useState} from 'react';
import {Role, StaffRow, api, errorText} from '../api';
import {Field} from '../LotForm';

export const Staff: React.FC<{onError: (e: string) => void}> = ({onError}) => {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState('');
  useEffect(() => { api.admin.staff().then(setStaff).catch((e) => onError(errorText(e))); }, [onError]);
  const set = async (mail: string, role: Role) => {
    try { setStaff(await api.admin.setRole(mail, role)); setEmail(''); } catch (err) { onError(errorText(err)); }
  };
  return (
    <section className="card">
      <form className="form" onSubmit={(e) => { e.preventDefault(); set(email, 'manager'); }}>
        <h2>Сотрудники</h2>
        <ul className="staff-list">
          {staff.map((s) => (
            <li key={s.id}>
              <span className="sl-who">{s.name || '—'}<span className="muted">{s.email}</span></span>
              <span className="muted">{s.platform_role === 'admin' ? 'админ' : 'менеджер'}</span>
              {s.platform_role === 'manager' && <button type="button" className="btn ghost" onClick={() => set(s.email, null)}>Снять</button>}
            </li>
          ))}
        </ul>
        <Field label="Сделать менеджером" hint="человек сначала регистрируется сам — пароль остаётся только у него">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="почта" required />
        </Field>
        <p className="hint">Менеджер видит клиентов и начисляет подписки и докупку; прайс, бонусы и сотрудников не меняет.</p>
        <button className="btn primary">Назначить</button>
      </form>
    </section>
  );
};
