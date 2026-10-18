// Одна библиотека компоновок для неподвижных слайдов и сцен ролика.
// Размер и безопасные поля считаются от композиции, поэтому формат не задаёт дизайн.
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {DesignId} from '../shared/types';
import {BODY, HEAD, Logo, clamp, useTheme} from '../shared/ui';
import {MotionTitle, easeOut, motionOf, photoMotion, priceMotion, textDelay} from './motion';

export type DesignFact = {label?: string; value: string};
export type DesignContent = {
  kind: 'cover' | 'facts' | 'gallery' | 'price' | 'cta';
  // kicker — рубрика мелко над заголовком, когда заголовок — фраза, а не название раздела
  title: string; kicker?: string; eyebrow?: string; subtitle?: string; photo?: string | null; photos?: string[];
  previousPhotos?: string[]; photoProgress?: number; collage?: boolean;
  // Другие фото объявления — для «Стопки» (задние снимки) и «Крупнее о деталях» (общий вид под деталью)
  spare?: string[];
  facts?: DesignFact[]; lines?: string[]; price?: string; priceLabel?: string;
  contact?: {label: string; value: string; secondary?: string};
};

const asset = (url: string) => /^(https?:|data:|blob:|\/)/.test(url) ? url : staticFile(url);
const fit = (text: string, width: number, max: number, min = 32) => Math.max(min, Math.min(max, width / (Math.max(1, text.length) * 0.59)));
const light = (hex: string) => parseInt(hex.slice(1, 3), 16) * .2126 + parseInt(hex.slice(3, 5), 16) * .7152 + parseInt(hex.slice(5, 7), 16) * .0722 > 155;

