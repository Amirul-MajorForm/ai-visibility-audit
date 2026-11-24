import type { PageInfo, Facts } from './page.js';
import { wordCount } from './page.js';

export interface Conflict {
  label: string;
  /** Values in the HTML AI crawlers read that visitors never see (often stale defaults). */
  ai: string[];
  /** Values visitors see instead. */
  visitors: string[];
}

export interface Comparison {
  /** Start of the text AI crawlers receive. */
  aiExcerpt: string;
  aiWords: number;
  /** Text blocks visitors see that are missing from what AI receives, in page order. */
  visitorOnly: string[];
  visitorOnlyCount: number;
  visitorOnlyWords: number;
  conflicts: Conflict[];
  /** Data sources that failed to load in our browser; the visitor side may be incomplete. */
  incomplete?: string[];
}

const FACT_NAMES: Record<keyof Facts, string> = { price: 'Prices', hours: 'Times', phone: 'Phone numbers', postal: 'Addresses', email: 'Email addresses' };

// Ignore spacing entirely: line breaks and adjacent elements vary between the two versions.
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[\s\u00a0]+/g, '');
const normFact = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/^s\$|^sgd/, '$');

/** What AI crawlers see vs what visitors see, for one page. */
export function comparePage(raw: PageInfo, rendered?: PageInfo, failedData: string[] = []): Comparison | undefined {
  if (!rendered || !rendered.words) return undefined;
  const rawText = norm(raw.text);
  const missing = rendered.blocks.filter((b) => b.length >= 3 && /[\p{L}\p{N}]/u.test(b) && !rawText.includes(norm(b)));

  const conflicts: Conflict[] = [];
  // If content requests failed, the browser may show fallback values, so differences would not be trustworthy.
  if (!failedData.length) for (const k of Object.keys(FACT_NAMES) as (keyof Facts)[]) {
    const r = new Map(raw.facts[k].map((v) => [normFact(v), v]));
    const v = new Map(rendered.facts[k].map((x) => [normFact(x), x]));
    const aiOnly = [...r].filter(([n]) => !v.has(n)).map(([, x]) => x);
    const visOnly = [...v].filter(([n]) => !r.has(n)).map(([, x]) => x);
    if (aiOnly.length && visOnly.length) conflicts.push({ label: FACT_NAMES[k], ai: aiOnly.slice(0, 5), visitors: visOnly.slice(0, 5) });
  }

  return {
    aiExcerpt: raw.text.slice(0, 900),
    aiWords: raw.words,
    visitorOnly: missing.slice(0, 40).map((b) => b.replace(/<\/?[a-z][^>]*>/gi, '').trim()).filter(Boolean).map((b) => (b.length > 160 ? b.slice(0, 157) + '...' : b)),
    visitorOnlyCount: missing.length,
    visitorOnlyWords: missing.reduce((n, b) => n + wordCount(b), 0),
    conflicts,
    incomplete: failedData.length ? failedData : undefined,
  };
}
