// Формы настроек: профиль клиента (компания, язык постов, модель цены, контакты), бренд
// (логотип, шрифты, оформление, палитра) и надписи рекламных роликов.
import {withoutAccentRoles} from '../src/shared/visualThemes.js';
import React, {useEffect, useRef, useState} from 'react';
import {POST_LANGUAGES} from '../src/shared/languages';
import type {Profile, Theme} from '../src/shared/types';
import {Lock} from 'lucide-react';
import {api, Copy, FontPair, Palette, ProfileEntry} from './api';
import {FORMATS} from '../src/shared/model';
import {resolveTexts, textsForLanguage} from '../src/shared/profile';
import {CURRENCIES, currencyCode, currencySign, isKnownCurrency} from '../src/shared/currencies';
import {contrastIssues, matchPalette} from '../src/shared/contrast.js';
import {PLATE_MIN_CONTRAST, PLATE_MODES, PLATE_SHAPES, inkContrast, plateSetting} from '../src/shared/logoPlate.js';
import {Logo, LogoImgContext, ThemeProvider} from '../src/shared/ui';
import {Field} from './LotForm';
import {useConfig} from './config';
import {DesignField} from './DesignField';
import {LangSwitch, useT, type Key} from './i18n';


// Только цветовые поля темы: в ней теперь есть ещё имя, шрифты и файлы бренда,
// и без сужения форма пыталась бы засунуть объект в поле ввода
type ColorKey = {[K in keyof Theme]-?: Theme[K] extends string ? K : never}[keyof Theme];

// Ключи в теме исторические (copper — со времён брендбука AXIS), а в интерфейсе — «акцент»:
// у клиента он бывает синим или зелёным
// Подпись — ключ словаря color.<поле> (app/i18n)
const COLOR_FIELDS: ColorKey[] = ['bg', 'panel', 'line', 'grey', 'white', 'copper', 'copperLight', 'copperDark'];

/**
 * Палитра: восемь цветов темы разом. Человек выбирает настроение, а не восемь цветов по
 * одному: свободные поля давали чёрные подписи на тёмно-синем фоне и три несвязанных
 * фиолетовых вместо перелива одного. Каждая палитра реестра прошла проверку контраста.
 * Выбранную узнаём по самим цветам — как пару шрифтов, без отдельного поля id.
 */
export const PaletteField: React.FC<{theme: Theme; palettes: Palette[]; onChange: (t: Theme) => void}> = ({theme, palettes, onChange}) => {
  const current = matchPalette(theme, palettes);
  const t = useT();
  return (
    <>
      <div className="pairs">
        {palettes.map((p) => {
          const c = p.colors;
          return (
            <button key={p.id} type="button" className={`pair palette${p.id === current?.id ? ' on' : ''}`}
              style={{background: c.bg, color: c.white, borderColor: p.id === current?.id ? c.copper : c.line}}
              onClick={() => onChange({...withoutAccentRoles(theme), ...c} as Theme)}>
              <span className="pair-head">{t.cfg(p.title)}</span>
              <span className="palette-demo">
                <span className="palette-price" style={{backgroundImage: `linear-gradient(115deg, ${c.copperDark}, ${c.copper} 35%, ${c.copperLight} 55%, ${c.copper} 80%, ${c.copperDark})`, color: c.bg}}>$10 349</span>
                <span className="palette-chip" style={{background: c.panel, border: `1px solid ${c.line}`}}>
                  <b style={{color: c.copper}}>7</b> <span style={{color: c.grey}}>{t('color.owners')}</span>
                </span>
              </span>
              <span className="pair-note" style={{color: c.grey, opacity: 1}}>{t.cfg(p.note)}</span>
            </button>
          );
        })}
      </div>
      {!current && <p className="hint">{t('color.custom')}</p>}
    </>
  );
};

/**
 * Тонкая настройка: свои восемь цветов. Свёрнута — большинству она не нужна, — и сразу
 * говорит, что перестанет читаться: предупреждение здесь, а не на готовом ролике.
 */
