// Формат «Авто с ценой» (price-ad): хук → характеристики → маршрут и цена до порта → призыв.
// Тайминги сцен — в config/formats.json.
import React from 'react';
import {AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Contacts, CarTitle, PriceTag} from '../../shared/blocks';
import {getFormat, resolveAd, themeOf} from '../../shared/model';
import {BackgroundMusic} from '../../shared/music';
import type {Ad, AdProps} from '../../shared/types';
import {BODY, CopperText, HEAD, Metal, PAD, Photo, Shade, ThemeProvider, TopLogo, clamp, lines, useTheme} from '../../shared/ui';

const FORMAT = getFormat('price-ad');

// Сцена 1: хук
const Hook: React.FC<{ad: Ad}> = ({ad}) => (
  <AbsoluteFill>
    <Photo src={ad.photos[0]} dur={useVideoConfig().durationInFrames} />
    <Shade />
    <CarTitle brand={ad.brand} model={ad.model} year={ad.year} trim={ad.trim} tagline={ad.texts.hookTagline} />
    <TopLogo />
  </AbsoluteFill>
);

// Сцена 2: характеристики
const Specs: React.FC<{ad: Ad}> = ({ad}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const half = Math.round(durationInFrames / 2);
  const [p0, p1, p2] = ad.photos;
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={half}><Photo src={p1 ?? p0} dur={half} /></Sequence>
      <Sequence from={half}><Photo src={p2 ?? p1 ?? p0} dur={durationInFrames - half} /></Sequence>
      <Shade />
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'flex-start', padding: PAD, gap: 20}}>
        {ad.specs.filter(Boolean).map((s, i) => {
          const a = spring({frame: f - 8 - i * 9, fps, config: {damping: 200}});
          return (
            <div key={i} style={{display: 'flex', alignItems: 'stretch', opacity: a, transform: `translateX(${(1 - a) * -60}px)`,
              background: `${C.panel}e0`}}>
              <Metal style={{width: 12}} />
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 52, color: C.white, padding: '22px 34px'}}>{s}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <TopLogo />
    </AbsoluteFill>
  );
};

