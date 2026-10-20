// Семейство Pulse Grid (пакет KOK_handoff_v1, доска design/boards/02_pulse_grid.png, PDF с. 9–15).
// Крем, вино и почти чёрный; наклонные курсивные заголовки (Exo 2 800 italic), смещённая сетка и
// скошенные винные плоскости. Наклон — лёгкий поворот строк (−5°), как на доске; фото не наклоняем,
// кроме второго окна экстерьера — там лёгкий поворот и есть композиция.
//
// Форматы (21.10): нарисовано на 4:5 (1080×1350). «Классика» 9:16 — та же вёрстка в середине кадра
// (FamilyCarousel). Квадрат 1:1 — вертикаль от высоты слайда h: координаты доски через y(), верхний
// предел кегля крупных масс — × k (scale в kit.tsx; при h = 1350 оба ничего не меняют, 4:5 совпал
// пиксель в пиксель). «Галерея» и «История» квадратных форматов — общие FamilyGallery / FamilyHistory.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD} from '../../shared/ui';
import {LogoCorner, Photo, fitW, kmNumber, photosOf, splitLast, upper, type FamilySlideProps, scale} from './kit';

// Exo 2 800 курсив заглавными — около 0,62 кегля на знак
const K = .62;
const tilt = (deg = -5): React.CSSProperties => ({transform: `rotate(${deg}deg)`, transformOrigin: 'left center'});
const head = (size: number, color: string): React.CSSProperties =>
  ({fontFamily: HEAD, fontWeight: 800, fontStyle: 'italic', fontSize: size, lineHeight: .92, color, whiteSpace: 'nowrap'});
const spaced = (size: number, color: string): React.CSSProperties => ({fontFamily: BODY, fontWeight: 600, fontSize: size, letterSpacing: size * .3, color});

