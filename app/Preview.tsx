// Превью ролика в браузере (Remotion Player). Обновляется сразу, в том числе с несохранёнными настройками.
import React, {useRef} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../src/formats';
import type {AdProps, FormatMeta} from '../src/shared/types';
import {withoutMusic} from '../src/shared/nomusic.js';

// autoPlay — основной экран лота: превью играет само по кругу, без клика (звука в превью нет)
export const Preview: React.FC<{input: AdProps; format: FormatMeta; autoPlay?: boolean}> = ({input, format, autoPlay}) => {
  const ref = useRef<PlayerRef>(null);
  return (
    <div className="player-wrap">
      <div className="player-box">
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
          loop
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
