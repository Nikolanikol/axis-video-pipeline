// Дополнительные слайды и факты: исходные значения целиком, области в пикселях композиции.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {LogoCorner, Photo, scale, onAccent, upper, kmNumber, photosOf, type FamilySlideProps} from '../kit';
import {Text, At} from './Text';

export const Gallery: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const all = Array.from(
    new Set(
      [...(content.photos ?? []), ...car.photos.exterior, ...car.photos.interior, car.photos.hero].filter(Boolean),
    ),
  );
  const g = 24,
    cw = (1080 - g * 3) / 2,
    ch = (h - g * 3) / 2;
  return (
    <AbsoluteFill style={{background: colors.light}}>
      {[0, 1, 2, 3].map((i) => (
        <Photo
          key={i}
          src={all[i % Math.max(1, all.length)]}
          style={{
            left: g + (i % 2) * (cw + g),
            top: g + Math.floor(i / 2) * (ch + g),
            width: cw,
            height: ch,
            borderRadius: 36,
          }}
        />
      ))}
      <LogoCorner on={colors.light} />
      <At x={330} y={120} style={{padding: 22, borderRadius: 30, background: colors.accent}}>
        <Text
          text={upper(content.kicker ?? content.title)}
          field="section"
          w={620}
          h={150}
          max={96}
          color={onAccent(colors)}
        />
      </At>
    </AbsoluteFill>
  );
};
export const History: React.FC<FamilySlideProps> = ({car, content, colors, h}) => {
  const {k} = scale(h),
    ink = onAccent(colors),
    facts = content.facts ?? [],
    top = 420 * k;
  return (
    <AbsoluteFill style={{background: colors.accent}}>
      <LogoCorner on={colors.accent} />
      <At x={60} y={150 * k}>
        <Text
          text={upper(content.title)}
          field="title"
          w={960}
          h={230 * k}
          max={facts.length ? 110 * k : 150 * k}
          min={40}
          color={ink}
        />
      </At>
      {facts.length ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            top,
            width: 960,
            height: h - top - 70 * k,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: `repeat(${Math.ceil(facts.length / 2)}, 1fr)`,
            gap: '0 60px',
          }}
        >
          {facts.map((f, i) => (
            <div key={i} style={{borderTop: `4px solid ${ink}88`, paddingTop: 16 * k}}>
              <Text
                text={f.value}
                field="specs"
                w={450}
                h={(h - top - 70 * k) / Math.ceil(facts.length / 2) - 115}
                max={190 * k}
                min={48}
                nowrap
                color={ink}
              />
              <Text
                text={f.label}
                field="label"
                w={450}
                h={90}
                max={32}
                min={24}
                lines={3}
                body
                weight={600}
                color={ink}
              />
            </div>
          ))}
        </div>
      ) : (
        <Photo
          src={car.photos.rear ?? car.photos.hero}
          style={{left: 60, right: 60, bottom: 60 * k, height: h * 0.45, borderRadius: 40}}
        />
      )}
    </AbsoluteFill>
  );
};

