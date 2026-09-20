// Звуки машины без голоса — проба.
//
// При озвучке живой звук глушится целиком, иначе в кадре говорят двое: свой голос в съёмке и
// начитка. Вместе с голосом пропадает машина — двери, двигатель, шаги. Модель разделения делит
// дорожку надвое, и «всё кроме голоса» можно подложить под начитку.
//
// Разделение неидеальное: местами голос просачивается и накладывается на озвучку. Поэтому шаг
// ручной, слой выключается, и в подписи это сказано прямо, а не спрятано.
import React, {useEffect, useState} from 'react';
import {api, ReviewEntry} from '../api';
import type {ReviewAmbience, ReviewSource} from '../../src/shared/types';

type Props = {
  review: ReviewEntry;
  source: ReviewSource;
  onChange: (ambience: ReviewAmbience) => void;
  onServer: (review: ReviewEntry) => void;
  onError: (e: unknown) => void;
};

export const AmbiencePanel: React.FC<Props> = ({review, source, onChange, onServer, onError}) => {
  const a = review.ambience;
  const running = a?.status === 'running';
  const [starting, setStarting] = useState(false);

  // Пока идёт разделение — опрашиваем сервер: шаг меняется, а работа может идти минуты
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => api.review(review.id).then(onServer).catch(onError), 1000);
    return () => clearInterval(t);
  }, [running, review.id, onServer, onError]);

  const start = async () => {
    setStarting(true);
    try { onServer(await api.separateAmbience(review.id)); } catch (e) { onError(e); } finally { setStarting(false); }
  };

  // Дорожка посчитана по другому видео: исходник заменили, а звуки остались от прежнего
  const stale = Boolean(a?.file && a.source?.name && (a.source.name !== source.name
    || Math.abs((a.source.duration ?? 0) - (source.duration ?? 0)) > 0.5));

  return (
    <div className="field">
      <label>
        Звуки машины без голоса <span className="muted">проба</span>
      </label>
      {a?.file && !running && (
        <label className="check">
          <input type="checkbox" checked={Boolean(a.enabled)}
            onChange={(e) => onChange({...a, enabled: e.target.checked})} />
          Подкладывать под озвучку вместо живого звука
        </label>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={start} disabled={running || starting}>
          {running ? (a?.stage ?? 'Выделяю…') : starting ? 'Запускаю…' : a?.file ? 'Выделить заново' : 'Выделить звуки машины'}
        </button>
      </div>
      {running && <div className="bar wait"><div /></div>}
      {a?.status === 'error' && <div className="job-message">{a.error}</div>}
      {stale && <div className="job-message">Звуки выделены из другого видео ({a?.source?.name}) — выдели заново</div>}
      <span className="muted">
        Разделяет дорожку на речь и всё остальное: двери, двигатель, шаги. Голос убирается не
        начисто — местами просачивается поверх озвучки, поэтому слушай результат.
      </span>
    </div>
  );
};
