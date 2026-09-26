// Карусель по авто: 7 слайдов 1080×1920 для Instagram и TikTok.
//
// Устроено как композиция из семи кадров по кадру в секунду: кадр 0 — обложка, кадр 6 — финал.
// Рендерим не видео, а семь картинок через renderStill(frame). Так слайды живут в общем
// движке рядом с рекламой и обзорами и получают тот же брендбук из настроек.
//
// Данные приходят от шлюза kmotors одним куском (CarouselCar) — см. server/carousel.mjs.
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {themeOf} from '../shared/model';
import type {CarouselProps} from '../shared/types';
import {BODY, CopperText, HEAD, Logo, ThemeProvider, radius, useAsset, useTheme} from '../shared/ui';
import {Bullets, NumberCard, PAD, PhotoBand, Row, SAFE, Slide, Title, TOTAL} from './Slides';
import {CarouselText, carouselLang, carouselText} from './i18n';

export const CAROUSEL_SLIDES = TOTAL;

/** Пустые значения на слайд не пускаем: «—» честнее, чем пустая строка в таблице */
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Полное имя машины: марка, модель и комплектация, если она есть */
const fullName = (car: CarouselProps['car']) =>
  [car.brand, car.model].filter(Boolean).join(' ');

// index и total на каждый слайд задаёт Carousel ниже: число слайдов не фиксировано
// (на проде нет истории), поэтому и номер «NN / total» приходит сверху, а не зашит в слайде
// tx — язык слайдов: подписи, перевод данных и числа (см. ./i18n)
type SlideProps = CarouselProps & {brandName: string; index: number; total: number; tx: CarouselText};

