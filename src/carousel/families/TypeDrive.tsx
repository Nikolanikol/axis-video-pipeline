// Семейство Type Drive (пакет KOK_handoff_v1, доска design/boards/01_type_drive.png, PDF с. 2–8).
// Узкий крупный шрифт, широкие скруглённые окна фото и сплошные винные плоскости. Обложка и цена —
// на графите, экстерьер, факты и контакты — на кремовом, салон — весь винный.
//
// Вино (#7B243D) на графите почти не читается (контраст 1,8) — поэтому акцент здесь только
// заливкой плоскостей с кремовым текстом (8,4), а текстом поверх графита идёт кремовый. На кремовом
// фоне вино как текст читается (7+), там заголовки винные.
//
// Форматы (21.10): нарисовано на 4:5 (1080×1350). «Классика» 9:16 — та же вёрстка в середине кадра
// (FamilyCarousel). Квадрат 1:1 — вертикаль от высоты слайда h: координаты доски через y(), верхний
// предел кегля крупных масс — × k (scale в kit.tsx; при h = 1350 оба ничего не меняют, 4:5 совпал
// пиксель в пиксель). «Галерея» и «История» квадратных форматов — общие FamilyGallery / FamilyHistory.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY, HEAD, Logo} from '../../shared/ui';
import {Photo, W, fitW, scale, upper, type FamilyColors, type FamilySlideProps} from './kit';

/** Логотип слева сверху и винная черта под ним (на доске — «KOK» с подчёркиванием) */
const LogoMark: React.FC<{colors: FamilyColors; on: string; line?: string}> = ({colors, on, line}) =>
  <div style={{position: 'absolute', left: 44, top: 34, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 10}}>
    <Logo asset="logoHorizontal" height={50} width={230} on={on} style={{textAlign: 'left', objectPosition: 'left'}} />
    <div style={{width: 56, height: 5, borderRadius: 3, background: line ?? colors.accent}} />
  </div>;

// Разрядка подписей («Ц Е Н А  А В Т О») — как на доске, у мелких строк под крупной цифрой
const spaced = (size: number): React.CSSProperties => ({fontFamily: BODY, fontWeight: 600, fontSize: size, letterSpacing: size * .32});

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors, h}) => {
  const {y, k} = scale(h);
  const brand = upper(car.brand);
  const model = upper(car.model || car.brand);
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : '';
  // Модель — главная масса: кегль по ширине левой колонки, но не выше места до фото
  // 0,44 — средняя ширина знака Oswald 700 в модели (цифры и заглавные), замер по «F150» 20.10
  const size = fitW(model, 620, 470 * k, 120, .44);
  return <AbsoluteFill style={{background: colors.bg}}>
    <LogoMark colors={colors} on={colors.bg} />
    <div style={{position: 'absolute', left: 44, top: y(150), width: 640, fontFamily: HEAD, color: colors.text, zIndex: 2}}>
      {brand && brand !== model && <div style={{fontWeight: 500, fontSize: 62, letterSpacing: 30, lineHeight: 1}}>{brand}</div>}
      <div style={{fontWeight: 700, fontSize: size, lineHeight: .86, whiteSpace: 'nowrap', marginTop: 10}}>{model}</div>
    </div>
    {year && <div style={{position: 'absolute', right: 52, top: y(190), fontFamily: HEAD, fontWeight: 500, fontSize: 84, color: colors.text, letterSpacing: 8}}>{year}</div>}
    {km && <div style={{position: 'absolute', right: 0, top: y(320), width: 380, height: y(210), background: colors.accent, borderTopLeftRadius: 60, borderBottomLeftRadius: 24,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 44px', boxSizing: 'border-box', color: colors.text}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fitW(km, 300, 74, 40, .5), lineHeight: 1, whiteSpace: 'nowrap'}}>{km}</div>
      <div style={{height: 3, background: colors.text, opacity: .5, marginTop: 18}} />
    </div>}
    <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(640), bottom: 30, borderRadius: 48, border: `6px solid ${colors.text}`}} position="45% 62%" />
  </AbsoluteFill>;
};

