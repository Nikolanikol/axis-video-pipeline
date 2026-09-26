// Новые форматы карусели: слайд — тип из библиотеки, формат — список типов и размер кадра.
//
// Реестр форматов — config/carousel-formats.json. Типы слайдов ниже; у части из них по два
// варианта компоновки, и вариант, как и фразы, выбирается зерном карусели: кнопка
// «Другой вариант» пересобирает ту же машину по-другому, а пересборка с тем же зерном
// даёт те же слайды.
//
// Фото — только реальные снимки Encar. Сгенерированные «студийные» кадры из образцов не
// делаем намеренно: покупатель приехал бы за другой машиной. Опции на слайдах — только
// из данных этой машины, с иконками как на kmotors.shop.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {TbBolt, TbGauge, TbManualGearbox} from 'react-icons/tb';
import type {CarouselProps} from '../../shared/types';
import {BODY, HEAD, radius, useTheme} from '../../shared/ui';
import {COPY, fill, pick} from '../i18n/copy';
import type {CarouselText} from '../i18n';
import {
  BOTTOM, CONTACT_ICONS, Fade, Frame, Grid2, Headline, Icon, IconCard, IconRow, Lead, PAD, Shot, Stat, TOP,
  benefitIcon, optionIcon, useTall,
} from './Kit';
import {OPTION_CODE} from '../i18n/option-icons.generated';

// Опции кузова: у шлюза они разбросаны по «комфорту» и «технике», а на слайде экстерьера
// нужны именно они. Коды Encar: люк, фары HID/LED, диски, рейлинги, зеркала, багажник, доводчики
const EXTERIOR_CODES = new Set(['010', '029', '075', '017', '062', '024', '059', '080']);

type IconType = React.ComponentType<{size?: number | string; color?: string; strokeWidth?: number}>;

export type DeckProps = CarouselProps & {slides: string[]; seed: number; tx: CarouselText; brandName: string};
type Ctx = DeckProps & {index: number; total: number; photos: Photos; vars: Record<string, string>};
type Photos = {hero: string | null; exterior: string | null; interior: string | null; dashboard: string | null;
  rear: string | null; engine: string | null; gallery: string[]; details: string[]};

/**
 * Раскладка фото по слайдам без повторов, пока хватает кадров: у Encar их 20–30, и одна и
 * та же картинка на трёх слайдах подряд выглядела бы как нехватка материала.
 */
const pickPhotos = (car: CarouselProps['car']): Photos => {
  const p = car.photos;
  const used = new Set<string>();
  const take = (...list: (string | null | undefined)[]) => {
    const found = list.find((u): u is string => Boolean(u) && !used.has(u as string)) ?? null;
    if (found) used.add(found);
    return found;
  };
  const hero = take(p.hero, ...p.exterior);
  const rear = take(p.rear, ...p.exterior);
  const interior = take(p.interiorShot, ...p.interior);
  const dashboard = take(p.dashboard, ...p.interior);
  const exterior = take(...p.exterior);
  // «Прочие» фото Encar — что угодно, от сидений до документов; под двигатель берём ещё
  // один ракурс кузова: он честно показывает машину, а случайный кадр — нет
  const engine = take(...p.exterior, ...p.other);
  const rest = [...p.exterior, ...p.interior, ...p.other].filter((u) => !used.has(u));
  const details = rest.slice(0, 4);
  const gallery = [hero, rest[4] ?? exterior, rest[5] ?? interior, rest[6] ?? rear].filter(Boolean) as string[];
  return {hero, exterior, interior, dashboard, rear, engine, gallery, details};
};

/**
 * Опции для ряда значков: с разными иконками. У шлюза первыми идут вентиляция водителя,
 * пассажира, задних сидений — три одинаковых значка подряд читаются как ошибка вёрстки.
 * Одинаковые по иконке опции отодвигаются в конец, а не выбрасываются: если других нет,
 * лучше повтор, чем пустое место.
 */
