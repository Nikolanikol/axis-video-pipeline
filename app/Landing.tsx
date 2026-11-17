// Витрина KOK для гостя — первая страница до входа (владелец 01.10: «зазвать людей,
// хорошая витрина, прозрачные и заманчивые условия, чтобы хотелось понажимать»).
//
// Сверху вниз: что это и что вы получите → живое превью, которое можно трогать (формат и
// палитра меняют ролик сразу, всё считается в браузере — без входа и без затрат сервера) →
// как это работает → образцы роликов и каруселей → условия и тарифы → вопросы → призыв.
// Вход и регистрация — окном поверх витрины из любой кнопки («Войти», «Попробовать»,
// «Получить кредиты»), а не формой в самом низу: владелец 01.10 — «форма внизу странная»,
// до неё надо было долистывать через всю страницу.
//
// Образцы и демо-объявление — статика в public/landing/, собирает tools/landing-samples.mjs
// от имени демо-компании «Ваша компания» (src/shared/landingDemo.js): на публичной странице
// не светим работы настоящего клиента.
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, Check, ChevronLeft, ChevronRight, Download, Link2, Palette, Sparkles, X} from 'lucide-react';
import brand from '../config/brand.json';
import copy from '../config/copy.json';
import palettes from '../config/palettes.json';
import seo from '../config/seo.json';
import {DEMO_LOT_TEXTS, demoProfile, demoTheme} from '../src/shared/landingDemo.js';
import {FORMATS} from '../src/shared/model';
import {marketFromProfile} from '../src/shared/profile';
import type {AdProps, Lot, Market, Theme} from '../src/shared/types';
import {dropPrerender} from './analytics';
import {api, PublicOffer} from './api';
import {AuthCard, AuthMode} from './auth';
import {takeEntryIntent} from './entry';
import {Preview} from './Preview';
import {SiteFooter} from './SiteFooter';
import {SourcesStrip} from './Sources';
import {faq as faqI18n} from './i18n/faq';
import {LangSwitch, T, useT} from './i18n';

type Samples = {
  videos: {title: string; year: number; format: string; palette: string; video: string; poster: string}[];
  carousels: {title: string; year: number; format: string; ratio: string; palette: string; slides: string[]}[];
};

