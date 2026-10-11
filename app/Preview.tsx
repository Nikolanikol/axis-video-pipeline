// Превью ролика в браузере (Remotion Player). Обновляется сразу, в том числе с несохранёнными настройками.
import React, {useEffect, useRef} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../src/formats';
import type {AdProps, FormatMeta} from '../src/shared/types';
import {withoutMusic} from '../src/shared/nomusic.js';

// autoPlay — основной экран лота: превью само проигрывает ролик ОДИН раз и встаёт на последнем
// кадре (владелец 12.10: бесконечный повтор рисовал 1080×1920 по 30 кадров в секунду, пока
// страница открыта, и грел процессор). Дальше — по ▶ или кнопкам сцен. loop — повтор по кругу:
// только витрине для гостя, там это реклама продукта.
export const Preview: React.FC<{input: AdProps; format: FormatMeta; autoPlay?: boolean; loop?: boolean}> = (
  {input, format, autoPlay, loop = false},
) => {
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  // Пауза, пока плеер не видно: уехал из видимой области (листаем ручные настройки ниже) или окно
  // не в фокусе (переключились в другое приложение, вкладку). Играющий плеер рисует кадры и тогда,
  // когда на него никто не смотрит. Вернулись — играет дальше, но только то, что остановили мы
  // сами: поставленное человеком на паузу и доигравшее до конца само не запустится.
  useEffect(() => {
    const el = box.current;
    const reasons = new Set<string>();
    let pausedByUs = false;
    const update = (reason: string, hidden: boolean) => {
      const player = ref.current;
      if (!player) return;
      if (hidden) reasons.add(reason); else reasons.delete(reason);
      if (reasons.size && player.isPlaying()) { player.pause(); pausedByUs = true; }
      else if (!reasons.size && pausedByUs) { pausedByUs = false; player.play(); }
    };
    const io = el && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => update('offscreen', !entry.isIntersecting), {threshold: 0.05})
      : null;
    if (io && el) io.observe(el);
    const onBlur = () => update('blur', true);
    const onFocus = () => update('blur', false);
    const onVisibility = () => update('hidden', document.visibilityState === 'hidden');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io?.disconnect();
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return (
    <div className="player-wrap">
      <div className="player-box" ref={box}>
        <Player
          ref={ref}
          key={format.id}
          component={FORMAT_COMPONENTS[format.id]}
          // Превью звучит так же, как рендер: без музыки, что бы ни было сохранено в лоте
          inputProps={{...input, lot: withoutMusic(input.lot)}}
          durationInFrames={format.durationInFrames}
          fps={format.fps}
          compositionWidth={format.width}
          compositionHeight={format.height}
          style={{width: '100%', height: '100%'}}
          controls
          loop={loop}
          autoPlay={autoPlay}
          clickToPlay
        />
      </div>
      <div className="scenes">
        {format.scenes.map((s) => (
          <button key={s.id} className="btn ghost" onClick={() => { ref.current?.pause(); ref.current?.seekTo(s.preview); }}>{s.title}</button>
        ))}
      </div>
    </div>
  );
};
