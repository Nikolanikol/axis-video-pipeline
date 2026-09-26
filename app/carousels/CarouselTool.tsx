// Пайплайн «Карусели авто»: ссылка на объявление → формат → слайды → скачать.
//
// Экран нарочно короткий: вставил ссылку, посмотрел, скачал. Всё остальное —
// данные, слайды, брендбук — уже решено на сервере и в композиции.
import React, {useCallback, useEffect, useState} from 'react';
import {api, CarouselEntry, CarouselFormat} from '../api';
import {useConfig} from '../config';
import {useCost, useSession} from '../auth';
import {carouselLang} from '../../src/carousel/i18n';
import {Field} from '../LotForm';

const km = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ru-RU')} км`);

/** Сводка по машине: по ней видно, ту ли карточку подтянули, не открывая слайды */
const CarSummary: React.FC<{entry: CarouselEntry}> = ({entry}) => {
  const c = entry.car;
  const bits = [
    c.year, km(c.mileageKm), c.transmission, c.fuel,
    c.price?.usd ? `$${c.price.usd.toLocaleString('ru-RU')}` : null,
    c.history ? `${c.history.accidentsTotal} ДТП` : 'история недоступна',
    c.history ? `${c.history.ownerChanges} смен владельца` : null,
  ].filter(Boolean);
  return (
    <div className="job">
      <div className="job-head">
        <b>{[c.brand, c.model, c.grade, c.trim].filter(Boolean).join(' ') || `№ ${entry.id}`}</b>
        <span>№ {entry.id}</span>
      </div>
      <div className="muted">{bits.join(' · ')}</div>
      {c.price && (
        <div className="muted">
          курс {Math.round(1 / c.price.krwToUsd).toLocaleString('ru-RU')} ₩ за $1, котировка {c.price.quotedAt}
        </div>
      )}
    </div>
  );
};

/**
 * Слайд во весь экран. Нужен потому, что в сетке превью размером с ноготь, а решать
 * про дизайн приходится по мелочам — читается ли подпись, не съехала ли цифра.
 */
const Lightbox: React.FC<{entry: CarouselEntry; at: number; onClose: () => void; onMove: (d: number) => void}> =
  ({entry, at, onClose, onMove}) => {
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') onMove(-1);
        if (e.key === 'ArrowRight') onMove(1);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onMove]);

    return (
      <div className="lightbox" onClick={onClose}>
        {/* Клик по самой картинке не закрывает: по ней хочется возить курсором и разглядывать */}
        <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
          <img src={`${entry.slides[at]}?v=${encodeURIComponent(entry.updatedAt)}`} alt={`Слайд ${at + 1}`} />
          <div className="lightbox-bar">
            <button className="btn ghost" onClick={() => onMove(-1)} disabled={at === 0}>← Назад</button>
            <span className="muted">{at + 1} / {entry.slides.length}</span>
            <button className="btn ghost" onClick={() => onMove(1)} disabled={at === entry.slides.length - 1}>Вперёд →</button>
            <a className="btn primary" href={`/api/carousels/${entry.id}/slide/${at + 1}/download`}>Скачать</a>
            <button className="btn ghost" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    );
  };

/**
 * Выбор формата: карточка с пропорцией кадра и числом слайдов. Пропорция нарисована —
 * «1:1» и «4:5» словами различают не все, а прямоугольник видно сразу.
 */
const FormatPicker: React.FC<{formats: CarouselFormat[]; value: string; onChange: (id: string) => void}> =
  ({formats, value, onChange}) => (
    <div className="pairs formats">
      {formats.map((f) => (
        <button key={f.id} type="button" className={`pair${f.id === value ? ' on' : ''}`} onClick={() => onChange(f.id)}>
          <span className="format-shape" style={{aspectRatio: `${f.width} / ${f.height}`}} />
          <span className="pair-head">{f.title}</span>
          <span className="pair-note">{f.note}</span>
        </button>
      ))}
    </div>
  );

// Последний выбранный формат — удобство этого браузера, не настройка
const FORMAT_KEY = 'axis-video:carousel-format';
const savedFormat = () => { try { return localStorage.getItem(FORMAT_KEY); } catch { return null; } };

