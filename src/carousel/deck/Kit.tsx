// Детали слайдов новых форматов карусели («Витрина», «Разворот», «Полная»).
//
// Каркас по образцам владельца (27 сентября): сверху логотип и рубрика с короткой линией,
// заголовок в две строки с одним словом в цвете акцента, внизу счётчик «03 / 09» с полосой
// прогресса и круглая стрелка «листай дальше». Размер кадра берётся из композиции —
// одни и те же детали рисуют и квадрат 1080×1080, и 4:5 1080×1350.
import React from 'react';
import {AbsoluteFill, Img, useVideoConfig} from 'remotion';
import {
  TbArrowRight, TbBrandTelegram, TbBrandWhatsapp, TbCircleCheck, TbCreditCard, TbEye, TbFileText,
  TbHeadset, TbHeartHandshake, TbPlane, TbSearch, TbShieldCheck, TbShip,
} from 'react-icons/tb';
import {BODY, CopperText, HEAD, Logo, radius, useTheme} from '../../shared/ui';
import type {BenefitIcon} from '../i18n/copy';
import {OPTION_CODE, OPTION_ICON} from '../i18n/option-icons.generated';

export const PAD = 64;
/** Верх полезного поля (под шапкой) и низ (над подвалом) */
export const TOP = 150;
export const BOTTOM = 132;

type IconType = React.ComponentType<{size?: number | string; color?: string; strokeWidth?: number}>;

const BENEFIT_ICONS: Record<BenefitIcon, IconType> = {
  shield: TbShieldCheck, plane: TbPlane, file: TbFileText, ship: TbShip, headset: TbHeadset,
  handshake: TbHeartHandshake, search: TbSearch, eye: TbEye, card: TbCreditCard,
};
export const CONTACT_ICONS: Record<'whatsapp' | 'telegram', IconType> = {whatsapp: TbBrandWhatsapp, telegram: TbBrandTelegram};

/** Иконка опции — та же, что на kmotors.shop; незнакомая опция — галочка */
export const optionIcon = (en: string): IconType => OPTION_ICON[OPTION_CODE[en]] ?? (TbCircleCheck as IconType);
export const benefitIcon = (name: BenefitIcon): IconType => BENEFIT_ICONS[name] ?? (TbCircleCheck as IconType);

/** Иконка цветом акцента. Tabler и Lucide рисуют линией — толщину держим одинаковой */
export const Icon: React.FC<{icon: IconType; size: number; color?: string}> = ({icon: I, size, color}) => {
  const C = useTheme();
  return <I size={size} color={color ?? C.copper} strokeWidth={1.6} />;
};

/** Квадрат 1:1 или вытянутый 4:5 — от этого зависят кегли и сколько влезает */
export const useTall = () => {
  const {width, height} = useVideoConfig();
  return height / width > 1.1;
};

/**
 * Заголовок: \n — перенос, {слово} — акцент. Акцент — медью (цветом акцента бренда) через
 * CopperText: у бренда может стоять градиент, и акцент в заголовке должен быть тем же металлом,
 * что плашки и рамки, а не плоским цветом.
 */
export const Headline: React.FC<{text: string; size?: number; style?: React.CSSProperties}> = ({text, size, style}) => {
  const C = useTheme();
  const tall = useTall();
  const fs = size ?? (tall ? 84 : 76);
  return (
    <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: fs, lineHeight: 1.08, color: C.white, ...style}}>
      {text.split('\n').map((line, i) => (
        <div key={i}>
          {line.split(/(\{[^}]*\})/).filter(Boolean).map((part, j) => (part.startsWith('{')
            ? <CopperText key={j}>{part.slice(1, -1)}</CopperText>
            : <span key={j}>{part}</span>))}
        </div>
      ))}
    </div>
  );
};

/** Абзац под заголовком */
export const Lead: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => {
  const C = useTheme();
  const tall = useTall();
  return (
    <div style={{fontFamily: BODY, fontWeight: 500, fontSize: tall ? 32 : 29, lineHeight: 1.45, color: C.white,
      opacity: 0.86, marginTop: 22, maxWidth: 820, ...style}}>{children}</div>
  );
};

/** Текст с переносами строк из шаблона */
export const Lines: React.FC<{text: string}> = ({text}) => <>{text.split('\n').map((l, i) => <div key={i}>{l}</div>)}</>;

/**
 * Фото Encar в рамке.
 *
 * У Encar в верхнем правом углу впечатан крупный красный «Trust Encar» — на студийных
 * снимках он виден с другого конца ленты. Против него два приёма разом: увеличение от
 * нижнего левого угла выталкивает верх-право за рамку, а затемнение верха самого фото
 * (veil) гасит то, что осталось. Затемнение — внутри рамки фото, а не на всём слайде:
 * иначе у фото, стоящего внизу слайда, его верх оказывался в прозрачной части градиента.
 * sink — затемнение низа фото под подвал со счётчиком.
 */