const Exterior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const photos = [car.photos.rear, ...car.photos.exterior, car.photos.hero].filter(Boolean) as string[];
  const a = photos[0], b = photos.find((p) => p !== a) ?? a;
  // Заголовок в две строки: начало — вином, последнее слово — графитом («С другого / РАКУРСА»)
  const words = upper(content.kicker ?? content.title).split(/\s+/).filter(Boolean);
  const last = words.pop() ?? '';
  const first = words.join(' ');
  const size = fitW([first, last].sort((a, b) => b.length - a.length)[0] ?? last, 700, 170 * k, 60, .5);
  const caption = upper(content.lines?.[0]);
  return <AbsoluteFill style={{background: colors.light}}>
    {/* Винная масса справа — фон за заголовком и фото, как на доске */}
    <div style={{position: 'absolute', right: 0, top: 0, width: 300, bottom: 0, background: colors.accent, borderTopLeftRadius: 120}} />
    <LogoMark colors={colors} on={colors.light} />
    <div style={{position: 'absolute', left: 44, right: 330, top: y(120), fontFamily: HEAD, fontWeight: 700, fontSize: size, lineHeight: .92, whiteSpace: 'nowrap'}}>
      {first && <div style={{color: colors.accent}}>{first}</div>}
      <div style={{color: colors.bg}}>{last}</div>
    </div>
    <Photo src={a} style={{left: 40, right: 40, top: y(470), height: y(520), borderRadius: 44}} />
    <Photo src={b} style={{left: 40, width: 560, top: y(1020), bottom: 40, borderRadius: 36}} />
    {caption && <div style={{position: 'absolute', left: 630, right: 40, top: y(1020), bottom: 40, borderRadius: 36, background: colors.accent, color: colors.text,
      padding: '28px 30px', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-end', fontFamily: HEAD, fontWeight: 500,
      fontSize: (caption.length > 60 ? 26 : 32) * k, letterSpacing: 2, lineHeight: 1.3, overflow: 'hidden'}}>{caption}</div>}
  </AbsoluteFill>;
};

const Interior: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const pool = [car.photos.interiorShot, ...car.photos.interior, car.photos.dashboard].filter(Boolean) as string[];
  const label = upper(content.kicker ?? content.title);
  return <AbsoluteFill style={{background: colors.accent}}>
    <LogoMark colors={colors} on={colors.accent} line={colors.text} />
    {/* Своя полоса под логотипом (110–320 px), слово по центру: короткое «САЛОН» — крупно, длинная
        рубрика («Технологии и безопасность» в «Классике») — мельче и не наезжает на логотип.
        0,56 — ширина знака Oswald в кириллице заглавными, при 0,5 последняя буква срезалась */}
    {label && <div style={{position: 'absolute', left: 30, right: 30, top: y(110), height: y(210), display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: HEAD, fontWeight: 700, color: colors.text, fontSize: fitW(label, W - 80, 220 * k, 40, .56), lineHeight: .9, whiteSpace: 'nowrap'}}>{label}</div>}
    <Photo src={pool[0]} style={{left: 30, right: 30, top: y(330), bottom: 30, borderRadius: 48, border: `6px solid ${colors.text}`}} />
  </AbsoluteFill>;
};

const Facts: React.FC<FamilySlideProps> = ({car, tx, ru, colors, h}) => {
  const {y, k} = scale(h);
  const year = car.year ? String(car.year) : '';
  const km = car.mileageKm !== null ? new Intl.NumberFormat(ru ? 'ru-RU' : 'en-US').format(car.mileageKm).replace(/\s/g, ' ') : '';
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  const detail = car.photos.other[0] ?? car.photos.exterior[2] ?? car.photos.hero;
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoMark colors={colors} on={colors.light} />
    {/* Год — главная масса сверху; «ГОД» рядом мелко с чертой */}
    {year && <div style={{position: 'absolute', left: 44, top: y(140), display: 'flex', alignItems: 'flex-start', gap: 24, fontFamily: HEAD}}>
      <div style={{fontWeight: 700, fontSize: 290 * k, color: colors.accent, lineHeight: .85}}>{year}</div>
      <div style={{marginTop: 30, fontWeight: 500, fontSize: 64, color: colors.bg}}>
        {ru ? 'ГОД' : 'YEAR'}<div style={{height: 4, background: colors.bg, marginTop: 10}} />
      </div>
    </div>}
    {/* Винная панель: пробег крупно, топливо и коробка строками; справа — узкое фото детали */}
    <div style={{position: 'absolute', left: 30, right: 30, top: y(470), bottom: 30, background: colors.accent, borderRadius: 56, overflow: 'hidden'}}>
      <Photo src={detail} style={{right: 30, top: y(60), bottom: y(60), width: 380, borderRadius: 36}} />
      <div style={{position: 'absolute', left: 50, top: y(60), right: 440, bottom: y(60), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: colors.text, fontFamily: HEAD}}>
        {km && <div style={{display: 'flex', alignItems: 'baseline', gap: 14, whiteSpace: 'nowrap'}}>
          <span style={{fontWeight: 700, fontSize: fitW(km, 420, 150 * k, 70, .5), lineHeight: 1}}>{km}</span>
          <span style={{fontWeight: 500, fontSize: 52}}>{ru ? 'КМ' : 'KM'}</span>
        </div>}
        {rows.map((r) => <div key={r} style={{borderTop: `3px solid ${colors.text}55`, paddingTop: 26 * k, fontWeight: 500, fontSize: fitW(r, 420, 64 * k, 36, .5)}}>{r}</div>)}
      </div>
    </div>
  </AbsoluteFill>;
};