export const FineColors: React.FC<{theme: Theme; custom: boolean; onChange: (t: Theme) => void}> = ({theme, custom, onChange}) => {
  const issues = contrastIssues(theme);
  const t = useT();
  return (
    <details className="fine" open={custom && issues.length > 0}>
      <summary>{t('color.fine')}{issues.length > 0 && <span className="fine-warn"> · {t.n('color.issues', issues.length)}</span>}</summary>
      <p className="note">{t('color.fineNote')}</p>
      {COLOR_FIELDS.map((key) => (
        <div className="color" key={key}>
          <input type="color" value={theme[key]} onChange={(e) => onChange({...withoutAccentRoles(theme), [key]: e.target.value.toUpperCase()} as Theme)} />
          <input value={theme[key]} maxLength={7} onChange={(e) => onChange({...withoutAccentRoles(theme), [key]: e.target.value} as Theme)} />
          <span>{t(`color.${key}` as Key)}</span>
        </div>
      ))}
      {issues.length > 0 && (
        <ul className="warnings">
          {issues.map((i) => (
            <li key={i.what}>{t('color.poor', {what: t.cfg(i.what)})}{i.ratio ? `: ${t('color.ratio', {ratio: i.ratio.toFixed(1), min: i.min})}` : `: ${t('color.unfinished')}`}</li>
          ))}
        </ul>
      )}
    </details>
  );
};

/**
 * Логотип: загрузка и вариант. Сервер сам приводит файл к виду для тёмного слайда —
 * убирает ровный фон, обрезает поля, уменьшает большое, SVG переводит в PNG. Здесь —
 * показать результат на цвете фона слайда и дать откатить, если автоматика ошиблась.
 * Нет логотипа — показываем то, что будет на роликах: название компании текстом.
 */
const LogoField: React.FC<{theme: Theme; onSaved: (t: Theme) => void; onError: (e: unknown) => void}> =
  ({theme, onSaved, onError}) => {
    // Без логотипа ролик пишет название компании из профиля, а не name из бренда — его и показываем
    const company = useConfig().profile.company?.trim();
    const t = useT();
    const [busy, setBusy] = useState(false);
    const [notes, setNotes] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const ref = useRef<HTMLInputElement>(null);
    const logo = theme.assets?.logoStacked ?? '';
    const isRaw = /-raw\.png$/.test(logo);
    const isOwn = logo.includes('/brand/logo-');
    // Вариант «как было» есть, только если фон убирался. Сервер кладёт его рядом с именем
    // -raw.png; после перезагрузки страницы узнаём о нём, спросив сам файл
    const [hasRaw, setHasRaw] = useState(isRaw);
    useEffect(() => {
      if (!isOwn || isRaw) return;
      let alive = true;
      fetch(logo.replace(/\.png$/, '-raw.png'), {method: 'HEAD'})
        .then((r) => { if (alive) setHasRaw(r.ok); }).catch(() => {});
      return () => { alive = false; };
    }, [logo, isOwn, isRaw]);

    const run = async (fn: () => Promise<{brand: Theme}>) => {
      setBusy(true);
      try { onSaved((await fn()).brand); } catch (e) { onError(e); } finally { setBusy(false); }
    };
    const send = (file?: File) => {
      if (!file) return;
      setNotes([]); setWarnings([]);
      return run(async () => {
        const res = await api.uploadLogo(file);
        setNotes([`${res.width}×${res.height}, ${t('common.kb', {n: Math.round(res.bytes / 1024)})}`, ...res.notes]);
        setWarnings(res.warnings);
        setHasRaw(res.hasRaw);
        return res;
      }).finally(() => { if (ref.current) ref.current.value = ''; });
    };
    const variant = (v: 'clean' | 'raw' | 'none') => run(() => api.logoVariant(v));

    // Путь внутри public/ в браузере доступен с корня, полный адрес оставляем как есть
    const shown = logo.startsWith('http') || logo.startsWith('/') ? logo : `/${logo}`;
    return (
      <div className="logo-field">
        <div className="logo-shot" style={{background: theme.bg}} title={t('logo.shotTitle')}>
          {logo
            ? <img src={shown} alt={t.cfg('Логотип')} />
            : <span className="logo-text" style={{fontFamily: theme.fonts?.head, color: theme.copper}}>{company || t('auth.company')}</span>}
        </div>
        <div>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>
              {t(busy ? 'logo.processing' : 'logo.upload')}
            </button>
            {isOwn && hasRaw && !isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('raw')}>{t('logo.keepBg')}</button>}
            {isOwn && isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('clean')}>{t('logo.removeBg')}</button>}
            {logo && <button className="btn ghost" disabled={busy} onClick={() => variant('none')}>{t('logo.none')}</button>}
          </div>
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden
            onChange={(e) => send(e.target.files?.[0])} />
          {!logo && <p className="hint">{t('logo.noLogo')}</p>}
          <ul className="rules">
            <li>{t('logo.rule1')}</li>
            <li>{t('logo.rule2')}</li>
            <li>{t('logo.rule3')}</li>
          </ul>
          {notes.length > 0 && <p className="hint">{t('logo.loaded', {notes: notes.join(' · ')})}</p>}
          {warnings.map((w) => <p key={w} className="auth-error">{w}</p>)}
          <p className="hint">{t('logo.where')}</p>
        </div>
      </div>
    );
  };