const Cover: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => {
  const C = useTheme();
  const sub = [car.year, tx.value(car.fuel), tx.value(car.transmission)].filter(Boolean).join(' · ');
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {car.photos.hero && (
        // Кадр горизонтальный, слайд вертикальный — обрезка неизбежна. Уводим её вниз и
        // влево, к машине: сверху справа у Encar впечатан свой логотип, и центральная
        // обрезка тащила бы его на обложку
        <Img src={car.photos.hero}
          style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '38% 62%'}} />
      )}
      {/* Затемнение: сверху глушим остатки чужого логотипа, снизу — под белый текст */}
      <AbsoluteFill style={{background: `linear-gradient(to bottom, ${C.bg}f2 0%, ${C.bg}66 18%, ${C.bg}22 40%, ${C.bg}f2 72%)`}} />
      {/* Поля сверху и снизу — безопасная зона: Instagram обрезает 9:16 до 4:5 */}
      <AbsoluteFill style={{padding: `${SAFE}px ${PAD}px`, display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontWeight: 600,
          fontSize: 30, letterSpacing: 7, textTransform: 'uppercase', color: C.white}}>
          <span>{brandName}</span><span>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        </div>
        <div style={{marginTop: 'auto'}}>
          <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 132, lineHeight: 1, color: C.white,
            textTransform: 'uppercase'}}>{fullName(car)}</div>
          {car.grade && (
            <CopperText style={{fontFamily: HEAD, fontWeight: 600, fontSize: 64, lineHeight: 1.2}}>
              {[car.grade, car.trim].filter(Boolean).join(' ')}
            </CopperText>
          )}
          <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 38, color: C.grey, marginTop: 22,
            letterSpacing: 2}}>{sub}</div>
          <div style={{display: 'flex', gap: 20, marginTop: 44}}>
            {[tx.km(car.mileageKm), car.history ? tx.s.ownerChanges(car.history.ownerChanges) : null]
              .filter(Boolean).map((t) => (
                <span key={t as string} style={{fontFamily: BODY, fontWeight: 600, fontSize: 32,
                  color: C.white, border: `2px solid ${C.copper}`, borderRadius: radius(C, 999), padding: '16px 34px'}}>{t}</span>
              ))}
          </div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 6, color: C.copperLight,
            textTransform: 'uppercase', marginTop: 54}}>{tx.s.swipe}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const History: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => {
  const {s} = tx;
  const C = useTheme();
  const h = car.history;
  // История недоступна — это не «всё чисто». Показываем прямо, иначе слайд соврёт
  if (!h) {
    return (
      <Slide index={index} total={total} brandName={brandName}>
        <div style={{marginTop: 52}}>
          <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
            textTransform: 'uppercase'}}>{s.history}</CopperText>
          <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: 72, marginTop: 24, color: C.white}}>
            {s.reportOnRequest}
          </div>
        </div>
      </Slide>
    );
  }
  // Чистая история — сама по себе довод, и подавать её надо как довод, а не как пустой слайд
  if (!h.accidentsTotal) {
    return (
      <Slide index={index} total={total} brandName={brandName}>
        <Title kicker={s.history}>{s.noAccidents}</Title>
        <div style={{display: 'flex', gap: 22, marginTop: 64}}>
          <NumberCard value="0" label={s.insuranceClaims} />
          <NumberCard value={String(h.ownerChanges)} label={s.ownerChangesLabel} />
        </div>
        <div style={{display: 'flex', gap: 22, marginTop: 22}}>
          <NumberCard value={String(h.theft)} label={s.theft} />
          <NumberCard value={String(h.flood)} label={s.flood} />
        </div>
        <div style={{marginTop: 'auto', fontFamily: BODY, fontWeight: 500, fontSize: 30, lineHeight: 1.5,
          color: C.grey, borderTop: `1px solid ${C.line}`, paddingTop: 32}}>
          {s.cleanNote}
        </div>
      </Slide>
    );
  }

  // Случаев может быть много — показываем свежие, про остальные честно говорим числом
  const SHOWN = 5;
  const shown = h.claims.slice(0, SHOWN);
  const rest = h.claims.length - shown.length;
  return (
    <Slide index={index} total={total} brandName={brandName}>
      <Title kicker={s.history}>{s.nothingHidden}</Title>
      <div style={{display: 'flex', gap: 22, marginTop: 44}}>
        <NumberCard value={String(h.accidentsTotal)} label={s.insuranceClaims} alarm />
        <NumberCard value={String(h.ownerChanges)} label={s.ownerChangesLabel} />
      </div>
      {/* Каждый случай с суммой: «4 ДТП» без цифр читается страшнее, чем есть на самом деле */}
      <div style={{marginTop: 40}}>
        <div style={{display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 24, letterSpacing: 3,
          textTransform: 'uppercase', color: C.grey, paddingBottom: 16}}>
          <span style={{flex: 1}}>{s.date}</span>
          <span style={{width: 150, textAlign: 'right'}}>{s.fault}</span>
          <span style={{width: 250, textAlign: 'right'}}>{s.paidOut}</span>
        </div>
        {shown.map((c) => (
          <div key={c.date} style={{borderTop: `1px solid ${C.line}`, padding: '22px 0'}}>
            <div style={{display: 'flex', alignItems: 'baseline'}}>
              <span style={{flex: 1, fontFamily: HEAD, fontWeight: 600, fontSize: 40, color: C.white}}>{c.date}</span>
              <span style={{width: 150, textAlign: 'right', fontFamily: BODY, fontWeight: 500, fontSize: 28,
                color: C.grey}}>{c.own ? s.own : s.other}</span>
              <span style={{width: 250, textAlign: 'right', fontFamily: HEAD, fontWeight: 600, fontSize: 40,
                color: C.white}}>{tx.krw(c.payoutKrw)}</span>
            </div>
            {/* Покраска отдельно: по ней видно, трогали ли кузов */}
            <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 25, color: C.grey, marginTop: 8}}>
              {s.parts} {tx.krw(c.partsKrw)} · {s.labour} {tx.krw(c.laborKrw)}
              {c.paintKrw > 0 && <> · <span style={{color: C.copperLight}}>{s.paint} {tx.krw(c.paintKrw)}</span></>}
            </div>
          </div>
        ))}
        {rest > 0 && (
          <div style={{borderTop: `1px solid ${C.line}`, paddingTop: 20, fontFamily: BODY,
            fontWeight: 500, fontSize: 28, color: C.grey}}>{s.andMore(rest)}</div>
        )}
      </div>
      <div style={{marginTop: 'auto', fontFamily: BODY, fontWeight: 500, fontSize: 28, lineHeight: 1.5,
        color: C.grey, borderTop: `1px solid ${C.line}`, paddingTop: 26}}>
        {s.summary(h.accidentsOwn, h.accidentsOther, h.theft, h.flood)}
      </div>
    </Slide>
  );
};

/**
 * Слайд с фото в край: кадр сверху, содержимое под ним.
 * Единый каркас для салона, техники и характеристик — иначе три похожих слайда
 * разъезжаются по вёрстке и карусель перестаёт выглядеть цельной.
 */
const BandSlide: React.FC<{
  index: number; total: number; brandName: string; kicker: string; photo?: string | null;
  label: string; focus?: string; height?: number; trimTop?: number; children: React.ReactNode;
}> = ({index, total, brandName, kicker, photo, label, focus, height = 1080, trimTop, children}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <PhotoBand src={photo ?? undefined} height={height} label={label}
        index={index} total={total} brandName={brandName} focus={focus} trimTop={trimTop} />
      {/* Наползаем на кадр: снизу он уже растворён в фоне, и шов не виден */}
      <div style={{padding: `0 ${PAD}px ${SAFE}px`, marginTop: -56, position: 'relative'}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
          textTransform: 'uppercase'}}>{kicker}</CopperText>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Interior: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => (
  <BandSlide index={index} total={total} brandName={brandName} kicker={tx.s.interior} photo={car.photos.interiorShot}
    label="фото салона не пришло">
    <Bullets items={car.options.comfort.slice(0, 5).map(tx.option)} size={44} />
  </BandSlide>
);

