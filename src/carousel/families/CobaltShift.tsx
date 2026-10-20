// Семейство Cobalt Shift (пакет KOK_handoff_v1, доска design/boards/04_cobalt_shift.png, PDF с. 24–29).
// Шесть слайдов 1080×1350: обложка (фото сверху, синяя полоса с моделью, годом и пробегом),
// экстерьер (два фото и вертикальная надпись у правого края), салон (два фото и синяя плашка),
// факты (весь слайд синий, пробег — главный), цена (фото и синяя сумма на белом), контакты
// (прямой вопрос, фото и синяя полоса обращения). Логотип — в тёмной вкладке слева сверху.
//
// Пакет даёт намерение композиции, а не координаты: размеры ниже сняты с доски. Правила пакета:
// фото — целиком с окружением, без вырезки машины; нет данных — блок пропускается, а не
// заполняется выдумкой; длинное название ужимается кеглем, а не обрезается.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD, Logo} from '../../shared/ui';
import {H, Photo, W, fitW, upper, type FamilyColors, type FamilySlideProps} from './kit';

/** Вкладка с логотипом слева сверху — тёмная, со скруглённым нижним правым углом */
const LogoTab: React.FC<{colors: FamilyColors; flat?: boolean}> = ({colors, flat}) =>
  <div style={{position: 'absolute', left: 0, top: 0, zIndex: 3, padding: '26px 40px 24px 44px', background: flat ? 'transparent' : colors.bg,
    borderBottomRightRadius: 40, display: 'flex', alignItems: 'center'}}>
    <Logo asset="logoHorizontal" height={54} width={250} on={flat ? colors.accent : colors.bg} style={{textAlign: 'left', objectPosition: 'left'}} />
  </div>;