/**
 * Подложка логотипа (src/shared/logoPlate.js): «Авто» ставит её, только когда логотип плохо виден
 * на фоне (белый на светлом, чёрный на тёмном); «Всегда»; «Нет» — для брендбуков, где плашки
 * под логотипом запрещены. Формы — плитками: на каждой ваш логотип на фоне ролика, тем же
 * компонентом, что и в роликах
 */
export const PlateField: React.FC<{theme: Theme; onChange: (t: Theme) => void}> = ({theme, onChange}) => {
  const setting = plateSetting(theme);
  const set = (patch: Partial<typeof setting>) => onChange({...theme, logoPlate: {...setting, ...patch}});
  const logo = theme.assets?.logoStacked;
  const ink = logo ? theme.logoInk?.[logo] : undefined;
  const t = useT();
  if (!logo) return null;
  const needs = !!ink && inkContrast(ink, theme.bg) < PLATE_MIN_CONTRAST;
  const status = t(!ink ? 'plate.unknown' : needs ? 'plate.needs' : 'plate.ok');
  return <div className="plate-field">
    <div className="seg" role="radiogroup" aria-label={t('plate.when')}>
      {PLATE_MODES.map((m) => <button key={m.id} type="button" role="radio" aria-checked={setting.mode === m.id}
        className={setting.mode === m.id ? 'on' : ''} onClick={() => set({mode: m.id})}>{t.cfg(m.title)}</button>)}
    </div>
    <p className="hint">{status}</p>
    {setting.mode !== 'off' && ink && <div className="plate-shapes" role="radiogroup" aria-label={t('plate.shape')}>
      {PLATE_SHAPES.map((sh) => <button key={sh.id} type="button" role="radio" aria-checked={setting.shape === sh.id}
        className={`plate-shape${setting.shape === sh.id ? ' on' : ''}`} onClick={() => set({shape: sh.id})}>
        <span className="plate-shape-frame" style={{background: theme.bg}}>
          <LogoImgContext.Provider value="img">
            <ThemeProvider value={{...theme, logoPlate: {mode: 'always', shape: sh.id}}}>
              <Logo asset="logoStacked" height={64} width={150} />
            </ThemeProvider>
          </LogoImgContext.Provider>
        </span>
        <span>{t.cfg(sh.title)}</span>
      </button>)}
    </div>}
  </div>;
};

/**
 * Таблицы стилей всех пар сразу.
 *
 * Иначе список нечем показать: пара, шрифт которой не загружен, нарисуется системным,
 * и выбирать пришлось бы по названию вслепую. Встроенная пара своей таблицы не имеет —
 * она приходит пакетами вместе со сборкой.
 */
