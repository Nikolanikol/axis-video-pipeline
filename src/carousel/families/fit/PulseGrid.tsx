// Pulse Grid: курсив и наклонённые текстовые области, скошенные винные плоскости.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Photo, LogoCorner, photosOf, scale, upper, type FamilySlideProps} from '../kit';
import {Text, At} from './Text';
import {Contact, bottomAreas} from './Contact';
import {Facts, Gallery, History} from './Shared';
const T = (p: React.ComponentProps<typeof Text>) => <Text weight={800} italic {...p} />;
const tilt = {transform: 'rotate(-5deg)', transformOrigin: '0 0'};
const Cover: React.FC<FamilySlideProps> = ({car, tx, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <div
        style={{
          position: 'absolute',
          right: 40,
          top: -40,
          width: 40,
          height: y(230),
          background: c.accent,
          transform: 'skewX(-14deg)',
        }}
      />
      <At x={44} y={y(140)} style={tilt}>
        <T text={upper(car.brand)} field="name" w={860} h={y(160)} max={190 * k} min={40} color={c.text} />
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={860}
          h={y(150)}
          max={190 * k}
          min={40}
          lines={2}
          color={c.accent}
        />
      </At>
      <At x={810} y={y(330)}>
        <T text={car.year ? String(car.year) : ''} w={210} h={y(110)} max={70} color={c.text} nowrap />
      </At>
      <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(470), height: y(560), borderRadius: 40}} />
      {car.mileageKm !== null && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: y(300),
              background: c.accent,
              clipPath: 'polygon(0 22%,100% 0,100% 100%,0 100%)',
            }}
          />
          <At x={50} y={h - y(190)} style={tilt}>
            <T
              text={upper(tx.km(car.mileageKm))}
              field="specs"
              w={960}
              h={y(170)}
              max={170 * k}
              min={48}
              nowrap
              color={c.light}
            />
          </At>
        </>
      )}
    </AbsoluteFill>
  );
};
const Exterior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <At x={50} y={y(150)} style={tilt}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={930}
          h={y(270)}
          max={190 * k}
          min={40}
          lines={3}
          color={c.accent}
        />
      </At>
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: y(500),
          width: 300,
          bottom: 0,
          background: c.accent,
          clipPath: 'polygon(30% 0,100% 0,100% 100%,0 100%)',
        }}
      />
      <Photo src={p.exterior[0]} style={{left: 30, right: 70, top: y(440), height: y(520), borderRadius: 40}} />
      <Photo
        src={p.exterior[1] ?? p.exterior[0]}
        style={{left: 90, width: 560, top: y(1010), height: y(300), borderRadius: 32, transform: 'rotate(-3deg)'}}
      />
    </AbsoluteFill>
  );
};
const Interior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <Photo src={p.interior[0]} style={{left: 30, right: 30, top: y(120), height: y(680), borderRadius: 40}} />
      <At
        x={40}
        y={y(170)}
        style={{...tilt, padding: '18px 30px', borderRadius: '0 24px 24px 0', background: c.accent}}
      >
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={620}
          h={160}
          max={96}
          min={36}
          lines={3}
          color={c.light}
        />
      </At>
      <Photo
        src={p.interior[1] ?? p.interior[0]}
        style={{left: 30, width: 495, top: y(830), bottom: 30, borderRadius: 32}}
      />
      <Photo
        src={p.interior[2] ?? p.interior[0]}
        style={{right: 30, width: 495, top: y(830), bottom: 30, borderRadius: 32}}
      />
    </AbsoluteFill>
  );
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.light}} data-band-top={c.text}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: y(560),
          background: c.text,
          clipPath: 'polygon(0 0,100% 0,100% 78%,0 100%)',
        }}
      />
      <LogoCorner on={c.text} />
      <At x={50} y={y(160)} style={tilt}>
        <T text={content.price ?? '—'} field="price" w={960} h={y(220)} max={230 * k} min={48} nowrap color={c.light} />
        <T
          text={upper(content.priceLabel)}
          w={930}
          h={y(120)}
          max={28}
          min={22}
          lines={3}
          body
          weight={600}
          italic={false}
          trackingEm={0.3}
          color={c.light}
        />
      </At>
      <Photo src={car.photos.hero} style={{left: 30, right: 30, top: y(610), bottom: 30, borderRadius: 40}} />
    </AbsoluteFill>
  );
};
const Cta: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    b = bottomAreas(h, content, y(150));
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <div
        style={{
          position: 'absolute',
          right: 40,
          top: -40,
          width: 40,
          height: y(230),
          background: c.accent,
          transform: 'skewX(-14deg)',
        }}
      />
      <At x={44} y={y(150)} style={tilt}>
        <T
          text={upper(content.title)}
          field="title"
          w={930}
          h={y(280)}
          max={170 * k}
          min={40}
          lines={3}
          color={c.accent}
        />
      </At>
      <Photo
        src={car.photos.hero}
        style={{left: 30, right: 30, top: y(470), height: b.photoEnd - y(470), borderRadius: 40}}
      />
      {content.contact && (
        <At
          x={30}
          y={b.contactY}
          style={{width: 1020, height: b.contactH, background: c.accent, borderRadius: 40, padding: '12px 40px'}}
        >
          <Contact contact={content.contact} w={830} color={c.light} headWeight={800} italic />
          <span style={{position: 'absolute', right: 35, top: 40, fontSize: 60, color: c.light}}>→</span>
        </At>
      )}
      <At x={50} y={b.noteY}>
        <T
          text={upper(content.lines?.join('\n'))}
          field="text"
          w={980}
          h={b.noteH}
          max={28}
          min={24}
          lines={4}
          body
          italic={false}
          weight={600}
          color={c.text}
        />
      </At>
    </AbsoluteFill>
  );
};
export const PULSE_GRID_FIT = {
  cover: Cover,
  exterior: Exterior,
  interior: Interior,
  engine: (p: FamilySlideProps) => Facts({...p, family: 'pulse_grid'}),
  price: Price,
  cta: Cta,
  gallery: Gallery,
  history: History,
};
