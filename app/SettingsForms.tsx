// Формы настроек: профиль клиента (компания, язык постов, модель цены, контакты), бренд
// (логотип, шрифты, оформление, палитра) и надписи рекламных роликов.
import React, {useEffect, useRef, useState} from 'react';
import {POST_LANGUAGES} from '../src/shared/languages';
import type {Profile, Theme} from '../src/shared/types';
import {Lock} from 'lucide-react';
import {api, Copy, FontPair, Palette, ProfileEntry} from './api';
import {FORMATS} from '../src/shared/model';
import {resolveTexts, textsForLanguage} from '../src/shared/profile';
import {CURRENCIES, currencyCode, currencySign, isKnownCurrency} from '../src/shared/currencies';
import {contrastIssues, matchPalette} from '../src/shared/contrast.js';
import {Field} from './LotForm';
import {useConfig} from './config';
import {DesignField} from './DesignField';


// Только цветовые поля темы: в ней теперь есть ещё имя, шрифты и файлы бренда,
// и без сужения форма пыталась бы засунуть объект в поле ввода
type ColorKey = {[K in keyof Theme]-?: Theme[K] extends string ? K : never}[keyof Theme];

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
    // Без логотипа ролик пишет название компании из профиля, а не name из бренда — его и показываем
    const company = useConfig().profile.company?.trim();
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
            : <span className="logo-text" style={{fontFamily: theme.fonts?.head, color: theme.copper}}>{company || 'Компания'}</span>}
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

      <DesignField theme={theme} onChange={onChange} />

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
 * Тексты постов здесь не правятся: они приходят из дефолтов платформы под язык и режим
 * (config/copy.json), а свои надписи роликов — отдельный раздел «Реклама авто» (AdTextsForm).
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
      <p className="note">Тексты постов подставляются сами под язык и модель цены; свои надписи роликов — в разделе «Реклама авто». Дизайн — в разделе «Бренд».</p>

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
        {/* Список со значками, а не свободное поле: вписанное слово («РУБЛЬ») печаталось в
            ролике как есть и не склонялось. Старое значение узнаём (currencyCode) */}
        <Field label="Валюта" hint={isKnownCurrency(profile.pricing.currency) ? `в ролике: 10 000 ${currencySign(profile.pricing.currency)}` : undefined}>
          <select value={currencyCode(profile.pricing.currency)} onChange={(e) => setPricing({currency: e.target.value})}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.sign} — {c.name}</option>)}
            {!isKnownCurrency(profile.pricing.currency) && (
              <option value={currencyCode(profile.pricing.currency)}>{profile.pricing.currency} — нет в списке, выберите другую</option>
            )}
          </select>
        </Field>
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
      <div className="row">
        <Field label="Telegram" hint="@имя или ссылка t.me/…">
          <input value={profile.contacts.telegram ?? ''} onChange={(e) => setContacts({telegram: e.target.value})} />
        </Field>
        <Field label="Кнопка на финале карусели" hint="если у выбранного нет контакта — возьмём другой">
          <select value={profile.contacts.primary ?? 'whatsapp'}
            onChange={(e) => setContacts({primary: e.target.value as 'whatsapp' | 'telegram'})}>
            <option value="whatsapp">Написать в WhatsApp</option>
            <option value="telegram">Написать в Telegram</option>
          </select>
        </Field>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>Отменить правки</button>
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
  {id: 'cta', title: 'CTA', keys: ['ctaTitle', 'ctaAccent', 'ctaBenefit', 'whatsappLabel'],
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
      setNotes([`${res.width}×${res.height}, ${Math.round(res.bytes / 1024)} КБ`, ...res.notes]);
      setWarnings(res.warnings);
      setHasRaw(res.hasRaw);
      return res;
    }).finally(() => { if (ref.current) ref.current.value = ''; });
  };
  const variant = (v: 'clean' | 'raw' | 'default') => run(() => { setNotes([]); setWarnings([]); return api.iconVariant(v); });
  const shown = icon.startsWith('http') || icon.startsWith('/') ? icon : `/${icon}`;

  return (
    <div className="icon-field">
      <div className="icon-shot" style={{background: theme.bg}} title="Так иконка ляжет на слайд">
        <img src={shown} alt="Иконка преимущества" />
      </div>
      <div>
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Обрабатываю…' : 'Загрузить свою иконку'}</button>
          {isOwn && hasRaw && !isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('raw')}>Оставить фон как был</button>}
          {isOwn && isRaw && <button className="btn ghost" disabled={busy} onClick={() => variant('clean')}>Убрать фон</button>}
          {isOwn && <button className="btn ghost" disabled={busy} onClick={() => variant('default')}>Вернуть стандартную</button>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden onChange={(e) => send(e.target.files?.[0])} />
        <p className="hint">PNG, JPG, WebP или SVG до 5 МБ, от 96 точек; фон прозрачный или однотонный — однотонный уберём сами, поля обрежем. Сохраняется сразу, общая для всех языков.</p>
        {notes.length > 0 && <p className="hint">Загружена: {notes.join(' · ')}</p>}
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
      <h2>Реклама авто <span className="muted">надписи в роликах</span></h2>
      <p className="note">
        Пустое поле — текст по умолчанию (серым). В конкретном ролике любую надпись можно поменять ещё раз — в «Изменить вручную».
        {mode === 'domestic' ? ' Сейчас режим «Внутренний рынок»' : ' Сейчас режим «Экспорт»'} — тексты по умолчанию под него.
      </p>

      <div className="btn-row">
        {POST_LANGUAGES.map((l) => (
          <button key={l.code} type="button" className={`btn ${l.code === language ? 'primary' : 'ghost'}`} onClick={() => onLanguage(l.code)}>
            {l.name}{ownCount(l.code) ? ` · ${ownCount(l.code)}` : ''}{l.code === profile.language ? ' (в постах)' : ''}
          </button>
        ))}
      </div>
      {language !== profile.language && (
        <p className="hint">Посты сейчас на другом языке — эти тексты включатся, когда в «Профиле» выберете {POST_LANGUAGES.find((l) => l.code === language)?.name}.</p>
      )}

      {[...AD_SCENES, ...(UNPLACED.length ? [{id: 'other', title: 'Прочее', keys: UNPLACED, locked: []}] : [])].map((sc) => (
        <section key={sc.id} className="scene-group">
          <h2>{sc.title}{'also' in sc && sc.also ? <span className="muted">{sc.also}</span> : null}</h2>
          {sc.keys.map((key) => {
            const t = AD_TEXT_FIELDS.get(key);
            const label = t?.label ?? key;
            const hint = ('hints' in sc ? sc.hints?.[key] : undefined) ?? t?.hint;
            return (
              <React.Fragment key={key}>
                <Field label={label} hint={hint} wide>
                  {t?.multiline
                    ? <textarea rows={2} value={own[key] ?? ''} placeholder={defaults[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
                    : <input value={own[key] ?? ''} placeholder={defaults[key] ?? ''} onChange={(e) => set(key, e.target.value)} />}
                </Field>
                {/* Иконка — к своей строке, а не отдельным пунктом: так видно, о какой речь */}
                {key === 'ctaBenefit' && (
                  <label className="check scene-check">
                    <input type="checkbox" checked={profile.ad?.benefitIcon !== false}
                      onChange={(e) => onChange({...profile, ad: {...profile.ad, benefitIcon: e.target.checked}})} />
                    Показывать иконку рядом — для всех языков
                  </label>
                )}
                {key === 'ctaBenefit' && profile.ad?.benefitIcon !== false && (
                  <IconField theme={theme} onSaved={onBrandSaved} onError={onError} />
                )}
              </React.Fragment>
            );
          })}
          {sc.locked.map((l) => (
            <div key={l.what} className="locked-row"><Lock size={13} aria-hidden /> <span>{l.what}</span> <span className="muted">— {l.where}</span></div>
          ))}
        </section>
      ))}

      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={persist}>Сохранить</button>
        <button className="btn" disabled={!dirty || busy || !saved} onClick={() => saved && onChange(saved)}>Отменить правки</button>
        <button className="btn ghost" disabled={busy || !ownCount(language)} onClick={reset}>Вернуть тексты по умолчанию</button>
      </div>
    </div>
  );
};
