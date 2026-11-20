// Подпись для Instagram/TikTok. С 20.11 — в «Содержании» рабочей панели, вместе с ценой
// и текстом выбранного слайда; поля не размонтируются при выборе «Оформления».
// Текст — шаблон из данных машины (src/carousel/postCaption.ts), без цены; правки дилера
// сохраняются в карусели (PUT /carousels/:id/caption) и переживают пересборку.
import React, {useEffect, useMemo, useState} from 'react';
import {Copy, RefreshCw, X} from 'lucide-react';
import {postHashtags, postText} from '../../src/carousel/postCaption';
import {api, CarouselEntry} from '../api';
import {useConfig} from '../config';
import {toast} from '../Toast';
import {useT} from '../i18n';

const MAX_TAGS = 5;
const asTag = (v: string) => {
  const s = v.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]+/gu, '');
  return s ? `#${s.toLowerCase()}` : '';
};

export const PostCaption: React.FC<{entry: CarouselEntry; onSaved: (e: CarouselEntry) => void}> = ({entry, onSaved}) => {
  const {profile, report} = useConfig();
  const t = useT();
  const [seed, setSeed] = useState(0);
  const template = useMemo(() => postText(entry.car, profile.language, seed, profile.contacts), [entry.car, profile.language, profile.contacts, seed]);
  const templateTags = useMemo(() => postHashtags(entry.car, profile.language), [entry.car, profile.language]);
  const [text, setText] = useState(entry.caption?.text ?? template);
  const [tags, setTags] = useState<string[]>(entry.caption?.hashtags ?? templateTags);
  const [dirty, setDirty] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);

  // Другая карусель — её текст: свой сохранённый или шаблон
  useEffect(() => {
    setSeed(0);
    setText(entry.caption?.text ?? postText(entry.car, profile.language, 0, profile.contacts));
    setTags(entry.caption?.hashtags ?? postHashtags(entry.car, profile.language));
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  const full = [text.trim(), tags.join(' ')].filter(Boolean).join('\n\n');

  const save = async (nextText = text, nextTags = tags) => {
    setBusy(true);
    try {
      onSaved(await api.saveCarouselCaption(entry.id, nextText, nextTags));
      setDirty(false);
      return true;
    } catch (e) { report(e); return false; } finally { setBusy(false); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      toast(t('post.copied'));
    } catch { report(new Error(t('post.copyFailed'))); }
    // Скопировал — значит, этот текст и пойдёт в пост: правки не должны потеряться
    if (dirty) void save();
  };
  const variant = () => {
    const next = seed + 1;
    setSeed(next);
    setText(postText(entry.car, profile.language, next, profile.contacts));
    setDirty(true);
  };
  const reset = async () => {
    setSeed(0);
    setText(postText(entry.car, profile.language, 0, profile.contacts));
    setTags(templateTags);
    // Пустой текст на сервере — «вернуть шаблон»: своей подписи у карусели больше нет
    if (entry.caption) await save('', []); else setDirty(false);
  };
  const addTag = () => {
    const tg = asTag(newTag);
    if (!tg || tags.includes(tg) || tags.length >= MAX_TAGS) { setNewTag(''); return; }
    setTags([...tags, tg]);
    setNewTag('');
    setDirty(true);
  };

  return (
    <section className="post-caption">
      <div className="post-head">
        <h3>{t('post.title')}</h3>
        <span className="hint">{t('post.hint')}</span>
      </div>
      <textarea aria-label={t('post.title')} value={text} rows={9} onChange={(e) => { setText(e.target.value); setDirty(true); }} />
      <div className="post-tags">
        {tags.map((tg) => (
          <span key={tg} className="post-tag">{tg}
            <button type="button" aria-label={t('post.removeTag', {tag: tg})} onClick={() => { setTags(tags.filter((x) => x !== tg)); setDirty(true); }}><X size={12} /></button>
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <input className="post-tag-input" value={newTag} placeholder={t('post.addTag')}
            onChange={(e) => setNewTag(e.target.value)} onBlur={addTag}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); addTag(); } }} />
        )}
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={copy} disabled={!full}><Copy size={16} /> {t('post.copy')}</button>
        <button type="button" className="btn" onClick={variant} disabled={busy}><RefreshCw size={16} /> {t('post.variant')}</button>
        {dirty && <button type="button" className="btn" onClick={() => save()} disabled={busy}>{t('common.save')}</button>}
        {(dirty || entry.caption) && <button type="button" className="btn ghost" onClick={reset} disabled={busy}>{t('post.reset')}</button>}
      </div>
    </section>
  );
};
