// Панель рендера: кнопка, предупреждения, история роликов с прогрессом и скачиванием
import React, {useCallback, useEffect, useState} from 'react';
import {api, Job, JobQuery} from './api';

type Props = {
  query: JobQuery;
  label: string;
  warnings: string[];
  disabled?: boolean;
  start: () => Promise<Job>;
  onError: (e: unknown) => void;
};

const time = (iso: string) => new Date(iso).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const active = (j: Job) => j.status === 'queued' || j.status === 'running';

export const JobsPanel: React.FC<Props> = ({query, label, warnings, disabled, start, onError}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [starting, setStarting] = useState(false);
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
      const job = await start();
      setJobs((js) => [job, ...js]);
    } catch (e) { onError(e); } finally { setStarting(false); }
  };

  // Управление роликом в истории: отменить идущий, пересобрать заново, удалить из списка
  const cancel = async (id: string) => {
    try { await api.cancelRender(id); refresh(); } catch (e) { onError(e); }
  };
  const retry = async (id: string) => {
    try { const job = await api.retryRender(id); setJobs((js) => [job, ...js]); } catch (e) { onError(e); }
  };
  const remove = async (id: string) => {
    try { await api.deleteRender(id); setJobs((js) => js.filter((j) => j.id !== id)); } catch (e) { onError(e); }
  };

  return (
    <div className="render">
      {/* Пока задание в очереди или считается — кнопка закрыта: рендер обзора занимает четверть
          часа, и десять нажатий подряд встанут в очередь одинаковыми роликами. На сервере стоит
          такая же проверка — вкладку можно открыть дважды, и тогда эта кнопка ничего не знает. */}
      <button className="btn primary big" onClick={run} disabled={starting || running || disabled}>
        {starting ? 'Запускаю…' : running ? 'Уже собирается…' : label}
      </button>
      {starting && <div className="bar wait"><div /></div>}
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
            <a href={j.storyboard} target="_blank" rel="noreferrer"><img className="storyboard" src={j.storyboard} alt="Раскадровка" /></a>
          )}
          {/* Кнопки управления есть всегда, только разные по состоянию:
              в очереди/работе — отменить; готовый — скачать/смотреть/пересобрать/удалить;
              ошибка или отменён — пересобрать/удалить */}
          <div className="job-actions">
            {active(j) && <button className="btn ghost" onClick={() => cancel(j.id)}>Отменить</button>}
            {j.status === 'done' && (
              <>
                <a className="btn primary" href={`/api/renders/${j.id}/download`}>Скачать mp4</a>
                <a className="btn ghost" href={j.video} target="_blank" rel="noreferrer">Смотреть</a>
              </>
            )}
            {(j.status === 'done' || j.status === 'error' || j.status === 'cancelled') && (
              <>
                <button className="btn" onClick={() => retry(j.id)}>Пересобрать</button>
                <button className="btn ghost" onClick={() => remove(j.id)}>Удалить</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