// Витрину рисует и сервер (server/seo.mjs) — там useLayoutEffect не работает и шумит предупреждением
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const usd = (n: number) => `$${n.toLocaleString('en-US', Number.isInteger(n) ? {maximumFractionDigits: 0} : {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

export const Landing: React.FC<{signup: {credits: number; days: number}; notice: string}> = ({signup, notice}) => {
  const t = useT();
  // «7 кредитов» / «7 credits» — форма числа по языку (app/i18n)
  const credits = (n: number) => t.n('unit.credit', n);
  const [mode, setMode] = useState<AuthMode>('register');
  const [authOpen, setAuthOpen] = useState(false);
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [samples, setSamples] = useState<Samples | null>(null);
  useEffect(() => {
    // Ответ проверяем по форме: старый сервер без этого адреса отвечал чем-то другим, и витрина
    // падала целиком на отсутствующих полях. Нет условий — показываем подарок из /auth/me
    api.publicOffer().then((o) => setOffer(o?.signup && o.costs ? o : null)).catch(() => setOffer(null));
    fetch('/landing/samples.json').then((r) => r.json()).then(setSamples).catch(() => setSamples(null));
  }, []);
  // Пришёл по ссылке из письма (подтверждение почты, сброс) — сразу окно входа
  useEffect(() => { if (notice) { setMode('login'); setAuthOpen(true); } }, [notice]);
  // Пришёл с витрины axis-beauty.com по кнопке «Попробовать» / «Войти» (/register, /login, 17.11) —
  // сразу нужное окно, без второй витрины. Адрес уже почищен в app/entry.ts
  useEffect(() => {
    const m = takeEntryIntent();
    if (!m) return;
    setMode(m);
    setAuthOpen(true);
  }, []);

  const gift = offer?.signup ?? signup;
  const costs = offer?.costs ?? {ads: 3, carousels: 1};
  const start = (m: AuthMode) => { setMode(m); setAuthOpen(true); };
  // Своя витрина нарисована — серверная копия больше не нужна. До отрисовки кадра, чтобы на миг
  // не стояли обе (server/seo.mjs)
  useBrowserLayoutEffect(dropPrerender, []);

  return (
    <div className="landing">
      <header className="land-top">
        <img src="/kok/wordmark.svg" alt="KOK" className="land-logo" />
        {offer?.preview && <span className="top-preview" title={t('land.preview')}>ТЕСТ · PR {offer.preview}</span>}
        <nav className="land-nav">
          <a href="#how" onClick={jump('how')}>{t('land.nav.how')}</a>
          <a href="#samples" onClick={jump('samples')}>{t('land.nav.samples')}</a>
          <a href="#pricing" onClick={jump('pricing')}>{t('land.nav.pricing')}</a>
          <a href="#contacts" onClick={jump('contacts')}>{t('land.nav.contacts')}</a>
        </nav>
        <LangSwitch />
        <button className="btn ghost" onClick={() => start('login')}>{t('land.login')}</button>
        <button className="btn primary land-cta-sm" onClick={() => start('register')}>{t('land.try')}</button>
      </header>

      <section className="land-hero">
        <div className="land-hero-text">
          <span className="land-eyebrow"><Sparkles size={15} aria-hidden /> {t('land.eyebrow')}</span>
          {/* Слова — как ищет дилер (подсказки Google и Яндекса 19.10, config/seo.json): «реклама / SMM автосалона».
              Прежний «Ролик и карусель по ссылке на объявление» не содержал ни одного запроса */}
          {/* Неразрывные пробелы (было «для&nbsp;автосалона», «по&nbsp;ссылке») — в словаре символом \u00a0 */}
          <h1>{t('land.h1.a')}<span className="land-accent">{t('land.h1.b')}</span></h1>
          <p className="land-lead">{t('land.lead')}</p>
          <div className="land-actions">
            <button className="btn primary land-cta" onClick={() => start('register')}>
              {t('land.cta.gift', {credits: credits(gift.credits)})} <ArrowRight size={18} aria-hidden />
            </button>
            <a className="btn ghost land-cta" href="#samples" onClick={jump('samples')}>{t('land.cta.samples')}</a>
          </div>
          <ul className="land-perks">
            <li><Check size={16} aria-hidden /> {t('land.perk.verify', {credits: credits(gift.credits), days: t.n('unit.day', gift.days)})}</li>
            <li><Check size={16} aria-hidden /> {t('land.perk.nocard')}</li>
            <li><Check size={16} aria-hidden /> {t('land.perk.costs', {video: credits(costs.ads ?? 3), carousel: credits(costs.carousels ?? 1)})}</li>
          </ul>
          {/* Какие площадки поддерживаем — сразу на первом экране, логотипы ведут на сайты (владелец 13.10) */}
          <SourcesStrip className="land-sources" />
        </div>
        <LiveDemo />
      </section>

      <section id="how" className="land-section">
        <h2 className="land-h2">{t('land.how.h2')}</h2>
        <div className="land-steps">
          <Step n={1} icon={<Link2 size={22} />} title={t('land.how.1.title')} text={t('land.how.1.text')} />
          <Step n={2} icon={<Palette size={22} />} title={t('land.how.2.title')} text={t('land.how.2.text')} />
          <Step n={3} icon={<Download size={22} />} title={t('land.how.3.title')} text={t('land.how.3.text')} />
        </div>
      </section>

      <section id="samples" className="land-section">
        <h2 className="land-h2">{t('land.samples.h2')}</h2>
        <p className="land-sub">{t('land.samples.sub')}</p>
        {samples ? <>
          <h3 className="land-h3">{t('land.samples.videos')}</h3>
          <div className="land-videos">
            {samples.videos.map((v) => (
              <figure key={v.video} className="land-video">
                <AutoVideo src={v.video} poster={v.poster} />
                <figcaption><b>{v.title} {v.year}</b><span>{t.cfg(v.format)} · {t.cfg(v.palette)}</span></figcaption>
              </figure>
            ))}
          </div>
          <h3 className="land-h3">{t('land.samples.carousels')}</h3>
          <Carousels items={samples.carousels} t={t} />
        </> : <p className="land-sub">{t('land.samples.loading')}</p>}
      </section>

      <section id="pricing" className="land-section">
        <h2 className="land-h2">{t('land.pricing.h2')}</h2>
        <div className="land-price-cards">
          <div className="land-price-card gift">
            <span className="land-badge">{t('land.pricing.free')}</span>
            <b className="land-big">{credits(gift.credits)}</b>
            <p>{t('land.pricing.giftText', {days: t.n('unit.day', gift.days)})} <GiftEnough t={t} credits={gift.credits} ad={costs.ads ?? 3} carousel={costs.carousels ?? 1} /></p>
          </div>
          <div className="land-price-card">
            <span className="land-badge muted-badge">{t('land.pricing.cost')}</span>
            <ul className="land-costs">
              <li><span>{t('land.pricing.video')}</span><b>{credits(costs.ads ?? 3)}</b></li>
              <li><span>{t('land.pricing.carousel')}</span><b>{credits(costs.carousels ?? 1)}</b></li>
              <li><span>{t('land.pricing.extras')}</span><b>{t('land.pricing.extrasFree')}</b></li>
            </ul>
            <p className="muted">{t('land.pricing.refund')}</p>
          </div>
        </div>
        <Tariffs offer={offer} t={t} />
      </section>

      <section id="faq" className="land-section">
        <h2 className="land-h2">{t('land.nav.faq')}</h2>
        {/* Русские вопросы — из config/seo.json: те же уходят в разметку FAQPage для Google (server/seo.mjs);
            переводы — app/i18n/faq.ts в том же порядке */}
        <div className="land-faq">
          {(t.lang === 'ru' ? seo.faq : faqI18n[t.lang]).map((f) => <details key={f.q}><summary>{f.q}</summary><p><Linked text={f.a} /></p></details>)}
        </div>
      </section>

      <section className="land-section">
        <div className="land-final">
          <div>
            <h2 className="land-h2">{t('land.final.h2')}</h2>
            <ul className="land-perks">
              <li><Check size={16} aria-hidden /> {t('land.final.gift', {credits: credits(gift.credits), days: t.n('unit.day', gift.days)})}</li>
              <li><Check size={16} aria-hidden /> {t('land.final.formats')}</li>
              <li><Check size={16} aria-hidden /> {t('land.final.brand')}</li>
              <li><Check size={16} aria-hidden /> {t('land.final.noobligation')}</li>
            </ul>
          </div>
          <div className="land-final-actions">
            <button className="btn primary land-cta" onClick={() => start('register')}>
              {t('land.final.cta')} <ArrowRight size={18} aria-hidden />
            </button>
            <span className="muted">{t('land.final.have')} <button className="link" onClick={() => start('login')}>{t('land.login')}</button></span>
          </div>
        </div>
      </section>

      {authOpen && <AuthModal mode={mode} onClose={() => setAuthOpen(false)}>
        <AuthCard signup={gift} notice={notice} mode={mode} setMode={setMode} />
      </AuthModal>}

      <SiteFooter offer={offer} service={[
        {label: t('land.nav.how'), href: '#how', onClick: jump('how')},
        {label: t('land.nav.samples'), href: '#samples', onClick: jump('samples')},
        {label: t('land.nav.pricing'), href: '#pricing', onClick: jump('pricing')},
        {label: t('land.nav.faq'), href: '#faq', onClick: jump('faq')},
      ]} />
    </div>
  );
};

/**
 * Окно входа и регистрации поверх витрины. Закрывается крестиком, Escape и нажатием мимо;
 * пока открыто, витрина под ним не прокручивается. На телефоне — лист снизу во всю ширину
 * (styles.css): так форма не прыгает под клавиатурой и закрывается привычно
 */
const AuthModal: React.FC<{mode: AuthMode; onClose: () => void; children: React.ReactNode}> = ({mode, onClose, children}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const page = document.querySelector<HTMLElement>('.landing');
    page?.classList.add('land-locked');
    return () => { window.removeEventListener('keydown', onKey); page?.classList.remove('land-locked'); };
  }, [onClose]);
  const t = useT();
  const title = t(mode === 'login' ? 'land.auth.login' : mode === 'register' ? 'land.auth.register' : 'land.auth.reset');
  return (
    <div className="land-modal" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="land-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="land-modal-head">
          <b>{title}</b>
          <button className="land-modal-close" onClick={onClose} aria-label={t('land.auth.close')}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

// Якоря без смены адреса: #how в адресе роутер принял бы за раздел приложения
const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
};

// «[оферте](/offer)» из config/seo.json — ссылкой, остальное — текстом
const Linked: React.FC<{text: string}> = ({text}) => <>{text.split(/(\[[^\]]+\]\([^)]+\))/).map((part, i) => {
  const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
  return m ? <a key={i} href={m[2]}>{m[1]}</a> : part;
})}</>;

// «Хватит на 2 ролика и 1 карусель или на 7 каруселей». Остатка на карусель нет — без «и 0 карусели»
const GiftEnough: React.FC<{t: T; credits: number; ad: number; carousel: number}> = ({t, credits, ad, carousel}) => {
  const rest = Math.floor((credits % ad) / carousel);
  const vars = {
    videos: t.n('unit.video', Math.floor(credits / ad)),
    carousels: t.n('unit.carousel', rest),
    onlyCarousels: t.n('unit.carousel', Math.floor(credits / carousel)),
  };
  return <>{t(rest > 0 ? 'land.pricing.enough' : 'land.pricing.enoughNoRest', vars)}</>;
};

const Step: React.FC<{n: number; icon: React.ReactNode; title: string; text: string}> = ({n, icon, title, text}) => (
  <div className="land-step">
    <span className="land-step-n">{n}</span>
    <span className="land-step-icon">{icon}</span>
    <h3>{title}</h3>
    <p>{text}</p>
  </div>
);

/**
 * Живое превью: демо-объявление (Hyundai Kona с Encar) в плеере, как в кабинете. Формат и
 * палитра меняют ролик сразу — гость «нажимает» и видит результат, а сервер не работает:
 * композиция считается в браузере. Демо грузится, когда превью доходит до экрана
 */
const LiveDemo: React.FC = () => {
  const t = useT();
  const [lot, setLot] = useState<Lot | null>(null);
  const [format, setFormat] = useState(FORMATS[0].id);
  const [palette, setPalette] = useState(palettes[0].id);
  useEffect(() => { fetch('/landing/demo/lot.json').then((r) => r.json()).then(setLot).catch(() => setLot(null)); }, []);
  // Ролик — на языке переключателя, как у клиента в кабинете
  const lang = t.lang;
  const market = useMemo(() => marketFromProfile(demoProfile(lang), copy) as Market, [lang]);
  const theme = useMemo(() => demoTheme(brand, palettes.find((p) => p.id === palette)!.colors, lang) as Theme, [palette, lang]);
  const fmt = FORMATS.find((f) => f.id === format)!;
  const local = useMemo(() => {
    const over = lang === 'ru' ? null : DEMO_LOT_TEXTS[lang];
    return lot && over ? {...lot, specs: over.specs, texts: {...lot.texts, hookTagline: over.hookTagline}} as Lot : lot;
  }, [lot, lang]);
  const input: AdProps | null = local ? {lot: local, market, theme} as AdProps : null;
  return (
    <div className="land-demo">
      <div className="land-phone">
        {input ? <Preview input={input} format={fmt} autoPlay loop /> : <div className="land-phone-empty" />}
      </div>
      <div className="land-demo-controls">
        <span className="land-try">{t('land.demo.try')}</span>
        <div className="land-chips" role="radiogroup" aria-label={t('land.demo.format')}>
          {FORMATS.map((f) => (
            <button key={f.id} role="radio" aria-checked={f.id === format} className={f.id === format ? 'land-chip on' : 'land-chip'}
              onClick={() => setFormat(f.id)}>{t.cfg(f.title)}</button>
          ))}
        </div>
        <div className="land-swatches" role="radiogroup" aria-label={t('land.demo.palette')}>
          {palettes.map((p) => (
            <button key={p.id} role="radio" aria-checked={p.id === palette} title={t.cfg(p.title)} aria-label={t.cfg(p.title)}
              className={p.id === palette ? 'land-swatch on' : 'land-swatch'}
              style={{background: `linear-gradient(135deg, ${p.colors.bg} 50%, ${p.colors.copper} 50%)`}}
              onClick={() => setPalette(p.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Ролик-образец: играет без звука по кругу, но только пока виден — шесть одновременно
 * играющих видео тормозили бы прокрутку, а грузить их до экрана незачем (preload="none")
 */
const AutoVideo: React.FC<{src: string; poster: string}> = ({src, poster}) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, {threshold: 0.4});
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" />;
};

/**
 * Карусели-образцы: переключатель машин и лента слайдов. Лента — на прокрутке со «щелчком»
 * (scroll-snap): пальцем листается сама, с инерцией, как в Instagram; соседний слайд
 * выглядывает справа — видно, что дальше есть ещё
 */
const Carousels: React.FC<{items: Samples['carousels']; t: T}> = ({items, t}) => {
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const c = items[at];
  useEffect(() => { strip.current?.scrollTo({left: 0}); }, [at]);
  if (!c) return null;
  const step = (d: number) => {
    const el = strip.current;
    const slide = el?.querySelector<HTMLElement>('.land-slide');
    if (el && slide) el.scrollBy({left: d * (slide.offsetWidth + 12), behavior: 'smooth'});
  };
  return (
    <div className="land-carousel">
      <div className="land-chips">
        {items.map((it, i) => (
          <button key={it.title + it.format} className={i === at ? 'land-chip on' : 'land-chip'} onClick={() => setAt(i)}>
            {it.title} · {t.cfg(it.format)}
          </button>
        ))}
      </div>
      <div className="land-strip-wrap">
        <button className="land-arrow left" onClick={() => step(-1)} aria-label={t('land.prev')}><ChevronLeft size={22} /></button>
        <div className="land-strip" ref={strip} style={{['--slide-ratio' as string]: c.ratio}}>
          {c.slides.map((s, i) => <img key={s} className="land-slide" src={s} alt={t('land.samples.slideAlt', {title: c.title, n: i + 1})} loading="lazy" />)}
        </div>
        <button className="land-arrow right" onClick={() => step(1)} aria-label={t('land.next')}><ChevronRight size={22} /></button>
      </div>
      <p className="land-sub">{t.n('unit.slide', c.slides.length)} · {t.cfg(c.palette)} · {t('land.samples.swipe')}</p>
    </div>
  );
};

// Тарифы — из админки, те же, что в кабинете. Без базы (копия на Mac) их нет — тогда
// только обещание показать после регистрации, а не пустая таблица
const Tariffs: React.FC<{offer: PublicOffer | null; t: T}> = ({offer, t}) => {
  const credits = (n: number) => t.n('unit.credit', n);
  const plans = (offer?.packs ?? []).filter((p) => p.kind === 'plan');
  const topups = (offer?.packs ?? []).filter((p) => p.kind === 'topup');
  // Менеджер — в Telegram (владелец 12.10: обратная связь через Telegram); нет его — WhatsApp
  const tg = offer?.contacts?.telegram?.trim().replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '');
  const wa = offer?.contacts?.whatsapp?.replace(/\D/g, '');
  const ask = tg ? {href: `https://t.me/${tg}`, label: 'Telegram'} : wa ? {href: `https://wa.me/${wa}`, label: 'WhatsApp'} : null;
  if (!plans.length && !topups.length) return <p className="land-sub">{t('land.tariffs.later')}</p>;
  return (
    <div className="land-tariffs">
      {plans.map((p) => (
        <div key={p.id} className="land-tariff">
          <span className="land-tariff-title">{p.title}</span>
          <b className="land-big">{usd(p.price_usd)}</b>
          <span className="muted">{t('land.tariffs.month')}</span>
          <span>{credits(p.credits)} · {t('land.tariffs.perCredit', {price: usd(Math.round((p.price_usd / p.credits) * 100) / 100)})}</span>
        </div>
      ))}
      {topups.length > 0 && (
        <div className="land-tariff topup">
          <span className="land-tariff-title">{t('land.tariffs.topup')}</span>
          {/* Название пакета часто уже содержит число («+20 кредитов») — тогда не повторяем его */}
          {topups.map((p) => (
            <span key={p.id}>{p.title.includes(String(p.credits)) ? p.title : `${p.title}: ${credits(p.credits)}`} — {usd(p.price_usd)}</span>
          ))}
        </div>
      )}
      {ask && <a className="btn ghost" href={ask.href} target="_blank" rel="noreferrer">{t('land.tariffs.ask', {channel: ask.label})}</a>}
    </div>
  );
};
