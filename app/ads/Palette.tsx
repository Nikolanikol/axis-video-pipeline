// Рабочая панель видео: оформление, содержание, анимация и текст поста.
// шапка и основное действие остаются на месте, прокручиваются параметры выбранного раздела.
import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import type {AdProps, FormatMeta, Market, Theme} from '../../src/shared/types';
import type {FontPair, LotEntry, Palette as PaletteColors} from '../api';
import {useConfig} from '../config';
import {NoteField} from '../LotForm';
import {Preview, type PreviewControl, type SceneSeek} from '../Preview';
import {lotTheme} from './LookPanel';
import {compositionTitle, playMotion, type MotionTab} from './MobileBodies';
import {VideoAppearance, VideoContent, VideoMotion, VideoTabs, type VideoSection} from './VideoPanel';
import {SceneScrubber} from './SceneScrubber';
import {VideoPostCaption} from './VideoPostCaption';
import {tNow, useT, type Key} from '../i18n';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Props = {
  lot: LotEntry; input: AdProps; market: Market; format: FormatMeta; brand: Theme;
  pairs: FontPair[]; palettes: PaletteColors[];
  save: SaveState; onRetrySave: () => void;
  onChange: (patch: Partial<LotEntry>) => void; onPhotos: (lot: LotEntry) => void; onError: (e: unknown) => void;
  onFormat: (id: string) => void; scene: string; onScene: (id: string) => void; seek: SceneSeek | null;
  render: React.ReactNode; photoSource?: React.ReactNode;
};
const SAVE_TEXT = (s: SaveState): Key => `save.${s}` as Key;
export const scenesWord = (n: number) => tNow().n('unit.scene', n);
export const seconds = (f: FormatMeta) => Math.round(f.durationInFrames / f.fps);
export type BodyProps = Pick<Props, 'lot' | 'market' | 'format' | 'brand' | 'pairs' | 'palettes' | 'onChange' | 'onPhotos' | 'onError' | 'onFormat' | 'scene' | 'onScene' | 'photoSource'>;
export const MotionUnavailable: React.FC = () => <p className="hint">{useT()('palette.noMotion')}</p>;

type UI = {tab: VideoSection; motion: MotionTab; about: boolean};
const FRESH: UI = {tab: 'look', motion: 'textMotion', about: false};
const keyOf = (ws: string, lot: string) => `kok.palette.desk.v3:${ws}:${lot}`;
const load = (key: string): UI => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (v) return {tab: ['look','content','motion','post'].includes(v.tab) ? v.tab : 'look', motion: ['textMotion','photoMotion','sceneTransition'].includes(v.motion) ? v.motion : 'textMotion', about: !!v.about};
    const old = JSON.parse(localStorage.getItem(key.replace('.v3:', '.v2:')) ?? 'null');
    return old ? {tab: old.settings ? old.group === 'look' ? 'look' : 'content' : old.tab === 'look' ? 'look' : 'motion', motion: ['textMotion','photoMotion','sceneTransition'].includes(old.tab) ? old.tab : 'textMotion', about: old.group === 'about'} : FRESH;
  } catch { return FRESH; }
};
const store = (key: string, ui: UI) => { try { localStorage.setItem(key, JSON.stringify(ui)); } catch { /* остаётся в памяти */ } };

export const Palette: React.FC<Props> = (props) => {
  const {lot, input, format, brand, save, onRetrySave, scene, onScene, seek, render} = props;
  const {config} = useConfig();
  const t = useT();
  const key = keyOf(config.workspace.id, lot.id);
  const [ui, setUi] = useState<UI>(() => load(key));
  useEffect(() => setUi(load(key)), [key]);
  const commit = (patch: Partial<UI>) => setUi((u) => { const next = {...u, ...patch}; store(key, next); return next; });
  const panelId = useId();
  const player = useRef<PreviewControl | null>(null);
  const [playing, setPlaying] = useState(false);
  const frameFn = useRef<((frame: number) => void) | null>(null);
  const listenFrame = useCallback((fn: (frame: number) => void) => { frameFn.current = fn; return () => { frameFn.current = null; }; }, []);
  const current = format.scenes.find((s) => s.id === scene) ?? format.scenes[0];
  const theme = lotTheme(brand, lot);
  const title = [lot.brand, lot.model].filter(Boolean).join(' ') || t('lots.untitled');
  const pickScene = (id: string) => { commit({about: false}); onScene(id); };
  const showMotion = (field: MotionTab) => playMotion(player.current, format, scene, field);
  return <>
    <section className="quick-preview pd-stage">
      <Preview key={lot.id} input={input} format={format} autoPlay loop showScenes={false} controls={false} control={player}
        onPlaying={setPlaying} onFrame={(f) => frameFn.current?.(f)} seek={seek} />
      <SceneScrubber format={format} listen={listenFrame} seekFrame={(f) => player.current?.seekFrame(f)} playing={playing} onToggle={() => player.current?.toggle()} />
    </section>
    <section className="quick-side palette-side">
      <div className="palette pd video-palette">
        <header className="palette-head"><h1>{title} <span className="muted">{lot.year || ''}</span></h1>
          <div className="palette-scope">{t('palette.onlyThis')} · <SaveStatus save={save} onRetry={onRetrySave} /></div></header>
        <div className="mle-tabs pd-tabs"><VideoTabs value={ui.tab} onChange={(tab) => commit({tab})} panelId={panelId} /></div>
        <div className="palette-body video-body" id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${ui.tab}`}>
          {ui.tab === 'look' && <VideoAppearance {...props} frame={current.preview} />}
          {ui.tab === 'content' && <>
            <VideoContent {...props} onScene={pickScene} about={ui.about} onAbout={() => commit({about: true})} />
            {ui.about && <section className="mle-sec pd-note"><h3>{t('palette.note')}</h3><NoteField lot={lot} onChange={props.onChange} /></section>}
          </>}
          {ui.tab === 'motion' && <VideoMotion {...props} value={ui.motion} onTab={(motion) => commit({motion})} onPicked={showMotion} />}
          {ui.tab === 'post' && <VideoPostCaption key={lot.id} lot={lot} market={props.market} onChange={props.onChange} onError={props.onError} />}
        </div>
        <footer className="palette-foot"><div className="palette-foot-line"><span>{compositionTitle(theme)}</span><span>{t('common.sec', {n: seconds(format)})} · {t.n('unit.scene', format.scenes.length)}</span></div>{render}</footer>
      </div>
    </section>
  </>;
};
export const SaveStatus: React.FC<{save: SaveState; onRetry: () => void}> = ({save, onRetry}) => {
  const t = useT();
  return save === 'error' ? <button type="button" className={`save save-${save} link`} onClick={onRetry}>{t(SAVE_TEXT(save))} — {t('save.retry')}</button> : <span className={`save save-${save}`}>{t(SAVE_TEXT(save))}</span>;
};
