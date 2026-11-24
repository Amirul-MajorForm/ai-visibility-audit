/**
 * Builds example wording from the client's own site, so advice never quotes an
 * unrelated business ("best natural dog treats...") in a client report.
 */

const SEP = /\s+[|–—\-:·•]\s+|\s*[|–—·•]\s*|:\s+/;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Meaningful parts of the hostname, e.g. shop.keesong.com -> ["keesong"]. */
function hostRoots(host: string): string[] {
  const skip = new Set(['www', 'shop', 'store', 'online', 'app', 'my', 'web', 'com', 'net', 'org', 'co', 'sg', 'io', 'asia', 'biz', 'info', 'edu', 'gov', 'my', 'au', 'uk']);
  return host.toLowerCase().split('.').filter((p) => p.length > 2 && !skip.has(p)).map(norm);
}

const isBrand = (segment: string, host: string) => {
  const n = norm(segment);
  if (!n) return false;
  return hostRoots(host).some((r) => r.length >= 3 && (n === r || (n.length >= 4 && (r.includes(n) || n.includes(r)) && n.length <= r.length + 6)));
};

/** Brand name as written in the page title, if one of the title's parts matches the domain. */
export function brandFromTitle(title: string, host: string): string | undefined {
  return title.split(SEP).map((s) => s.trim()).find((s) => isBrand(s, host));
}

const GENERIC_SEGMENT = /^(home|homepage|home page|welcome|official (web)?site|shop|store|online store|main|index|page \d+)$/i;
const LOCATION = /\s*\b(?:in|from|across|for|of)?\s*(?:singapore|sg|southeast asia|south east asia|sea|asia|asia pacific|apac|malaysia|the world|worldwide)\b\s*/gi;
const HYPE = /\b(?:premium|high[- ]quality|quality|best|leading|trusted|top|top[- ]rated|no\.?\s?1|#1|number one|award[- ]winning|official|finest|ultimate|world[- ]class|#?\d+(?:st|nd|rd|th)?)\b\s*/gi;

/** Lower-case ordinary words but keep short acronyms like HR, PSLE, B2B. */
const tidyCase = (s: string) =>
  s.split(/\s+/).map((w) => (/^[A-Z0-9&+]{2,5}s?$/.test(w) && /[A-Z]/.test(w) ? w : w.toLowerCase())).join(' ');

/**
 * The thing the business offers, in a few words, taken from its own page title or description.
 * Returns undefined when nothing clear can be extracted.
 */
export function offeringFromSite(title: string, description: string, host: string, brand?: string): string | undefined {
  const brandN = brand ? norm(brand) : '';
  const candidates: string[] = [];
  for (const raw of title.split(SEP)) {
    let s = raw.trim();
    if (!s || GENERIC_SEGMENT.test(s) || isBrand(s, host) || (brandN && norm(s) === brandN)) continue;
    // Drop a brand name that leads the segment ("Kee Song Premium Chicken")
    if (brand && s.toLowerCase().startsWith(brand.toLowerCase() + ' ')) s = s.slice(brand.length).trim();
    candidates.push(s);
  }
  const cleaned = candidates
    .map((s) =>
      s
        // Trailing place names: "Tuition in Bishan", "Bakery near Tiong Bahru"
        .replace(/\s+(?:in|near|at)\s+[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,2}\s*$/, '')
        .replace(LOCATION, ' ')
        .replace(HYPE, ' ')
        .replace(/^(?:and|&|for|with|the|your|our)\s+/i, '')
        .replace(/\s+(?:and|&|for|with|the|from|in)$/i, '')
        .replace(/[!.,;]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((s) => {
      const words = s.split(/\s+/).filter(Boolean);
      return words.length >= 1 && words.length <= 6 && s.length >= 4 && s.length <= 50 && /[a-z]/i.test(s) && !isBrand(s, host);
    })
    // A single generic word ("Programs", "Shop") is not a useful offering.
    .filter((s) => s.includes(' ') || s.length >= 6);
  const best = cleaned.sort((a, b) => b.split(' ').length - a.split(' ').length)[0];
  if (best) return tidyCase(best);

  // Fall back to a short "X for Y" style phrase from the meta description, e.g. "Shop natural dog treats ..."
  const m = description.match(/\b(?:shop|buy|order|discover|book)\s+((?:[a-z][\w'&-]*\s){1,4}[a-z][\w'&-]*)/i);
  if (m) {
    const s = m[1].replace(HYPE, ' ').replace(/\s+(?:and|&|for|with|from|to|at|in|on|by|the)\b.*$/i, '').replace(/\s{2,}/g, ' ').trim();
    if (s.split(' ').length >= 1 && s.length >= 4 && !isBrand(s, host)) return tidyCase(s);
  }
  return undefined;
}

export interface Examples {
  /** What the business offers, from its own site (e.g. "chicken & meat delivery"). */
  offering?: string;
  /** A realistic question a customer might ask AI, or undefined if we can't make a relevant one. */
  query?: string;
  /** Example page title built from the offering and brand. */
  titleExample: string;
}

export function buildExamples(input: { title: string; description: string; host: string; brand: string; categoryNoun?: string; physical: boolean }): Examples {
  const offering = offeringFromSite(input.title, input.description, input.host, input.brand);
  const subject = offering ?? input.categoryNoun;
  const query = subject ? `best ${subject} in Singapore` : undefined;
  const cap = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(And|For|With|Of|In|The|To)\b/g, (w) => w.toLowerCase());
  const titleExample = offering
    ? `${cap(offering)} in Singapore | ${input.brand}`
    : `[What you offer]${input.physical ? ' in [Area]' : ''} | ${input.brand}`;
  return { offering, query, titleExample };
}

/** "questions like "best X in Singapore"" or a neutral phrasing when no relevant example exists. */
export const askedLike = (ex: Examples) => (ex.query ? `questions like "${ex.query}"` : 'questions about businesses like yours');
