// Семейство Wide Form (пакет KOK_handoff_v1, доска design/boards/03_wide_form.png, PDF с. 16–22).
// Графит, крем и оранжевый; растянутый шрифт (Unbounded 800) и плавные изогнутые границы между
// фото и плоскостями. Изгибы — эллиптические подложки за фото (border-radius в процентах), без
// SVG-масок: так фото остаётся целым кадром с окружением.
//
// Форматы (21.10): нарисовано на 4:5 (1080×1350). «Классика» 9:16 — та же вёрстка в середине кадра
// (FamilyCarousel). Квадрат 1:1 — вертикаль от высоты слайда h: координаты доски через y(), верхний
// предел кегля крупных масс — × k (scale в kit.tsx; при h = 1350 оба ничего не меняют, 4:5 совпал
// пиксель в пиксель). «Галерея» и «История» квадратных форматов — общие FamilyGallery / FamilyHistory.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD} from '../../shared/ui';
import {LogoCorner, Photo, fitW, kmNumber, photosOf, splitLast, upper, type FamilySlideProps, scale} from './kit';

// Unbounded 800 заглавными — очень широкий: около 0,86 кегля на знак (замер 21.10: при 0,78
// «ЭКСТЕРЬЕР» и «67 842 KM» упирались в край слайда)
const K = .86;
const head = (size: number, color: string): React.CSSProperties =>
  ({fontFamily: HEAD, fontWeight: 800, fontSize: size, lineHeight: .95, color, whiteSpace: 'nowrap', letterSpacing: -size * .02});

/** Логотип и тонкая линия вправо от него (на доске — «KOK ———») */
const Head: React.FC<{on: string; line: string}> = ({on, line}) => <>
  <LogoCorner on={on} />
  <div style={{position: 'absolute', left: 300, right: 60, top: 62, height: 2, background: line, opacity: .7}} />
</>;

