// Формы настроек: профиль клиента (компания, язык, модель цены, контакты), рынок и бренд.
import React, {useEffect, useRef, useState} from 'react';
import {POST_LANGUAGES} from '../src/shared/languages';
import type {Profile, Theme} from '../src/shared/types';
import {api, FontPair, Palette, ProfileEntry} from './api';
import {contrastIssues, matchPalette} from '../src/shared/contrast.js';
import {Field} from './LotForm';


// Только цветовые поля темы: в ней теперь есть ещё имя, шрифты и файлы бренда,
// и без сужения форма пыталась бы засунуть объект в поле ввода
type ColorKey = {[K in keyof Theme]: Theme[K] extends string ? K : never}[keyof Theme];

// Ключи в теме исторические (copper — со времён брендбука AXIS), а в интерфейсе — «акцент»:
// у клиента он бывает синим или зелёным
const COLOR_FIELDS: [ColorKey, string][] = [
  ['bg', 'Фон'], ['panel', 'Плашки'], ['line', 'Линии, пунктир'], ['grey', 'Второстепенный текст'],
  ['white', 'Основной текст'], ['copper', 'Акцент'], ['copperLight', 'Акцент светлый'], ['copperDark', 'Акцент тёмный'],
];

/**
 * Палитра: восемь цветов темы разом. Человек выбирает настроение, а не восемь цветов по
 * одному: свободные поля давали чёрные подписи на тёмно-синем фоне и три несвязанных
 * фиолетовых вместо перелива одного. Каждая палитра реестра прошла проверку контраста.
 * Выбранную узнаём по самим цветам — как пару шрифтов, без отдельного поля id.
 */
const PaletteField: React.FC<{theme: Theme; palettes: Palette[]; onChange: (t: Theme) => void}> = ({theme, palettes, onChange}) => {
  const current = matchPalette(theme, palettes);
  return (
    <>
      <div className="pairs">
        {palettes.map((p) => {
          const c = p.colors;
          return (
            <button key={p.id} type="button" className={`pair palette${p.id === current?.id ? ' on' : ''}`}
              style={{background: c.bg, color: c.white, borderColor: p.id === current?.id ? c.copper : c.line}}
              onClick={() => onChange({...theme, ...c} as Theme)}>
              <span className="pair-head">{p.title}</span>
              <span className="palette-demo">
                <span className="palette-price" style={{backgroundImage: `linear-gradient(115deg, ${c.copperDark}, ${c.copper} 35%, ${c.copperLight} 55%, ${c.copper} 80%, ${c.copperDark})`, color: c.bg}}>$10 349</span>
                <span className="palette-chip" style={{background: c.panel, border: `1px solid ${c.line}`}}>
                  <b style={{color: c.copper}}>7</b> <span style={{color: c.grey}}>владельцев</span>
                </span>
              </span>
              <span className="pair-note" style={{color: c.grey, opacity: 1}}>{p.note}</span>
            </button>
          );
        })}
      </div>
      {!current && <p className="hint">Сейчас стоят свои цвета — ни одна палитра с ними не совпадает.</p>}
    </>
  );
};

/**
 * Тонкая настройка: свои восемь цветов. Свёрнута — большинству она не нужна, — и сразу
 * говорит, что перестанет читаться: предупреждение здесь, а не на готовом ролике.
 */
