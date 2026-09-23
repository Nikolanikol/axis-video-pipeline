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
import {BODY, CopperText, HEAD, ThemeProvider, useAsset, useTheme} from '../shared/ui';
import {Bullets, NumberCard, PAD, PhotoBand, Row, Slide, Title, NumberCard as Card, TOTAL} from './Slides';

export const CAROUSEL_SLIDES = TOTAL;

const km = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('en-US')} km`);
const usd = (v: number | null | undefined) => (v ? `$${v.toLocaleString('en-US')}` : '—');
/** Пустые значения на слайд не пускаем: «—» честнее, чем пустая строка в таблице */
const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Полное имя машины: марка, модель и комплектация, если она есть */
const fullName = (car: CarouselProps['car']) =>
  [car.brand, car.model].filter(Boolean).join(' ');

const Cover: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => {
  const C = useTheme();
  const sub = [car.year, car.fuel, car.transmission].filter(Boolean).join(' · ');
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
      <AbsoluteFill style={{padding: 96, display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontWeight: 600,
          fontSize: 30, letterSpacing: 7, textTransform: 'uppercase', color: C.white}}>
          <span>{brandName}</span><span>01 / 0{TOTAL}</span>
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
            {[km(car.mileageKm), car.history ? `${car.history.ownerChanges} owner changes` : null]
              .filter(Boolean).map((t) => (
                <span key={t as string} style={{fontFamily: BODY, fontWeight: 600, fontSize: 32,
                  color: C.white, border: `2px solid ${C.copper}`, borderRadius: 999, padding: '16px 34px'}}>{t}</span>
              ))}
          </div>
          <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 6, color: C.copperLight,
            textTransform: 'uppercase', marginTop: 54}}>Swipe →</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const History: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => {
  const C = useTheme();
  const h = car.history;
  // История недоступна — это не «всё чисто». Показываем прямо, иначе слайд соврёт
  if (!h) {
    return (
      <Slide index={2} brandName={brandName}>
        <div style={{marginTop: 52}}>
          <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
            textTransform: 'uppercase'}}>Vehicle history</CopperText>
          <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: 72, marginTop: 24, color: C.white}}>
            Report available on request
          </div>
        </div>
      </Slide>
    );
  }
  // Чистая история — сама по себе довод, и подавать её надо как довод, а не как пустой слайд
  if (!h.accidentsTotal) {
    return (
      <Slide index={2} brandName={brandName}>
        <Title kicker="Vehicle history">No accident record</Title>
        <div style={{display: 'flex', gap: 22, marginTop: 64}}>
          <NumberCard value="0" label="Insurance claims" />
          <NumberCard value={String(h.ownerChanges)} label="Owner changes" />
        </div>
        <div style={{display: 'flex', gap: 22, marginTop: 22}}>
          <NumberCard value={String(h.theft)} label="Theft records" />
          <NumberCard value={String(h.flood)} label="Flood damage" />
        </div>
        <div style={{marginTop: 'auto', fontFamily: BODY, fontWeight: 500, fontSize: 30, lineHeight: 1.5,
          color: C.grey, borderTop: `1px solid ${C.line}`, paddingTop: 32}}>
          Nothing on record with the insurers. Full Encar report supplied before purchase.
        </div>
      </Slide>
    );
  }

  // Случаев может быть много — показываем свежие, про остальные честно говорим числом
  const SHOWN = 5;
  const shown = h.claims.slice(0, SHOWN);
  const rest = h.claims.length - shown.length;
  return (
    <Slide index={2} brandName={brandName}>
      <Title kicker="Vehicle history">Nothing hidden</Title>
      <div style={{display: 'flex', gap: 22, marginTop: 44}}>
        <NumberCard value={String(h.accidentsTotal)} label="Insurance claims" alarm />
        <NumberCard value={String(h.ownerChanges)} label="Owner changes" />
      </div>
      {/* Каждый случай с суммой: «4 ДТП» без цифр читается страшнее, чем есть на самом деле */}
      <div style={{marginTop: 40}}>
        <div style={{display: 'flex', fontFamily: BODY, fontWeight: 600, fontSize: 24, letterSpacing: 3,
          textTransform: 'uppercase', color: C.grey, paddingBottom: 16}}>
          <span style={{flex: 1}}>Date</span>
          <span style={{width: 150, textAlign: 'right'}}>Fault</span>
          <span style={{width: 250, textAlign: 'right'}}>Paid out</span>
        </div>
        {shown.map((c) => (
          <div key={c.date} style={{borderTop: `1px solid ${C.line}`, padding: '22px 0'}}>
            <div style={{display: 'flex', alignItems: 'baseline'}}>
              <span style={{flex: 1, fontFamily: HEAD, fontWeight: 600, fontSize: 40, color: C.white}}>{c.date}</span>
              <span style={{width: 150, textAlign: 'right', fontFamily: BODY, fontWeight: 500, fontSize: 28,
                color: C.grey}}>{c.own ? 'own' : 'other'}</span>
              <span style={{width: 250, textAlign: 'right', fontFamily: HEAD, fontWeight: 600, fontSize: 40,
                color: C.white}}>₩{c.payoutKrw.toLocaleString('en-US')}</span>
            </div>
            {/* Покраска отдельно: по ней видно, трогали ли кузов */}
            <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 25, color: C.grey, marginTop: 8}}>
              parts ₩{c.partsKrw.toLocaleString('en-US')} · labour ₩{c.laborKrw.toLocaleString('en-US')}
              {c.paintKrw > 0 && <> · <span style={{color: C.copperLight}}>paint ₩{c.paintKrw.toLocaleString('en-US')}</span></>}
            </div>
          </div>
        ))}
        {rest > 0 && (
          <div style={{borderTop: `1px solid ${C.line}`, paddingTop: 20, fontFamily: BODY,
            fontWeight: 500, fontSize: 28, color: C.grey}}>and {rest} more in the full report</div>
        )}
      </div>
      <div style={{marginTop: 'auto', fontFamily: BODY, fontWeight: 500, fontSize: 28, lineHeight: 1.5,
        color: C.grey, borderTop: `1px solid ${C.line}`, paddingTop: 26}}>
        {h.accidentsOwn} at fault, {h.accidentsOther} third-party. Theft {h.theft} · Flood {h.flood}.
        Full Encar report supplied before purchase.
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
  index: number; brandName: string; kicker: string; photo?: string | null;
  label: string; focus?: string; height?: number; trimTop?: number; children: React.ReactNode;
}> = ({index, brandName, kicker, photo, label, focus, height = 1080, trimTop, children}) => {
  const C = useTheme();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <PhotoBand src={photo ?? undefined} height={height} label={label}
        index={index} brandName={brandName} focus={focus} trimTop={trimTop} />
      {/* Наползаем на кадр: снизу он уже растворён в фоне, и шов не виден */}
      <div style={{padding: `0 ${PAD}px ${PAD}px`, marginTop: -56, position: 'relative'}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
          textTransform: 'uppercase'}}>{kicker}</CopperText>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Interior: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => (
  <BandSlide index={3} brandName={brandName} kicker="Interior" photo={car.photos.interiorShot}
    label="фото салона не пришло">
    <Bullets items={car.options.comfort.slice(0, 5)} size={44} />
  </BandSlide>
);

const Technology: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => (
  <BandSlide index={4} brandName={brandName} kicker="Technology &amp; safety" photo={car.photos.dashboard}
    label="фото приборки не пришло" focus="50% 50%">
    <Bullets items={car.options.safety.slice(0, 5)} size={44} />
  </BandSlide>
);

const Specs: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => {
  const rows: [string, string][] = [
    ['Year', dash(car.year)],
    ['Engine', car.displacementCc ? `${(car.displacementCc / 1000).toFixed(1)} L` : '—'],
    ['Fuel', dash(car.fuel)],
    ['Transmission', dash(car.transmission)],
    ['Mileage', km(car.mileageKm)],
    ['Seats', dash(car.seats)],
  ];
  return (
    <BandSlide index={5} brandName={brandName} kicker="Specifications" photo={car.photos.rear}
      label="фото сзади не пришло" height={860} trimTop={0.30}>
      <div style={{marginTop: 30}}>
        {rows.map(([k, v], i) => <Row key={k} k={k} v={v} first={i === 0} />)}
      </div>
    </BandSlide>
  );
};

const Price: React.FC<CarouselProps & {brandName: string}> = ({car, brandName}) => {
  const C = useTheme();
  return (
    <Slide index={6} brandName={brandName}>
      <div style={{marginTop: 52}}>
        <CopperText style={{fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 9,
          textTransform: 'uppercase'}}>Price</CopperText>
      </div>
      <div style={{
        marginTop: 64, border: `3px solid ${C.copper}`, borderRadius: 22, padding: '72px 56px',
        textAlign: 'center',
      }}>
        <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 6,
          textTransform: 'uppercase', color: C.grey}}>Price in Korea</div>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 168, lineHeight: 1.05, color: C.white,
          marginTop: 18}}>{usd(car.price?.usd)}</div>
        {car.price && (
          <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.grey, marginTop: 14}}>
            ₩{car.price.krw.toLocaleString('en-US')}
          </div>
        )}
      </div>
      <Bullets items={[
        'Shipping and customs are calculated separately',
        'Full landed cost quoted for your country',
        'Inspection report and walkaround video before purchase',
      ]} size={34} />
    </Slide>
  );
};

const Cta: React.FC<CarouselProps & {brandName: string}> = ({car, market, brandName}) => {
  const C = useTheme();
  return (
    <Slide index={7} brandName={brandName}>
      <AbsoluteFill style={{display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 96}}>
        <Img src={useAsset('logoStacked')} style={{height: 240}} />
        <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: 72, color: C.white, marginTop: 64,
          textAlign: 'center', lineHeight: 1.2}}>Want this car?</div>
        <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 36, color: C.grey, marginTop: 24,
          textAlign: 'center', lineHeight: 1.5}}>
          Message us for the full landed cost to your country
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
  const slides = [Cover, History, Interior, Technology, Specs, Price, Cta];
  const Current = slides[Math.min(slides.length - 1, Math.max(0, frame))];
  return (
    <ThemeProvider value={theme}>
      <Current {...props} brandName={brandName} />
    </ThemeProvider>
  );
};
