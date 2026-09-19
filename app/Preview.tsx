// Превью ролика в браузере (Remotion Player). Обновляется сразу, в том числе с несохранёнными настройками.
import React, {useRef} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../src/formats';
import type {AdProps, FormatMeta} from '../src/shared/types';

export const Preview: React.FC<{input: AdProps; format: FormatMeta}> = ({input, format}) => {
  const ref = useRef<PlayerRef>(null);
  return (
    <div className="player-wrap">
      <div className="player-box">
        <Player
          ref={ref}
          key={format.id}
          component={FORMAT_COMPONENTS[format.id]}
          inputProps={input}
          durationInFrames={format.durationInFrames}
          fps={format.fps}
          compositionWidth={format.width}
          compositionHeight={format.height}
          style={{width: '100%', height: '100%'}}
          controls
          loop
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