export const DesignSlide: React.FC<{content: DesignContent; design: DesignId; index?: number; total?: number;
  animated?: boolean; variant?: number}> = ({content: c, design, index = 1, total = 1, animated = false, variant = 0}) => {
  const C = useTheme();
  const {width: w, height: h, fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const portrait = h / w > 1.6;
  const crop = !animated && portrait ? (h - w * 1.25) / 2 : 0;
  const left = 64;
  const right = animated ? 150 : 64;
  const top = animated ? 128 : crop + 64;
  const bottom = animated ? 340 : crop + 64;
  const areaW = w - left - right;
  const areaH = h - top - bottom;
  const compact = areaH < 1000;
  const direction = Math.abs(Math.trunc(variant)) % 2;
  // Движение сцены (motion.tsx): заголовок, цена и фото — свои приёмы, остальное — прежнее
  // мягкое появление; подписи ждут фото, если оно раскрывается («Окно», «Общий объект»)
  const motion = motionOf(C, design);
  const delay = textDelay(motion.slide);
  const t = frame / fps;
  const entrance = animated ? interpolate(frame, [Math.round(fps * delay), Math.round(fps * (delay + .5))], [0, 1], clamp) : 1;
  const move: React.CSSProperties = animated ? {opacity: entrance, transform: design === 'catalog'
    ? `translateX(${(1 - entrance) * -32}px)` : `translateY(${(1 - entrance) * 24}px)`} : {};
  const safe: React.CSSProperties = {position: 'absolute', left, right, top, bottom};
  // Заголовок-фраза («Салон, в котором хочется ехать») идёт в две строки: подбор под одну строку
  // ужал бы его до 42 px. Название модели и рубрика — по-прежнему в одну
  const titleSize = fit(c.title, areaW * (c.kicker && c.kind !== 'cover' ? 1.9 : 1), c.kind === 'cover' ? (compact ? 122 : 160) : (compact ? 76 : 94), 36);
  const bodySize = compact ? 30 : 38;
  // Высота рубрики и заголовка: в «Редакционном» фото стоит под ними, и при заголовке-фразе в две
  // строки (или с рубрикой) прежний отступ 265/335 px давал наезд текста на фото (проба 19.10).
  // 0,55 — средняя ширина буквы заголовочных шрифтов пресетов в долях кегля
  const kickerH = c.kicker ? (compact ? 24 : 28) * 1.2 + (compact ? 12 : 18) : 0;
  const titleLines = Math.max(1, Math.ceil(c.title.length * titleSize * .55 / areaW));
  const headingH = kickerH + titleLines * titleSize * 1.06;
  // Без рубрики — прежние отступы, чтобы ролик и старые слайды не сдвинулись
  const below = (base: number) => c.kicker ? Math.max(base, 115 + headingH + (compact ? 30 : 45)) : base;
  const photos = (c.photos?.length ? c.photos : c.photo ? [c.photo] : []).filter(Boolean);
  const hasImageLogo = C.assets?.logoHorizontal !== '';
  const header = (
    <div style={{position: 'absolute', left, right, top, height: 70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22, zIndex: 3}}>
      <div style={{maxWidth: areaW * .57, overflow: 'hidden', ...(light(C.bg) && hasImageLogo
        ? {background: '#171719', padding: '12px 18px', borderRadius: 4} : {})}}>
        <Logo asset="logoHorizontal" height={46} width={Math.min(380, areaW * .48)} style={{textAlign: 'left', objectFit: 'contain', objectPosition: 'left'}} />
      </div>
      <div style={{fontFamily: BODY, fontSize: compact ? 23 : 27, color: C.grey, textAlign: 'right', maxWidth: areaW * .4, overflowWrap: 'anywhere'}}>{c.eyebrow}</div>
    </div>
  );
  const footer = (
    <div style={{position: 'absolute', bottom, left, right, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
      borderTop: `1px solid ${C.line}`, paddingTop: 22, fontFamily: BODY, fontSize: 23, color: C.grey, zIndex: 3}}>
      <span style={{maxWidth: areaW * .78, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'}}>{c.subtitle || C.name}</span>
      <span style={{whiteSpace: 'nowrap'}}>{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    </div>
  );
  const heading = (size = titleSize, color = C.white) => <>
    {c.kicker && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: compact ? 24 : 28, letterSpacing: '.08em', textTransform: 'uppercase',
      color: C.copper, marginBottom: compact ? 12 : 18, overflowWrap: 'anywhere', ...(animated ? {opacity: entrance} : {})}}>{c.kicker}</div>}
    <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: size, lineHeight: 1.06, color, overflowWrap: 'anywhere'}}>
      {/* Вторая надпись «Смены надписи» — год и комплектация у обложки; в других сценах её нет, и приём сам
          становится построчным появлением. Текст на акцентной плашке — цветом фона, как у кнопки контакта */}
      {animated ? <MotionTitle text={c.title} kind={motion.text} t={t - delay} size={size} width={areaW}
        colors={{accent: C.copper, onAccent: C.bg, panel: C.panel}} swap={c.kind === 'cover' ? c.subtitle : undefined} /> : c.title}
    </div>
  </>;
  const image = (style: React.CSSProperties, collage = false) => {
    // «Стопке» нужны два других снимка, «Деталям» — один; иначе, как советует пакет, — «Окно».
    // Коллажу и галерее они не подходят: там несколько фото в одной рамке
    const spare = (c.spare ?? []).filter((url) => !photos.includes(url));
    const single = !(collage || c.collage) && photos.length > 0;
    const slide = motion.slide === 'stack' ? (single && spare.length >= 2 ? 'stack' : 'window')
      : motion.slide === 'detail' ? (single && spare.length >= 1 ? 'detail' : 'window') : motion.slide;
    const pm = animated ? photoMotion(slide, t) : {frame: {}};
    // «Тихий проезд» заменяет прежнее приближение «Кино»; у остальных смен «Кино» его сохраняет
    const zoom = pm.img ?? (animated && design === 'cinema' ? `scale(${interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1, 1.045], clamp)})` : undefined);
    const block = (list: string[], opacity = 1) => <div style={{position: 'absolute', inset: 0, opacity}}>
      {(collage || c.collage) && list.length > 1 ? <div style={{display: 'grid', gridTemplateColumns: direction ? '1fr 1fr' : '2fr 1fr',
        gridTemplateRows: list.length > 2 ? '1fr 1fr' : '1fr', height: '100%', gap: 12}}>
        {list.slice(0, 3).map((url, i) => <Img key={`${url}-${i}`} src={asset(url)} style={{width: '100%', height: '100%', minHeight: 0,
          gridRow: list.length > 2 && i === 0 ? 'span 2' : undefined, objectFit: 'cover', objectPosition: '50% 58%'}} />)}
      </div> : list[0] ? <Img src={asset(list[0])} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 58%',
        transform: zoom}} /> : null}
    </div>;
    const fill = (url: string, extra: React.CSSProperties = {}) => <Img src={asset(url)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%',
      objectFit: 'cover', objectPosition: '50% 58%', ...extra}} />;
    if (animated && slide === 'stack') {
      // Два снимка лежат сзади под ±4°, главный садится снизу за 0,8 с с мягкой тенью — без отскока
      const v = easeOut(t / .8);
      return <div style={{position: 'absolute', overflow: 'hidden', background: C.panel, ...style}}>
        {[4, -4].map((deg, i) => <div key={deg} style={{position: 'absolute', inset: 0, transform: `scale(.86) rotate(${deg}deg)`,
          boxShadow: '0 16px 40px rgba(0,0,0,.35)', overflow: 'hidden'}}>{fill(spare[i])}</div>)}
        <div style={{position: 'absolute', inset: 0, transform: `translateY(${(1 - v) * 38}%)`, boxShadow: v < 1 ? '0 -12px 40px rgba(0,0,0,.35)' : undefined}}>
          {block(photos, c.photoProgress ?? 1)}
        </div>
      </div>;
    }
    if (animated && slide === 'detail') {
      // Общий вид — другое настоящее фото объявления; поверх него из угла раскрывается фото сцены
      // (с 0,45 с за 0,7 с). Деталь не выдумываем и не увеличиваем кадр — только настоящие снимки
      const z = easeOut((t - .45) / .7);
      return <div style={{position: 'absolute', overflow: 'hidden', background: C.panel, ...style}}>
        {fill(spare[0])}
        <div style={{position: 'absolute', right: 0, bottom: 0, width: `${z * 100}%`, height: `${z * 100}%`, overflow: 'hidden'}}>
          {block(photos, c.photoProgress ?? 1)}
        </div>
      </div>;
    }
    return <div style={{position: 'absolute', overflow: 'hidden', background: C.panel, ...style, ...pm.frame}}>
      {c.previousPhotos?.length ? block(c.previousPhotos) : null}{block(photos, c.photoProgress ?? 1)}
    </div>;
  };
  // Цена — своим въездом, остальные подробности — общим появлением (move)
  const price = animated ? priceMotion(t - delay) : null;
  const details = (availableWidth: number, dense = false) => {
    // При цене общее появление переходит с колонки на строки под ней — иначе оно гасило бы и въезд цены
    const own = Boolean(price && c.price);
    const rest = own ? move : {};
    return (
    <div style={{...(own ? {} : move), display: 'flex', flexDirection: 'column', gap: compact ? 14 : 24, minWidth: 0}}>
      {c.price && <div>
        <div style={{fontFamily: BODY, fontSize: compact ? 25 : 30, color: C.grey, marginBottom: 15, ...(price ? price.label : {})}}>{c.priceLabel}</div>
        <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fit(c.price, availableWidth, compact ? 118 : 162, 42), lineHeight: 1.05, color: C.copper, whiteSpace: 'nowrap', ...(price ? price.mask : {})}}>
          {price ? <span style={price.figure}>{c.price}</span> : c.price}
        </div>
      </div>}
      {/* Под фразой — три опции, на квадрате две: с заголовком в две строки и текстом остальные уходили на подвал */}
      {(c.facts ?? []).slice(0, (dense ? 4 : 5) - (c.kicker && c.lines?.length ? (compact ? 2 : 1) : 0)).map((fact, i) => <div key={`${i}-${fact.value}`} style={{...rest, borderBottom: `1px solid ${C.line}`, paddingBottom: compact ? 14 : 22,
        ...(design === 'catalog' ? {display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24} : {})}}>
        {fact.label && <div style={{fontFamily: BODY, fontSize: compact ? 25 : 29, color: C.grey, marginBottom: design === 'catalog' ? 0 : 7}}>{fact.label}</div>}
        <div style={{fontFamily: design === 'editorial' ? HEAD : BODY, fontWeight: 500,
          fontSize: fit(fact.value, availableWidth * (design === 'catalog' && fact.label ? .57 : 1), dense ? 42 : 54, 28),
          lineHeight: 1.18, color: C.white, overflowWrap: 'anywhere'}}>{fact.value}</div>
      </div>)}
      {(c.lines ?? []).slice(0, dense ? 3 : 4).map((line, i) => <div key={i} style={{...rest, fontFamily: BODY, fontSize: dense ? bodySize - 3 : bodySize,
        lineHeight: 1.35, color: C.grey, overflowWrap: 'anywhere'}}>{line}</div>)}
      {c.contact && <div style={{...rest, marginTop: 15}}>
        <div style={{fontFamily: BODY, fontSize: compact ? 26 : 32, color: C.grey, marginBottom: 15}}>{c.contact.label}</div>
        <div style={{fontFamily: HEAD, fontWeight: 600, fontSize: fit(c.contact.value, availableWidth - 40, compact ? 60 : 78, 26), lineHeight: 1.2,
          background: C.copper, color: C.bg, padding: '22px 20px', overflowWrap: 'anywhere'}}>{c.contact.value}</div>
        {c.contact.secondary && <div style={{fontFamily: BODY, fontSize: 28, color: C.grey, marginTop: 22, overflowWrap: 'anywhere'}}>{c.contact.secondary}</div>}
      </div>}
    </div>
    );
  };
  const cover = c.kind === 'cover';
  const gallery = c.kind === 'gallery';
  return (
    <AbsoluteFill style={{background: C.bg, color: C.white}}>
      {design === 'cinema' ? <>
        {image({inset: 0}, gallery)}
        <AbsoluteFill style={{background: direction && cover
          ? `linear-gradient(to bottom, ${C.bg} 0%, ${C.bg}ee 34%, ${C.bg}22 66%, ${C.bg} 94%)`
          : `linear-gradient(to bottom, ${C.bg}f5 0%, ${C.bg}bb 16%, ${C.bg}22 35%, ${C.bg}ee 61%, ${C.bg} 84%)`}} />
        <div style={{position: 'absolute', left, right, ...(direction && cover ? {top: top + 130} : {bottom: bottom + 95})}}>
          {heading()}
          <div style={{marginTop: compact ? 26 : 40}}>{details(areaW, true)}</div>
        </div>
      </> : design === 'editorial' ? <>
        <div style={{...safe, top: top + 115}}>{heading(titleSize, C.copper)}</div>
        {cover || gallery ? <>
          {image({left: direction ? left + areaW * .1 : left, right, top: top + below(compact ? 275 : 335), bottom: bottom + (c.price ? 390 : c.lines?.length ? 210 : 125)}, gallery || Boolean(direction))}
          <div style={{position: 'absolute', left, right, bottom: bottom + 100}}>{details(areaW, true)}</div>
        </> : <>
          {image({left: direction ? left + areaW * .59 : left, width: areaW * .42, top: top + below(265), bottom: bottom + 110})}
          <div style={{position: 'absolute', top: top + below(265), left: direction ? left : left + areaW * .47, width: areaW * .53,
            borderLeft: `3px solid ${C.copper}`, paddingLeft: 25}}>{details(areaW * .53 - 25, true)}</div>
        </>}
      </> : <>
        {image({left: 0, right: 0, top: top + 105, height: areaH * (cover || gallery ? .48 : .29)}, gallery || Boolean(direction))}
        <div style={{position: 'absolute', left, right, top: top + 140 + areaH * (cover || gallery ? .48 : .29)}}>
          {heading(titleSize, cover ? C.white : C.copper)}
          <div style={{marginTop: compact ? 24 : 36}}>{details(areaW, true)}</div>
        </div>
      </>}
      {header}{footer}
    </AbsoluteFill>
  );
};