export const Shot: React.FC<{
  src?: string | null; style?: React.CSSProperties; focus?: string; zoom?: number; round?: number;
  veil?: number; sink?: number;
}> = ({src, style, focus = '45% 70%', zoom = 1.22, round = 0, veil = 1, sink = 0}) => {
  const C = useTheme();
  const a = (o: number) => `${C.bg}${Math.round(Math.max(0, Math.min(1, o)) * 255).toString(16).padStart(2, '0')}`;
  return (
    <div style={{position: 'relative', overflow: 'hidden', background: C.panel, borderRadius: round ? radius(C, round) : 0, ...style}}>
      {src && (
        <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus,
          transform: `scale(${zoom})`, transformOrigin: '20% 100%'}} />
      )}
      {veil > 0 && <div style={{position: 'absolute', inset: 0, background:
        `linear-gradient(to bottom, ${a(veil)} 0%, ${a(veil * 0.95)} 20%, ${a(veil * 0.6)} 36%, ${a(0)} 56%)`}} />}
      {sink > 0 && <div style={{position: 'absolute', inset: 0, background:
        `linear-gradient(to top, ${a(sink)} 0%, ${a(sink * 0.7)} 16%, ${a(0)} 40%)`}} />}
    </div>
  );
};

/** Затемнение фото под текст: from — откуда глухо, до transparent к середине */
export const Fade: React.FC<{to: 'top' | 'bottom' | 'left'; strength?: number}> = ({to, strength = 1}) => {
  const C = useTheme();
  const a = (o: number) => `${C.bg}${Math.round(Math.min(1, o * strength) * 255).toString(16).padStart(2, '0')}`;
  const dir = to === 'top' ? 'to bottom' : to === 'bottom' ? 'to top' : 'to right';
  return <AbsoluteFill style={{background: `linear-gradient(${dir}, ${a(1)} 0%, ${a(0.85)} 22%, ${a(0.35)} 48%, ${a(0)} 70%)`}} />;
};

/** Каркас слайда: фон, шапка, подвал; содержимое — дети */
export const Frame: React.FC<{
  section: string; index: number; total: number; children: React.ReactNode;
}> = ({section, index, total, children}) => {
  const C = useTheme();
  const last = index === total;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {children}
      {/* Шапка: логотип слева, рубрика справа — на всех слайдах одинаково */}
      <div style={{position: 'absolute', top: PAD, left: PAD, right: PAD, height: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between'}}>
        <Logo asset="logoHorizontal" height={52} style={{textAlign: 'left'}} />
        <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
          <div style={{width: 70, height: 2, background: C.copper}} />
          <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 24, color: C.white, opacity: 0.85,
            textAlign: 'right', lineHeight: 1.3, maxWidth: 360}}><Lines text={section} /></div>
        </div>
      </div>
      {/* Подвал: номер и прогресс слева, стрелка справа (на последнем её нет — листать некуда) */}
      <div style={{position: 'absolute', bottom: PAD - 6, left: PAD, right: PAD, height: 72, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
          <span style={{fontFamily: BODY, fontWeight: 600, fontSize: 24, color: C.grey, letterSpacing: 2}}>
            {index} / {total}
          </span>
          <div style={{width: 180, height: 3, background: C.line, borderRadius: 2}}>
            <div style={{width: `${(index / total) * 100}%`, height: '100%', background: C.copper, borderRadius: 2}} />
          </div>
        </div>
        {!last && (
          <div style={{width: 72, height: 72, borderRadius: radius(C, 36), border: `2px solid ${C.copper}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon icon={TbArrowRight as IconType} size={36} />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Ряд значков с подписью: опции или преимущества. Делители — тонкие линии между */
export const IconRow: React.FC<{items: {icon: IconType; text: string}[]; size?: number; style?: React.CSSProperties}> =
  ({items, size = 48, style}) => {
    const C = useTheme();
    return (
      <div style={{display: 'flex', ...style}}>
        {items.map((it, i) => (
          <div key={it.text} style={{flex: 1, minWidth: 0, padding: '4px 18px', borderLeft: i ? `1px solid ${C.line}` : undefined,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center'}}>
            <Icon icon={it.icon} size={size} />
            <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 24, lineHeight: 1.3, color: C.white}}>
              <Lines text={it.text} />
            </div>
          </div>
        ))}
      </div>
    );
  };

/** Карточка с иконкой и подписью — для сеток 2×2 (безопасность, «почему мы») */
export const IconCard: React.FC<{icon: IconType; text: string; style?: React.CSSProperties}> = ({icon, text, style}) => {
  const C = useTheme();
  return (
    <div style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 22, padding: '26px 26px',
      background: `${C.panel}e6`, border: `1px solid ${C.line}`, borderRadius: radius(C, 16), ...style}}>
      <Icon icon={icon} size={50} />
      <div style={{fontFamily: BODY, fontWeight: 500, fontSize: 26, lineHeight: 1.3, color: C.white}}>
        <Lines text={text} />
      </div>
    </div>
  );
};

/** Сетка 2×2 из карточек */
export const Grid2: React.FC<{children: React.ReactNode[]; gap?: number}> = ({children, gap = 18}) => {
  const rows = [children.slice(0, 2), children.slice(2, 4)].filter((r) => r.length);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap}}>
      {rows.map((r, i) => <div key={i} style={{display: 'flex', gap}}>{r}</div>)}
    </div>
  );
};

/** Крупная цифра с подписью (история) */
export const Stat: React.FC<{value: string; label: string; alarm?: boolean}> = ({value, label, alarm}) => {
  const C = useTheme();
  return (
    <div style={{flex: 1, minWidth: 0, padding: '26px 28px', background: C.panel, border: `1px solid ${C.line}`,
      borderRadius: radius(C, 16)}}>
      <div style={{fontFamily: HEAD, fontWeight: 700, fontSize: 84, lineHeight: 1, color: alarm ? C.copperLight : C.white}}>{value}</div>
      <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 22, letterSpacing: 2, textTransform: 'uppercase',
        color: C.grey, marginTop: 12, lineHeight: 1.3}}>{label}</div>
    </div>
  );
};
