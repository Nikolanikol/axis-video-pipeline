// Речь обзора: распознавание через ElevenLabs, строки субтитров и перевод
import React, {useState} from 'react';
import {TARGET_LANGUAGES, canSpeak, languageName, targetLanguageOf} from '../../src/shared/languages.js';
import type {SubtitleLine} from '../../src/shared/types';
import {api, ReviewEntry} from '../api';
import {Field} from '../LotForm';
import {sec} from './Scrubber';

type Props = {
  review: ReviewEntry;
  available: boolean;              // есть ключ ElevenLabs
  market?: {language?: string} | null;  // язык рынка — значение по умолчанию для перевода
  canVoice: boolean;               // есть голос для озвучки (ELEVENLABS_VOICE_ID)
  ready: boolean;                  // видео готово
  onChange: (patch: Partial<ReviewEntry>) => void;
  onServer: (review: ReviewEntry) => void;
  onError: (e: unknown) => void;
  onSeek: (time: number) => void;
};

const LANGUAGES = [['', 'определить самому'], ['rus', 'русский'], ['mkd', 'македонский'], ['eng', 'английский'], ['kor', 'корейский']] as const;

export const SpeechPanel: React.FC<Props> = ({review, available, canVoice, market, ready, onChange, onServer, onError, onSeek}) => {
  const [starting, setStarting] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [relining, setRelining] = useState(false);
  const speech = review.speech;
  const running = speech?.status === 'running';
  const lines = speech?.lines ?? [];
  const subtitles = review.subtitles ?? {enabled: false, useTranslation: false};
  const voice = review.voice;
  const translatedCount = lines.filter((l) => (l.translation ?? '').trim()).length;
  const translated = translatedCount > 0;
  const voiced = Object.keys(voice?.clips ?? {}).length;
  const target = targetLanguageOf(review, market);
  const speaks = canSpeak(target);
  // Синтез идёт в фоне: пока сервер не сказал «готово», кнопка ждёт
  const voiceRunning = voice?.status === 'running';
  const busy = voicing || voiceRunning;
  const done = voice?.done ?? 0;
  const total = voice?.total ?? 0;

  const start = async () => {
    setStarting(true);
    try { onServer(await api.transcribe(review.id)); } catch (e) { onError(e); } finally { setStarting(false); }
  };
  const speak = async () => {
    setVoicing(true);
    try { onServer(await api.voiceReview(review.id)); } catch (e) { onError(e); } finally { setVoicing(false); }
  };
  const relines = async () => {
    if (!window.confirm('Собрать строки заново? Правки текста и перевод в строках потеряются.')) return;
    setRelining(true);
    try { onServer(await api.rebuildLines(review.id)); } catch (e) { onError(e); } finally { setRelining(false); }
  };
  const setLine = (id: string, patch: Partial<SubtitleLine>) =>
    onChange({speech: {...speech!, lines: lines.map((l) => (l.id === id ? {...l, ...patch} : l))}});

  return (
    <>
      <h2>Речь и субтитры</h2>
      {!available && <p className="note">Распознавание включится, когда в <code>.env</code> появится <code>ELEVENLABS_API_KEY</code> (нужен доступ Speech to Text) и сервер перезапустится.</p>}
      <div className="row">
        <Field label="Язык речи в видео" hint="на каком языке говоришь ты — для распознавания">
          <select value={review.speechLanguage ?? ''} onChange={(e) => onChange({speechLanguage: e.target.value})}>
            {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <Field label="Язык субтитров и озвучки" hint={speaks ? 'на нём пишется перевод строк' : 'субтитры — да, озвучка на этом языке не умеет'}>
          <select value={target} onChange={(e) => onChange({targetLanguage: e.target.value})}>
            {TARGET_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.name}{l.voice ? '' : ' — без озвучки'}</option>
            ))}
          </select>
        </Field>
        <Field label="&nbsp;">
          <button className="btn" disabled={!available || !ready || running || starting} onClick={start}>
            {running ? 'Распознаю…' : starting ? 'Запускаю…' : lines.length ? 'Распознать заново' : 'Распознать речь'}
          </button>
        </Field>
      </div>
      {(running || starting) && (
        <>
          <div className="hint">Распознаю речь… обычно это несколько секунд</div>
          <div className="bar wait"><div /></div>
        </>
      )}
      {speech?.status === 'error' && <div className="job-message">{speech.error}</div>}

      {lines.length > 0 && (
        <>
          <div className="btn-row">
            <button className="btn ghost" onClick={relines} disabled={relining} title="Заново разбить распознанные слова на строки — бесплатно">
              {relining ? 'Собираю…' : 'Пересобрать строки'}
            </button>
            {canVoice && (
              <button className="btn ghost" disabled={!translated || busy || !speaks} onClick={speak}
                title={!speaks ? `Голос не умеет ${languageName(target)} — субтитры делать можно, озвучку нет`
                  : translated ? 'Озвучить перевод голосом из .env — строки без изменений не переозвучиваются'
                    : 'Сначала впиши перевод хотя бы одной строки'}>
                {busy ? 'Озвучиваю…' : 'Озвучить перевод'}
              </button>
            )}
            <label className="check">
              <input type="checkbox" checked={subtitles.enabled} onChange={(e) => onChange({subtitles: {...subtitles, enabled: e.target.checked}})} />
              Показывать субтитры
            </label>
            <label className="check">
              <input type="checkbox" checked={subtitles.useTranslation} disabled={!subtitles.enabled}
                onChange={(e) => onChange({subtitles: {...subtitles, useTranslation: e.target.checked}})} />
              Показывать перевод
            </label>
            {voice && voiced > 0 && (
              <label className="check">
                <input type="checkbox" checked={Boolean(voice.enabled)}
                  onChange={(e) => onChange({voice: {...voice, enabled: e.target.checked}})} />
                Озвучка вместо живого звука
              </label>
            )}
          </div>
          {voiceRunning && (
            <>
              <div className="hint">Озвучиваю {total ? `${done} из ${total}` : 'строки'}… не закрывай страницу</div>
              <div className="bar"><div style={{width: `${total ? Math.round((done / total) * 100) : 5}%`}} /></div>
            </>
          )}
          {voice?.status === 'error' && <div className="job-message">{voice.error}</div>}
          {voiced > 0 && !voiceRunning && (
            <p className="hint">
              Озвучено строк: {voiced} из {translatedCount}. Повторная озвучка трогает только изменённые — остальные берутся с диска.
              {voice?.enabled ? ' Фрагменты под неё разложит кнопка «Под озвучку» в таймлайне.' : ' Включи галочку выше, чтобы озвучка пошла в ролик.'}
            </p>
          )}
          <p className="hint">
            Перевод на {languageName(target)} заполняется вручную — автоматического перевода в инструменте пока нет.
            Субтитры показываются на фрагментах с плашками: на хуке и в финале свой текст.
            Перед публикацией перевод смотрит носитель языка.
          </p>
          <div className="lines">
            {lines.map((l) => (
              <div className="line" key={l.id}>
                <button className="btn ghost line-time" title="Перейти к этому месту" onClick={() => onSeek(l.start)}>{sec(l.start)}</button>
                <input value={l.text} onChange={(e) => setLine(l.id, {text: e.target.value})} />
                <input className="line-translation" value={l.translation ?? ''} placeholder="перевод"
                  onChange={(e) => setLine(l.id, {translation: e.target.value})} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};
