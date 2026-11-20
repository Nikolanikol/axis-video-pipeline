// Contour Plum: контурный номер, лавандовые ленты и скруглённые окна фотографий.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Photo, LogoCorner, photosOf, scale, upper, type FamilySlideProps} from '../kit';
import {Text, At} from './Text';
import {Contact, bottomAreas} from './Contact';
import {Facts, Gallery, History} from './Shared';
const T = (p: React.ComponentProps<typeof Text>) => <Text weight={800} {...p} />;
const Cover: React.FC<FamilySlideProps> = ({car, tx, colors: c, h}) => {
  const {y, k} = scale(h),
    titleH = h - y(690) - y(110) - 90;
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: y(600),
          bottom: 0,
          background: c.accent,
          borderTopLeftRadius: 140,
        }}
      />
      <Photo src={car.photos.hero} style={{left: 30, right: 30, top: 30, height: y(620), borderRadius: 56}} />
      <LogoCorner on={c.bg} left={60} top={56} />
      <At x={50} y={y(690)}>
        <T
          text={upper(car.brand)}
          field="name"
          w={980}
          h={titleH * 0.4}
          max={190 * k}
          min={36}
          lines={2}
          align="middle"
          color={c.bg}
        />
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={980}
          h={titleH * 0.6}
          max={230 * k}
          min={40}
          lines={3}
          align="middle"
          color={c.text}
        />
      </At>
      <At
        x={50}
        y={h - y(110) - 46}
        style={{
          width: 980,
          height: y(110),
          borderRadius: 55,
          background: c.bg,
          padding: '10px 40px',
          display: 'flex',
          gap: 40,
          alignItems: 'center',
        }}
      >
        <T
          text={car.year ? String(car.year) : ''}
          w={330}
          h={y(110) - 20}
          max={58}
          min={32}
          color={c.text}
          nowrap
          align="middle"
        />
        <div style={{width: 3, height: 50, background: c.text}} />
        <T
          text={car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : ''}
          field="specs"
          w={500}
          h={y(110) - 20}
          max={58}
          min={28}
          color={c.text}
          nowrap
          align="middle"
        />
      </At>
    </AbsoluteFill>
  );
};
const Exterior: React.FC<FamilySlideProps> = ({car, content, index, colors: c, h}) => {
  const {y} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <LogoCorner on={c.bg} />
      <At x={40} y={y(150)}>
        <T
          text={String(index).padStart(2, '0').split('').join('\n')}
          w={230}
          h={h - y(150) - 40}
          max={470}
          min={80}
          lines={2}
          color="transparent"
          align="middle"
          outline={{color: c.accent, width: 6}}
        />
      </At>
      <Photo src={p.exterior[0]} style={{left: 300, right: 30, top: 30, height: y(470), borderRadius: 48}} />
      <Photo
        src={p.exterior[1] ?? p.exterior[0]}
        style={{left: 300, right: 30, top: y(530), height: y(470), borderRadius: 48}}
      />
      <At
        x={300}
        y={y(1030)}
        style={{width: 750, height: h - y(1030) - 30, borderRadius: 48, background: c.accent, padding: '18px 30px'}}
      >
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={690}
          h={h - y(1030) - 66}
          max={96}
          min={32}
          lines={4}
          align="middle"
          color={c.bg}
        />
      </At>
    </AbsoluteFill>
  );
};
const Interior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <Photo src={p.interior[0]} style={{left: 30, width: 495, top: y(130), height: y(830), borderRadius: 48}} />
      <Photo
        src={p.interior[1] ?? p.interior[0]}
        style={{right: 30, width: 495, top: y(130), height: y(830), borderRadius: 48}}
      />
      <At
        x={30}
        y={y(990)}
        style={{width: 1020, height: h - y(990) - 30, borderRadius: 60, background: c.accent, padding: '18px 30px'}}
      >
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={960}
          h={h - y(990) - 66}
          max={220 * k}
          min={34}
          lines={3}
          align="middle"
          color={c.bg}
        />
      </At>
    </AbsoluteFill>
  );
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <Photo
        src={car.photos.exterior[1] ?? car.photos.hero}
        style={{left: 30, right: 30, top: 30, height: y(760), borderRadius: 56, border: `6px solid ${c.accent}`}}
      />
      <LogoCorner on={c.bg} left={60} top={56} />
      <At x={50} y={y(830)}>
        <T
          text={content.price ?? '—'}
          field="price"
          w={980}
          h={y(270)}
          max={230 * k}
          min={48}
          nowrap
          align="middle"
          color={c.text}
        />
        <div style={{borderRadius: 50, background: c.accent, padding: '16px 44px'}}>
          <T
            text={upper(content.priceLabel)}
            w={892}
            h={h - y(1100) - 80}
            max={56}
            min={26}
            lines={3}
            align="middle"
            color={c.bg}
          />
        </div>
      </At>
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
          right: -40,
          top: -40,
          width: 150,
          height: y(420),
          background: c.accent,
          borderRadius: '0 0 0 140px',
        }}
      />
      <At x={40} y={y(140)}>
        <T text={upper(content.title)} field="title" w={880} h={y(290)} max={180 * k} min={36} lines={3} color={c.bg} />
      </At>
      <Photo
        src={car.photos.rear ?? car.photos.hero}
        style={{left: 30, right: 30, top: y(460), height: b.photoEnd - y(460), borderRadius: 56}}
      />
      {content.contact && (
        <At
          x={30}
          y={b.contactY}
          style={{width: 1020, height: b.contactH, borderRadius: 70, background: c.bg, padding: '12px 48px'}}
        >
          <Contact contact={content.contact} w={790} color={c.text} headWeight={800} max={62} />
          <span style={{position: 'absolute', right: 35, top: 40, fontSize: 60, color: c.accent}}>›</span>
        </At>
      )}
      <At x={50} y={b.noteY}>
        <T
          text={upper(content.lines?.join('\n'))}
          field="text"
          w={980}
          h={b.noteH}
          max={32}
          min={26}
          lines={4}
          align="middle"
          color={c.bg}
        />
      </At>
    </AbsoluteFill>
  );
};
export const CONTOUR_PLUM_FIT = {
  cover: Cover,
  exterior: Exterior,
  interior: Interior,
  engine: (p: FamilySlideProps) => Facts({...p, family: 'contour_plum'}),
  price: Price,
  cta: Cta,
  gallery: Gallery,
  history: History,
};
