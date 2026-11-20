// Миниатюры используют композицию рендера. Движется только одна видимая карточка по жесту,
// остальные показывают неподвижный кадр; за пределами ленты Remotion не монтируется.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Player, Thumbnail, type PlayerRef} from '@remotion/player';
import {FORMAT_COMPONENTS} from '../../src/formats';
import {pickLook} from '../../src/design/style/look.js';
import {withoutMusic} from '../../src/shared/nomusic.js';
import type {AdProps, FormatMeta, Theme} from '../../src/shared/types';
import type {MotionTab} from './MobileBodies';

export const motionFragment = (format: FormatMeta, sceneId: string, field: MotionTab) => {
  const i = Math.max(0, format.scenes.findIndex((s) => s.id === sceneId));
  const scene = format.scenes[i];
  const next = format.scenes[i + 1] ?? format.scenes[1] ?? scene;
  return {from: Math.max(0, field === 'sceneTransition' ? next.from - Math.round(format.fps * .8) : scene.from), seconds: field === 'sceneTransition' ? 2.4 : 2.6};
};

type Props = {input: AdProps; format: FormatMeta; theme: Theme; scene: string; field: MotionTab;
  rail: React.RefObject<HTMLDivElement>; active: boolean; onEnd: () => void};
export const MotionTile: React.FC<Props> = ({input, format, theme, scene, field, rail, active, onEnd}) => {
  const box = useRef<HTMLSpanElement>(null);
  const player = useRef<PlayerRef>(null);
  const [visible, setVisible] = useState(false);
  const look = JSON.stringify(pickLook(theme));
  const props = useMemo(() => ({...input, lot: {...withoutMusic(input.lot), look: JSON.parse(look)}}), [input, look]);
  const fragment = motionFragment(format, scene, field);
  const showing = active && visible;
  const end = useRef(onEnd); end.current = onEnd;
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => { setVisible(entry.isIntersecting); if (!entry.isIntersecting) end.current(); }, {root: rail.current, threshold: .05});
    io.observe(node); return () => io.disconnect();
  }, [rail]);
  useEffect(() => {
    if (!showing) return;
    const p = player.current;
    if (!p) return;
    p.seekTo(fragment.from); p.play();
    const timer = window.setTimeout(() => { p.pause(); end.current(); }, fragment.seconds * 1000);
    const stop = () => { p.pause(); end.current(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer); p.pause(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [showing, fragment.from, fragment.seconds, props]);
  const frame = format.scenes.find((s) => s.id === scene)?.preview ?? 0;
  const common = {component: FORMAT_COMPONENTS[format.id], inputProps: props, durationInFrames: format.durationInFrames,
    fps: format.fps, compositionWidth: format.width, compositionHeight: format.height, style: {width: '100%', height: '100%'}};
  return <span className="mle-comp-frame" ref={box} aria-hidden="true"><span className="mle-comp-crop">
    {visible && (showing ? <Player {...common} ref={player} initialFrame={fragment.from} controls={false} clickToPlay={false}
      doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false} numberOfSharedAudioTags={0} />
      : <Thumbnail {...common} frameToDisplay={Math.min(frame, format.durationInFrames - 1)} />)}
  </span></span>;
};