const FineColors: React.FC<{theme: Theme; custom: boolean; onChange: (t: Theme) => void}> = ({theme, custom, onChange}) => {
  const issues = contrastIssues(theme);
  return (
    <details className="fine" open={custom && issues.length > 0}>
      <summary>Тонкая настройка цветов{issues.length > 0 && <span className="fine-warn"> · {issues.length} {issues.length === 1 ? 'проблема' : 'проблемы'} с читаемостью</span>}</summary>
      <p className="note">Цвета по одному — на свой страх: палитры выше уже проверены на читаемость.</p>
      {COLOR_FIELDS.map(([key, label]) => (
        <div className="color" key={key}>
          <input type="color" value={theme[key]} onChange={(e) => onChange({...theme, [key]: e.target.value.toUpperCase()})} />
          <input value={theme[key]} maxLength={7} onChange={(e) => onChange({...theme, [key]: e.target.value})} />
          <span>{label}</span>
        </div>
      ))}
      {issues.length > 0 && (
        <ul className="warnings">
          {issues.map((i) => (
            <li key={i.what}>плохо читается {i.what}{i.ratio ? `: контраст ${i.ratio.toFixed(1)} при нужных ${i.min}` : ': цвет не дописан'}</li>
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
        setNotes([`${res.width}×${res.height}, ${Math.round(res.bytes / 1024)} КБ`, ...res.notes]);
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
        <div className="logo-shot" style={{background: theme.bg}} title="Так логотип ляжет на тёмный слайд">
          {logo
            ? <img src={shown} alt="Логотип" />
            : <span className="logo-text" style={{fontFamily: theme.fonts?.head, color: theme.copper}}>{theme.name || 'Компания'}</span>}
        </div>
        <div>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>
              {busy ? 'Обрабатываю…' : 'Загрузить логотип'}
            </button>
            {isOwn && hasRaw && !isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('raw')}>Оставить фон как был</button>}
            {isOwn && isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('clean')}>Убрать фон</button>}
            {logo && <button className="btn ghost" disabled={busy} onClick={() => variant('none')}>Без логотипа — название текстом</button>}
          </div>
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden
            onChange={(e) => send(e.target.files?.[0])} />
          {!logo && <p className="hint">Логотипа нет — на роликах вместо него название компании.</p>}
          <ul className="rules">
            <li><b>PNG, JPG, WebP или SVG</b>, до 10 МБ</li>
            <li>фон <b>прозрачный или однотонный</b> — однотонный уберём сами; фото и текстуры не подойдут</li>
            <li>от <b>300</b> точек по длинной стороне; большое уменьшим, пустые поля обрежем</li>
          </ul>
          {notes.length > 0 && <p className="hint">Загружен: {notes.join(' · ')}</p>}
          {warnings.map((w) => <p key={w} className="auth-error">{w}</p>)}
          <p className="hint">Ставится везде, где виден логотип: крупно на финале и полосой вверху кадра.</p>
        </div>
      </div>
    );
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
const FontField: React.FC<{theme: Theme; pairs: FontPair[]; onChange: (t: Theme) => void}> = ({theme, pairs, onChange}) => {
  useFontSheets(pairs);
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
            <span className="pair-note">{p.note}</span>
          </button>
        ))}
      </div>
      {!current && (
        <p className="hint">
          Сейчас стоит свой шрифт из <code>config/brand.json</code> — ни одна пара с ним не совпадает.
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
const RADIUS: [number, string][] = [[0, 'Острые'], [1, 'Мягкие'], [1.8, 'Круглые']];

const StyleField: React.FC<{theme: Theme; onChange: (t: Theme) => void}> = ({theme, onChange}) => {
  // Значения по умолчанию те же, что в вёрстке: тема могла прийти без style
  const style = {gradient: theme.style?.gradient ?? true, radius: theme.style?.radius ?? 1};
  const set = (patch: Partial<typeof style>) => onChange({...theme, style: {...style, ...patch}});
  return (
    <>
      <div className="switch-row">
        <span className="switch-label">Акцент</span>
        <div className="btn-row">
          <button type="button" className={`btn ${style.gradient ? 'primary' : 'ghost'}`}
            onClick={() => set({gradient: true})}>Градиентом</button>
          <button type="button" className={`btn ${style.gradient ? 'ghost' : 'primary'}`}
            onClick={() => set({gradient: false})}>Плоским цветом</button>
        </div>
      </div>
      <div className="switch-row">
        <span className="switch-label">Углы</span>
        <div className="btn-row">
          {RADIUS.map(([value, label]) => (
            <button key={label} type="button"
              className={`btn ${style.radius === value ? 'primary' : 'ghost'}`}
              onClick={() => set({radius: value})}>{label}</button>
          ))}
        </div>
      </div>
      <p className="hint">Углы задаются множителем: он меняет плашки, рамки, «таблетки» и точки списка разом, сохраняя их соотношение.</p>
    </>
  );
};

type BrandProps = {
  theme: Theme; saved: Theme; pairs: FontPair[]; palettes: Palette[];
  onChange: (t: Theme) => void; onSaved: (t: Theme) => void; onError: (e: unknown) => void;
};

export const BrandForm: React.FC<BrandProps> = ({theme, saved, pairs, palettes, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
  const dirty = theme !== saved;
  const persist = async () => {
    setBusy(true);
    try { onSaved(await api.saveBrand(theme)); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="form">
      <h2>Логотип</h2>
      <LogoField theme={theme} onSaved={onSaved} onError={onError} />

      <h2>Шрифты</h2>
      <p className="note">
        Пары со стороны грузятся по сети при рендере. Не догрузился — кадр рисуется системным
        шрифтом, а не ждёт: первая пара встроена в проект и работает всегда.
      </p>
      <FontField theme={theme} pairs={pairs} onChange={onChange} />

      <h2>Оформление</h2>
      <StyleField theme={theme} onChange={onChange} />

      <h2>Палитра</h2>
      <p className="note">Цвета всех роликов и слайдов. Каждая палитра проверена: текст и цена читаются на телефоне.</p>
      <PaletteField theme={theme} palettes={palettes} onChange={onChange} />
      <FineColors theme={theme} custom={!matchPalette(theme, palettes)} onChange={onChange} />
      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy} onClick={() => onChange(saved)}>Отменить правки</button>
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
 * Тексты постов здесь НЕ правятся: они приходят из дефолтов платформы под язык и режим
 * (config/copy.json). Клиент задаёт только своё — в этом смысл «пришёл и работает».
 * Переключатель модели цены прячет поля порта и фрахта на внутреннем рынке: там их нет.
 */
export const ProfileForm: React.FC<ProfileProps> = ({profile, saved, onChange, onSaved, onError}) => {
  const [busy, setBusy] = useState(false);
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
      <h2>Профиль <span className="muted">кто вы и как продаёте</span></h2>
      <p className="note">Тексты постов подставляются сами под язык и модель цены — их править не нужно. Дизайн — в разделе «Бренд».</p>

      <div className="row">
        <Field label="Компания" hint="печатается на постах"><input value={profile.company} onChange={(e) => set({company: e.target.value})} /></Field>
        <Field label="Язык постов" hint="реклама и карусели">
          <select value={profile.language} onChange={(e) => set({language: e.target.value})}>
            {POST_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            {/* Старый профиль мог остаться на языке, которого в списке больше нет: показываем
                его как есть, иначе поле молча отображало бы первый пункт, а сохранялось другое */}
            {!POST_LANGUAGES.some((l) => l.code === profile.language) && (
              <option value={profile.language}>{profile.language} — больше не поддерживается, выберите другой</option>
            )}
          </select>
        </Field>
      </div>

      <h2>Модель цены</h2>
      <div className="switch-row">
        <span className="switch-label">Режим</span>
        <div className="btn-row">
          <button type="button" className={`btn ${isExport ? 'primary' : 'ghost'}`}
            onClick={() => setPricing({mode: 'export', export: {...EXPORT_DEFAULTS, ...profile.pricing.export}})}>Экспорт</button>
          <button type="button" className={`btn ${isExport ? 'ghost' : 'primary'}`}
            onClick={() => setPricing({mode: 'domestic'})}>Внутренний рынок</button>
        </div>
      </div>
      <p className="hint">
        {isExport
          ? 'Экспорт: цена = авто + фрахт, на постах маршрут и «цена до порта».'
          : 'Внутренний рынок: цена как есть, без порта и фрахта.'}
      </p>

      <div className="row">
        <Field label="Валюта"><input value={profile.pricing.currency} onChange={(e) => setPricing({currency: e.target.value.toUpperCase()})} /></Field>
        {isExport && <Field label="Фрахт, $"><input inputMode="decimal" value={profile.pricing.export?.freight ?? 0}
          onChange={(e) => setExport({freight: Number(e.target.value) || 0})} /></Field>}
      </div>
      {isExport && (
        <>
          <div className="row">
            <Field label="Откуда"><input value={profile.pricing.export?.origin ?? ''} onChange={(e) => setExport({origin: e.target.value})} /></Field>
            <Field label="Страна отправки"><input value={profile.pricing.export?.originCountry ?? ''} onChange={(e) => setExport({originCountry: e.target.value})} /></Field>
          </div>
          <div className="row">
            <Field label="Порт назначения"><input value={profile.pricing.export?.port ?? ''} onChange={(e) => setExport({port: e.target.value})} /></Field>
            <Field label="Страна порта"><input value={profile.pricing.export?.portCountry ?? ''} onChange={(e) => setExport({portCountry: e.target.value})} /></Field>
          </div>
        </>
      )}

      <h2>Контакты</h2>
      <div className="row">
        <Field label="WhatsApp" hint="пусто — не показывать">
          <input value={profile.contacts.whatsapp ?? ''} onChange={(e) => setContacts({whatsapp: e.target.value || null})} />
        </Field>
        <Field label="Сайт"><input value={profile.contacts.site} onChange={(e) => setContacts({site: e.target.value})} /></Field>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>Отменить правки</button>
      </div>
    </div>
  );
};