export const CarouselTool: React.FC = () => {
  const {report, config, profile} = useConfig();
  // Язык слайдов — из профиля: виден здесь, чтобы не удивляться английской карусели
  const slidesLang = carouselLang(profile.language) === 'ru' ? 'русском' : 'английском';
  const {refresh: refreshAccess} = useSession();
  const cost = useCost('carousels', config.credits);
  const formats = config.carouselFormats ?? [];
  const [format, setFormatState] = useState<string>(() => savedFormat() ?? 'showcase');
  const setFormat = (id: string) => { setFormatState(id); try { localStorage.setItem(FORMAT_KEY, id); } catch { /* приватный режим */ } };
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState<CarouselEntry | null>(null);
  const [history, setHistory] = useState<CarouselEntry[]>([]);
  // Какой слайд открыт во весь экран; null — сетка
  const [open, setOpen] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.carousels().then((list) => {
      setHistory(list);
      setEntry((e) => e ?? list[0] ?? null);
    }).catch(report);
  }, [report]);
  useEffect(refresh, [refresh]);

  const build = async () => {
    setBusy(true);
    try {
      const made = await api.buildCarousel(link, format);
      setEntry(made);
      setHistory((h) => [made, ...h.filter((x) => x.id !== made.id)]);
      setLink('');
    } catch (e) { report(e); } finally { setBusy(false); refreshAccess(); }
  };

  // Пересобрать существующую карусель: свежие данные и бренд. again — тот же вариант (зерно
  // прежнее), иначе «Другой вариант»: новое зерно — другие компоновка и фразы.
  // Формат — выбранный сейчас: так карусель переводится из одного формата в другой
  const rebuild = async (again: boolean) => {
    if (!entry) return;
    setBusy(true);
    try {
      const made = await api.buildCarousel(entry.id, format, again && entry.format === format ? entry.seed : undefined);
      setEntry(made);
      setHistory((h) => [made, ...h.filter((x) => x.id !== made.id)]);
    } catch (e) { report(e); } finally { setBusy(false); refreshAccess(); }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteCarousel(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      setEntry((e) => (e?.id === id ? null : e));
    } catch (e) { report(e); }
  };

  // Удалили открытую карусель — показываем следующую из истории, а не пустой экран
  useEffect(() => { if (!entry && history.length) setEntry(history[0]); }, [entry, history]);

  // Скачиваем по одному файлу: в Instagram и TikTok слайды всё равно загружаются
  // по отдельности, и архив пришлось бы распаковывать. Пауза между файлами — чтобы
  // браузер не счёл это за лавину загрузок и не отменил половину.
  const downloadAll = async () => {
    if (!entry) return;
    for (let n = 1; n <= entry.slides.length; n++) {
      const a = document.createElement('a');
      a.href = `/api/carousels/${entry.id}/slide/${n}/download`;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  return (
    <main className="grid grid-carousel">
      <section className="panel editor">
        <div className="form">
          <h2>Объявление</h2>
          <Field label="Ссылка на Encar" hint={<>можно вставить и просто номер объявления · слайды на {slidesLang} — язык меняется в <a href="#/settings/profile">профиле</a></>}>
            <input
              value={link}
              placeholder="https://fem.encar.com/cars/detail/41630924"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !busy) build(); }}
            />
          </Field>
          {formats.length > 0 && (
            <Field label="Формат">
              <FormatPicker formats={formats} value={format} onChange={setFormat} />
            </Field>
          )}
          <div className="btn-row">
            <button className="btn primary big" onClick={build} disabled={busy || !link.trim()}>
              {busy ? 'Собираю…' : `Собрать карусель${cost}`}
            </button>
          </div>
          {busy && <div className="bar wait"><div /></div>}

          {entry && (
            <>
              <h2>Машина</h2>
              <CarSummary entry={entry} />
              <div className="job-actions">
                <button className="btn primary" onClick={downloadAll} disabled={busy}>Скачать все {entry.slides.length}</button>
                <a className="btn ghost" href={entry.car.source} target="_blank" rel="noreferrer">Открыть в каталоге</a>
                <button className="btn" onClick={() => rebuild(true)} disabled={busy}
                  title="Те же компоновка и фразы, свежие данные и текущий бренд">Пересобрать{cost}</button>
                {format !== 'classic' && (
                  <button className="btn" onClick={() => rebuild(false)} disabled={busy}
                    title="Та же машина, другие компоновка и фразы">Другой вариант{cost}</button>
                )}
                <button className="btn ghost" onClick={() => remove(entry.id)} disabled={busy}>Удалить</button>
              </div>
            </>
          )}

          {history.length > 1 && (
            <>
              <h2>Собранные раньше</h2>
              {history.filter((h) => h.id !== entry?.id).slice(0, 8).map((h) => (
                <div key={h.id} className="hist-row">
                  <button className="btn ghost hist-open" onClick={() => setEntry(h)}>
                    {[h.car.brand, h.car.model].filter(Boolean).join(' ') || h.id} · № {h.id}
                  </button>
                  <button className="btn icon" title="Удалить" onClick={() => remove(h.id)}>×</button>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="panel preview">
        {!entry && <div className="empty">Вставь ссылку на объявление</div>}
        {entry && (
          <div className="slides" style={{['--slide-ratio' as string]: (() => {
            const f = formats.find((x) => x.id === (entry.format ?? 'classic'));
            return f ? `${f.width} / ${f.height}` : '9 / 16';
          })()}}>
            {entry.slides.map((src, i) => (
              <figure key={src} className="slide">
                {/* Ключ по времени сборки: иначе браузер покажет прежнюю картинку из кэша */}
                <img src={`${src}?v=${encodeURIComponent(entry.updatedAt)}`} alt={`Слайд ${i + 1}`}
                  onClick={() => setOpen(i)} title="Открыть во весь экран" />
                <figcaption>
                  <span>{i + 1} / {entry.slides.length}</span>
                  <a className="btn ghost" href={`/api/carousels/${entry.id}/slide/${i + 1}/download`}>Скачать</a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {entry && open !== null && (
        <Lightbox
          entry={entry}
          at={open}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen((n) => Math.min(entry.slides.length - 1, Math.max(0, (n ?? 0) + d)))}
        />
      )}
    </main>
  );
};
