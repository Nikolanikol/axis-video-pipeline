// Пайплайн «Карусели авто»: ссылка на объявление → семь слайдов → скачать.
//
// Экран нарочно короткий: вставил ссылку, посмотрел, скачал. Всё остальное —
// данные, слайды, брендбук — уже решено на сервере и в композиции.
import React, {useCallback, useEffect, useState} from 'react';
import {api, CarouselEntry} from '../api';
import {useConfig} from '../config';
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

export const CarouselTool: React.FC = () => {
  const {report} = useConfig();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState<CarouselEntry | null>(null);
  const [history, setHistory] = useState<CarouselEntry[]>([]);

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
      const made = await api.buildCarousel(link);
      setEntry(made);
      setHistory((h) => [made, ...h.filter((x) => x.id !== made.id)]);
      setLink('');
    } catch (e) { report(e); } finally { setBusy(false); }
  };

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
          <Field label="Ссылка на Encar" hint="можно вставить и просто номер объявления">
            <input
              value={link}
              placeholder="https://fem.encar.com/cars/detail/41630924"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !busy) build(); }}
            />
          </Field>
          <div className="btn-row">
            <button className="btn primary big" onClick={build} disabled={busy || !link.trim()}>
              {busy ? 'Собираю…' : 'Собрать карусель'}
            </button>
          </div>
          {busy && <div className="bar wait"><div /></div>}

          {entry && (
            <>
              <h2>Машина</h2>
              <CarSummary entry={entry} />
              <div className="btn-row">
                <button className="btn primary" onClick={downloadAll}>Скачать все 7</button>
                <a className="btn ghost" href={entry.car.source} target="_blank" rel="noreferrer">Открыть в каталоге</a>
              </div>
            </>
          )}

          {history.length > 1 && (
            <>
              <h2>Собранные раньше</h2>
              {history.filter((h) => h.id !== entry?.id).slice(0, 8).map((h) => (
                <button key={h.id} className="btn ghost" style={{display: 'block', width: '100%', textAlign: 'left'}}
                  onClick={() => setEntry(h)}>
                  {[h.car.brand, h.car.model].filter(Boolean).join(' ') || h.id} · № {h.id}
                </button>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="panel preview">
        {!entry && <div className="empty">Вставь ссылку на объявление</div>}
        {entry && (
          <div className="slides">
            {entry.slides.map((src, i) => (
              <figure key={src} className="slide">
                {/* Ключ по времени сборки: иначе браузер покажет прежнюю картинку из кэша */}
                <img src={`${src}?v=${encodeURIComponent(entry.updatedAt)}`} alt={`Слайд ${i + 1}`} />
                <figcaption>
                  <span>{i + 1} / {entry.slides.length}</span>
                  <a className="btn ghost" href={`/api/carousels/${entry.id}/slide/${i + 1}/download`}>Скачать</a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