const Technology: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => (
  <BandSlide index={index} total={total} brandName={brandName} kicker={tx.s.technology} photo={car.photos.dashboard}
    label="фото приборки не пришло" focus="50% 50%">
    <Bullets items={car.options.safety.slice(0, 5).map(tx.option)} size={44} />
  </BandSlide>
);

const Specs: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => {
  const {s} = tx;
  const rows: [string, string][] = [
    [s.year, dash(car.year)],
    [s.engine, tx.liters(car.displacementCc)],
    [s.fuel, dash(tx.value(car.fuel))],
    [s.transmission, dash(tx.value(car.transmission))],
    [s.mileage, tx.km(car.mileageKm)],
    [s.seats, dash(car.seats)],
  ];
  return (
    <BandSlide index={index} total={total} brandName={brandName} kicker={s.specs} photo={car.photos.rear}
      label="фото сзади не пришло" height={1000} trimTop={0.16}>
      <div style={{marginTop: 30}}>
        {rows.map(([k, v], i) => <Row key={k} k={k} v={v} first={i === 0} />)}
      </div>
    </BandSlide>
  );
};

const Price: React.FC<SlideProps> = ({car, brandName, index, total, tx}) => {
  const C = useTheme();
  return (
    <Slide index={index} total={total} brandName={brandName}>
      <div style={{marginTop: 52}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
          textTransform: 'uppercase'}}>{tx.s.price}</CopperText>
      </div>
      <div style={{
        marginTop: 64, border: `3px solid ${C.copper}`, borderRadius: radius(C, 22), padding: '72px 56px',
        textAlign: 'center',
      }}>
        <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 6,
          textTransform: 'uppercase', color: C.grey}}>{tx.s.priceInKorea}</div>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 168, lineHeight: 1.05, color: C.white,
          marginTop: 18}}>{tx.usd(car.price?.usd)}</div>
        {car.price && (
          <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.grey, marginTop: 14}}>
            {tx.krw(car.price.krw)}
          </div>
        )}
      </div>
      <Bullets items={tx.s.priceNotes} size={34} />
    </Slide>
  );
};

const Cta: React.FC<SlideProps> = ({car, market, brandName, index, total, tx}) => {
  const C = useTheme();
  return (
    <Slide index={index} total={total} brandName={brandName}>
      <AbsoluteFill style={{display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 96}}>
        <Logo asset="logoStacked" height={240} />
        <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: 72, color: C.white, marginTop: 64,
          textAlign: 'center', lineHeight: 1.2}}>{tx.s.ctaTitle}</div>
        <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 36, color: C.grey, marginTop: 24,
          textAlign: 'center', lineHeight: 1.5}}>
          {tx.s.ctaText}
        </div>
        <div style={{marginTop: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
          {market.whatsapp && (
            <CopperText style={{fontFamily: HEAD, fontWeight: 600, fontSize: 52}}>{market.whatsapp}</CopperText>
          )}
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 40, color: C.white}}>{market.site}</div>
        </div>
      </AbsoluteFill>
      {/* Номер объявления внизу: по нему машину находят в каталоге и в переписке */}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 56, textAlign: 'center',
        fontFamily: BODY, fontWeight: 500, fontSize: 26, letterSpacing: 4, color: C.line}}>
        № {car.id}
      </div>
    </Slide>
  );
};

export const Carousel: React.FC<CarouselProps> = (props) => {
  const theme = themeOf(props.theme);
  const frame = useCurrentFrame();
  // Имя из темы: у каждого бренда своё, править в настройках, а не в коде
  const brandName = theme.name;
  // Слайд истории убираем, когда сервер просит (прод: страховые случаи с датацентра
  // не приходят, Encar режет адрес). По умолчанию — на месте. Тогда и слайдов шесть,
  // и нумерация «NN / 06» считается от фактического списка, а не от максимума в семь.
  const withHistory = props.includeHistory !== false;
  // Язык слайдов — из профиля клиента; не английский и не русский → английский
  const tx = carouselText(carouselLang(props.market?.language));
  const slides = [Cover, ...(withHistory ? [History] : []), Interior, Technology, Specs, Price, Cta];
  const total = slides.length;
  const i = Math.min(total - 1, Math.max(0, frame));
  const Current = slides[i];
  return (
    <ThemeProvider value={theme}>
      <Current {...props} brandName={brandName} index={i + 1} total={total} tx={tx} />
    </ThemeProvider>
  );
};
