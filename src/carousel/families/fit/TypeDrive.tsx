// Type Drive: крупная модель слева, винные плоскости, широкие окна фотографий.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Photo, LogoCorner, scale, upper, type FamilySlideProps} from '../kit';
import {Text as T, At} from './Text';
import {Contact, bottomAreas} from './Contact';
import {Facts, Gallery, History} from './Shared';

const Cover: React.FC<FamilySlideProps> = ({car, tx, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <LogoCorner on={c.bg} line={c.accent} />
      <At x={44} y={y(140)}>
        <T text={upper(car.brand)} field="name" w={620} h={90} max={62} color={c.text} trackingEm={0.3} weight={500} />
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={620}
          h={y(390)}
          max={470 * k}
          min={64}
          lines={3}
          color={c.text}
        />
      </At>
      <At x={730} y={y(170)}>
        <T text={car.year ? String(car.year) : ''} w={290} h={y(130)} max={84} color={c.text} nowrap weight={500} />
      </At>
      {car.mileageKm !== null && (
        <At
          x={700}
          y={y(330)}
          style={{
            width: 380,
            height: y(210),
            background: c.accent,
            borderRadius: '60px 0 0 24px',
            padding: '28px 34px',
          }}
        >
          <T
            text={upper(tx.km(car.mileageKm))}
            field="specs"
            w={300}
            h={y(120)}
            max={74}
            min={32}
            nowrap
            color={c.text}
          />
        </At>
      )}
      <Photo
        src={car.photos.hero}
        style={{left: 30, right: 30, top: y(640), bottom: 30, borderRadius: 48, border: `6px solid ${c.text}`}}
      />
    </AbsoluteFill>
  );
};
const Exterior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = [car.photos.rear, ...car.photos.exterior, car.photos.hero].filter(Boolean);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 300,
          bottom: 0,
          background: c.accent,
          borderTopLeftRadius: 120,
        }}
      />
      <LogoCorner on={c.light} line={c.accent} />
      <At x={44} y={y(120)}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={700}
          h={y(310)}
          max={170 * k}
          min={40}
          color={c.bg}
          lines={3}
        />
      </At>
      <Photo src={p[0]} style={{left: 40, right: 40, top: y(470), height: y(520), borderRadius: 44}} />
      <Photo src={p[1] ?? p[0]} style={{left: 40, width: 560, top: y(1020), bottom: 40, borderRadius: 36}} />
      {content.lines?.length && (
        <At x={630} y={y(1020)} style={{padding: '24px 26px', background: c.accent, borderRadius: 36}}>
          <T
            text={upper(content.lines.join('\n'))}
            field="text"
            w={358}
            h={h - y(1020) - 88}
            max={32 * k}
            min={26}
            color={c.text}
            tracking={2}
            weight={500}
            lines={8}
          />
        </At>
      )}
    </AbsoluteFill>
  );
};
const Interior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.accent}}>
      <LogoCorner on={c.accent} line={c.text} />
      <At x={40} y={y(110)}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={1000}
          h={y(200)}
          max={220 * k}
          min={36}
          lines={3}
          align="middle"
          color={c.text}
        />
      </At>
      <Photo
        src={car.photos.interiorShot ?? car.photos.hero}
        style={{left: 30, right: 30, top: y(330), bottom: 30, borderRadius: 48, border: `6px solid ${c.text}`}}
      />
    </AbsoluteFill>
  );
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <LogoCorner on={c.bg} line={c.accent} />
      <Photo
        src={car.photos.exterior[1] ?? car.photos.hero}
        style={{left: 30, right: 30, top: y(140), height: y(620), borderRadius: 48}}
      />
      <At
        x={30}
        y={y(800)}
        style={{width: 1020, height: h - y(800) - 30, background: c.accent, borderRadius: 56, padding: '30px 40px'}}
      >
        <T
          text={content.price ?? '—'}
          field="price"
          w={940}
          h={y(280)}
          max={260 * k}
          min={48}
          color={c.text}
          nowrap
          align="middle"
        />
        <T
          text={upper(content.priceLabel)}
          w={940}
          h={h - y(800) - 90 - y(280)}
          max={30}
          min={24}
          color={c.text}
          body
          trackingEm={0.32}
          align="middle"
        />
      </At>
    </AbsoluteFill>
  );
};
const Cta: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    b = bottomAreas(h, content, y(140));
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} line={c.accent} />
      <At x={40} y={y(140)}>
        <T
          text={upper(content.title)}
          field="title"
          w={1000}
          h={y(300)}
          max={190 * k}
          min={40}
          color={c.accent}
          align="end"
          lines={3}
        />
      </At>
      <Photo
        src={car.photos.hero}
        style={{left: 30, right: 30, top: y(470), height: b.photoEnd - y(470), borderRadius: 44}}
      />
      {content.contact && (
        <At
          x={30}
          y={b.contactY}
          style={{width: 1020, height: b.contactH, background: c.accent, borderRadius: 70, padding: '12px 48px'}}
        >
          <Contact contact={content.contact} w={800} color={c.text} />
          <span style={{position: 'absolute', right: 40, top: 40, fontSize: 60, color: c.text}}>→</span>
        </At>
      )}
      <At x={50} y={b.noteY}>
        <T
          text={upper(content.lines?.join('\n'))}
          field="text"
          w={980}
          h={b.noteH}
          max={26}
          min={24}
          color={c.bg}
          body
          weight={600}
          trackingEm={0.22}
          lines={4}
          align="middle"
        />
      </At>
    </AbsoluteFill>
  );
};
export const TYPE_DRIVE_FIT = {
  cover: Cover,
  exterior: Exterior,
  interior: Interior,
  engine: (p: FamilySlideProps) => Facts({...p, family: 'type_drive'}),
  price: Price,
  cta: Cta,
  gallery: Gallery,
  history: History,
};
