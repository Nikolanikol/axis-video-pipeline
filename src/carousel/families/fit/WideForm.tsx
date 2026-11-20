// Wide Form: широкий шрифт, изогнутые границы фотографий и оранжевые капсулы.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Photo, LogoCorner, photosOf, scale, upper, type FamilySlideProps} from '../kit';
import {Text, At} from './Text';
import {Contact, bottomAreas} from './Contact';
import {Facts, Gallery, History} from './Shared';
const T = (p: React.ComponentProps<typeof Text>) => <Text weight={800} trackingEm={-0.02} {...p} />;
const Head = ({on, line}: {on: string; line: string}) => (
  <>
    <LogoCorner on={on} />
    <div style={{position: 'absolute', left: 300, right: 60, top: 62, height: 2, background: line}} />
  </>
);
const Cover: React.FC<FamilySlideProps> = ({car, tx, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Head on={c.bg} line={c.text} />
      <At x={44} y={y(110)}>
        <T text={upper(car.brand)} field="name" w={990} h={y(100)} max={66} min={32} color={c.text} />
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={990}
          h={y(205)}
          max={250 * k}
          min={48}
          lines={3}
          color={c.accent}
        />
      </At>
      <Photo src={car.photos.hero} style={{left: 0, right: 0, top: y(420), height: y(640)}} />
      <div
        style={{
          position: 'absolute',
          left: -120,
          right: -120,
          top: y(960),
          bottom: -200,
          background: c.accent,
          borderRadius: '50% 50% 0 0 / 22% 22% 0 0',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -120,
          right: -120,
          top: y(985),
          bottom: -200,
          background: c.light,
          borderRadius: '50% 50% 0 0 / 22% 22% 0 0',
        }}
      />
      <At x={60} y={h - y(230)} style={{display: 'flex', gap: 40}}>
        <T text={car.year ? String(car.year) : ''} w={330} h={y(170)} max={96} color={c.bg} nowrap />
        <div style={{width: 4, height: y(120), background: c.bg}} />
        <T
          text={car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : ''}
          field="specs"
          w={580}
          h={y(170)}
          max={90}
          min={32}
          color={c.bg}
          nowrap
        />
      </At>
    </AbsoluteFill>
  );
};
const Exterior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Head on={c.bg} line={c.text} />
      <At x={44} y={y(110)}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={990}
          h={y(290)}
          max={150 * k}
          min={36}
          lines={3}
          color={c.accent}
        />
      </At>
      <div
        style={{
          position: 'absolute',
          left: -80,
          right: -80,
          top: y(410),
          height: y(700),
          background: c.light,
          borderRadius: '50% 50% 0 0 / 14% 14% 0 0',
        }}
      />
      <Photo
        src={p.exterior[0]}
        style={{left: 0, right: 0, top: y(440), height: y(600), borderRadius: '50% 50% 0 0 / 12% 12% 0 0'}}
      />
      <div
        style={{
          position: 'absolute',
          left: 40,
          width: 600,
          top: y(1030),
          height: y(300),
          background: c.accent,
          borderRadius: '0 160px 160px 0',
        }}
      />
      <Photo
        src={p.exterior[1] ?? p.exterior[0]}
        style={{left: 40, width: 560, top: y(1050), height: y(260), borderRadius: '40px 140px 140px 40px'}}
      />
    </AbsoluteFill>
  );
};
const Interior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Head on={c.bg} line={c.text} />
      <At x={44} y={y(110)}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={990}
          h={y(225)}
          max={210 * k}
          min={34}
          lines={3}
          color={c.text}
        />
      </At>
      <Photo
        src={p.interior[0]}
        style={{
          left: 30,
          right: 30,
          top: y(360),
          bottom: 30,
          borderRadius: '48px 48px 48px 200px',
          border: `6px solid ${c.light}`,
        }}
      />
    </AbsoluteFill>
  );
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Head on={c.bg} line={c.text} />
      <At x={44} y={y(110)}>
        <T
          text={content.price ?? '—'}
          field="price"
          w={990}
          h={y(250)}
          max={210 * k}
          min={48}
          nowrap
          color={c.accent}
        />
        <T
          text={upper(content.priceLabel)}
          w={990}
          h={y(100)}
          max={34}
          min={24}
          lines={3}
          body
          weight={700}
          tracking={1}
          trackingEm={0}
          color={c.text}
        />
      </At>
      <div
        style={{
          position: 'absolute',
          left: -100,
          right: -100,
          top: y(470),
          height: y(200),
          background: c.light,
          borderRadius: '50% 50% 0 0 / 60% 60% 0 0',
        }}
      />
      <Photo
        src={car.photos.hero}
        style={{left: 0, right: 0, top: y(520), bottom: 0, borderRadius: '50% 50% 0 0 / 10% 10% 0 0'}}
      />
    </AbsoluteFill>
  );
};
const Cta: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    b = bottomAreas(h, content, y(150));
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Head on={c.bg} line={c.text} />
      <At x={44} y={y(110)}>
        <T
          text={upper(content.title)}
          field="title"
          w={990}
          h={y(300)}
          max={140 * k}
          min={36}
          lines={3}
          color={c.accent}
        />
      </At>
      <div
        style={{
          position: 'absolute',
          left: -80,
          right: -80,
          top: y(430),
          height: b.photoEnd - y(430),
          background: c.light,
          borderRadius: '50% / 14%',
        }}
      />
      <Photo
        src={car.photos.hero}
        style={{left: 0, right: 0, top: y(450), height: b.photoEnd - y(450), borderRadius: '50% / 12%'}}
      />
      {content.contact && (
        <At
          x={30}
          y={b.contactY}
          style={{width: 1020, height: b.contactH, background: c.accent, borderRadius: 90, padding: '12px 40px'}}
        >
          <Contact contact={content.contact} w={790} color={c.bg} headWeight={800} max={58} />
          <span style={{position: 'absolute', right: 40, top: 40, fontSize: 60, color: c.bg}}>→</span>
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
          weight={700}
          trackingEm={0}
          align="middle"
          color={c.text}
        />
      </At>
    </AbsoluteFill>
  );
};
export const WIDE_FORM_FIT = {
  cover: Cover,
  exterior: Exterior,
  interior: Interior,
  engine: (p: FamilySlideProps) => Facts({...p, family: 'wide_form'}),
  price: Price,
  cta: Cta,
  gallery: Gallery,
  history: History,
};