// Сцена 3: маршрут и цена — главный момент ролика
const Route: React.FC<{ad: Ad}> = ({ad}) => {
  const C = useTheme();
  const f = useCurrentFrame();
  const prog = interpolate(f, [5, 55], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const pulse = interpolate(f, [55, 75], [0, 1], clamp);
  // Дуга маршрута и позиция контейнера на ней
  const P = [[150, 470], [350, 190], [730, 190], [930, 470]];
  const len = 930;
  const t = prog;
  const bez = (i: 0 | 1) => (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t ** 2 * P[2][i] + t ** 3 * P[3][i];
  const [bx, by] = [bez(0), bez(1)];
  const d = `M ${P[0].join(' ')} C ${P[1].join(' ')}, ${P[2].join(' ')}, ${P[3].join(' ')}`;
  const city = {fontFamily: HEAD, fontWeight: 500, fontSize: 52, textTransform: 'uppercase'} as const;
  const country = {fontFamily: BODY, fontWeight: 500, fontSize: 30} as const;
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 30%, ${C.panel} 0%, ${C.bg} 65%)`}}>
      <AbsoluteFill style={{alignItems: 'center', top: 330, opacity: 0.06}}>
        <Img src={staticFile('brand/sign.svg')} style={{width: 760}} />
      </AbsoluteFill>
      <svg width={1080} height={700} style={{position: 'absolute', top: 270}}>
        <defs>
          <linearGradient id="copper" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={C.copperDark} />
            <stop offset="0.5" stopColor={C.copperLight} />
            <stop offset="1" stopColor={C.copper} />
          </linearGradient>
        </defs>
        <path d={d} stroke={C.line} strokeWidth={8} fill="none" strokeDasharray="4 22" strokeLinecap="round" />
        <path d={d} stroke="url(#copper)" strokeWidth={8} fill="none" strokeDasharray={len} strokeDashoffset={len * (1 - prog)} strokeLinecap="round" />
        <circle cx={P[0][0]} cy={P[0][1]} r={18} fill={C.white} />
        <circle cx={P[3][0]} cy={P[3][1]} r={18} fill={prog > 0.98 ? C.copperLight : C.line} />
        {prog > 0.98 && <circle cx={P[3][0]} cy={P[3][1]} r={18 + 30 * pulse}
          fill="none" stroke={C.copperLight} strokeWidth={3} opacity={0.9 * (1 - pulse)} />}
        {/* контейнер */}
        <g transform={`translate(${bx - 40} ${by - 24})`}>
          <rect width={80} height={48} rx={4} fill="url(#copper)" />
          {[16, 32, 48, 64].map((x) => <rect key={x} x={x - 1.5} y={8} width={3} height={32} fill={C.copperDark} opacity={0.7} />)}
        </g>
        <text x={P[0][0]} y={550} textAnchor="middle" fill={C.white} style={city}>{ad.origin}</text>
        <text x={P[0][0]} y={600} textAnchor="middle" fill={C.grey} style={country}>{ad.originCountry}</text>
        <text x={P[3][0]} y={550} textAnchor="middle" fill={C.white} style={city}>{ad.port}</text>
        <text x={P[3][0]} y={600} textAnchor="middle" fill={C.grey} style={country}>{ad.portCountry}</text>
      </svg>
      <PriceTag ad={ad} delay={45} />
      <TopLogo />
    </AbsoluteFill>
  );
};

// Сцена 4: призыв
const Cta: React.FC<{ad: Ad}> = ({ad}) => {
  const C = useTheme();
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const logo = spring({frame: f - 2, fps, config: {damping: 200}});
  const a = spring({frame: f - 10, fps, config: {damping: 200}});
  const b = spring({frame: f - 22, fps, config: {damping: 200}});
  const c = spring({frame: f - 32, fps, config: {damping: 200}});
  const rise = (v: number) => ({opacity: v, transform: `translateY(${(1 - v) * 50}px)`});
  const row: React.CSSProperties = {display: 'flex', alignItems: 'center', gap: 30};
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 18%, ${C.panel} 0%, ${C.bg} 60%)`,
      padding: '190px 150px 360px 80px', alignItems: 'center'}}>
      <Img src={staticFile('brand/logo-stacked.svg')} style={{height: 260, opacity: logo, transform: `scale(${0.9 + 0.1 * logo})`}} />
      <div style={{...rise(a), marginTop: 100, alignSelf: 'stretch'}}>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 120, lineHeight: 1.04, color: C.white, textTransform: 'uppercase'}}>
          {lines(ad.texts.ctaTitle)}<br />
          <CopperText>{lines(ad.texts.ctaAccent)}</CopperText>
        </div>
      </div>
      <div style={{...rise(b), ...row, marginTop: 70, alignSelf: 'stretch'}}>
        <Img src={staticFile('brand/icon-handshake.png')} style={{width: 100}} />
        <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 46, color: C.white}}>{ad.texts.ctaBenefit}</div>
      </div>
      <div style={{...rise(c), marginTop: 'auto', alignSelf: 'stretch'}}>
        <Contacts whatsapp={ad.whatsapp} whatsappLabel={ad.texts.whatsappLabel} site={ad.site} />
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<string, React.FC<{ad: Ad}>> = {hook: Hook, specs: Specs, price: Route, cta: Cta};

export const PriceAd: React.FC<AdProps> = (props) => {
  const ad = resolveAd(props);
  const theme = themeOf(props.theme);
  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.bg}}>
        {FORMAT.scenes.map((s) => {
          const Scene = SCENES[s.id];
          return <Sequence key={s.id} name={s.title} from={s.from} durationInFrames={s.frames}><Scene ad={ad} /></Sequence>;
        })}
        <BackgroundMusic music={ad.music} bpm={FORMAT.bpm} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
