// Семейство Urban Olive (пакет KOK_handoff_v1, доска design/boards/05_urban_olive.png, PDF с. 30–36).
// Тёмно-зелёный, крем и лайм; узкий шрифт (Oswald 700), цифры столбцом и контурные надписи,
// угловая скоба «L» и ступенчатые фото. Контур — обводкой шрифта (-webkit-text-stroke): Chrome
// рендера его рисует, а буквы остаются настоящим текстом.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD} from '../../shared/ui';
import {LogoCorner, Photo, fitW, kmNumber, photosOf, splitLast, upper, type FamilySlideProps} from './kit';

const head = (size: number, color: string): React.CSSProperties =>
  ({fontFamily: HEAD, fontWeight: 700, fontSize: size, lineHeight: .95, color, whiteSpace: 'nowrap'});
const outline = (size: number, color: string): React.CSSProperties =>
  ({...head(size, 'transparent'), WebkitTextStroke: `${Math.max(3, size * .025)}px ${color}`});
/** Вертикальная строка, читается снизу вверх */
const vertical: React.CSSProperties = {writingMode: 'vertical-rl', transform: 'rotate(180deg)'};

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors}) => {
  const brand = upper(car.brand);
  const model = upper(car.model || car.brand);
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={car.photos.hero} style={{left: 0, right: 0, top: 0, height: 880}} position="45% 62%" />
    <LogoCorner on={colors.bg} />
    <div style={{position: 'absolute', left: 44, top: 930, right: 420, height: 380, display: 'flex', alignItems: 'center', gap: 22}}>
      {brand && brand !== model && <div style={head(fitW(brand, 220, 64, 36, .55), colors.bg)}>{brand}</div>}
      <div style={outline(fitW(model, 400, 320, 110, .5), colors.bg)}>{model}</div>
    </div>
    {(year || km) && <div style={{position: 'absolute', right: 30, top: 930, width: 380, bottom: 30, borderRadius: 48, background: colors.bg,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 20, padding: '0 30px'}}>
      {year && <div style={head(140, colors.accent)}>{year}</div>}
      {year && km && <div style={{alignSelf: 'stretch', height: 3, background: colors.text, opacity: .5}} />}
      {km && <div style={head(fitW(km, 320, 64, 36, .5), colors.text)}>{km}</div>}
    </div>}
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const p = photosOf(car);
  const {first, last} = splitLast(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={p.exterior[0]} style={{left: 0, right: 0, top: 0, height: 700}} />
    <LogoCorner on={colors.bg} />
    <Photo src={p.exterior[1] ?? p.exterior[0]} style={{left: 30, width: 520, top: 730, bottom: 30, borderRadius: 40}} />
    {/* Минимальный заголовок справа и лаймовая черта под ним */}
    <div style={{position: 'absolute', left: 590, right: 40, top: 760, bottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
      {first && <div style={head(fitW(first, 450, 120, 50, .5), colors.bg)}>{first}</div>}
      <div style={head(fitW(last, 450, 140, 50, .5), colors.bg)}>{last}</div>
      <div style={{height: 16, borderRadius: 8, background: colors.accent, marginTop: 34, width: '85%'}} />
    </div>
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const p = photosOf(car);
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.bg}}>
    <LogoCorner on={colors.bg} />
    {/* Слово раздела столбцом, лаймом, и угловая скоба под ним */}
    {label && <div style={{position: 'absolute', left: 40, top: 150, bottom: 60, width: 230, display: 'flex', justifyContent: 'center', ...vertical}}>
      <div style={head(fitW(label, 1080, 230, 90, .5), colors.accent)}>{label}</div>
    </div>}
    <div style={{position: 'absolute', left: 40, bottom: 50, width: 70, height: 70, borderLeft: `10px solid ${colors.accent}`, borderBottom: `10px solid ${colors.accent}`}} />
    <Photo src={p.interior[0]} style={{left: 300, right: 30, top: 30, height: 630, borderRadius: 40, border: `5px solid ${colors.text}`}} />
    <Photo src={p.interior[1] ?? p.interior[0]} style={{left: 300, right: 30, top: 690, bottom: 30, borderRadius: 40, border: `5px solid ${colors.text}`}} />
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors}) => {
  const p = photosOf(car);
  const year = car.year ? String(car.year) : '';
  const km = kmNumber(car.mileageKm, ru);
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    {/* Пробег — архитектурный столбец слева, единица под ним */}
    {km && <div style={{position: 'absolute', left: 40, top: 150, bottom: 50, width: 230, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div style={{flex: 1, display: 'flex', justifyContent: 'center', ...vertical}}>
        <div style={head(fitW(km, 1000, 230, 100, .5), colors.bg)}>{km}</div>
      </div>
      <div style={{...head(72, colors.bg), marginTop: 16}}>{ru ? 'КМ' : 'KM'}</div>
    </div>}
    <div style={{position: 'absolute', left: 300, top: 120, bottom: 40, width: 3, background: colors.bg, opacity: .6}} />
    <div style={{position: 'absolute', left: 340, right: 40, top: 110, bottom: 40, display: 'flex', flexDirection: 'column', gap: 26}}>
      {year && <div><div style={head(200, colors.bg)}>{year}</div><div style={{fontFamily: BODY, fontWeight: 700, fontSize: 36, color: colors.bg}}>{ru ? 'ГОД' : 'YEAR'}</div></div>}
      <Photo src={p.detail} style={{position: 'relative', flex: 1, minHeight: 260, borderRadius: 36}} />
      {rows.map((r) => <div key={r} style={{display: 'flex', alignItems: 'center', gap: 24, borderTop: `3px solid ${colors.bg}33`, paddingTop: 20}}>
        <span style={{width: 76, height: 76, borderRadius: 18, background: colors.accent, flex: 'none'}} />
        <span style={head(fitW(r, 520, 84, 40, .5), colors.bg)}>{r}</span>
      </div>)}
    </div>
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoCorner on={colors.light} />
    <div style={{position: 'absolute', left: 44, right: 44, top: 130}}>
      <div style={head(fitW(price, 990, 250, 90, .5), colors.bg)}>{price}</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 28, marginTop: 20}}>
        <span style={{flex: 1, height: 16, borderRadius: 8, background: colors.accent}} />
        {label && <span style={{fontFamily: HEAD, fontWeight: 700, fontSize: 40, color: colors.bg}}>{label}</span>}
      </div>
    </div>
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: 500, bottom: 30, borderRadius: 40, border: `5px solid ${colors.bg}`}} />
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const model = upper(car.model || car.brand);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  const title = upper(content.title);
  return <AbsoluteFill style={{background: colors.bg}}>
    <LogoCorner on={colors.bg} />
    {/* Слева — модель контуром столбцом, справа фото и лаймовая плоскость с вопросом */}
    <div style={{position: 'absolute', left: 30, top: 150, bottom: 40, width: 220, display: 'flex', justifyContent: 'center', ...vertical}}>
      <div style={outline(fitW(model, 1100, 260, 90, .5), colors.accent)}>{model}</div>
    </div>
    <Photo src={car.photos.hero} style={{left: 280, right: 0, top: 0, height: 650}} />
    <div style={{position: 'absolute', left: 280, right: 0, top: 650, bottom: 0, background: colors.accent, padding: '50px 46px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fitW(title, 1500, 110, 56, .5), lineHeight: 1, color: colors.bg}}>{title}</div>
      {c && <div style={{borderRadius: 60, background: colors.bg, color: colors.text, padding: '20px 36px', display: 'flex', alignItems: 'center', gap: 20}}>
        <div style={{flex: 1, minWidth: 0}}>
          {c.label && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 26, opacity: .8}}>{c.label}</div>}
          <div style={head(fitW(c.value, 520, 60, 34, .5), colors.text)}>{c.value}</div>
        </div>
        <span style={{fontFamily: BODY, fontSize: 56, color: colors.accent}}>→</span>
      </div>}
      {caption && <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: caption.length > 48 ? 28 : 34, color: colors.bg, lineHeight: 1.25}}>{caption}</div>}
    </div>
  </AbsoluteFill>;
};

export const URBAN_OLIVE_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, history: Facts, price: Price, cta: Cta,
};
