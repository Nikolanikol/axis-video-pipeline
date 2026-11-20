import type {MailingDraft, Recipient} from '../api';

export const EMPTY: MailingDraft = {subject: '', body: '', button_label: '', button_url: '', segment: 'all', user_ids: []};
export type MailingScratch = {draft: MailingDraft; savedAs: string; picked: Recipient[]};
export const FRESH: MailingScratch = {draft: EMPTY, savedAs: JSON.stringify(EMPTY), picked: []};
export const mailingDraftKey = (scope: string, id?: number) => `kok.mailing-draft.v1:${scope}:${id ?? 'new'}`;
export const validMailingScratch = (v: unknown): v is MailingScratch => {
  if (!v || typeof v !== 'object') return false;
  const s = v as MailingScratch;
  const d = s.draft;
  return !!d && ['subject', 'body', 'button_label', 'button_url', 'segment'].every((k) => typeof d[k as keyof MailingDraft] === 'string')
    && ['all', 'new', 'trial', 'active', 'renew', 'lapsed', 'idle', 'unverified', 'hidden', 'pick'].includes(d.segment)
    && Array.isArray(d.user_ids) && d.user_ids.every((id) => typeof id === 'string')
    && typeof s.savedAs === 'string' && Array.isArray(s.picked) && s.picked.every((r) => r && typeof r.user_id === 'string'
      && typeof r.name === 'string' && typeof r.email === 'string' && typeof r.ok === 'boolean'
      && (r.person === null || typeof r.person === 'string') && (r.why === null || typeof r.why === 'string'));
};
