// Семейство Contour Plum (пакет KOK_handoff_v1, доска design/boards/06_contour_plum.png, PDF с. 37–43).
// Слива, лаванда и светлый; мягкий квадратный шрифт (Rubik 800), контурный номер слайда у края
// экстерьера, скруглённые ленты и плашки. Контур — обводкой шрифта (-webkit-text-stroke), как у
// Urban Olive: буквы остаются текстом.
//
// Форматы (21.10): нарисовано на 4:5 (1080×1350). «Классика» 9:16 — та же вёрстка в середине кадра
// (FamilyCarousel). Квадрат 1:1 — вертикаль от высоты слайда h: координаты доски через y(), верхний
// предел кегля крупных масс — × k (scale в kit.tsx; при h = 1350 оба ничего не меняют, 4:5 совпал
// пиксель в пиксель). «Галерея» и «История» квадратных форматов — общие FamilyGallery / FamilyHistory.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD} from '../../shared/ui';
import {LogoCorner, Photo, fitW, kmNumber, photosOf, splitLast, upper, type FamilySlideProps, scale} from './kit';

// Rubik 800 заглавными — около 0,68 кегля на знак
const K = .68;
const head = (size: number, color: string): React.CSSProperties =>
  ({fontFamily: HEAD, fontWeight: 800, fontSize: size, lineHeight: .92, color, whiteSpace: 'nowrap'});

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors, h}) => {
  const {y, k} = scale(h);
  const brand = upper(car.brand);
  const model = upper(car.model || car.brand);
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  return <AbsoluteFill style={{background: colors.bg}}>
    {/* Лавандовая плоскость снизу с крупным скруглением — за моделью */}
    <div style={{position: 'absolute', left: 0, right: 0, top: y(600), bottom: 0, background: colors.accent, borderTopLeftRadius: 140}} />
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: 30, height: y(620), borderRadius: 56}} position="45% 62%" />
    <LogoCorner on={colors.bg} left={60} top={56} />
    <div style={{position: 'absolute', left: 50, right: 50, top: y(690), textAlign: 'center'}}>
      {brand && brand !== model && <div style={head(fitW(brand, 980, 190 * k, 70, K), colors.bg)}>{brand}</div>}
      <div style={head(fitW(model, 980, 230 * k, 80, K), colors.text)}>{model}</div>
    </div>
    {(year || km) && <div style={{position: 'absolute', left: 50, right: 50, bottom: 46, height: y(110), borderRadius: 55, background: colors.bg, color: colors.text,
      display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontFamily: HEAD, fontWeight: 800}}>
      {year && <span style={{fontSize: 58}}>{year}</span>}
      {year && km && <span style={{width: 3, height: 50, background: colors.text, opacity: .6}} />}
      {km && <span style={{fontSize: fitW(km, 440, 58, 34, K)}}>{km}</span>}
    </div>}
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, index, colors, h}) => {
  const {y} = scale(h);
  const p = photosOf(car);
  const {first, last} = splitLast(content.kicker ?? content.title);
  const title = [first, last].filter(Boolean);
  return <AbsoluteFill style={{background: colors.bg}}>
    <LogoCorner on={colors.bg} />
    {/* Контурный номер слайда столбцом у левого края (на доске «02») */}
    <div style={{position: 'absolute', left: 40, top: y(150), bottom: 40, width: 230, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', alignItems: 'center'}}>
      {String(index).padStart(2, '0').split('').map((d, i) => <div key={i} style={{...head(470, 'transparent'), lineHeight: .8, WebkitTextStroke: `6px ${colors.accent}`}}>{d}</div>)}
    </div>
    <Photo src={p.exterior[0]} style={{left: 300, right: 30, top: 30, height: y(470), borderRadius: 48}} />
    <Photo src={p.exterior[1] ?? p.exterior[0]} style={{left: 300, right: 30, top: y(530), height: y(470), borderRadius: 48}} />
    <div style={{position: 'absolute', left: 300, right: 30, top: y(1030), bottom: 30, borderRadius: 48, background: colors.accent,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 30px'}}>
      {title.map((t) => <div key={t} style={head(fitW(t, 680, 96, 44, K), colors.bg)}>{t}</div>)}
    </div>
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    <Photo src={p.interior[0]} style={{left: 30, width: 495, top: y(130), height: y(830), borderRadius: 48}} />
    <Photo src={p.interior[1] ?? p.interior[0]} style={{right: 30, width: 495, top: y(130), height: y(830), borderRadius: 48}} />
    {label && <div style={{position: 'absolute', left: 30, right: 30, top: y(990), bottom: 30, borderRadius: 60, background: colors.accent,
      display: 'grid', placeItems: 'center'}}><span style={head(fitW(label, 940, 220 * k, 34, K), colors.bg)}>{label}</span></div>}
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const year = car.year ? String(car.year) : '';
  const km = kmNumber(car.mileageKm, ru);
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  return <AbsoluteFill style={{background: colors.accent}}>
    <LogoCorner on={colors.accent} />
    {/* Год и пробег по диагонали: год слева сверху, пробег справа снизу; тёмная полоса техники между */}
    {year && <div style={{position: 'absolute', left: 44, top: y(140)}}>
      <div style={head(230, colors.bg)}>{year}</div>
      <div style={{fontFamily: HEAD, fontWeight: 800, fontSize: 56, color: colors.bg, marginTop: 6}}>{ru ? 'ГОД' : 'YEAR'}</div>
    </div>}
    <Photo src={p.detail} style={{right: 30, top: y(130), width: 300, height: y(360), borderRadius: 44, border: `5px solid ${colors.text}`}} />
    {rows.length > 0 && <div style={{position: 'absolute', left: -40, right: -40, top: y(560), height: y(170), background: colors.bg, transform: 'rotate(-5deg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 50, color: colors.text}}>
      {rows.map((r, i) => <React.Fragment key={r}>
        {i > 0 && <span style={{width: 4, height: 80, background: colors.text, opacity: .6}} />}
        <span style={head(fitW(r, 400, 70, 36, K), colors.text)}>{r}</span>
      </React.Fragment>)}
    </div>}
    {km && <div style={{position: 'absolute', left: 44, right: 44, bottom: 60, textAlign: 'right'}}>
      <div style={head(fitW(km, 990, 250 * k, 100, K), colors.text)}>{km}</div>
      <div style={{fontFamily: HEAD, fontWeight: 800, fontSize: 84, color: colors.bg, lineHeight: 1}}>{ru ? 'КМ' : 'KM'}</div>
    </div>}
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  return <AbsoluteFill style={{background: colors.bg}}>
    <Photo src={car.photos.exterior[1] ?? car.photos.hero} style={{left: 30, right: 30, top: 30, height: y(760), borderRadius: 56, border: `6px solid ${colors.accent}`}} />
    <LogoCorner on={colors.bg} left={60} top={56} />
    <div style={{position: 'absolute', left: 30, right: 30, top: y(830), bottom: 30, borderRadius: 56, background: colors.bg,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 30}}>
      <div style={head(fitW(price, 980, 230 * k, 90, K), colors.text)}>{price}</div>
      {label && <div style={{borderRadius: 50, background: colors.accent, padding: '18px 44px', fontFamily: HEAD, fontWeight: 800,
        fontSize: fitW(label, 860, 56, 28, K), color: colors.bg, whiteSpace: 'nowrap'}}>{label}</div>}
    </div>
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const {first, last} = splitLast(content.title);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  return <AbsoluteFill style={{background: colors.light}}>
    {/* Лавандовый изгиб справа сверху, как на доске */}
    {/* Узкий — лавандовый вопрос не должен ложиться на лавандовый изгиб (проба 21.10: «?» пропадал) */}
    <div style={{position: 'absolute', right: -40, top: -40, width: 150, height: y(420), background: colors.accent, borderRadius: '0 0 0 140px'}} />
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 30, right: 40, top: 60, bottom: 40, display: 'flex', flexDirection: 'column', gap: 26}}>
      <div style={{marginTop: 70, marginRight: 110}}>
        {first && <div style={head(fitW(first, 880, 170 * k, 60, K), colors.bg)}>{first}</div>}
        <div style={head(fitW(last, 880, 180 * k, 60, K), colors.accent)}>{last}</div>
      </div>
      <Photo src={car.photos.rear ?? car.photos.hero} style={{position: 'relative', flex: 1, minHeight: 260, borderRadius: 56}} />
      {c && <div style={{flex: 'none', height: y(140), borderRadius: 70, background: colors.bg, color: colors.text,
        display: 'flex', alignItems: 'center', padding: '0 22px 0 48px', gap: 20}}>
        <div style={{flex: 1, minWidth: 0}}>
          {c.label && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 28, opacity: .8}}>{c.label}</div>}
          <div style={head(fitW(c.value, 680, 62, 36, K), colors.text)}>{c.value}</div>
        </div>
        <div style={{width: 100, height: y(100), borderRadius: '50%', background: colors.accent, color: colors.bg, display: 'grid', placeItems: 'center',
          fontFamily: BODY, fontWeight: 700, fontSize: 52}}>›</div>
      </div>}
      {caption && <div style={{flex: 'none', fontFamily: HEAD, fontWeight: 800, fontSize: caption.length > 48 ? 26 : 32, color: colors.bg,
        textAlign: 'center', lineHeight: 1.3}}>{caption}</div>}
    </div>
  </AbsoluteFill>;
};

export const CONTOUR_PLUM_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, price: Price, cta: Cta,
};