const Cover: React.FC<FamilySlideProps> = ({car, tx, colors}) => {
  const name = upper([car.brand, car.model].filter(Boolean).join(' '));
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  const side = Boolean(year || km);
  const nameW = side ? 640 : 960;
  return <AbsoluteFill style={{background: colors.accent}}>
    <Photo src={car.photos.hero} style={{left: 0, top: 0, width: W, height: 860, borderBottomLeftRadius: 56, borderBottomRightRadius: 56}} position="45% 60%" />
    <LogoTab colors={colors} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 860, bottom: 0, display: 'flex', alignItems: 'center', gap: 36}}>
      <div style={{flex: side ? 'none' : 1, width: nameW, fontFamily: HEAD, fontWeight: 700, color: '#fff', lineHeight: .95, whiteSpace: 'nowrap',
        fontSize: fitW(name, nameW, 210, 70, .52)}}>{name}</div>
      {side && <>
        <div style={{alignSelf: 'stretch', margin: '90px 0', width: 4, background: '#ffffffcc'}} />
        <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, fontFamily: HEAD, color: '#fff'}}>
          {year && <div style={{fontWeight: 700, fontSize: 118, lineHeight: 1}}>{year}</div>}
          {km && <div style={{fontWeight: 500, fontSize: fitW(km, 300, 66, 40, .5), lineHeight: 1, whiteSpace: 'nowrap'}}>{km}</div>}
        </div>
      </>}
    </div>
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const photos = [car.photos.rear, ...car.photos.exterior, car.photos.hero].filter(Boolean) as string[];
  const [a, b] = [photos[0], photos.find((p) => p !== photos[0]) ?? photos[0]];
  // Рубрика вертикально у правого края: последнее слово крупно, остальное мелко над ним
  // («С другого / РАКУРСА» на доске)
  const words = upper(content.kicker ?? content.title).split(/\s+/).filter(Boolean);
  const big = words.pop() ?? '';
  const small = words.join(' ');
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={a} style={{left: 0, top: 0, width: 760, height: 600, borderBottomRightRadius: 56}} />
    <Photo src={b} style={{left: 0, top: 640, width: 760, height: 670, borderTopRightRadius: 56, borderBottomRightRadius: 56}} />
    <LogoTab colors={colors} />
    {/* Вертикальная надпись читается снизу вверх: vertical-rl, повёрнутый на 180°. Первая строка
        (мелкая) — левее, конец текста — вверху, как на доске */}
    <div style={{position: 'absolute', left: 790, right: 36, top: 56, bottom: 56, display: 'flex', justifyContent: 'center',
      writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'end', fontFamily: HEAD, fontWeight: 700, lineHeight: .92}}>
      {small && <div style={{fontSize: 58, color: colors.bg, marginLeft: 8}}>{small}</div>}
      <div style={{fontSize: fitW(big, H - 120, 220, 90, .5), color: colors.accent, whiteSpace: 'nowrap'}}>{big}</div>
    </div>
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const pool = [car.photos.interiorShot, ...car.photos.interior, car.photos.dashboard].filter(Boolean) as string[];
  const a = pool[0], b = pool.find((p) => p !== a) ?? a;
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={a} style={{left: 28, top: 28, width: W - 56, height: 630, borderRadius: 44}} />
    <Photo src={b} style={{left: 28, top: 686, width: W - 56, height: 636, borderRadius: 44}} />
    <LogoTab colors={colors} />
    {label && <div style={{position: 'absolute', right: 52, top: 56, zIndex: 3, background: colors.accent, borderRadius: 32, padding: '14px 40px 18px',
      fontFamily: HEAD, fontWeight: 700, color: '#fff', fontSize: fitW(label, 520, 104, 56), lineHeight: 1}}>{label}</div>}
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors}) => {
  const year = car.year ? String(car.year) : '';
  // Разряды — как у остальных слайдов карусели на этом языке (обложка: «67,842 KM» / «67 842 км»)
  const km = car.mileageKm !== null ? new Intl.NumberFormat(ru ? 'ru-RU' : 'en-US').format(car.mileageKm).replace(/\s/g, ' ') : '';
  const engine = car.displacementCc ? `${(car.displacementCc / 1000).toFixed(1).replace('.', ru ? ',' : '.')} ${ru ? 'Л' : 'L'}` : '';
  const pair = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  const detail = car.photos.other[0] ?? car.photos.exterior[2] ?? car.photos.hero;
  // Главное число — пробег; нет пробега — объём двигателя; нет и его — год (факты не выдумываем)
  const main = km ? {v: km, unit: ru ? 'КМ' : 'KM'} : engine ? {v: engine, unit: ''} : null;
  const line = <div style={{height: 4, background: '#ffffffb3', margin: '0 60px'}} />;
  return <AbsoluteFill style={{background: colors.accent, color: '#fff', fontFamily: HEAD}}>
    <LogoTab colors={colors} flat />
    <div style={{position: 'absolute', left: 0, right: 0, top: 150, bottom: 70, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 40, padding: '0 60px'}}>
        <Photo src={detail} style={{position: 'relative', width: 560, height: 250, borderRadius: 40}} />
        {year && <div style={{flex: 1, textAlign: 'right'}}>
          <div style={{fontWeight: 700, fontSize: 150, lineHeight: .95}}>{year}</div>
          <div style={{fontWeight: 500, fontSize: 52}}>{ru ? 'ГОД' : 'YEAR'}</div>
        </div>}
      </div>
      {line}
      {main && <div style={{padding: '0 60px', display: 'flex', alignItems: 'flex-end', gap: 24}}>
        <div style={{fontWeight: 700, fontSize: fitW(main.v, 820, 300, 120, .5), lineHeight: .9}}>{main.v}</div>
        {main.unit && <div style={{fontWeight: 500, fontSize: 64, marginLeft: 'auto', lineHeight: 1}}>{main.unit}</div>}
      </div>}
      {line}
      {pair.length > 0 && <div style={{display: 'flex', padding: '0 60px', alignItems: 'center'}}>
        {pair.map((p, i) => <React.Fragment key={p}>
          {i > 0 && <div style={{width: 4, height: 110, background: '#ffffffb3', margin: '0 44px'}} />}
          <div style={{flex: 1, fontWeight: 700, fontSize: fitW(p, 420, 82, 44), textAlign: i ? 'right' : 'left'}}>{p}</div>
        </React.Fragment>)}
      </div>}
    </div>
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  return <AbsoluteFill style={{background: colors.light}}>
    <Photo src={car.photos.exterior[1] ?? car.photos.hero} style={{left: 0, top: 0, width: W, height: 820, borderBottomLeftRadius: 56, borderBottomRightRadius: 56}} />
    <LogoTab colors={colors} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 860, bottom: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, color: colors.accent, fontSize: fitW(price, 960, 250, 90, .5), lineHeight: 1}}>{price}</div>
      {label && <div style={{display: 'flex', alignItems: 'center', gap: 28, marginTop: 26}}>
        <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 38, color: colors.bg, letterSpacing: 1}}>{label}</div>
        <div style={{flex: 1, height: 4, background: colors.accent, opacity: .8}} />
      </div>}
    </div>
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors}) => {
  // Вопрос крупно; последнее слово — акцентом (на доске модель «A8» синим)
  const words = upper(content.title).split(/\s+/).filter(Boolean);
  const last = words.pop() ?? '';
  const title = upper(content.title);
  const size = fitW(title, 960 * 2.2, 170, 84, .5);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  // Столбиком: вопрос, фото забирает остаток высоты, полоса обращения и подпись. Подпись не
  // обрезается (пакет: смысл не режем) — до двух строк, кегль по длине
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoTab colors={colors} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 150, bottom: 60, display: 'flex', flexDirection: 'column', gap: 28}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, color: colors.bg, fontSize: size, lineHeight: .98}}>
        {words.join(' ')} <span style={{color: colors.accent}}>{last}</span>
      </div>
      <Photo src={car.photos.hero} style={{position: 'relative', flex: 1, minHeight: 240, borderRadius: 40}} />
      {c && <div style={{flex: 'none', height: 140, borderRadius: 40, background: colors.accent, color: '#fff',
        display: 'flex', alignItems: 'center', padding: '0 44px', gap: 24, fontFamily: HEAD}}>
        <div style={{flex: 1, minWidth: 0}}>
          {c.label && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, opacity: .85}}>{c.label}</div>}
          <div style={{fontWeight: 700, fontSize: fitW(c.value, 760, 70, 40), lineHeight: 1.05, whiteSpace: 'nowrap'}}>{c.value}</div>
        </div>
        <div style={{fontSize: 80, fontWeight: 500, lineHeight: 1}}>→</div>
      </div>}
      {caption && <div style={{flex: 'none', fontFamily: BODY, fontWeight: 700, fontSize: caption.length > 48 ? 28 : 34, color: colors.bg,
        letterSpacing: .5, lineHeight: 1.25}}>{caption}</div>}
    </div>
  </AbsoluteFill>;
};

/** Слайды «Разворота» → вёрстка Cobalt Shift. История и прочие слайды других форматов — фактами */
export const COBALT_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, history: Facts, price: Price, cta: Cta,
};
