// Превью ролика в браузере (Remotion Player). Обновляется сразу, в том числе с несохранёнными настройками.
import React, {useEffect, useRef, useState} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../src/formats';
import type {AdProps, FormatMeta} from '../src/shared/types';
import {withoutMusic} from '../src/shared/nomusic.js';
import {backdropSrc, photoSrc} from '../src/shared/ui';
import {preloadPhotos} from '../src/shared/photoPreload';
import {RecMark} from './Loading';

// autoPlay — превью само начинает играть. Без loop — один проигрыш и стоп на последнем кадре
// (владелец 12.10: бесконечный повтор рисовал 1080×1920 по 30 кадров в секунду, пока страница
// открыта, и грел процессор). loop — по кругу: витрина гостя (реклама продукта) и палитра ролика
// на компьютере (владелец 20.10: «пока идёт монтаж — бесконечно»). Пауза без фокуса и за экраном
// (ниже) работает в обоих случаях — она и не даёт повтору греть процессор впустую.
// Связь с палитрой (app/ads/Palette.tsx, docs/palette.md): onScene — какая сцена сейчас в кадре
// (плеер дошёл или перемотали), seek — команда «перейти к сцене» из палитры; n меняется при каждом
// нажатии, чтобы повторный выбор той же сцены тоже перематывал
export type SceneSeek = {id: string; n: number};
export const Preview: React.FC<{input: AdProps; format: FormatMeta; autoPlay?: boolean; loop?: boolean;
  onScene?: (id: string) => void; seek?: SceneSeek | null}> = (
  {input, format, autoPlay, loop = false, onScene, seek},
) => {
  const ref = useRef<PlayerRef>(null);
  // Сцена в кадре — по номеру кадра и границам сцен формата. Сообщаем только смену, а не каждый кадр
  const [current, setCurrent] = useState(format.scenes[0]?.id);
  const lastScene = useRef<string | undefined>(undefined);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const update = (frame: number) => {
      const scene = [...format.scenes].reverse().find((s) => frame >= s.from) ?? format.scenes[0];
      if (!scene || scene.id === lastScene.current) return;
      lastScene.current = scene.id;
      setCurrent(scene.id);
      onSceneRef.current?.(scene.id);
    };
    const onFrame = (e: {detail: {frame: number}}) => update(e.detail.frame);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => { player.removeEventListener('frameupdate', onFrame); player.removeEventListener('seeked', onFrame); };
  }, [format]);
  // Перейти к сцене: на её показательный кадр (preview в formats.json) — там сцена уже собрана
  // и видно, что правишь; с самого начала сцены текст ещё не появился
  const goTo = (id: string) => {
    const scene = format.scenes.find((s) => s.id === id);
    if (!scene) return;
    ref.current?.pause();
    ref.current?.seekTo(scene.preview);
  };
  useEffect(() => { if (seek) goTo(seek.id); }, [seek?.n]); // eslint-disable-line react-hooks/exhaustive-deps
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
          <button key={s.id} className={`btn ${onScene && current === s.id ? 'primary' : 'ghost'}`} aria-pressed={onScene ? current === s.id : undefined}
            onClick={() => goTo(s.id)}>{s.title}</button>
        ))}
      </div>
    </div>
  );
};
