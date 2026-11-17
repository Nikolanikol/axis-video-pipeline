// Гость на app.axis-beauty.com — сразу вход, а не реклама (17.11, после переезда витрины на корень
// axis-beauty.com, docs/projects/site/). Раньше здесь стояла своя витрина (Landing.tsx) — та же, что
// теперь на корне: две одинаковые главные отбирали друг у друга место в поиске, а клиент, у которого
// слетел вход, по закладке попадал на рекламу и искал «Войти».
//
// Перенаправлений нет намеренно: кто открыл app., тот пришёл работать — ему окно входа. Новичку —
// вкладка «Регистрация» и ссылка «Что такое KOK» на витрину. Адрес не меняем: после входа страница
// перезагружается (AuthCard) и открывает тот раздел, на который вела ссылка (#/account/<заказ> из
// письма об оплате, #/carousels из закладки).
import React, {useEffect, useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {api, PublicOffer} from './api';
import {AuthCard, AuthMode} from './auth';
import {takeEntryIntent} from './entry';
import {SiteFooter} from './SiteFooter';
import {LangSwitch, useT} from './i18n';

// Витрина KOK — у каждого языка свой адрес (site/src/lib/site.ts, pathFor). Превью ветки тоже ведёт
// на боевую витрину: своей у превью нет
const SITE = 'https://axis-beauty.com';
const siteFor = (lang: string) => `${SITE}/${lang === 'ru' ? '' : `${lang}/`}`;

export const GuestEntry: React.FC<{signup: {credits: number; days: number}; notice: string}> = ({signup, notice}) => {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>('login');
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  useEffect(() => {
    // Условия — для подарка в регистрации и контактов в подвале; не ответил — подарок из /auth/me
    api.publicOffer().then((o) => setOffer(o?.signup ? o : null)).catch(() => setOffer(null));
  }, []);
  // С витрины по «Попробовать» (/register) — сразу регистрация, по «Войти» (/login) — вход.
  // В эффекте, а не в начальном состоянии: take отдаёт намерение один раз (app/entry.ts)
  useEffect(() => { const m = takeEntryIntent(); if (m) setMode(m); }, []);
  // Ссылка из письма (почта подтверждена, аккаунт восстановлен или удалён) — строкой над входом
  useEffect(() => { if (notice) setMode('login'); }, [notice]);

  const title = t(mode === 'login' ? 'land.auth.login' : mode === 'register' ? 'land.auth.register' : 'land.auth.reset');
  return (
    <div className="guest">
      <header className="guest-top">
        <a href={siteFor(t.lang)} aria-label={t('guest.about')}><img src="/kok/wordmark.svg" alt="KOK" className="land-logo" /></a>
        {offer?.preview && <span className="top-preview" title={t('land.preview')}>ТЕСТ · PR {offer.preview}</span>}
        <LangSwitch />
      </header>
      <main className="guest-main">
        <h1 className="guest-title">{title}</h1>
        <AuthCard signup={offer?.signup ?? signup} notice={notice} mode={mode} setMode={setMode} />
        <a className="guest-about" href={siteFor(t.lang)}>{t('guest.about')} <ArrowRight size={16} aria-hidden /></a>
      </main>
      <SiteFooter offer={offer} service={[{label: t('guest.site'), href: siteFor(t.lang)}]} />
    </div>
  );
};