const useFontSheets = (pairs: FontPair[]) => {
  useEffect(() => {
    const links = pairs.filter((p) => p.url).map((p) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = p.url;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [pairs]);
};

/**
 * Выбор пары шрифтов. Каждая нарисована своими шрифтами — по названию их не отличить.
 *
 * В образце намеренно есть кириллица: все пары реестра её умеют (проверено запросом
 * к Google Fonts), и видеть это надо сразу, а не после первого ролика на македонском.
 */
export const FontField: React.FC<{theme: Theme; pairs: FontPair[]; onChange: (t: Theme) => void}> = ({theme, pairs, onChange}) => {
  useFontSheets(pairs);
  const t = useT();
  // Выбранную пару узнаём по самим шрифтам, а не по отдельному полю id: лишнее поле
  // разошлось бы с fonts, стоит один раз поправить brand.json руками
  const current = pairs.find((p) => p.head === theme.fonts?.head && p.body === theme.fonts?.body);
  return (
    <>
      <div className="pairs">
        {pairs.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pair${p.id === current?.id ? ' on' : ''}`}
            onClick={() => onChange({...theme, fonts: {head: p.head, body: p.body, url: p.url}})}
          >
            <span className="pair-head" style={{fontFamily: p.head}}>Hyundai Equus</span>
            <span className="pair-body" style={{fontFamily: p.body}}>2015 · Бензин · Автомат · 239 601 км</span>
            <span className="pair-note">{t.cfg(p.note)}</span>
          </button>
        ))}
      </div>
      {!current && (
        <p className="hint">
          {t('font.custom')}
        </p>
      )}
    </>
  );
};

/**
 * Оформление: медь и углы.
 *
 * Скругления заданы множителем, а не набором радиусов: в вёрстке углов полтора десятка
 * и они разного размера — плашка, рамка, «таблетка», точка списка. Множитель сохраняет
 * их соотношение, и подбирать полтора десятка чисел никому не приходится.
 */
const RADIUS: [number, Key][] = [[0, 'style.sharp'], [1, 'style.soft'], [1.8, 'style.round']];

export const StyleField: React.FC<{theme: Theme; onChange: (t: Theme) => void}> = ({theme, onChange}) => {
  // Значения по умолчанию те же, что в вёрстке: тема могла прийти без style
  const style = {gradient: theme.style?.gradient ?? true, radius: theme.style?.radius ?? 1};
  const set = (patch: Partial<typeof style>) => onChange({...theme, style: {...style, ...patch}});
  const t = useT();
  return (
    <>
      <div className="switch-row">
        <span className="switch-label">{t('color.copper')}</span>
        <div className="btn-row">
          <button type="button" className={`btn ${style.gradient ? 'primary' : 'ghost'}`}
            onClick={() => set({gradient: true})}>{t('style.gradient')}</button>
          <button type="button" className={`btn ${style.gradient ? 'ghost' : 'primary'}`}
            onClick={() => set({gradient: false})}>{t('style.flat')}</button>
        </div>
      </div>
      <div className="switch-row">
        <span className="switch-label">{t('style.corners')}</span>
        <div className="btn-row">
          {RADIUS.map(([value, label]) => (
            <button key={label} type="button"
              className={`btn ${style.radius === value ? 'primary' : 'ghost'}`}
              onClick={() => set({radius: value})}>{t(label)}</button>
          ))}
        </div>
      </div>
      <p className="hint">{t('style.cornersHint')}</p>
    </>
  );
};

type BrandProps = {
  theme: Theme; saved: Theme; pairs: FontPair[]; palettes: Palette[];
  onChange: (t: Theme) => void; onSaved: (t: Theme) => void; onError: (e: unknown) => void;
};

export const BrandForm: React.FC<BrandProps> = ({theme, saved, pairs, palettes, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const dirty = theme !== saved;
  const persist = async () => {
    setBusy(true);
    try { onSaved(await api.saveBrand(theme)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="form">
      <h2>{t.cfg('Логотип')}</h2>
      <LogoField theme={theme} onSaved={onSaved} onError={onError} />
      <h2>{t('look.plate')}</h2>
      <PlateField theme={theme} onChange={onChange} />

      <DesignField theme={theme} onChange={onChange} />

      <h2>{t('font.title')}</h2>
      <p className="note">{t('font.note')}</p>
      <FontField theme={theme} pairs={pairs} onChange={onChange} />

      <h2>{t('look.style')}</h2>
      <StyleField theme={theme} onChange={onChange} />

      <h2>{t('land.demo.palette')}</h2>
      <p className="note">{t('color.paletteNote')}</p>
      <PaletteField theme={theme} palettes={palettes} onChange={onChange} />
      <FineColors theme={theme} custom={!matchPalette(theme, palettes)} onChange={onChange} />
      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>{t('common.save')}</button>
        <button className="btn" disabled={!dirty || busy} onClick={() => onChange(saved)}>{t('set.revert')}</button>
      </div>
    </div>
  );
};

type ProfileProps = {
  profile: ProfileEntry;
  saved?: ProfileEntry;
  onChange: (p: ProfileEntry) => void;
  onSaved: (p: ProfileEntry) => void;
  onError: (e: unknown) => void;
};

// Значения по умолчанию для блока экспорта: подставляем, когда клиент впервые переключается
// на экспорт с пустого профиля, чтобы поля не были undefined
const EXPORT_DEFAULTS = {origin: '', originCountry: '', port: '', portCountry: '', freight: 0};

/**
 * Профиль клиента — «пара кнопок»: кто он, на каком языке и по какой модели продаёт.
 *
 * Тексты постов здесь не правятся: они приходят из дефолтов платформы под язык и режим
 * (config/copy.json), а свои надписи роликов — отдельный раздел «Реклама авто» (AdTextsForm).
 * Переключатель модели цены прячет поля порта и фрахта на внутреннем рынке: там их нет.
 */
export const ProfileForm: React.FC<ProfileProps> = ({profile, saved, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const dirty = profile !== saved;
  const set = (patch: Partial<Profile>) => onChange({...profile, ...patch});
  const setPricing = (patch: Partial<Profile['pricing']>) => set({pricing: {...profile.pricing, ...patch}});
  const setExport = (patch: Partial<NonNullable<Profile['pricing']['export']>>) =>
    setPricing({export: {...EXPORT_DEFAULTS, ...profile.pricing.export, ...patch}});
  const setContacts = (patch: Partial<Profile['contacts']>) => set({contacts: {...profile.contacts, ...patch}});
  const isExport = profile.pricing.mode !== 'domestic';

  const persist = async () => {
    setBusy(true);
    const {id, ...data} = profile;
    try { onSaved(await api.saveProfile(id, data)); } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <div className="form">
      <h2>{t('prof.title')} <span className="muted">{t('pf.sub')}</span></h2>
      <p className="note">{t('pf.note')}</p>

      <div className="row">
        <Field label={t('auth.company')} hint={t('pf.companyHint')}><input value={profile.company} onChange={(e) => set({company: e.target.value})} /></Field>
        {/* Язык — тот же переключатель, что в шапке (15.11): интерфейс, посты и письма на одном языке.
            Пишется сразу, без «Сохранить» (app/config.tsx) — как и в шапке */}
        <Field label={t('pf.lang')} hint={t('pf.langHint')}>
          <LangSwitch className="pf-lang" />
        </Field>
      </div>

      <h2>{t('pf.pricing')}</h2>
      <div className="switch-row">
        <span className="switch-label">{t('pf.mode')}</span>
        <div className="btn-row">
          <button type="button" className={`btn ${isExport ? 'primary' : 'ghost'}`}
            onClick={() => setPricing({mode: 'export', export: {...EXPORT_DEFAULTS, ...profile.pricing.export}})}>{t('pf.export')}</button>
          <button type="button" className={`btn ${isExport ? 'ghost' : 'primary'}`}
            onClick={() => setPricing({mode: 'domestic'})}>{t('pf.domestic')}</button>
        </div>
      </div>
      <p className="hint">
        {isExport
          ? t('pf.exportHint')
          : t('pf.domesticHint')}
      </p>

      <div className="row">
        {/* Список со значками, а не свободное поле: вписанное слово («РУБЛЬ») печаталось в
            ролике как есть и не склонялось. Старое значение узнаём (currencyCode) */}
        <Field label={t('pf.currency')} hint={isKnownCurrency(profile.pricing.currency) ? t('pf.currencyHint', {v: `10 000 ${currencySign(profile.pricing.currency)}`}) : undefined}>
          <select value={currencyCode(profile.pricing.currency)} onChange={(e) => setPricing({currency: e.target.value})}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.sign} — {t.cfg(c.name)}</option>)}
            {!isKnownCurrency(profile.pricing.currency) && (
              <option value={currencyCode(profile.pricing.currency)}>{profile.pricing.currency} — {t('pf.currencyGone')}</option>
            )}
          </select>
        </Field>
        {isExport && <Field label={t('price.freight')}><input inputMode="decimal" value={profile.pricing.export?.freight ?? 0}
          onChange={(e) => setExport({freight: Number(e.target.value) || 0})} /></Field>}
      </div>
      {isExport && (
        <>
          <div className="row">
            <Field label={t('pf.from')}><input value={profile.pricing.export?.origin ?? ''} onChange={(e) => setExport({origin: e.target.value})} /></Field>
            <Field label={t('pf.fromCountry')}><input value={profile.pricing.export?.originCountry ?? ''} onChange={(e) => setExport({originCountry: e.target.value})} /></Field>
          </div>
          <div className="row">
            <Field label={t('pf.port')}><input value={profile.pricing.export?.port ?? ''} onChange={(e) => setExport({port: e.target.value})} /></Field>
            <Field label={t('pf.portCountry')}><input value={profile.pricing.export?.portCountry ?? ''} onChange={(e) => setExport({portCountry: e.target.value})} /></Field>
          </div>
        </>
      )}

      <h2>{t.cfg('Контакты')}</h2>
      <div className="row">
        <Field label="WhatsApp" hint={t('pf.waHint')}>
          <input value={profile.contacts.whatsapp ?? ''} onChange={(e) => setContacts({whatsapp: e.target.value || null})} />
        </Field>
        <Field label={t('pf.site')}><input value={profile.contacts.site} onChange={(e) => setContacts({site: e.target.value})} /></Field>
      </div>
      <div className="row">
        <Field label="Telegram" hint={t('pf.tgHint')}>
          <input value={profile.contacts.telegram ?? ''} onChange={(e) => setContacts({telegram: e.target.value})} />
        </Field>
        <Field label={t('pf.button')} hint={t('pf.buttonHint')}>
          <select value={profile.contacts.primary ?? 'whatsapp'}
            onChange={(e) => setContacts({primary: e.target.value as 'whatsapp' | 'telegram'})}>
            <option value="whatsapp">{t('pay.mgr.write', {channel: 'WhatsApp'})}</option>
            <option value="telegram">{t('pay.mgr.write', {channel: 'Telegram'})}</option>
          </select>
        </Field>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>{t('common.save')}</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>{t('set.revert')}</button>
      </div>
    </div>
  );
};

// Подписи и подсказки полей — из описаний форматов (config/formats.json): ключи у форматов
// одинаковые, берём по первому вхождению
const AD_TEXT_FIELDS = new Map(FORMATS.flatMap((f) => f.texts).map((t) => [t.key, t] as const).reverse());

/**
 * Надписи по сценам ролика — как кнопки под превью (владелец 11.10: «по разделам раздели»).
 * У каждой сцены — что здесь правится и что нет: «замок» — текст, который ролик берёт из
 * объявления (Encar), профиля или бренда; здесь его не поменять, и пишем, где можно.
 * Названия сцен у форматов разные: третья — «Стопка» в «Галерее», «Характеристики» в «Авто
 * с ценой», «История» в «Цене сразу»; в «Цене сразу» цена — первая сцена, а не четвёртая.
 * Новый текст в formats.json без места здесь не пропадёт — он попадёт в «Прочее».
 * Строки здесь — русские; на экран идут через t.cfg (переводы — app/i18n/names.ts)
 */
type Locked = {what: string; where: string};
const AD_SCENES: {id: string; title: string; also?: string; keys: string[]; hints?: Record<string, string>; locked: Locked[]}[] = [
  {id: 'hook', title: 'Хук', keys: ['hookTagline'],
    hints: {hookTagline: 'строка под годом; Encar может подставить в объявлении свою — «один владелец», «без ДТП»'},
    locked: [{what: 'Марка, модель, год, версия', where: 'из объявления'}, {what: 'Фото', where: 'из объявления'}]},
  {id: 'gallery', title: 'Галерея', also: 'в «Галерее» и «Цене сразу»', keys: [],
    locked: [{what: 'Фото', where: 'из объявления'}, {what: 'Марка, модель, год', where: 'из объявления'}]},
  {id: 'stack', title: 'Стопка', also: 'в «Авто с ценой» — «Характеристики», в «Цене сразу» — «История»', keys: [],
    locked: [{what: 'Характеристики: пробег, двигатель, коробка…', where: 'из объявления'},
      {what: 'История: ДТП, владельцы', where: 'из Encar, только «Цена сразу»'}]},
  {id: 'price', title: 'Цена', keys: ['priceLabel', 'priceNoteIncluded', 'priceNoteExcluded'],
    hints: {priceLabel: '{port} заменится на порт из профиля', priceNoteIncluded: 'под ценой, первой строкой', priceNoteExcluded: 'серым, второй строкой'},
    locked: [{what: 'Цена', where: 'в объявлении: расчёт или «Цена в ролике»'}, {what: 'Маршрут: откуда → порт', where: 'Профиль'}]},
  {id: 'cta', title: 'Контакты', keys: ['ctaTitle', 'ctaAccent', 'ctaBenefit', 'whatsappLabel'],
    hints: {ctaAccent: 'последняя строка заголовка, акцентным цветом', ctaBenefit: 'строка с рукопожатием', whatsappLabel: 'над номером на плашке'},
    locked: [{what: 'Номер WhatsApp и сайт', where: 'Профиль'}, {what: 'Логотип', where: 'Бренд'}]},
];
const PLACED = new Set(AD_SCENES.flatMap((sc) => sc.keys));
const UNPLACED = [...AD_TEXT_FIELDS.keys()].filter((k) => !PLACED.has(k));

/**
 * Своя иконка у преимущества в CTA — как логотип (владелец 11.10): сервер убирает ровный фон,
 * обрезает поля, SVG переводит в PNG; здесь — результат на цвете слайда и откат. Файл
 * живёт в бренде компании (assets.iconHandshake), поэтому сохраняется сразу, без «Сохранить»
 */
const IconField: React.FC<{theme: Theme; onSaved: (t: Theme) => void; onError: (e: unknown) => void}> = ({theme, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const [notes, setNotes] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const icon = theme.assets?.iconHandshake || 'brand/icon-handshake.png';
  const isRaw = /-raw\.png$/.test(icon);
  const isOwn = icon.includes('/brand/icon-');
  // Вариант «как была» есть, только если фон убирался — спрашиваем сам файл, как у логотипа
  const [hasRaw, setHasRaw] = useState(isRaw);
  useEffect(() => {
    if (!isOwn || isRaw) return;
    let alive = true;
    fetch(icon.replace(/\.png$/, '-raw.png'), {method: 'HEAD'}).then((r) => { if (alive) setHasRaw(r.ok); }).catch(() => {});
    return () => { alive = false; };
  }, [icon, isOwn, isRaw]);

  const run = async (fn: () => Promise<{brand: Theme}>) => {
    setBusy(true);
    try { onSaved((await fn()).brand); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const send = (file?: File) => {
    if (!file) return;
    setNotes([]); setWarnings([]);
    return run(async () => {
      const res = await api.uploadIcon(file);
      setNotes([`${res.width}×${res.height}, ${t('common.kb', {n: Math.round(res.bytes / 1024)})}`, ...res.notes]);
      setWarnings(res.warnings);
      setHasRaw(res.hasRaw);
      return res;
    }).finally(() => { if (ref.current) ref.current.value = ''; });
  };
  const variant = (v: 'clean' | 'raw' | 'default') => run(() => { setNotes([]); setWarnings([]); return api.iconVariant(v); });
  const shown = icon.startsWith('http') || icon.startsWith('/') ? icon : `/${icon}`;

  return (
    <div className="icon-field">
      <div className="icon-shot" style={{background: theme.bg}} title={t('icon.shotTitle')}>
        <img src={shown} alt={t('icon.alt')} />
      </div>
      <div>
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>{t(busy ? 'logo.processing' : 'icon.upload')}</button>
          {isOwn && hasRaw && !isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('raw')}>{t('logo.keepBg')}</button>}
          {isOwn && isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('clean')}>{t('logo.removeBg')}</button>}
          {isOwn && <button className="btn ghost" disabled={busy} onClick={() => variant('default')}>{t('icon.default')}</button>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden onChange={(e) => send(e.target.files?.[0])} />
        <p className="hint">{t('icon.rules')}</p>
        {notes.length > 0 && <p className="hint">{t('logo.loaded', {notes: notes.join(' · ')})}</p>}
        {warnings.map((w) => <p key={w} className="auth-error">{w}</p>)}
      </div>
    </div>
  );
};

type AdTextsProps = ProfileProps & {
  copy: Copy;
  // Бренд — ради своей иконки преимущества: она файл бренда, а не текст профиля
  theme: Theme;
  onBrandSaved: (t: Theme) => void;
  language: string;
  onLanguage: (code: string) => void;
};

/**
 * Надписи рекламных роликов по умолчанию — свои у каждого языка (profile.texts[язык]).
 * Пустое поле — текст платформы (config/copy.json), он виден серым. В ролике поверх этого
 * ещё и надписи самого объявления («Изменить вручную»).
 * Язык здесь выбирается свой, а не берётся из профиля: можно заранее подготовить тексты на
 * другом языке и переключиться, ничего не теряя.
 */
export const AdTextsForm: React.FC<AdTextsProps> = ({profile, saved, copy, theme, onBrandSaved, language, onLanguage, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const dirty = profile !== saved;
  const mode = profile.pricing.mode === 'domestic' ? 'domestic' : 'export';
  const defaults = resolveTexts(copy, mode, language, {});
  const own = textsForLanguage(profile.texts, language);
  const ownCount = (code: string) => Object.values(textsForLanguage(profile.texts, code)).filter((v) => v !== undefined).length;

  const set = (key: string, value: string) => {
    // Старая плоская пачка — правки языка профиля; раскладываем по языкам при первой правке
    const byLang = Object.values(profile.texts ?? {}).some((v) => typeof v === 'string')
      ? {[profile.language]: profile.texts as Record<string, string>}
      : (profile.texts ?? {}) as Record<string, Record<string, string>>;
    onChange({...profile, texts: {...byLang, [language]: {...byLang[language], [key]: value === '' ? undefined : value}}} as ProfileEntry);
  };
  const reset = () => {
    const {[language]: _dropped, ...rest} = (profile.texts ?? {}) as Record<string, unknown>;
    onChange({...profile, texts: rest} as ProfileEntry);
  };
  const persist = async () => {
    setBusy(true);
    const {id, ...data} = profile;
    try { onSaved(await api.saveProfile(id, data)); } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <div className="form">
      <h2>{t.cfg('Реклама авто')} <span className="muted">{t('ad.sub')}</span></h2>
      <p className="note">
        {t('ad.note')} {t('ad.mode', {mode: t(mode === 'domestic' ? 'pf.domestic' : 'pf.export')})}
      </p>

      <div className="btn-row">
        {POST_LANGUAGES.map((l) => (
          <button key={l.code} type="button" className={`btn ${l.code === language ? 'primary' : 'ghost'}`} onClick={() => onLanguage(l.code)}>
            {t.cfg(l.name)}{ownCount(l.code) ? ` · ${ownCount(l.code)}` : ''}{l.code === profile.language ? ` (${t('ad.inPosts')})` : ''}
          </button>
        ))}
      </div>
      {language !== profile.language && (
        <p className="hint">{t('ad.otherLang', {lang: t.cfg(POST_LANGUAGES.find((l) => l.code === language)?.name ?? '')})}</p>
      )}

      {[...AD_SCENES, ...(UNPLACED.length ? [{id: 'other', title: 'Прочее', keys: UNPLACED, locked: []}] : [])].map((sc) => (
        <section key={sc.id} className="scene-group">
          <h2>{t.cfg(sc.title)}{'also' in sc && sc.also ? <span className="muted">{t.cfg(sc.also)}</span> : null}</h2>
          {sc.keys.map((key) => {
            const f = AD_TEXT_FIELDS.get(key);
            const label = f?.label ? t.cfg(f.label) : key;
            const raw = ('hints' in sc ? sc.hints?.[key] : undefined) ?? f?.hint;
            const hint = raw && t.cfg(raw);
            return (
              <React.Fragment key={key}>
                <Field label={label} hint={hint} wide>
                  {f?.multiline
                    ? <textarea rows={2} value={own[key] ?? ''} placeholder={defaults[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
                    : <input value={own[key] ?? ''} placeholder={defaults[key] ?? ''} onChange={(e) => set(key, e.target.value)} />}
                </Field>
                {/* Иконка — к своей строке, а не отдельным пунктом: так видно, о какой речь */}
                {key === 'ctaBenefit' && (
                  <label className="check scene-check">
                    <input type="checkbox" checked={profile.ad?.benefitIcon !== false}
                      onChange={(e) => onChange({...profile, ad: {...profile.ad, benefitIcon: e.target.checked}})} />
                    {t('ad.icon')}
                  </label>
                )}
                {key === 'ctaBenefit' && profile.ad?.benefitIcon !== false && (
                  <IconField theme={theme} onSaved={onBrandSaved} onError={onError} />
                )}
              </React.Fragment>
            );
          })}
          {sc.locked.map((l) => (
            <div key={l.what} className="locked-row"><Lock size={13} aria-hidden /> <span>{t.cfg(l.what)}</span> <span className="muted">— {t.cfg(l.where)}</span></div>
          ))}
        </section>
      ))}

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>{t('common.save')}</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>{t('set.revert')}</button>
        <button className="btn ghost" disabled={busy || !ownCount(language)} onClick={reset}>{t('ad.reset')}</button>
      </div>
    </div>
  );
};