const optionItems = (names: string[], tx: CarouselText, n: number) => {
  const seen = new Set<unknown>();
  const first: string[] = [];
  const later: string[] = [];
  for (const en of names) {
    const icon = optionIcon(en);
    (seen.has(icon) ? later : first).push(en);
    seen.add(icon);
  }
  return [...first, ...later].slice(0, n).map((en) => ({icon: optionIcon(en), text: tx.option(en)}));
};

// ——— Слайды ———

const Cover: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const tall = useTall();
  const copy = COPY[c.tx.lang].cover;
  const {car, tx} = c;
  const sub = [car.grade, car.trim, tx.value(car.fuel), car.year].filter(Boolean).join(' ');
  const variant = pick(['side', 'full'], c.seed, 'cover');
  const benefits = pick(copy.benefits, c.seed, 'cover-b').map((b) => ({icon: benefitIcon(b.icon), text: b.text}));
  return (
    <Frame section={pick(copy.tagline, c.seed, 'cover-t')} index={c.index} total={c.total}>
      {variant === 'full'
        ? <><Shot src={c.photos.hero} style={{position: 'absolute', inset: 0}} veil={0} /><Fade to="top" /><Fade to="bottom" strength={0.95} /></>
        : <Shot src={c.photos.hero} style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%'}} sink={0.95} />}
      <div style={{position: 'absolute', top: TOP + 10, left: PAD, right: PAD}}>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: tall ? 116 : 104, lineHeight: 1, color: C.white}}>{car.brand}</div>
        <Headline text={`{${car.model}}`} size={tall ? 116 : 104} style={{lineHeight: 1}} />
        {sub && <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: tall ? 46 : 40, color: C.white, marginTop: 20, maxWidth: 760, lineHeight: 1.2}}>{sub}</div>}
      </div>
      <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 8}}>
        {variant === 'side'
          ? <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 22, letterSpacing: 6, textTransform: 'uppercase', color: C.white, opacity: 0.8}}>
            {pick(copy.strap, c.seed, 'cover-s')}</div>
          : <IconRow items={benefits} size={46} />}
      </div>
    </Frame>
  );
};

/** Раздел с фото и опциями: экстерьер и салон устроены одинаково, различаются набором */
const Section: React.FC<Ctx & {kind: 'exterior' | 'interior'}> = (c) => {
  const tall = useTall();
  const copy = COPY[c.tx.lang][c.kind];
  const comfort = c.car.options.comfort;
  const all = [...comfort, ...c.car.options.safety, ...c.car.options.other];
  const exteriorOpts = all.filter((o) => EXTERIOR_CODES.has(OPTION_CODE[o]));
  const opts = c.kind === 'exterior' ? exteriorOpts : comfort.filter((o) => !EXTERIOR_CODES.has(OPTION_CODE[o]));
  const photo = c.kind === 'exterior' ? (c.photos.exterior ?? c.photos.hero) : (c.photos.interior ?? c.photos.dashboard);
  const variant = pick(['band', 'tiles'], c.seed, c.kind);
  const tiles = c.kind === 'exterior' ? c.photos.details.slice(0, 3) : [];
  // Три, а не четыре и на вытянутом кадре: русские названия длинные, и четвёртая колонка
  // выходила в четыре строки
  const items = optionItems(opts, c.tx, 3);
  const photoTop = tall ? 470 : 420;
  return (
    <Frame section={pick(copy.kicker, c.seed, `${c.kind}-k`)} index={c.index} total={c.total}>
      <Shot src={photo} style={{position: 'absolute', left: 0, right: 0, top: photoTop, bottom: 0}} sink={0.95} />
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={fill(pick(copy.title, c.seed, `${c.kind}-t`), c.vars)} />
        <Lead>{fill(pick(copy.text, c.seed, `${c.kind}-x`), c.vars)}</Lead>
      </div>
      <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 10}}>
        {variant === 'tiles' && tiles.length === 3
          ? <div style={{display: 'flex', gap: 14}}>{tiles.map((t) => <Shot key={t} src={t} round={12} veil={0.6} style={{flex: 1, height: tall ? 230 : 180}} />)}</div>
          : items.length > 0 && <IconRow items={items} size={46} />}
      </div>
    </Frame>
  );
};

