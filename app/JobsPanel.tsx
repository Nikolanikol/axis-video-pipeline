// Панель рендера: кнопка, «версия без звука», предупреждения, история роликов с прогрессом и скачиванием
import React, {useCallback, useEffect, useState} from 'react';
import {api, Job, JobQuery} from './api';

type Props = {
  query: JobQuery;
  label: string;
  warnings: string[];
  disabled?: boolean;
  start: (silent: boolean) => Promise<Job>;
  onError: (e: unknown) => void;
};

const time = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const active = (j: Job) => j.status === 'queued' || j.status === 'running';

export const JobsPanel: React.FC<Props> = ({query, label, warnings, disabled, start, onError}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [starting, setStarting] = useState(false);
  const [silent, setSilent] = useState(false);
  const key = JSON.stringify(query);

  const refresh = useCallback(() => api.jobs(JSON.parse(key)).then(setJobs).catch(onError), [key, onError]);
  useEffect(() => { setJobs([]); refresh(); }, [refresh]);

  // Пока что-то рендерится — опрашиваем раз в секунду
  const running = jobs.some(active);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const run = async () => {
    setStarting(true);
    try {
      const job = await start(silent);
      setJobs((js) => [job, ...js]);
    } catch (e) { onError(e); } finally { setStarting(false); }
  };

  return (
    <div className="render">
      <button className="btn primary big" onClick={run} disabled={starting || disabled}>
        {starting ? 'Запускаю…' : label}
      </button>
      {starting && <div className="bar wait"><div /></div>}
      <label className="check silent-check">
        <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
        + версия без звука — под трендовый звук в TikTok/Instagram
      </label>
      {warnings.length > 0 && <ul className="warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      <h2>Ролики</h2>
      {!jobs.length && <div className="empty small">Пока пусто</div>}
      {jobs.map((j) => (
        <div key={j.id} className={`job job-${j.status}`}>
          <div className="job-head">
            <b>{time(j.createdAt)} · {j.formatTitle ?? j.format ?? 'Авто с ценой'}</b>
            <span>{j.stage}{active(j) && j.status === 'running' ? ` · ${j.progress}%` : ''}</span>
          </div>
          {active(j) && (j.status === 'queued' || !j.progress
            ? <div className="bar wait"><div /></div>
            : <div className="bar"><div style={{width: `${j.progress}%`}} /></div>)}
          {j.status === 'error' && <div className="job-message">{j.error}</div>}
          {j.status === 'done' && (
            <>
              <a href={j.storyboard} target="_blank" rel="noreferrer"><img className="storyboard" src={j.storyboard} alt="Раскадровка" /></a>
              <div className="job-actions">
                <a className="btn primary" href={`/api/renders/${j.id}/download`}>Скачать mp4</a>
                <a className="btn ghost" href={j.video} target="_blank" rel="noreferrer">Смотреть</a>
              </div>
              {j.videoSilent && (
                <div className="job-actions">
                  <a className="btn" href={`/api/renders/${j.id}/download?variant=silent`}>Без звука</a>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};
