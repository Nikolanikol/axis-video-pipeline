// Одна структура параметров для телефона и ПК; формы и данные принадлежат прежним модулям.
import React, {useEffect, useRef} from 'react';
import './video-panel.css';
import {FORMATS} from '../../src/shared/model';
import type {AdProps} from '../../src/shared/types';
import {Field} from '../LotForm';
import {useT} from '../i18n';
import {LookPanel} from './LookPanel';
import {LookStrip, MobileAbout, MobileContent, MotionStrip, motionTitle, type MotionTab} from './MobileBodies';
import {seconds, type BodyProps} from './Palette';
import {VisualThemePicker} from './VisualThemePicker';

export type VideoSection = 'look' | 'content' | 'motion' | 'post';
export const VideoTabs: React.FC<{value: VideoSection; onChange: (v: VideoSection) => void; panelId: string}> = ({value, onChange, panelId}) => {
  const t = useT();
  const tabs = useRef<HTMLDivElement>(null);
  const items = [{id: 'look', title: t('look.style')}, {id: 'content', title: t('workspace.content')}, {id: 'motion', title: t('workspace.animation')}, {id: 'post', title: t('post.title')}] as const;
  useEffect(() => {
    // Узкая панель прокручивает только строку вкладок, выбранная подпись остаётся видимой.
    const list = tabs.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const row = list.getBoundingClientRect(), button = active.getBoundingClientRect();
    if (button.left < row.left) list.scrollLeft += button.left - row.left;
    else if (button.right > row.right) list.scrollLeft += button.right - row.right;
  }, [value, t.lang]);
  return <div ref={tabs} className="mle-tabs-list video-tabs" role="tablist" aria-label={t('palette.settingsAria')}>
    {items.map((item, i) => <button key={item.id} id={`${panelId}-${item.id}`} type="button" role="tab" tabIndex={value === item.id ? 0 : -1} aria-selected={value === item.id}
      aria-controls={panelId} className={`mle-tab${value === item.id ? ' on' : ''}`} onClick={() => onChange(item.id)}
      onKeyDown={(e) => {
        const at = e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i + items.length - 1) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
        if (at < 0) return;
        e.preventDefault(); onChange(items[at].id);
        document.getElementById(`${panelId}-${items[at].id}`)?.focus();
      }}>{item.title}</button>)}
  </div>;
};

export const VideoAppearance: React.FC<BodyProps & {input: AdProps; frame: number; onFine?: () => void}> = (props) => {
  const t = useT();
  return <div className="video-appearance">
    <VisualThemePicker {...props} />
    <LookStrip {...props} />
    <div className="video-format"><Field label={t('palette.scriptLabel')}>
      <select value={props.format.id} onChange={(e) => props.onFormat(e.target.value)}>
        {FORMATS.map((f) => <option key={f.id} value={f.id}>{t.cfg(f.title)} · {t('common.sec', {n: seconds(f)})}</option>)}
      </select>
    </Field></div>
    {props.onFine ? <button type="button" className="video-fine-open" onClick={props.onFine}>{t('workspace.fine')}</button>
      : <details className="video-fine"><summary>{t('workspace.fine')}</summary><LookPanel {...props} embedded detailsOnly /></details>}
  </div>;
};

export const VideoContent: React.FC<BodyProps & {about: boolean; onAbout: () => void}> = (props) => {
  const t = useT();
  return <>
    <nav className="mle-side-scenes video-scenes" aria-label={t('palette.whatAria')}>
      {props.format.scenes.map((s, i) => <button key={s.id} type="button" aria-pressed={!props.about && props.scene === s.id}
        className={`mle-scene${!props.about && props.scene === s.id ? ' edit' : ''}`} onClick={() => props.onScene(s.id)}>
        <span>{String(i + 1).padStart(2, '0')}</span>{t.cfg(s.title)}
      </button>)}
      <button type="button" aria-pressed={props.about} className={`mle-scene${props.about ? ' edit' : ''}`} onClick={props.onAbout}>{t('palette.about')}</button>
    </nav>
    {props.about ? <MobileAbout {...props} showFormat={false} /> : <MobileContent {...props} />}
  </>;
};

export const VideoMotion: React.FC<BodyProps & {input: AdProps; value: MotionTab; onTab: (v: MotionTab) => void; onPicked: (v: MotionTab) => void}> = (props) => {
  const t = useT();
  const items = [{id: 'textMotion', title: 'palette.tab.text'}, {id: 'photoMotion', title: 'palette.tab.photo'}, {id: 'sceneTransition', title: 'palette.tab.transition'}] as const;
  return <div className="video-motion">
    <div className="video-motion-groups" role="group" aria-label={t('workspace.motionGroups')}>
      {items.map((x) => <button type="button" key={x.id} aria-pressed={props.value === x.id} className={props.value === x.id ? 'on' : ''}
        onClick={() => props.onTab(x.id)}>{t(x.title)}</button>)}
    </div>
    <MotionStrip {...props} tab={props.value} />
    <div className="video-motion-summary"><span>{motionTitle(props.brand, props.lot, props.value)}</span>
      <button type="button" className="motion-reset" onClick={() => props.onPicked(props.value)}>{t('workspace.replay')}</button></div>
  </div>;
};