const Details: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const copy = COPY[c.tx.lang].details;
  const opts = optionItems([...c.car.options.comfort, ...c.car.options.safety], c.tx, 4).map((o) => o.text);
  const shots = c.photos.details;
  return (
    <Frame section={pick(copy.kicker, c.seed, 'det-k')} index={c.index} total={c.total}>
      <div style={{position: 'absolute', top: TOP, left: PAD, width: 420}}>
        <Headline text={pick(copy.title, c.seed, 'det-t')} size={64} />
        <div style={{marginTop: 34}}>
          {opts.map((o, i) => (
            <div key={o} style={{display: 'flex', gap: 18, alignItems: 'baseline', padding: '12px 0', borderTop: i ? `1px solid ${C.line}` : undefined}}>
              <span style={{fontFamily: HEAD, fontWeight: 600, fontSize: 26, color: C.copper}}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{fontFamily: BODY, fontWeight: 500, fontSize: 25, color: C.white, lineHeight: 1.3}}>{o}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{position: 'absolute', top: TOP, right: PAD, bottom: BOTTOM, width: 470, display: 'grid',
        gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14}}>
        {shots.map((s) => <Shot key={s} src={s} round={12} veil={0.6} style={{width: '100%', height: '100%'}} />)}
      </div>
    </Frame>
  );
};

const Engine: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const tall = useTall();
  const copy = COPY[c.tx.lang];
  const {car, tx} = c;
  const rows: {icon: IconType; value: string; label: string}[] = [
    {icon: TbBolt as IconType, value: tx.liters(car.displacementCc), label: tx.value(car.fuel) || copy.engineRows.fuel},
    {icon: TbManualGearbox as IconType, value: tx.value(car.transmission) || '—', label: copy.engineRows.transmission},
    {icon: TbGauge as IconType, value: tx.km(car.mileageKm), label: copy.engineRows.mileage},
  ];
  return (
    <Frame section={pick(copy.engine.kicker, c.seed, 'eng-k')} index={c.index} total={c.total}>
      <Shot src={c.photos.engine} style={{position: 'absolute', top: 0, bottom: 0, right: 0, width: '62%'}} focus="40% 70%" />
      <Fade to="left" />
      <div style={{position: 'absolute', top: TOP, left: PAD, width: 620}}>
        <Headline text={fill(pick(copy.engine.title, c.seed, 'eng-t'), c.vars)} />
        <Lead style={{maxWidth: 560}}>{pick(copy.engine.text, c.seed, 'eng-x')}</Lead>
        <div style={{marginTop: tall ? 56 : 40, display: 'flex', flexDirection: 'column', gap: tall ? 34 : 24}}>
          {rows.map((r) => (
            <div key={r.label} style={{display: 'flex', alignItems: 'center', gap: 26}}>
              <Icon icon={r.icon} size={52} />
              <div>
                <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: tall ? 48 : 42, color: C.white, lineHeight: 1.1}}>{r.value}</div>
                <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 22, color: C.grey}}>{r.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

const Safety: React.FC<Ctx> = (c) => {
  const copy = COPY[c.tx.lang].safety;
  const items = optionItems(c.car.options.safety, c.tx, 4);
  return (
    <Frame section={pick(copy.kicker, c.seed, 'saf-k')} index={c.index} total={c.total}>
      <Shot src={c.photos.dashboard} style={{position: 'absolute', inset: 0}} focus="50% 50%" veil={0} />
      <AbsoluteFill style={{background: `${useTheme().bg}d9`}} />
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={pick(copy.title, c.seed, 'saf-t')} />
        <Lead>{pick(copy.text, c.seed, 'saf-x')}</Lead>
      </div>
      <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 14}}>
        <Grid2>{items.map((it) => <IconCard key={it.text} icon={it.icon} text={it.text} />)}</Grid2>
      </div>
    </Frame>
  );
};

