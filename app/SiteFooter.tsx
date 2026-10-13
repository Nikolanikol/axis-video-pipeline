// Подвал KOK — общий для витрины гостя и рабочих экранов (владелец 12.10: «футер виден всегда,
// как у нормальных сайтов, но не мешает»). О сервисе и каналы связи, разделы, документы,
// реквизиты продавца внизу. Модерации платёжного сервиса нужны контакты и оферта на виду.
// Каналы и продавец — из config/platform.json через /api/public/offer (он открыт и вошедшему).
//
// На рабочих экранах подвал стоит под рабочей зоной высотой в экран (Shell.tsx): работе он не
// мешает, а дойти до него — прокрутить чуть ниже.
import React, {useEffect, useState} from 'react';
import {Instagram, Mail, MessageCircle, Send} from 'lucide-react';
import {api, PublicOffer} from './api';
import {contactLinks} from './Legal';
import {SourcesStrip} from './Sources';

export type FooterLink = {label: string; href: string; onClick?: (e: React.MouseEvent) => void};

type Props = {
  // Ссылки колонки «Сервис»: на витрине — разделы страницы, в кабинете — пайплайны
  service: FooterLink[];
  // Витрина уже загрузила условия сама — второй запрос не нужен; не передали — подвал берёт их сам
  offer?: PublicOffer | null;
  className?: string;
};

export const SiteFooter: React.FC<Props> = ({service, offer: given, className}) => {
  const [loaded, setLoaded] = useState<PublicOffer | null>(null);
  useEffect(() => {
    if (given !== undefined) return;
    // Не ответил — подвал без каналов связи и реквизитов, но с документами: ошибку на экран не
    // выводим (подвал вторичен), а сторону сервера записал его журнал
    api.publicOffer().then(setLoaded).catch(() => setLoaded(null));
  }, [given]);
  const offer = given !== undefined ? given : loaded;

  const links = contactLinks(offer?.contacts);
  const tg = links.find((c) => c.label === 'Telegram');
  const l = offer?.legal;
  const icon = (label: string) => label === 'WhatsApp' ? <MessageCircle size={18} aria-hidden />
    : label === 'Telegram' ? <Send size={18} aria-hidden />
    : label === 'Instagram' ? <Instagram size={18} aria-hidden /> : <Mail size={18} aria-hidden />;
  return (
    <footer className={['land-foot', className].filter(Boolean).join(' ')} id="contacts">
      <div className="land-foot-grid">
        <div className="land-foot-brand">
          <img src="/kok/wordmark.svg" alt="KOK" className="land-logo" />
          <p className="muted">Контент одной кнопкой: рекламные ролики и карусели для автодилеров по объявлениям Encar, che168 и Carsensor.</p>
          {links.length > 0 && (
            <div className="land-socials">
              {links.map((c) => (
                <a key={c.label} href={c.href} target="_blank" rel="noreferrer" aria-label={c.label} title={c.label}>{icon(c.label)}</a>
              ))}
            </div>
          )}
        </div>
        <nav className="land-foot-col" aria-label="Разделы">
          <b>Сервис</b>
          {service.map((s) => <a key={s.href} href={s.href} onClick={s.onClick}>{s.label}</a>)}
        </nav>
        {/* Откуда KOK берёт объявления — логотипы-ссылки на площадки (13.10, app/Sources.tsx) */}
        <div className="land-foot-col land-foot-sources">
          <b>Площадки</b>
          <SourcesStrip compact title="" />
        </div>
        <nav className="land-foot-col" aria-label="Документы">
          <b>Документы</b>
          <a href="#/offer">Публичная оферта</a>
          <a href="#/offer/refunds">Возврат денег</a>
          <a href="#/privacy">Персональные данные</a>
        </nav>
        <div className="land-foot-col">
          <b>Связаться</b>
          {/* Telegram — главный канал (владелец 12.10): там бот поддержки и тема на клиента у команды.
              Остальные каналы — строками ниже, тише */}
          {tg && (
            <a className="btn primary land-foot-tg" href={tg.href} target="_blank" rel="noreferrer">
              <Send size={17} aria-hidden /> Написать в Telegram
            </a>
          )}
          {links.filter((c) => c !== tg).map((c) => <a key={c.label} href={c.href} target="_blank" rel="noreferrer">{c.label}: <span className="nowrap">{c.value}</span></a>)}
          <span className="muted">Оплата, возвраты, помощь с кабинетом</span>
        </div>
      </div>
      <div className="land-foot-legal">
        <span>© {new Date().getFullYear()} {l?.seller || 'KOK'}</span>
        {l?.regNo && <span>Рег. № {l.regNo.replace(/\s*\(.*\)$/, '')}</span>}
        {l?.country && <span>{l.country}</span>}
      </div>
    </footer>
  );
};