export const Facts: React.FC<FamilySlideProps & {family: string}> = ({car, tx, colors: c, h, family}) => {
  const {y, k} = scale(h),
    p = photosOf(car),
    km = kmNumber(car.mileageKm, tx.locale),
    year = car.year ? String(car.year) : '';
  const rows = [upper(tx.value(car.fuel)), upper(tx.value(car.transmission))].filter(Boolean);
  const stat = (value: string, unit: string, w: number, height: number, max: number, color: string) => (
    <>
      <Text text={value} field="specs" w={w} h={height - 52} max={max} min={48} nowrap color={color} />
      <Text text={unit} field="label" w={w} h={48} max={36} min={24} nowrap color={color} />
    </>
  );
  const row = (value: string, w: number, height: number, color: string, weight = 700) => (
    <Text text={value} field="specs" w={w} h={height} max={64 * k} min={28} lines={2} color={color} weight={weight} />
  );
  if (family === 'urban_olive')
    return (
      <AbsoluteFill style={{background: c.light}}>
        <LogoCorner on={c.light} />
        <At x={40} y={h - 150} style={{transform: 'rotate(-90deg)', transformOrigin: '0 0'}}>
          {stat(km, tx.u.km, h - y(150) - 190, 220, 230 * k, c.bg)}
        </At>
        <div style={{position: 'absolute', left: 300, top: y(120), bottom: 40, width: 3, background: c.bg}} />
        <At x={340} y={y(110)}>
          {stat(year, tx.u.year, 700, y(300), 200 * k, c.bg)}
        </At>
        <Photo src={p.detail} style={{left: 340, right: 40, top: y(430), bottom: y(310), borderRadius: 36}} />
        <At x={340} y={h - y(280)}>
          {rows.map((r, i) => (
            <div key={i} style={{borderTop: `3px solid ${c.bg}33`, paddingTop: 12}}>
              {row(r, 700, y(115), c.bg)}
            </div>
          ))}
        </At>
      </AbsoluteFill>
    );
  if (family === 'contour_plum')
    return (
      <AbsoluteFill style={{background: c.accent}}>
        <LogoCorner on={c.accent} />
        <At x={44} y={y(130)}>
          {stat(year, tx.u.year, 650, y(360), 280 * k, c.bg)}
        </At>
        <Photo
          src={p.detail}
          style={{right: 30, top: y(130), width: 300, height: y(360), borderRadius: 44, border: `5px solid ${c.text}`}}
        />
        <At
          x={20}
          y={y(560)}
          style={{
            width: 1040,
            height: y(170),
            background: c.bg,
            transform: 'rotate(-5deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
          }}
        >
          {rows.map((r, i) => (
            <React.Fragment key={i}>{row(r, 440, y(145), c.text, 800)}</React.Fragment>
          ))}
        </At>
        <At x={44} y={y(820)}>
          {stat(km, tx.u.km, 992, h - y(820) - 50, 250 * k, c.text)}
        </At>
      </AbsoluteFill>
    );
  if (family === 'cobalt_shift')
    return (
      <AbsoluteFill style={{background: c.accent}}>
        <LogoCorner on={c.accent} />
        <Photo src={p.detail} style={{left: 60, top: y(150), width: 560, height: y(250), borderRadius: 40}} />
        <At x={660} y={y(150)}>
          {stat(year, tx.u.year, 360, y(250), 150 * k, '#FFFFFF')}
        </At>
        <At x={60} y={y(470)}>
          {stat(
            km || (car.displacementCc ? String(car.displacementCc / 1000) : ''),
            km ? tx.u.km : tx.u.l,
            960,
            y(400),
            290 * k,
            '#FFFFFF',
          )}
        </At>
        <At x={60} y={y(960)}>
          {rows.map((r, i) => (
            <div key={i} style={{borderTop: '3px solid #ffffff88', paddingTop: 12}}>
              {row(r, 960, y(140), '#FFFFFF')}
            </div>
          ))}
        </At>
      </AbsoluteFill>
    );
  if (family === 'type_drive')
    return (
      <AbsoluteFill style={{background: c.light}}>
        <LogoCorner on={c.light} />
        <At x={44} y={y(130)}>
          {stat(year, tx.u.year, 900, y(300), 290 * k, c.accent)}
        </At>
        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            top: y(470),
            bottom: 30,
            borderRadius: 56,
            background: c.accent,
          }}
        />
        <Photo src={p.detail} style={{right: 60, top: y(530), bottom: y(60), width: 380, borderRadius: 36}} />
        <At x={80} y={y(530)}>
          {stat(km, tx.u.km, 480, y(280), 150 * k, c.text)}
          {rows.map((r, i) => (
            <div key={i} style={{marginTop: y(45), borderTop: `3px solid ${c.text}55`, paddingTop: 16}}>
              {row(r, 480, y(130), c.text, 500)}
            </div>
          ))}
        </At>
      </AbsoluteFill>
    );
  const pulse = family === 'pulse_grid',
    bg = pulse ? c.light : c.bg,
    ink = pulse ? c.text : c.text;
  return (
    <AbsoluteFill style={{background: bg}}>
      <LogoCorner on={bg} />
      <At x={44} y={y(120)} style={pulse ? {transform: 'rotate(-5deg)', transformOrigin: '0 0'} : {}}>
        {stat(year, tx.u.year, 930, y(240), pulse ? 210 : 190, ink)}
        {stat(km, tx.u.km, 930, y(270), 200 * k, c.accent)}
      </At>
      <At x={50} y={y(650)} style={{display: 'flex', gap: 40}}>
        {rows.map((r, i) => (
          <div key={i} style={{borderLeft: `12px solid ${c.accent}`, paddingLeft: 20}}>
            {row(r, 420, y(110), ink, pulse ? 800 : 700)}
          </div>
        ))}
      </At>
      {pulse && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 520,
            height: y(620),
            background: c.accent,
            clipPath: 'polygon(40% 0,100% 0,100% 100%,0 100%)',
          }}
        />
      )}
      <Photo src={p.detail} style={{left: 30, right: pulse ? 120 : 30, top: y(790), bottom: 30, borderRadius: 40}} />
    </AbsoluteFill>
  );
};
