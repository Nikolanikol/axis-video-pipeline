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
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, Check, ChevronLeft, ChevronRight, Download, Link2, Palette, Sparkles, X} from 'lucide-react';
import brand from '../config/brand.json';
import copy from '../config/copy.json';
import palettes from '../config/palettes.json';
import {DEMO_PROFILE, demoTheme} from '../src/shared/landingDemo.js';
import {FORMATS} from '../src/shared/model';
import {marketFromProfile} from '../src/shared/profile';
import type {AdProps, Lot, Market, Theme} from '../src/shared/types';
import {api, PublicOffer} from './api';
import {AuthCard, AuthMode} from './auth';
import {Preview} from './Preview';

type Samples = {
  videos: {title: string; year: number; format: string; palette: string; video: string; poster: string}[];
  carousels: {title: string; year: number; format: string; ratio: string; palette: string; slides: string[]}[];
};

const won = (n: number) => `${n.toLocaleString('ru-RU')} ₩`;
// «7 кредитов», «3 кредита», «1 кредит»
const credits = (n: number) => {
  const d = n % 10; const h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? 'кредит' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'кредита' : 'кредитов'}`;
};

export const Landing: React.FC<{signup: {credits: number; days: number}; notice: string}> = ({signup, notice}) => {
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

  const gift = offer?.signup ?? signup;
  const costs = offer?.costs ?? {ads: 3, carousels: 1};
  const start = (m: AuthMode) => { setMode(m); setAuthOpen(true); };

  return (
    <div className="landing">
      <header className="land-top">
        <img src="/kok/wordmark.svg" alt="KOK" className="land-logo" />
        <nav className="land-nav">
          <a href="#how" onClick={jump('how')}>Как это работает</a>
          <a href="#samples" onClick={jump('samples')}>Образцы</a>
          <a href="#pricing" onClick={jump('pricing')}>Цены</a>
        </nav>
        <button className="btn ghost" onClick={() => start('login')}>Войти</button>
        <button className="btn primary land-cta-sm" onClick={() => start('register')}>Попробовать</button>
      </header>

      <section className="land-hero">
        <div className="land-hero-text">
          <span className="land-eyebrow"><Sparkles size={15} aria-hidden /> Для автодилеров, продающих машины из Кореи</span>
          <h1>Ролик и карусель по&nbsp;объявлению Encar — <span className="land-accent">одной кнопкой</span></h1>
          <p className="land-lead">
            Вставляете ссылку — KOK сам подбирает фото, характеристики и цену и собирает рекламный ролик
            для Reels и TikTok и карусель для Instagram в вашем фирменном стиле. Минута вместо вечера в монтаже.
          </p>
          <div className="land-actions">
            <button className="btn primary land-cta" onClick={() => start('register')}>
              Получить {credits(gift.credits)} бесплатно <ArrowRight size={18} aria-hidden />
            </button>
            <a className="btn ghost land-cta" href="#samples" onClick={jump('samples')}>Смотреть образцы</a>
          </div>
          <ul className="land-perks">
            <li><Check size={16} aria-hidden /> Подтвердите почту — {credits(gift.credits)} на {gift.days} дней</li>
            <li><Check size={16} aria-hidden /> Без карты и без звонков менеджера</li>
            <li><Check size={16} aria-hidden /> Ролик — {credits(costs.ads ?? 3)}, карусель — {credits(costs.carousels ?? 1)}</li>
          </ul>
        </div>
        <LiveDemo />
      </section>

      <section id="how" className="land-section">
        <h2 className="land-h2">Три шага — и пост готов</h2>
        <div className="land-steps">
          <Step n={1} icon={<Link2 size={22} />} title="Вставьте ссылку" text="Любое объявление с Encar. Марку, пробег, цену и лучшие фото KOK возьмёт сам — переводить и выписывать ничего не нужно." />
          <Step n={2} icon={<Palette size={22} />} title="Выберите формат" text="Ролик с ценой в конце, галерея фото или цена в первую секунду. Логотип, цвета и шрифты — ваши, настраиваются один раз." />
          <Step n={3} icon={<Download size={22} />} title="Скачайте и публикуйте" text="Ролик 1080×1920 для Reels, TikTok и Shorts, карусель для Instagram. С телефона — сразу в галерею." />
        </div>
      </section>

      <section id="samples" className="land-section">
        <h2 className="land-h2">Так это выглядит</h2>
        <p className="land-sub">Всё ниже собрано KOK по настоящим объявлениям Encar — без ручного монтажа. Название, цвета и контакты здесь демо, у вас будут ваши.</p>
        {samples ? <>
          <h3 className="land-h3">Рекламные ролики</h3>
          <div className="land-videos">
            {samples.videos.map((v) => (
              <figure key={v.video} className="land-video">
                <AutoVideo src={v.video} poster={v.poster} />
                <figcaption><b>{v.title} {v.year}</b><span>{v.format} · {v.palette}</span></figcaption>
              </figure>
            ))}
          </div>
          <h3 className="land-h3">Карусели для Instagram</h3>
          <Carousels items={samples.carousels} />
        </> : <p className="land-sub">Образцы загружаются…</p>}
      </section>

      <section id="pricing" className="land-section">
        <h2 className="land-h2">Честные условия</h2>
        <div className="land-price-cards">
          <div className="land-price-card gift">
            <span className="land-badge">Бесплатно</span>
            <b className="land-big">{credits(gift.credits)}</b>
            <p>на {gift.days} дней — сразу после подтверждения почты. Хватит на {Math.floor(gift.credits / (costs.ads ?? 3))} ролика и {gift.credits % (costs.ads ?? 3)} {gift.credits % (costs.ads ?? 3) === 1 ? 'карусель' : 'карусели'} или на {Math.floor(gift.credits / (costs.carousels ?? 1))} каруселей.</p>
          </div>
          <div className="land-price-card">
            <span className="land-badge muted-badge">Сколько стоит</span>
            <ul className="land-costs">
              <li><span>Рекламный ролик</span><b>{credits(costs.ads ?? 3)}</b></li>
              <li><span>Карусель</span><b>{credits(costs.carousels ?? 1)}</b></li>
              <li><span>Превью, настройки, правки</span><b>бесплатно</b></li>
            </ul>
            <p className="muted">Кредит списывается только за готовый результат: не собралось — кредит возвращается сам.</p>
          </div>
        </div>
        <Tariffs offer={offer} />
      </section>

      <section className="land-section">
        <h2 className="land-h2">Вопросы</h2>
        <div className="land-faq">
          <details><summary>Нужна ли карта, чтобы попробовать?</summary><p>Нет. Регистрация и пробные кредиты — без карты. Тариф подключает менеджер, когда вы решите продолжить.</p></details>
          <details><summary>Что будет, если объявление на Encar снимут?</summary><p>Ничего: фото копируются к нам при создании, готовый ролик и карусель от объявления не зависят.</p></details>
          <details><summary>Можно поставить свой логотип и цвета?</summary><p>Да. В настройках бренда — логотип, палитра, шрифты и контакты. Один раз — и они на всех роликах и каруселях.</p></details>
          <details><summary>На каком языке тексты?</summary><p>На языке вашего профиля: характеристики и подписи переводятся сами. Карусели — на русском или английском.</p></details>
        </div>
      </section>

      <section className="land-section">
        <div className="land-final">
          <div>
            <h2 className="land-h2">Начните бесплатно</h2>
            <ul className="land-perks">
              <li><Check size={16} aria-hidden /> {credits(gift.credits)} на {gift.days} дней после подтверждения почты</li>
              <li><Check size={16} aria-hidden /> Все форматы роликов и каруселей</li>
              <li><Check size={16} aria-hidden /> Ваш логотип, цвета и контакты</li>
              <li><Check size={16} aria-hidden /> Без карты и без обязательств</li>
            </ul>
          </div>
          <div className="land-final-actions">
            <button className="btn primary land-cta" onClick={() => start('register')}>
              Создать кабинет бесплатно <ArrowRight size={18} aria-hidden />
            </button>
            <span className="muted">Уже есть кабинет? <button className="link" onClick={() => start('login')}>Войти</button></span>
          </div>
        </div>
      </section>

      {authOpen && <AuthModal mode={mode} onClose={() => setAuthOpen(false)}>
        <AuthCard signup={gift} notice={notice} mode={mode} setMode={setMode} />
      </AuthModal>}

      <footer className="land-foot">
        <img src="/kok/wordmark.svg" alt="KOK" className="land-logo" />
        <span className="muted">Контент одной кнопкой</span>
      </footer>
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
  const title = mode === 'login' ? 'Вход в KOK' : mode === 'register' ? 'Кабинет за минуту' : 'Новый пароль';
  return (
    <div className="land-modal" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="land-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="land-modal-head">
          <b>{title}</b>
          <button className="land-modal-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
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
  const [lot, setLot] = useState<Lot | null>(null);
  const [format, setFormat] = useState(FORMATS[0].id);
  const [palette, setPalette] = useState(palettes[0].id);
  useEffect(() => { fetch('/landing/demo/lot.json').then((r) => r.json()).then(setLot).catch(() => setLot(null)); }, []);
  const market = useMemo(() => marketFromProfile(DEMO_PROFILE, copy) as Market, []);
  const theme = useMemo(() => demoTheme(brand, palettes.find((p) => p.id === palette)!.colors) as Theme, [palette]);
  const fmt = FORMATS.find((f) => f.id === format)!;
  const input: AdProps | null = lot ? {lot, market, theme} as AdProps : null;
  return (
    <div className="land-demo">
      <div className="land-phone">
        {input ? <Preview input={input} format={fmt} autoPlay /> : <div className="land-phone-empty" />}
      </div>
      <div className="land-demo-controls">
        <span className="land-try">Попробуйте — ролик меняется сразу</span>
        <div className="land-chips" role="radiogroup" aria-label="Формат ролика">
          {FORMATS.map((f) => (
            <button key={f.id} role="radio" aria-checked={f.id === format} className={f.id === format ? 'land-chip on' : 'land-chip'}
              onClick={() => setFormat(f.id)}>{f.title}</button>
          ))}
        </div>
        <div className="land-swatches" role="radiogroup" aria-label="Палитра">
          {palettes.map((p) => (
            <button key={p.id} role="radio" aria-checked={p.id === palette} title={p.title} aria-label={p.title}
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
const Carousels: React.FC<{items: Samples['carousels']}> = ({items}) => {
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
            {it.title} · {it.format}
          </button>
        ))}
      </div>
      <div className="land-strip-wrap">
        <button className="land-arrow left" onClick={() => step(-1)} aria-label="Назад"><ChevronLeft size={22} /></button>
        <div className="land-strip" ref={strip} style={{['--slide-ratio' as string]: c.ratio}}>
          {c.slides.map((s, i) => <img key={s} className="land-slide" src={s} alt={`${c.title}, слайд ${i + 1}`} loading="lazy" />)}
        </div>
        <button className="land-arrow right" onClick={() => step(1)} aria-label="Вперёд"><ChevronRight size={22} /></button>
      </div>
      <p className="land-sub">{c.slides.length} слайдов · {c.palette} · листайте вбок</p>
    </div>
  );
};

// Тарифы — из админки, те же, что в кабинете. Без базы (копия на Mac) их нет — тогда
// только обещание показать после регистрации, а не пустая таблица
const Tariffs: React.FC<{offer: PublicOffer | null}> = ({offer}) => {
  const plans = (offer?.packs ?? []).filter((p) => p.kind === 'plan');
  const topups = (offer?.packs ?? []).filter((p) => p.kind === 'topup');
  const wa = offer?.contacts?.whatsapp?.replace(/\D/g, '');
  if (!plans.length && !topups.length) return <p className="land-sub">Тарифы и докупка — в кабинете после регистрации.</p>;
  return (
    <div className="land-tariffs">
      {plans.map((p) => (
        <div key={p.id} className="land-tariff">
          <span className="land-tariff-title">{p.title}</span>
          <b className="land-big">{won(p.price_krw)}</b>
          <span className="muted">в месяц</span>
          <span>{credits(p.credits)} · {won(Math.round(p.price_krw / p.credits))} за кредит</span>
        </div>
      ))}
      {topups.length > 0 && (
        <div className="land-tariff topup">
          <span className="land-tariff-title">Не хватило на месяц</span>
          {/* Название пакета часто уже содержит число («+20 кредитов») — тогда не повторяем его */}
          {topups.map((p) => (
            <span key={p.id}>{p.title.includes(String(p.credits)) ? p.title : `${p.title}: ${credits(p.credits)}`} — {won(p.price_krw)}</span>
          ))}
        </div>
      )}
      {wa && <a className="btn ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Спросить менеджера в WhatsApp</a>}
    </div>
  );
};
