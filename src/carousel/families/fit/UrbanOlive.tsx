// Urban Olive: контур модели, вертикальные надписи, ступенчатое фото и лаймовая панель.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Photo, LogoCorner, photosOf, scale, upper, type FamilySlideProps} from '../kit';
import {Text as T, At} from './Text';
import {Contact} from './Contact';
import {Facts, Gallery, History} from './Shared';
const Cover: React.FC<FamilySlideProps> = ({car, tx, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <Photo src={car.photos.hero} style={{left: 0, right: 0, top: 0, height: y(880)}} />
      <LogoCorner on={c.bg} />
      <At x={44} y={y(930)}>
        <T text={upper(car.brand)} field="name" w={570} h={y(75)} max={64} min={28} color={c.bg} />
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={570}
          h={h - y(1005) - 30}
          max={320 * k}
          min={48}
          lines={3}
          color="transparent"
          outline={{color: c.bg, width: 6}}
        />
      </At>
      <At
        x={670}
        y={y(930)}
        style={{width: 380, height: h - y(930) - 30, borderRadius: 48, background: c.bg, padding: '20px 30px'}}
      >
        <T
          text={car.year ? String(car.year) : ''}
          w={320}
          h={(h - y(930) - 70) * 0.55}
          max={140}
          min={40}
          nowrap
          align="middle"
          color={c.accent}
        />
        <T
          text={car.mileageKm !== null ? upper(tx.km(car.mileageKm)) : ''}
          field="specs"
          w={320}
          h={(h - y(930) - 70) * 0.45}
          max={64}
          min={30}
          nowrap
          align="middle"
          color={c.text}
        />
      </At>
    </AbsoluteFill>
  );
};
const Exterior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <Photo src={p.exterior[0]} style={{left: 0, right: 0, top: 0, height: y(700)}} />
      <LogoCorner on={c.bg} />
      <Photo
        src={p.exterior[1] ?? p.exterior[0]}
        style={{left: 30, width: 520, top: y(730), bottom: 30, borderRadius: 40}}
      />
      <At x={590} y={y(760)}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={450}
          h={h - y(760) - 110}
          max={140 * k}
          min={36}
          lines={5}
          color={c.bg}
        />
        <div style={{height: 16, borderRadius: 8, background: c.accent, marginTop: 24, width: 380}} />
      </At>
    </AbsoluteFill>
  );
};
const Interior: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    p = photosOf(car);
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <LogoCorner on={c.bg} />
      <At x={40} y={h - 100} style={{transform: 'rotate(-90deg)', transformOrigin: '0 0'}}>
        <T
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={h - y(150) - 100}
          h={230}
          max={230 * k}
          min={40}
          lines={2}
          color={c.accent}
        />
      </At>
      <div
        style={{
          position: 'absolute',
          left: 40,
          bottom: 30,
          width: 70,
          height: 70,
          borderLeft: `10px solid ${c.accent}`,
          borderBottom: `10px solid ${c.accent}`,
        }}
      />
      <Photo
        src={p.interior[0]}
        style={{left: 300, right: 30, top: 30, height: y(630), borderRadius: 40, border: `5px solid ${c.text}`}}
      />
      <Photo
        src={p.interior[1] ?? p.interior[0]}
        style={{left: 300, right: 30, top: y(690), bottom: 30, borderRadius: 40, border: `5px solid ${c.text}`}}
      />
    </AbsoluteFill>
  );
};
const Price: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h);
  return (
    <AbsoluteFill style={{background: c.light}}>
      <LogoCorner on={c.light} />
      <At x={44} y={y(130)}>
        <T text={content.price ?? '—'} field="price" w={990} h={y(230)} max={250 * k} min={48} nowrap color={c.bg} />
        <div style={{height: 12, background: c.accent, width: 120, borderRadius: 6}} />
        <T text={upper(content.priceLabel)} w={990} h={y(110)} max={40} min={26} lines={3} color={c.bg} />
      </At>
      <Photo
        src={car.photos.hero}
        style={{left: 30, right: 30, top: y(500), bottom: 30, borderRadius: 40, border: `5px solid ${c.bg}`}}
      />
    </AbsoluteFill>
  );
};
const Cta: React.FC<FamilySlideProps> = ({car, content, colors: c, h}) => {
  const {y, k} = scale(h),
    panelY = y(500),
    panelH = h - panelY,
    titleH = content.contact ? panelH * 0.27 : panelH * 0.42,
    contactH = content.contact ? (content.contact.secondary ? 204 : 164) : 0,
    noteH = panelH - titleH - contactH - 110;
  return (
    <AbsoluteFill style={{background: c.bg}}>
      <LogoCorner on={c.bg} />
      <At x={30} y={h - 40} style={{transform: 'rotate(-90deg)', transformOrigin: '0 0'}}>
        <T
          text={upper(car.model || car.brand)}
          field="name"
          w={h - y(150) - 40}
          h={220}
          max={260 * k}
          min={48}
          lines={2}
          color="transparent"
          outline={{color: c.accent, width: 6}}
        />
      </At>
      <Photo src={car.photos.hero} style={{left: 280, right: 0, top: 0, height: panelY}} />
      <At x={280} y={panelY} style={{width: 800, height: panelH, background: c.accent, padding: '30px 46px'}}>
        <T text={upper(content.title)} field="title" w={708} h={titleH} max={110 * k} min={36} lines={4} color={c.bg} />
        {content.contact && (
          <div style={{marginTop: 20, padding: '12px 26px', height: contactH, borderRadius: 60, background: c.bg}}>
            <Contact contact={content.contact} w={590} color={c.text} max={60} />
          </div>
        )}
        <div style={{marginTop: 20}}>
          <T
            text={upper(content.lines?.join('\n'))}
            field="text"
            w={708}
            h={noteH}
            max={34}
            min={26}
            lines={5}
            color={c.bg}
          />
        </div>
      </At>
    </AbsoluteFill>
  );
};
export const URBAN_OLIVE_FIT = {
  cover: Cover,
  exterior: Exterior,
  interior: Interior,
  engine: (p: FamilySlideProps) => Facts({...p, family: 'urban_olive'}),
  price: Price,
  cta: Cta,
  gallery: Gallery,
  history: History,
};