const History: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const tall = useTall();
  const h = c.car.history;
  const all = COPY[c.tx.lang];
  const copy = !h ? all.historyNone : h.accidentsTotal ? all.historyClaims : all.historyClean;
  const s = c.tx.s;
  return (
    <Frame section={pick(copy.kicker, c.seed, 'his-k')} index={c.index} total={c.total}>
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={pick(copy.title, c.seed, 'his-t')} />
        <Lead>{copy.text[0]}</Lead>
      </div>
      {h && (
        <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 14}}>
          <Grid2 gap={16}>{[
            <Stat key="c" value={String(h.accidentsTotal)} label={s.insuranceClaims} alarm={h.accidentsTotal > 0} />,
            <Stat key="o" value={String(h.ownerChanges)} label={s.ownerChangesLabel} />,
            <Stat key="t" value={String(h.theft)} label={s.theft} />,
            <Stat key="f" value={String(h.flood)} label={s.flood} />,
          ]}</Grid2>
          {tall && h.claims.length > 0 && (
            <div style={{marginTop: 22, fontFamily: BODY, fontWeight: 500, fontSize: 24, color: C.grey, lineHeight: 1.5}}>
              {h.claims.slice(0, 3).map((cl) => `${cl.date}: ${c.tx.krw(cl.payoutKrw)}`).join('  ·  ')}
            </div>
          )}
        </div>
      )}
    </Frame>
  );
};

const Rear: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const copy = COPY[c.tx.lang].rear;
  return (
    <Frame section={pick(copy.kicker, c.seed, 'rear-k')} index={c.index} total={c.total}>
      <Shot src={c.photos.rear} style={{position: 'absolute', left: 0, right: 0, top: 330, bottom: 0}} sink={0.9} />
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={fill(copy.title[0], c.vars)} size={72} />
        <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 34, color: C.white, marginTop: 12}}>{pick(copy.text, c.seed, 'rear-x')}</div>
      </div>
    </Frame>
  );
};

const Gallery: React.FC<Ctx> = (c) => {
  const g = c.photos.gallery;
  return (
    <Frame section={pick(COPY[c.tx.lang].gallery.kicker, c.seed, 'gal-k')} index={c.index} total={c.total}>
      <div style={{position: 'absolute', top: TOP, bottom: BOTTOM, left: PAD, right: PAD, display: 'flex', gap: 16}}>
        <Shot src={g[0]} round={14} veil={0.75} style={{flex: 1.6, height: '100%'}} />
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 16}}>
          {g.slice(1, 4).map((s) => <Shot key={s} src={s} round={14} veil={0.6} style={{flex: 1, width: '100%'}} />)}
        </div>
      </div>
    </Frame>
  );
};

