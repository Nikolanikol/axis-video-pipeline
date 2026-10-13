// Превью ролика в браузере (Remotion Player). Обновляется сразу, в том числе с несохранёнными настройками.
import React, {useEffect, useRef} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../src/formats';
import type {AdProps, FormatMeta} from '../src/shared/types';
import {withoutMusic} from '../src/shared/nomusic.js';
import {backdropSrc, photoSrc} from '../src/shared/ui';
import {preloadPhotos} from '../src/shared/photoPreload';
import {RecMark} from './Loading';

// autoPlay — основной экран лота: превью само проигрывает ролик ОДИН раз и встаёт на последнем
// кадре (владелец 12.10: бесконечный повтор рисовал 1080×1920 по 30 кадров в секунду, пока
// страница открыта, и грел процессор). Дальше — по ▶ или кнопкам сцен. loop — повтор по кругу:
// только витрине для гостя, там это реклама продукта.
export const Preview: React.FC<{input: AdProps; format: FormatMeta; autoPlay?: boolean; loop?: boolean}> = (
  {input, format, autoPlay, loop = false},
) => {
  const ref = useRef<PlayerRef>(null);
  // Все фото объявления и их размытые фоны — сразу при открытии превью, а не когда до сцены
  // дойдёт воспроизведение: иначе на мобильной сети сцены стояли «чёрными заглушками»
  // (src/shared/photoPreload.ts). Смена формата фото не меняет — повторно не качаем
  const photos = JSON.stringify((input.lot?.photos ?? []).filter(Boolean).flatMap((p) => {
    const url = photoSrc(p);
    const bg = backdropSrc(url);
    return bg ? [url, bg] : [url];
  }));
  useEffect(() => preloadPhotos(JSON.parse(photos)), [photos]);
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
          // Почему 0 аудиоэлементов. 12.10 пришла тревога в «Сбои»: InvalidStateError «Failed to start
          // the audio device» — необработанный отказ (rejection) на витрине гостя (`/`), iPhone с iOS 27,
          // встроенный браузер Instagram (гость пришёл по ссылке из Instagram). Код отчёта в журнале
          // Coolify — 3d437b7f7c.
          // Причина: плеер Remotion по умолчанию заранее создаёт 5 общих <audio> и при автозапуске ролика
          // (autoPlay на витрине) запускает их вместе с картинкой. Встроенный браузер Instagram звуковое
          // устройство странице не даёт — play() у этих <audio> отклоняется, и отказ никто не ловит.
          // Звука в превью при этом нет вовсе: ролик идёт без музыки (withoutMusic выше), в форматах
          // других звуков нет. Поэтому аудиоэлементы не нужны, и без них отказу неоткуда взяться.
          // Вернётся музыка в превью — убрать эту строку, иначе звук в плеере не заиграет
          numberOfSharedAudioTags={0}
          clickToPlay
          // Фото не успело загрузиться (медленная сеть) — плеер ждёт его, а не показывает тёмный
          // кадр, и поверх — знак ожидания. Не раньше чем через 0,3 с: на быстрой сети не мелькает
          showPosterWhenBuffering
          bufferStateDelayInMilliseconds={300}
          renderPoster={({isBuffering}) => (isBuffering ? <div className="player-buffering"><RecMark /></div> : null)}
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