const Price: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {y, k} = scale(h);
  const price = content.price ?? '—';
  const label = upper(content.priceLabel);
  return <AbsoluteFill style={{background: colors.bg}}>
    <LogoMark colors={colors} on={colors.bg} />
    <Photo src={car.photos.exterior[1] ?? car.photos.hero} style={{left: 30, right: 30, top: y(140), height: y(620), borderRadius: 48}} />
    <div style={{position: 'absolute', left: 30, right: 30, top: y(800), bottom: 30, background: colors.accent, borderRadius: 56, color: colors.text,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 40px'}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fitW(price, 940, 260 * k, 90, .5), lineHeight: 1, whiteSpace: 'nowrap'}}>{price}</div>
      {label && <div style={{...spaced(label.length > 26 ? 24 : 30), marginTop: 24, textAlign: 'center'}}>{label}</div>}
    </div>
  </AbsoluteFill>;
};

const Cta: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {k} = scale(h);
  // Вопрос в две массы: первая строка графитом, остальное вином (на доске «ХОТИТЕ / ЭТУ A8?»)
  const words = upper(content.title).split(/\s+/).filter(Boolean);
  const first = words.shift() ?? '';
  const rest = words.join(' ');
  const size = fitW([first, rest].sort((a, b) => b.length - a.length)[0], 990, 190 * k, 70, .5);
  const c = content.contact;
  const caption = upper(content.lines?.[0]);
  return <AbsoluteFill style={{background: colors.light}}>
    <LogoMark colors={colors} on={colors.light} />
    <div style={{position: 'absolute', left: 30, right: 40, top: 60, bottom: 40, display: 'flex', flexDirection: 'column', gap: 26}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: size, lineHeight: .92, textAlign: 'right'}}>
        <div style={{color: colors.bg}}>{first}</div>
        {rest && <div style={{color: colors.accent}}>{rest}</div>}
      </div>
      <Photo src={car.photos.hero} style={{position: 'relative', flex: 1, minHeight: 180, borderRadius: 44}} />
      {c && <div style={{flex: 'none', height: 140, borderRadius: 70, background: colors.accent, color: colors.text,
        display: 'flex', alignItems: 'center', padding: '0 24px 0 48px', gap: 24}}>
        <div style={{flex: 1, minWidth: 0}}>
          {c.label && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 28, opacity: .8}}>{c.label}</div>}
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fitW(c.value, 700, 66, 40), lineHeight: 1.05, whiteSpace: 'nowrap'}}>{c.value}</div>
        </div>
        <div style={{width: 96, height: 96, borderRadius: '50%', border: `4px solid ${colors.text}`, display: 'grid', placeItems: 'center',
          fontFamily: HEAD, fontSize: 56, lineHeight: 1}}>→</div>
      </div>}
      {caption && <div style={{flex: 'none', ...spaced(caption.length > 48 ? 20 : 26), color: colors.bg, textAlign: 'center', lineHeight: 1.35}}>{caption}</div>}
    </div>
  </AbsoluteFill>;
};

/** Слайды «Разворота» → вёрстка Type Drive */
export const TYPE_DRIVE_SLIDES: Record<string, React.FC<FamilySlideProps>> = {
  cover: Cover, exterior: Exterior, interior: Interior, engine: Facts, specs: Facts, price: Price, cta: Cta,
};
