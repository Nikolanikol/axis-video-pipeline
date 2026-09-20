// Пайплайн «Обзоры авто» → «Монтаж обзора»: видео → фрагменты → превью → рендер
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {ReviewShort} from '../../src/reviews/ReviewShort';
import {
  MAX_REVIEW_SEC, REVIEW_FPS, buildTimeline, reviewFrames, sanitizeSegments, wholeReview,
} from '../../src/shared/timeline.js';
import type {Market, ReviewProps, ReviewSegment} from '../../src/shared/types';
import {api, LotEntry, ReviewEntry} from '../api';
import {useConfig} from '../config';
import {JobsPanel} from '../JobsPanel';
import {Field} from '../LotForm';
import {MusicFields} from '../MusicFields';
import {Scrubber, Seek, sec} from './Scrubber';
import {SegmentList} from './SegmentList';
import {speechStale} from '../../src/shared/subtitles.js';
import {ColourPanel} from './ColourPanel';
import {SpeechPanel} from './SpeechPanel';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const SAVE_LABEL: Record<SaveState, string> = {saved: 'Сохранено', dirty: 'Есть правки', saving: 'Сохраняю…', error: 'Не сохранено'};
const LAST_REVIEW = 'axis-video:last-review';
const lastReview = {
  get: () => { try { return localStorage.getItem(LAST_REVIEW); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem(LAST_REVIEW, id); } catch { /* приватный режим */ } },
};
const newId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export const ReviewTool: React.FC = () => {
  const {config, markets, brand, report} = useConfig();
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [review, setReview] = useState<ReviewEntry | null>(null);
  const [lots, setLots] = useState<LotEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>('saved');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  // Версия обзора, с которой работает форма: по ней сервер ловит правку поверх чужих изменений
  const versionRef = useRef<string | undefined>(undefined);
  const seekRef = useRef<Seek | null>(null);
  const player = useRef<PlayerRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.reviews(), api.lots()]).then(([list, lotList]) => {
      setReviews(list);
      setLots(lotList);
      const first = list.find((r) => r.id === lastReview.get()) ?? list[0] ?? null;
      versionRef.current = first?.updatedAt;
      setReview(first);
      setLoaded(true);
    }).catch(report);
  }, [report]);
  useEffect(() => { if (review) lastReview.set(review.id); }, [review?.id]);

  // Автосохранение
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const saveRef = useRef(save);
  saveRef.current = save;
  const persist = useCallback(async () => {
    const current = reviewRef.current;
    if (!current) return;
    setSave('saving');
    try {
      const saved = await api.saveReview(current, versionRef.current);
      versionRef.current = saved.updatedAt;
      setReviews((rs) => [saved, ...rs.filter((r) => r.id !== saved.id)]);
      setSave(reviewRef.current === current ? 'saved' : 'dirty');
    } catch (e) { setSave('error'); report(e); }
  }, [report]);
  useEffect(() => {
    if (save !== 'dirty') return;
    const t = setTimeout(persist, 600);
    return () => clearTimeout(t);
  }, [review, save, persist]);
  useEffect(() => () => {
    if (saveRef.current === 'dirty' && reviewRef.current) api.saveReview(reviewRef.current, versionRef.current).catch(report);
  }, [report]);

  const edit = useCallback((patch: Partial<ReviewEntry>) => {
    setReview((r) => (r ? {...r, ...patch} : r));
    setSave('dirty');
  }, []);
  const setSegments = useCallback((segments: ReviewSegment[]) => edit({segments}), [edit]);
  const updateSegment = useCallback((id: string, patch: Partial<ReviewSegment>) => {
    const current = reviewRef.current;
    if (current) edit({segments: current.segments.map((s) => (s.id === id ? {...s, ...patch} : s))});
  }, [edit]);
  // Ответ сервера про видео, речь и озвучку: эти поля ведёт сервер, правки формы не трогаем
  const adoptServer = useCallback((server: ReviewEntry) => {
    versionRef.current = server.updatedAt;
    const patch = {source: server.source, speech: server.speech, voice: server.voice};
    setReview((r) => (r && r.id === server.id ? {...r, ...patch} : r));
    setReviews((rs) => rs.map((r) => (r.id === server.id ? {...r, ...patch} : r)));
  }, []);

  // Пока идёт обработка видео, распознавание или озвучка — опрашиваем сервер
  const busy = review?.source?.status === 'processing' || review?.speech?.status === 'running'
    || review?.voice?.status === 'running';
  useEffect(() => {
    if (!busy || !review) return;
    const t = setInterval(() => api.review(review.id).then(adoptServer).catch(report), 1000);
    return () => clearInterval(t);
  }, [busy, review?.id, adoptServer, report]);

  const select = async (id: string) => {
    if (save === 'dirty') await persist();
    const next = reviews.find((r) => r.id === id);
    if (next) { versionRef.current = next.updatedAt; setReview(next); setSave('saved'); setSelectedId(null); }
  };
  const create = async () => {
    try {
      if (save === 'dirty') await persist();
      const created = await api.createReview({lotId: review?.lotId ?? null});
      versionRef.current = created.updatedAt;
      setReviews((rs) => [created, ...rs]);
      setReview(created);
      setSave('saved');
    } catch (e) { report(e); }
  };
  // Пересборка рабочей копии из того же файла: перезаливать 400 МБ ради смены обработки незачем
  const reprocess = async () => {
    if (!review) return;
    if (!window.confirm('Собрать рабочую копию заново? Фрагменты и распознанная речь останутся.')) return;
    try { adoptServer(await api.reprocessVideo(review.id)); } catch (e) { report(e); }
  };
  const sendVideo = async (file?: File) => {
    if (!file || !review) return;
    if (save === 'dirty') await persist();
    setUpload(0);
    try {
      adoptServer(await api.uploadVideo(review.id, file, setUpload));
    } catch (e) { report(e); } finally { setUpload(null); }
  };

  // Озвучка считается включённой ровно так же, как в композиции: есть начитка и она не выключена
  const voiceClips = Object.keys(review?.voice?.clips ?? {}).length;
  const voiceOn = Boolean(review?.voice?.enabled && voiceClips);
  const lot = lots.find((l) => l.id === review?.lotId) ?? null;
  const marketId = lot?.market ?? review?.market ?? config.defaultMarket;
  const market = markets.find((m) => m.id === marketId) ?? markets[0];
  const source = review?.source?.status === 'ready' ? review.source : null;
  // Видео из мессенджера приходит сильно меньше 1080p — никакой обработкой резкость не вернуть
  const smallSource = Boolean(source?.original?.width && Math.max(source.original.width, source.original.height ?? 0) < 1280);
  const segments = review?.segments ?? [];
  const selected = segments.find((s) => s.id === selectedId) ?? null;
  const timeline = useMemo(() => buildTimeline(segments, REVIEW_FPS), [segments]);
  const totalSec = timeline.durationInFrames / REVIEW_FPS;
  const input: ReviewProps | null = useMemo(
    () => (review && market ? {review, lot, market: market as Market, theme: brand} : null),
    [review, lot, market, brand],
  );

  const addSegment = useCallback((start: number, duration: number) => {
    const id = newId();
    const current = reviewRef.current?.segments ?? [];
    const finalAt = current.findIndex((s) => s.kind === 'final');
    const seg: ReviewSegment = {id, start: Math.round(start * 100) / 100, duration: Math.round(duration * 100) / 100, speed: 1, kind: current.length ? 'caption' : 'hook', caption: '', accent: false, note: ''};
    const next = [...current];
    next.splice(finalAt >= 0 ? finalAt : next.length, 0, seg);
    setSegments(next);
    setSelectedId(id);
  }, [setSegments]);

  // Готовые раскладки фрагментов. Любая заменяет текущие, поэтому спрашиваем подтверждение.
  const replaceSegments = (next: ReviewSegment[], what: string) => {
    if (!source) return;
    if (segments.length && !window.confirm(`Заменить ${segments.length} фрагм. ${what}?`)) return;
    // Через ту же чистку, что и на сервере: иначе превью покажет одно, а рендер выдаст другое
    setSegments(sanitizeSegments(next, source.duration) as ReviewSegment[]);
    setSelectedId(null);
  };
  // Целиком — ничего не режем, только заставка и финал по краям
  const applyWhole = () => replaceSegments(wholeReview(source?.duration ?? 0), 'обзором целиком');

  // Остальные раскладки — шаблон v1, «под озвучку», чистка пауз — из интерфейса убраны.
  // Все три режут материал на куски, а обзор снимается одним кадром и должен таким остаться:
  // склейки ломают и картинку, и синхрон с начиткой. Код живёт в src/shared/timeline.js
  // (applyTemplate, voiceTimeline, cutPauses) вместе с тестами — вернём кнопки, когда доведём
  // режимы до ума. Возвращать по одной и каждую проверять на полном прогоне.

  const warnings = [
    !source && 'нет готового видео',
    source && !segments.length && 'нет фрагментов',
    segments.length > 0 && !segments.some((s) => s.kind === 'hook') && 'нет хука',
    segments.length > 0 && !segments.some((s) => s.kind === 'final') && 'нет финала с ценой и контактами',
    totalSec > MAX_REVIEW_SEC && `ролик ${sec(totalSec)} — длиннее ${MAX_REVIEW_SEC} с`,
    lot && !lot.carPriceUsd && !(lot.carPriceKrw && lot.krwPerUsd) && 'у лота нет цены — будет «XX XXX $»',
    speechStale(review?.speech, source) && 'речь распознана по другому видео — субтитры и озвучка лягут мимо кадра',
  ].filter(Boolean) as string[];

  if (!loaded) return <div className="boot">Загрузка обзоров…</div>;

  return (
    <>
      <div className="toolbar">
        <select value={review?.id ?? ''} onChange={(e) => select(e.target.value)} disabled={!reviews.length}>
          {!reviews.length && <option value="">Обзоров пока нет</option>}
          {reviews.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <button className="btn" onClick={create}>+ Новый обзор</button>
        {review && <span className={`save save-${save}`}>{SAVE_LABEL[save]}</span>}
      </div>

      {!review ? (
        <div className="page"><div className="card soon"><h1>Монтаж обзора</h1><p className="muted">Создай первый обзор кнопкой «+ Новый обзор».</p></div></div>
      ) : (
        <main className="grid grid-review">
          <section className="panel editor">
            <div className="form">
              <div className="row">
                <Field label="Название"><input value={review.title} onChange={(e) => edit({title: e.target.value})} /></Field>
                <Field label="Подпись под названием">
                  <input value={review.tagline ?? market.texts.hookTagline}
                    onChange={(e) => edit({tagline: e.target.value})} maxLength={60} />
                </Field>
                {/* Лот и рынок из формы убраны: лот всегда оставался пустым, а рынок в конфиге один.
                    Рынок по-прежнему работает под капотом — из него идут контакты, тексты финала и
                    музыка; обзор берёт рынок по умолчанию (config.defaultMarket). Вернуть выбор
                    лота имеет смысл, когда на финале обзора понадобится цена: без лота её негде взять. */}
              </div>

              <h2>Видео <span className="muted">своя вертикальная съёмка, до 10 минут</span></h2>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); sendVideo(e.dataTransfer.files[0]); }}
              >
                {upload !== null ? (
                  <><div>Загрузка {Math.round(upload * 100)}%</div><div className="bar"><div style={{width: `${upload * 100}%`}} /></div></>
                ) : review.source?.status === 'processing' ? (
                  <><div>Готовлю видео… {Math.round((review.source?.progress ?? 0) * 100)}%</div>
                    <div className="bar"><div style={{width: `${(review.source?.progress ?? 0) * 100}%`}} /></div></>
                ) : (
                  <>
                    {review.source?.status === 'error' && <div className="job-message">Не получилось: {review.source.error}</div>}
                    {source && (
                      <div className="source-info">
                        <b>{source.name}</b>
                        <span className="muted">
                          {sec(source.duration ?? 0)} · {source.original?.width}×{source.original?.height}
                          {source.original?.fps ? ` · ${source.original.fps} fps` : ''}{source.original?.codec ? ` · ${source.original.codec.toUpperCase()}` : ''}
                          {source.original?.hdr ? ' · HDR' : ''}
                        </span>
                      </div>
                    )}
                    <div className="btn-row">
                      <button className="btn" onClick={() => fileRef.current?.click()}>{source ? 'Заменить видео' : 'Загрузить видео'}</button>
                      {source && (
                        <button className="btn ghost" onClick={reprocess}
                          title="Собрать рабочую копию заново из того же файла — нужно, когда поменялась обработка (например, перевод HDR в обычный цвет)">
                          Пересобрать видео
                        </button>
                      )}
                    </div>
                    <span className="muted">или перетащи файл сюда (.mov / .mp4 с iPhone)</span>
                    {source && smallSource && (
                      <span className="warn-inline">Это сжатая копия ({source.original?.width}×{source.original?.height}) — залей оригинал из галереи телефона, качество заметно выше</span>
                    )}
                  </>
                )}
                <input ref={fileRef} type="file" accept="video/*,.mov,.mp4,.m4v" hidden
                  onChange={(e) => { sendVideo(e.target.files?.[0]); e.target.value = ''; }} />
              </div>

              {source && (
                <>
                  <h2>Таймлайн</h2>
                  <Scrubber source={source} segments={segments} selected={selected} onSelect={setSelectedId}
                    onAdd={addSegment} onUpdate={updateSegment} seekRef={seekRef} />

                  <h2>
                    Фрагменты <span className="muted">ролик {sec(totalSec)}{totalSec > MAX_REVIEW_SEC ? ` — больше ${MAX_REVIEW_SEC} с` : ''}</span>
                  </h2>
                  <div className="btn-row">
                    <button className="btn" onClick={applyWhole} title="Весь материал подряд, без склеек: заставка в начале, цена в конце">Обзор целиком</button>
                    {segments.length > 0 && <button className="btn ghost" onClick={() => { if (window.confirm('Убрать все фрагменты?')) setSegments([]); }}>Очистить</button>}
                  </div>
                  <SegmentList
                    segments={segments}
                    source={source}
                    selectedId={selectedId}
                    onSelect={(id) => { setSelectedId(id); const s = segments.find((x) => x.id === id); if (s) seekRef.current?.(s.start); }}
                    onChange={setSegments}
                    onPlay={(s) => seekRef.current?.(s.start, s.duration)}
                  />
                </>
              )}

              <SpeechPanel
                review={review}
                available={config.features?.speech ?? false}
                canVoice={config.features?.voice ?? false}
                market={market as {language?: string} | null}
                voices={config.voices}
                source={source}
                ready={Boolean(source)}
                onChange={edit}
                onServer={adoptServer}
                onError={report}
                onSeek={(t) => seekRef.current?.(t)}
              />

              {source && (
                <ColourPanel colour={review.colour} hdrSource={source.original?.hdr}
                  onChange={(colour) => edit({colour})} />
              )}

              <h2>Звук</h2>
              <MusicFields value={review.music} inherited={market?.music ?? {track: null}} onChange={(music) => edit({music})} />
              {review.voice && voiceClips > 0 && (
                <Field label={`Голос диктора: ${Math.round((review.voice.volume ?? 1) * 100)}%`}
                  hint={review.voice.enabled ? undefined : 'озвучка выключена — включается в разделе «Речь»'}>
                  <input type="range" min={0} max={100} step={5} value={Math.round((review.voice.volume ?? 1) * 100)}
                    onChange={(e) => edit({voice: {...review.voice!, volume: Number(e.target.value) / 100}})} />
                </Field>
              )}
              {/* При озвучке живой звук глушится в композиции наглухо, и ползунок бесполезен:
                  показываем это прямо, а не оставляем регулятор, который ни на что не влияет */}
              <Field label={`Живой звук с видео: ${voiceOn ? 'выключен' : `${Math.round((review.sourceVolume ?? 0) * 100)}%`}`}
                hint={voiceOn
                  ? 'при озвучке живой звук выключен: иначе в кадре говорят два голоса разом'
                  : 'на ускоренных фрагментах всегда выключен'}>
                <input type="range" min={0} max={100} step={5} disabled={voiceOn}
                  value={Math.round((review.sourceVolume ?? 0) * 100)}
                  onChange={(e) => edit({sourceVolume: Number(e.target.value) / 100})} />
              </Field>
            </div>
          </section>

          <section className="panel preview">
            {input && (
              <div className="player-wrap">
                <div className="player-box">
                  <Player
                    ref={player}
                    component={ReviewShort}
                    inputProps={input}
                    durationInFrames={reviewFrames(segments, REVIEW_FPS)}
                    fps={REVIEW_FPS}
                    compositionWidth={1080}
                    compositionHeight={1920}
                    style={{width: '100%', height: '100%'}}
                    controls
                    loop
                    clickToPlay
                  />
                </div>
                <div className="scenes">
                  {timeline.items.map(({seg, index, from}) => (
                    <button key={seg.id} className={seg.id === selectedId ? 'btn' : 'btn ghost'} title={seg.note || seg.caption}
                      onClick={() => { setSelectedId(seg.id); player.current?.pause(); player.current?.seekTo(from + 5); }}>
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel renders">
            <JobsPanel
              query={{review: review.id}}
              label="Рендер обзора"
              warnings={warnings}
              disabled={!source || !segments.length}
              start={async (silent) => { if (save !== 'saved') await persist(); return api.renderReview(review.id, silent); }}
              onError={report}
            />
          </section>
        </main>
      )}
    </>
  );
};
