// Админка платформы. Менеджер видит клиентов, начисляет пакеты и делает рассылки; тарифы, бонусы
// и сотрудники — только у админа.
//
// Разделы — вкладками сверху (21.10): на телефоне всё шло одной лентой — «Пора продлевать»,
// клиенты, сотрудники, а прайс в самом низу, под всеми. На компьютере у вкладки «Клиенты»
// прайс по-прежнему сбоку и закреплён (владелец 11.10: «под рукой, пока листаешь список»);
// на телефоне сбоку места нет — там он только во вкладке «Тарифы».
import React, {useCallback, useEffect, useState} from 'react';
import {Pack, api, errorText} from '../api';
import {useSession} from '../auth';
import {useIsPhone} from '../MobileTabs';
import {Clients} from './Clients';
import {Packs} from './Packs';
import {Staff} from './Staff';
import {Mailings} from './Mailings';
import './admin.css';

type Tab = 'clients' | 'mail' | 'packs' | 'staff';
const TAB_KEY = 'kok-admin-tab';
// Последняя вкладка — удобство одного браузера: в приватном окне хранилище бросает, тогда «Клиенты»
const savedTab = (): Tab => {
  try { return (sessionStorage.getItem(TAB_KEY) as Tab) || 'clients'; } catch { return 'clients'; }
};

export const AdminPage: React.FC = () => {
  const {isAdmin, isStaff, enabled} = useSession();
  const phone = useIsPhone();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(savedTab);

  const loadPacks = useCallback(() => { api.admin.packs().then(setPacks).catch((e) => setError(errorText(e))); }, []);
  useEffect(() => { if (enabled && isStaff) loadPacks(); }, [enabled, isStaff, loadPacks]);

  if (!enabled || !isStaff) {
    return <div className="page"><div className="card"><h1>Админка</h1><p className="muted">Только для сотрудников платформы, и только с подключённой базой.</p></div></div>;
  }

  const tabs: {id: Tab; label: string}[] = [
    {id: 'clients', label: 'Клиенты'},
    // Рассылки — и менеджеру: он их и делает (владелец 21.10)
    {id: 'mail', label: 'Рассылки'},
    ...(isAdmin ? [{id: 'packs' as const, label: 'Тарифы'}, {id: 'staff' as const, label: 'Сотрудники'}] : []),
  ];
  // Сохранённая вкладка недоступна (менеджер в браузере, где входил админ) — «Клиенты»
  const current = tabs.some((t) => t.id === tab) ? tab : 'clients';
  const go = (t: Tab) => {
    setTab(t);
    // Прокручивается .page: без сброса новая вкладка открывалась бы с середины, а вкладки — за краем
    document.querySelector('.admin-page')?.scrollTo({top: 0});
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* только удобство — без него вкладка просто не запомнится */ }
  };
  const side = isAdmin && !phone && current === 'clients';
  const onSale = packs.filter((p) => p.active && !p.archived_at);

  return (
    <div className={`page admin-page${side ? ' with-side' : ''}`}>
      <h1 className="page-title">Админка</h1>
      {tabs.length > 1 && (
        <nav className="admin-tabs" aria-label="Разделы админки">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={current === t.id ? 'active' : ''} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {current === 'clients' && (
        <div className="admin-layout">
          <div className="admin-main"><Clients packs={onSale} isAdmin={isAdmin} onError={setError} /></div>
          {side && <aside className="admin-side"><Packs packs={packs} onSaved={loadPacks} onError={setError} /></aside>}
        </div>
      )}
      {current === 'mail' && <Mailings onError={setError} />}
      {current === 'packs' && <div className="admin-narrow"><Packs packs={packs} onSaved={loadPacks} onError={setError} /></div>}
      {current === 'staff' && <div className="admin-narrow"><Staff onError={setError} /></div>}
    </div>
  );
};