const Price: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const tall = useTall();
  const copy = COPY[c.tx.lang].price;
  const {car, tx} = c;
  return (
    <Frame section={pick(copy.kicker, c.seed, 'pr-k')} index={c.index} total={c.total}>
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={copy.title[0]} />
        <div style={{marginTop: tall ? 60 : 40, border: `3px solid ${C.copper}`, borderRadius: radius(C, 22),
          padding: tall ? '60px 40px' : '44px 40px', textAlign: 'center'}}>
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: tall ? 150 : 132, lineHeight: 1, color: C.white}}>{tx.usd(car.price?.usd)}</div>
          {car.price && <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 30, color: C.grey, marginTop: 14}}>{tx.krw(car.price.krw)}</div>}
        </div>
      </div>
      <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 10}}>
        {tx.s.priceNotes.map((n) => (
          <div key={n} style={{display: 'flex', gap: 16, alignItems: 'center', padding: '8px 0'}}>
            <span style={{width: 9, height: 9, borderRadius: radius(C, 5), background: C.copper, flexShrink: 0}} />
            <span style={{fontFamily: BODY, fontWeight: 500, fontSize: 26, color: C.white}}>{n}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
};

const Why: React.FC<Ctx> = (c) => {
  const copy = COPY[c.tx.lang].why;
  const items = pick(copy.benefits, c.seed, 'why-b');
  return (
    <Frame section={fill(pick(copy.kicker, c.seed, 'why-k'), c.vars)} index={c.index} total={c.total}>
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={pick(copy.title, c.seed, 'why-t')} />
      </div>
      <div style={{position: 'absolute', left: PAD, right: PAD, bottom: BOTTOM + 14}}>
        <Grid2>{items.map((b) => <IconCard key={b.text} icon={benefitIcon(b.icon)} text={b.text} style={{padding: '34px 26px'}} />)}</Grid2>
      </div>
    </Frame>
  );
};

const Cta: React.FC<Ctx> = (c) => {
  const C = useTheme();
  const tall = useTall();
  const copy = COPY[c.tx.lang].cta;
  const m = c.market;
  // Кнопка — тем мессенджером, который клиент отметил главным; нет его контакта — другим
  const telegram = m.telegram?.trim();
  const whatsapp = m.whatsapp?.trim();
  const channel = (m.contactPrimary === 'telegram' && telegram) || !whatsapp ? 'telegram' : 'whatsapp';
  const handle = channel === 'telegram' ? telegram : whatsapp;
  const guarantees = pick(copy.guarantees, c.seed, 'cta-g').map((g) => ({icon: benefitIcon(g.icon), text: g.text}));
  return (
    <Frame section={pick(copy.kicker, c.seed, 'cta-k')} index={c.index} total={c.total}>
      <Shot src={c.photos.rear ?? c.photos.hero} style={{position: 'absolute', right: 0, bottom: 0, width: '50%', height: tall ? '46%' : '42%'}} sink={0.9} />
      {/* Левый край фото уводим в фон: значки гарантий стоят рядом, не поверх */}
      <div style={{position: 'absolute', right: 0, bottom: 0, width: '50%', height: tall ? '46%' : '42%',
        background: `linear-gradient(to right, ${C.bg} 0%, ${C.bg}00 35%)`}} />
      <div style={{position: 'absolute', top: TOP, left: PAD, right: PAD}}>
        <Headline text={fill(pick(copy.title, c.seed, 'cta-t'), c.vars)} />
        <Lead>{pick(copy.text, c.seed, 'cta-x')}</Lead>
        {handle && (
          <div style={{marginTop: 34, display: 'inline-flex', alignItems: 'center', gap: 18, padding: '20px 40px',
            borderRadius: radius(C, 999), background: C.copper}}>
            <Icon icon={CONTACT_ICONS[channel]} size={40} color={C.bg} />
            <div>
              <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 28, color: C.bg}}>{copy.button[channel]}</div>
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 22, color: C.bg, opacity: 0.8}}>{handle}</div>
            </div>
          </div>
        )}
        {m.site && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 28, color: C.white, marginTop: 20}}>{m.site}</div>}
      </div>
      <div style={{position: 'absolute', left: PAD, width: 450, bottom: BOTTOM + 14}}>
        <IconRow items={guarantees} size={40} style={{marginLeft: -18}} />
      </div>
    </Frame>
  );
};

const SLIDES: Record<string, React.FC<Ctx>> = {
  cover: Cover,
  exterior: (c) => <Section {...c} kind="exterior" />,
  interior: (c) => <Section {...c} kind="interior" />,
  details: Details,
  engine: Engine,
  safety: Safety,
  history: History,
  rear: Rear,
  gallery: Gallery,
  price: Price,
  why: Why,
  cta: Cta,
};
export const DECK_SLIDES = Object.keys(SLIDES);

/** Один слайд колоды: frame — номер кадра композиции = номер слайда */
export const Deck: React.FC<DeckProps & {frame: number}> = ({frame, ...props}) => {
  const photos = pickPhotos(props.car);
  const total = props.slides.length;
  const i = Math.min(total - 1, Math.max(0, frame));
  const Slide = SLIDES[props.slides[i]] ?? Cover;
  const vars = {
    model: [props.car.brand, props.car.model].filter(Boolean).join(' '),
    brand: props.brandName,
    engine: props.tx.liters(props.car.displacementCc),
  };
  return <Slide {...props} index={i + 1} total={total} photos={photos} vars={vars} />;
};