/** Модель двумя цветами: буквы — кремом, с первой цифры — оранжевым («A» + «8» на доске) */
const TwoTone: React.FC<{text: string; size: number; a: string; b: string}> = ({text, size, a, b}) => {
  const at = text.search(/\d/);
  return <div style={head(size, a)}>{at > 0 ? <>{text.slice(0, at)}<span style={{color: b}}>{text.slice(at)}</span></> : text}</div>;
};

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors, h}) => {
  const {y, k} = scale(h);
  const brand = upper(car.brand);
  const model = upper(car.model || car.brand);
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    <div style={{position: 'absolute', left: 44, right: 44, top: y(110)}}>
      {brand && brand !== model && <div style={head(fitW(brand, 420, 66, 36, K), colors.text)}>{brand}</div>}
      <TwoTone text={model} size={fitW(model, 990, 250 * k, 90, K)} a={colors.text} b={colors.accent} />
    </div>
    <Photo src={car.photos.hero} style={{left: 0, right: 0, top: y(420), height: y(640)}} position="45% 62%" />
    {/* Нижняя светлая полоса с плавным изгибом и оранжевой кромкой */}
    <div style={{position: 'absolute', left: -120, right: -120, top: y(960), bottom: -200, background: colors.accent, borderRadius: '50% 50% 0 0 / 22% 22% 0 0'}} />
    <div style={{position: 'absolute', left: -120, right: -120, top: y(985), bottom: -200, background: colors.light, borderRadius: '50% 50% 0 0 / 22% 22% 0 0'}} />
    {(year || km) && <div style={{position: 'absolute', left: 60, right: 60, bottom: 70, display: 'flex', alignItems: 'center', gap: 40}}>
      {year && <div style={head(96, colors.bg)}>{year}</div>}
      {year && km && <div style={{width: 4, height: y(120), background: colors.bg}} />}
      {km && <div style={head(fitW(km, 520, 90, 40, K), colors.bg)}>{km}</div>}
    </div>}
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const {first, last} = splitLast(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    <div style={{position: 'absolute', left: 44, right: 44, top: y(110)}}>
      {first && <div style={head(fitW(first, 990, 130 * k, 60, K), colors.text)}>{first}</div>}
      <div style={head(fitW(last, 990, 150 * k, 60, K), colors.accent)}>{last}</div>
    </div>
    {/* Изогнутая светлая кромка над задним ракурсом */}
    <div style={{position: 'absolute', left: -80, right: -80, top: y(410), height: y(700), background: colors.light, borderRadius: '50% 50% 0 0 / 14% 14% 0 0'}} />
    <Photo src={p.exterior[0]} style={{left: 0, right: 0, top: y(440), height: y(600), borderRadius: '50% 50% 0 0 / 12% 12% 0 0'}} />
    <div style={{position: 'absolute', left: 40, width: 600, top: y(1030), height: y(300), background: colors.accent, borderRadius: '0 160px 160px 0'}} />
    <Photo src={p.exterior[1] ?? p.exterior[0]} style={{left: 40, width: 560, top: y(1050), height: y(260), borderRadius: '40px 140px 140px 40px'}} />
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    {label && <div style={{position: 'absolute', left: 44, right: 44, top: y(110), ...head(fitW(label, 990, 210 * k, 34, K), colors.text)}}>{label}</div>}
    <Photo src={p.interior[0]} style={{left: 30, right: 30, top: y(360), bottom: 30, borderRadius: '48px 48px 48px 200px', border: `6px solid ${colors.light}`}} />
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const year = car.year ? String(car.year) : '';
  const km = kmNumber(car.mileageKm, ru);
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  const unit = (t: string) => <span style={{fontFamily: HEAD, fontWeight: 800, fontSize: 48, color: colors.text, marginLeft: 22}}>{t}</span>;
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    <div style={{position: 'absolute', left: 44, right: 44, top: y(110)}}>
      {year && <div style={{display: 'flex', alignItems: 'baseline'}}><span style={head(190, colors.text)}>{year}</span>{unit(ru ? 'ГОД' : 'YEAR')}</div>}
      {km && <div style={{display: 'flex', alignItems: 'baseline'}}><span style={head(fitW(km, 760, 190 * k, 80, K), colors.accent)}>{km}</span>{unit(ru ? 'КМ' : 'KM')}</div>}
    </div>
    {rows.length > 0 && <div style={{position: 'absolute', left: 50, right: 50, top: y(560), display: 'flex', alignItems: 'center', gap: 34}}>
      {rows.map((r, i) => <React.Fragment key={r}>
        {i > 0 && <div style={{width: 3, height: 70, background: colors.text, opacity: .5}} />}
        <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
          <span style={{width: 70, height: 70, borderRadius: 16, background: colors.accent, flex: 'none'}} />
          <span style={{fontFamily: BODY, fontWeight: 700, fontSize: fitW(r, 300, 40, 26, .62), color: colors.text}}>{r}</span>
        </div>
      </React.Fragment>)}
    </div>}
    <Photo src={p.interior[0] ?? p.detail} style={{left: 30, right: 30, top: y(680), bottom: 30, borderRadius: 48, border: `6px solid ${colors.light}`}} />
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    <div style={{position: 'absolute', left: 44, right: 44, top: y(110)}}>
      <div style={head(fitW(price, 990, 210 * k, 80, K * .92), colors.accent)}>{price}</div>
      {label && <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 34, color: colors.text, marginTop: 16, letterSpacing: 1}}>{label}</div>}
    </div>
    <div style={{position: 'absolute', left: -100, right: -100, top: y(470), height: y(200), background: colors.light, borderRadius: '50% 50% 0 0 / 60% 60% 0 0'}} />
    <Photo src={car.photos.hero} style={{left: 0, right: 0, top: y(520), bottom: 0, borderRadius: '50% 50% 0 0 / 10% 10% 0 0'}} />
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const {first, last} = splitLast(content.title);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  return <AbsoluteFill style={{background: colors.bg}}>
    <Head on={colors.bg} line={colors.text} />
    <div style={{position: 'absolute', left: 44, right: 44, top: y(110)}}>
      {first && <div style={head(fitW(first, 990, 130 * k, 50, K), colors.text)}>{first}</div>}
      <div style={head(fitW(last, 990, 140 * k, 50, K), colors.accent)}>{last}</div>
    </div>
    <div style={{position: 'absolute', left: -80, right: -80, top: y(430), height: y(560), background: colors.light, borderRadius: '50% 50% 50% 50% / 14% 14% 14% 14%'}} />
    <Photo src={car.photos.hero} style={{left: 0, right: 0, top: y(450), height: y(520), borderRadius: '50% 50% 50% 50% / 12% 12% 12% 12%'}} />
    {c && <div style={{position: 'absolute', left: 30, right: 30, top: y(1010), height: y(150), borderRadius: 75, background: colors.accent,
      display: 'flex', alignItems: 'center', padding: '0 20px 0 50px', gap: 20}}>
      <div style={{flex: 1, minWidth: 0, color: colors.bg}}>
        {c.label && <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 28}}>{c.label}</div>}
        <div style={head(fitW(c.value, 640, 58, 34, .7), colors.bg)}>{c.value}</div>
      </div>
      <div style={{width: 110, height: y(110), borderRadius: '50%', background: colors.bg, color: colors.text, display: 'grid', placeItems: 'center',
        fontFamily: BODY, fontSize: 56}}>→</div>
    </div>}
    {caption && <div style={{position: 'absolute', left: 50, right: 50, top: y(1190), fontFamily: BODY, fontWeight: 700, fontSize: caption.length > 48 ? 26 : 32,
      color: colors.text, textAlign: 'center', lineHeight: 1.3}}>{caption}</div>}
  </AbsoluteFill>;
};

export const WIDE_FORM_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, price: Price, cta: Cta,
};
