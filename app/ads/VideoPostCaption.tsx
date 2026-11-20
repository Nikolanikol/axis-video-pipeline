// Редактор подписи к видео. Все принятые правки сразу принадлежат объявлению и проходят
// обычное автосохранение LotTool, поэтому вкладки, размеры экрана и рендер их не сбрасывают.
import React, {useId, useState} from 'react';
import {Copy, RefreshCw, X} from 'lucide-react';
import type {LotPostCaption, Market} from '../../src/shared/types';
import {videoPostHashtags, videoPostText} from '../../src/shared/videoPostCaption';
import type {LotEntry} from '../api';
import {useConfig} from '../config';
import {useT} from '../i18n';
import {toast} from '../Toast';

const MAX_TAGS = 5;
const asTag = (value: string) => {
  const clean = value.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]+/gu, '').toLowerCase();
  return clean ? `#${clean}` : '';
};

export const VideoPostCaption: React.FC<{
  lot: LotEntry; market: Market; onChange: (patch: Partial<LotEntry>) => void; onError: (e: unknown) => void;
}> = ({lot, market, onChange, onError}) => {
  const {profile} = useConfig();
  const t = useT();
  const textId = useId();
  const [newTag, setNewTag] = useState('');
  const seed = lot.postCaption?.seed ?? 0;
  const text = lot.postCaption?.text ?? videoPostText(lot, market, profile.language, seed);
  const tags = lot.postCaption?.hashtags ?? videoPostHashtags(lot, profile.language);
  const ready = !!(lot.brand?.trim() || lot.model?.trim());
  const full = [text.trim(), tags.join(' ')].filter(Boolean).join('\n\n');
  const change = (patch: Partial<LotPostCaption>) => onChange({postCaption: {text, hashtags: tags, seed, ...patch}});
  const addTag = () => {
    const next = asTag(newTag);
    if (next && !tags.includes(next) && tags.length < MAX_TAGS) change({hashtags: [...tags, next]});
    setNewTag('');
  };
  const variant = () => {
    const next = seed + 1;
    change({text: videoPostText(lot, market, profile.language, next), seed: next});
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      toast(t('post.copied'));
    } catch { onError(new Error(t('post.copyFailed'))); }
  };

  return <section className="video-post">
    <label htmlFor={textId} className="label">{t('post.title')}</label>
    <p className="hint">{t(ready ? 'videoPost.hint' : 'videoPost.empty')}</p>
    <textarea id={textId} aria-label={t('post.title')} value={ready ? text : ''} rows={10} disabled={!ready}
      onChange={(e) => change({text: e.target.value})} />
    <div className="video-post-tags">
      {ready && tags.map((value) => <span key={value} className="video-post-tag">{value}
        <button type="button" aria-label={t('post.removeTag', {tag: value})}
          onClick={() => change({hashtags: tags.filter((tag) => tag !== value)})}><X size={14} /></button>
      </span>)}
      {ready && tags.length < MAX_TAGS && <input value={newTag} aria-label={t('post.addTag')} placeholder={t('post.addTag')}
        onChange={(e) => setNewTag(e.target.value)} onBlur={addTag}
        onKeyDown={(e) => { if (['Enter', ' ', ','].includes(e.key)) { e.preventDefault(); addTag(); } }} />}
    </div>
    <div className="btn-row">
      <button type="button" className="btn primary" onClick={copy} disabled={!ready || !full}><Copy size={16} />{t('post.copy')}</button>
      <button type="button" className="btn" onClick={variant} disabled={!ready}><RefreshCw size={16} />{t('post.variant')}</button>
      {lot.postCaption && <button type="button" className="btn ghost" onClick={() => { setNewTag(''); onChange({postCaption: null}); }}>{t('post.reset')}</button>}
    </div>
  </section>;
};