const Cover: React.FC<FamilySlideProps> = ({car, ru, colors, h}) => {
  const {y, k} = scale(h);
  const brand = upper(car.brand);
  const model = upper(car.model || car.brand);
  const km = kmNumber(car.mileageKm, ru);
  const year = car.year ? String(car.year) : '';
  return <AbsoluteFill style={{background: colors.light}}>
    {/* Винный косой штрих в правом верхнем углу */}
    <div style={{position: 'absolute', right: 40, top: -40, width: 40, height: y(230), background: colors.accent, transform: 'skewX(-14deg)'}} />
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 44, top: y(120), ...tilt()}}>
      {brand && brand !== model && <div style={head(fitW(brand, 860, 190 * k, 80, K), colors.text)}>{brand}</div>}
      <div style={head(fitW(model, 640, 190 * k, 80, K), colors.accent)}>{model}</div>
    </div>
    {year && <div style={{position: 'absolute', right: 56, top: y(330), textAlign: 'right'}}>
      <div style={head(70, colors.text)}>{year}</div>
      <div style={{height: 6, background: colors.accent, marginTop: 8}} />
    </div>}
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(470), height: y(560), borderRadius: 40}} position="45% 62%" />
    {/* Нижняя скошенная винная плоскость с пробегом */}
    {km && <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: y(300), background: colors.accent, clipPath: 'polygon(0 22%, 100% 0, 100% 100%, 0 100%)'}}>
      <div style={{position: 'absolute', left: 50, bottom: 50, display: 'flex', alignItems: 'baseline', gap: 18, ...tilt(-4)}}>
        <span style={head(fitW(km, 700, 170 * k, 80, K), colors.light)}>{km}</span>
        <span style={{...head(60, colors.light), borderBottom: `5px solid ${colors.light}`}}>{ru ? 'КМ' : 'KM'}</span>
      </div>
    </div>}
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const {first, last} = splitLast(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 50, top: y(130), ...tilt()}}>
      {first && <div style={head(fitW(first, 820, 120 * k, 60, K), colors.text)}>{first}</div>}
      <div style={head(fitW(last, 900, 190 * k, 80, K), colors.accent)}>{last}</div>
    </div>
    {/* Винная плоскость справа — сетка смещена за фото */}
    {/* Заголовок в одно слово — фото выше, без пустоты под ним */}
    <div style={{position: 'absolute', right: 0, top: first ? y(560) : y(450), width: 300, bottom: 0, background: colors.accent, clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0 100%)'}} />
    <Photo src={p.exterior[0]} style={{left: 30, right: 70, top: first ? y(440) : y(330), height: first ? y(520) : y(600), borderRadius: 40}} />
    <Photo src={p.exterior[1] ?? p.exterior[0]} style={{left: 90, width: 560, top: y(1010), height: y(300), borderRadius: 32, transform: 'rotate(-3deg)', boxShadow: '0 16px 40px #0003'}} />
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y} = scale(h);
  const p = photosOf(car);
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    <Photo src={p.interior[0]} style={{left: 30, right: 30, top: y(120), height: y(680), borderRadius: 40}} />
    {label && <div style={{position: 'absolute', left: 30, top: y(150), zIndex: 3, background: colors.accent, padding: '18px 44px 22px', borderRadius: '0 24px 24px 0',
      ...tilt(-5)}}><span style={head(fitW(label, 520, 96, 50, K), colors.light)}>{label}</span></div>}
    <Photo src={p.interior[1] ?? p.interior[0]} style={{left: 30, width: 495, top: y(830), bottom: 30, borderRadius: 32}} />
    <Photo src={p.interior[2] ?? p.interior[1] ?? p.interior[0]} style={{right: 30, width: 495, top: y(830), bottom: 30, borderRadius: 32}} />
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors, h}) => {
  const {y, k} = scale(h);
  const p = photosOf(car);
  const year = car.year ? String(car.year) : '';
  const km = kmNumber(car.mileageKm, ru);
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  const unit = (t: string, color: string) => <span style={{...head(56, color), borderBottom: `4px solid ${colors.accent}`, marginLeft: 20}}>{t}</span>;
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 44, top: y(130), ...tilt()}}>
      {year && <div style={{display: 'flex', alignItems: 'baseline'}}><span style={head(210, colors.accent)}>{year}</span>{unit(ru ? 'ГОД' : 'YEAR', colors.text)}</div>}
      {km && <div style={{display: 'flex', alignItems: 'baseline'}}><span style={head(fitW(km, 700, 200 * k, 90, K), colors.text)}>{km}</span>{unit(ru ? 'КМ' : 'KM', colors.text)}</div>}
    </div>
    {rows.length > 0 && <div style={{position: 'absolute', left: 50, right: 50, top: y(650), display: 'flex', gap: 50}}>
      {rows.map((r) => <div key={r} style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <span style={{width: 74, height: 74, borderRadius: '50%', background: colors.accent, flex: 'none'}} />
        <span style={{...head(fitW(r, 300, 52, 32, K), colors.text), borderBottom: `4px solid ${colors.accent}`}}>{r}</span>
      </div>)}
    </div>}
    <div style={{position: 'absolute', right: 0, bottom: 0, width: 520, height: y(620), background: colors.accent, clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0 100%)'}} />
    <Photo src={p.detail} style={{left: 30, right: 120, top: y(790), bottom: 30, borderRadius: 40}} />
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  // data-band-top — цвет полосы над вёрсткой в 9:16 (FamilyCarousel): сверху тёмная плоскость
  return <AbsoluteFill style={{background: colors.light}} data-band-top={colors.text}>
    {/* Сумма в крупной наклонной тёмной плоскости сверху */}
    <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: y(560), background: colors.text, clipPath: 'polygon(0 0, 100% 0, 100% 78%, 0 100%)'}} />
    <LogoCorner on={colors.text} />
    <div style={{position: 'absolute', left: 50, right: 50, top: y(150), ...tilt(-4)}}>
      <div style={head(fitW(price, 960, 230 * k, 90, K), colors.light)}>{price}</div>
      {label && <div style={{display: 'flex', alignItems: 'center', gap: 24, marginTop: 22}}>
        <span style={spaced(label.length > 26 ? 22 : 28, colors.light)}>{label}</span>
        <span style={{flex: 1, height: 6, background: colors.accent}} />
      </div>}
    </div>
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(610), bottom: 30, borderRadius: 40}} />
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const {first, last} = splitLast(content.title);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  return <AbsoluteFill style={{background: colors.light}}>
    <div style={{position: 'absolute', right: 40, top: -40, width: 40, height: y(230), background: colors.accent, transform: 'skewX(-14deg)'}} />
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 44, top: y(130), ...tilt()}}>
      {first && <div style={head(fitW(first, 900, 150 * k, 60, K), colors.text)}>{first}</div>}
      <div style={head(fitW(last, 900, 170 * k, 70, K), colors.accent)}>{last}</div>
    </div>
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(470), height: c ? y(520) : y(780), borderRadius: 40}} />
    {c && <div style={{position: 'absolute', left: 30, right: 30, bottom: 30, height: y(290), borderRadius: 40, background: colors.accent, color: colors.light,
      display: 'flex', alignItems: 'center', gap: 34, padding: '0 50px'}}>
      <div style={{flex: 1, minWidth: 0}}>
        {c.label && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, opacity: .85}}>{c.label}</div>}
        <div style={head(fitW(c.value, 720, 72, 40, .55), colors.light)}>{c.value} →</div>
        {caption && <div style={{...spaced(caption.length > 48 ? 18 : 22, colors.light), marginTop: 18, lineHeight: 1.4, whiteSpace: 'normal'}}>{caption}</div>}
      </div>
    </div>}
  </AbsoluteFill>;
};

export const PULSE_GRID_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, price: Price, cta: Cta,
};
