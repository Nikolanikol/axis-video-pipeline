export type OfferValues = {client: string; amounts: Record<string, string>; extra: {label: string; amount: string}[]; currency: string};
export const validOfferValues = (v: unknown): v is OfferValues => {
  if (!v || typeof v !== 'object') return false;
  const d = v as OfferValues;
  return typeof d.client === 'string' && typeof d.currency === 'string' && !!d.amounts && typeof d.amounts === 'object'
    && !Array.isArray(d.amounts) && Object.values(d.amounts).every((x) => typeof x === 'string')
    && Array.isArray(d.extra) && d.extra.length <= 10 && d.extra.every((x) => x && typeof x.label === 'string' && typeof x.amount === 'string');
};
