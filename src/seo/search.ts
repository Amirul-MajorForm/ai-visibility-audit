import { fetch, EnvHttpProxyAgent } from 'undici';
import type { SearchData } from '../types.js';

const hasProxy = ['HTTPS_PROXY', 'https_proxy'].some((k) => process.env[k]);
const dispatcher = hasProxy ? new EnvHttpProxyAgent() : undefined;

const ACTOR = 'pnda~semrush-keyword';
const API = 'https://api.apify.com/v2';

export const searchDataAvailable = () => !!process.env.APIFY_TOKEN;

/** Countries offered in the form (the actor supports more). */
export const SEARCH_DBS: { id: string; label: string }[] = [
  { id: 'sg', label: 'Singapore' }, { id: 'my', label: 'Malaysia' }, { id: 'id', label: 'Indonesia' }, { id: 'th', label: 'Thailand' },
  { id: 'ph', label: 'Philippines' }, { id: 'vn', label: 'Vietnam' }, { id: 'hk', label: 'Hong Kong' }, { id: 'au', label: 'Australia' },
  { id: 'uk', label: 'United Kingdom' }, { id: 'us', label: 'United States' },
];

/** Big platforms show up as "competitors" for almost everyone; they are not useful in a client report. */
const PLATFORMS = /(^|\.)(facebook|youtube|instagram|linkedin|reddit|tiktok|twitter|x|pinterest|wikipedia|google|amazon|shopee|lazada|carousell|about\.me|quora|medium|yelp|tripadvisor|grab|foodpanda|deliveroo|apple|microsoft|github|wordpress|blogspot|tumblr)\.[a-z.]+$/i;

/** keesong.com for shop.keesong.com; abc.com.sg for www.abc.com.sg */
export function rootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const twoPart = /^(com|net|org|edu|gov|co|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPart ? -3 : -2).join('.');
}

async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    dispatcher,
    signal: AbortSignal.timeout(90000),
    headers: { authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'content-type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? `Apify HTTP ${res.status}`);
  return j;
}

/**
 * Run the actor with a hard spending cap and return whatever rows it saved.
 * When the cap is reached Apify stops the run ("ABORTED") but keeps the rows, so that is not an error.
 */
async function runActor(input: Record<string, unknown>, maxUsd: number): Promise<{ rows: any[]; costUsd: number; status: string }> {
  const start = await api(`/acts/${ACTOR}/runs?maxTotalChargeUsd=${maxUsd}&waitForFinish=60`, { method: 'POST', body: input });
  let run = start.data;
  const deadline = Date.now() + 4 * 60_000;
  while (['READY', 'RUNNING'].includes(run.status) && Date.now() < deadline) run = (await api(`/actor-runs/${run.id}?waitForFinish=60`)).data;
  if (['READY', 'RUNNING'].includes(run.status)) {
    await api(`/actor-runs/${run.id}/abort`, { method: 'POST' }).catch(() => {});
    throw new Error('Search data took too long');
  }
  const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=true&limit=1000`);
  return { rows: Array.isArray(items) ? items : [], costUsd: run.usageTotalUsd ?? 0, status: run.status };
}

/** Rows the actor adds to explain a limit or outage instead of data. */
const statusRow = (rows: any[]) => rows.find((r) => typeof r?.status === 'string' && /limit|unavailable|error/i.test(r.status));

/** Keyword seeds from the offering the site describes, e.g. "chicken & meat delivery" -> chicken delivery, meat delivery. */
export function seedsFrom(offering: string | undefined): string[] {
  if (!offering) return [];
  const o = offering.toLowerCase().replace(/[^\p{L}\p{N}&+' -]/gu, ' ').replace(/\s+/g, ' ').trim();
  const m = o.match(/^(.+?)\s+(?:&|and|\+)\s+(.+?)\s+(\S+)$/);
  const seeds = m ? [`${m[1]} ${m[3]}`, `${m[2]} ${m[3]}`] : [o.replace(/\s*(&|\+)\s*/g, ' ')];
  return [...new Set(seeds.map((s) => s.trim()).filter((s) => s.split(' ').length <= 5 && s.length >= 3))].slice(0, 2);
}

export async function fetchSearchData(opts: { host: string; db: string; brand: string; offering?: string; log: (s: string) => void }): Promise<{ data?: SearchData; note?: string }> {
  if (!searchDataAvailable()) return { note: 'Search data is not set up (no Apify token configured).' };
  const domain = rootDomain(opts.host);
  const seeds = seedsFrom(opts.offering);
  opts.log(`Fetching search data for ${domain} (${opts.db.toUpperCase()})`);
  const notes: string[] = [];
  const settle = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e }));

  const [dom, bl, kw] = await Promise.all([
    settle(runActor({ mode: 'domain', q: domain, db: opts.db }, 0.03)),
    settle(runActor({ mode: 'backlinks', q: domain, target_type: 'root_domain' }, 0.06)),
    seeds.length ? settle(runActor({ mode: 'keyword', queries: seeds, db: opts.db, type: 'phrase', pages: 1 }, 0.12)) : Promise.resolve(undefined),
  ]);

  const data: SearchData = { db: opts.db, domain, trafficTrend: [], topKeywords: [], competitors: [], topBacklinks: [], keywordIdeas: [], seeds, notes, costUsd: 0 };
  const limitNote = (rows: any[]) => {
    const s = statusRow(rows);
    if (s) notes.push(s.message ?? `Search data provider reported: ${s.status}`);
  };

  if (dom.ok) {
    data.costUsd! += dom.v.costUsd;
    limitNote(dom.v.rows);
    const d = dom.v.rows.find((r) => r && 'authority_score' in r);
    if (d) {
      data.authorityScore = d.authority_score;
      data.backlinks = d.number_of_backlinks;
      const months = Object.keys(d.search_traffic ?? {}).sort().slice(-12);
      data.trafficTrend = months.map((m) => ({ month: `${m.slice(0, 4)}-${m.slice(4, 6)}`, traffic: Number(d.search_traffic[m]) || 0 }));
      data.topKeywords = (d.top_keywords ?? []).slice(0, 15).map((k: any) => ({ phrase: k.phrase, position: k.position, volume: k.volume, url: k.url, trafficPercent: k.traffic_percent }));
      data.competitors = (d.competitors ?? [])
        .filter((c: any) => c?.domain && !PLATFORMS.test(c.domain) && rootDomain(c.domain) !== domain)
        .slice(0, 8)
        .map((c: any) => ({ domain: c.domain, commonKeywords: c.common_keywords, level: c.level }));
    } else if (!statusRow(dom.v.rows)) notes.push('No domain overview was returned for this site.');
  } else notes.push(`Domain overview failed: ${dom.e.message}`);

  if (bl.ok) {
    data.costUsd! += bl.v.costUsd;
    limitNote(bl.v.rows);
    data.topBacklinks = bl.v.rows
      .filter((r) => r?.source_url)
      .sort((a, b) => (b.page_ascore ?? 0) - (a.page_ascore ?? 0))
      .filter((r, i, arr) => arr.findIndex((x) => new URL(x.source_url).host === new URL(r.source_url).host) === i)
      .slice(0, 10)
      .map((r) => ({ sourceUrl: r.source_url, sourceTitle: r.source_title, authority: r.page_ascore, anchor: r.target_anchor, targetUrl: r.target_url }));
  } else notes.push(`Backlinks failed: ${bl.e.message}`);

  if (kw) {
    if (kw.ok) {
      data.costUsd! += kw.v.costUsd;
      limitNote(kw.v.rows);
      const brand = opts.brand.toLowerCase().replace(/[^a-z0-9]/g, '');
      const seen = new Set<string>();
      data.keywordIdeas = kw.v.rows
        .filter((r) => r?.phrase && !(brand.length >= 4 && r.phrase.toLowerCase().replace(/[^a-z0-9]/g, '').includes(brand)))
        .filter((r) => !seen.has(r.phrase) && seen.add(r.phrase))
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
        .slice(0, 15)
        .map((r) => ({ phrase: r.phrase, volume: r.volume, difficulty: r.difficulty, cpc: r.cpc }));
    } else notes.push(`Keyword ideas failed: ${kw.e.message}`);
  } else notes.push('No keyword ideas: the site does not say clearly enough what it offers to pick a starting keyword.');

  data.costUsd = Math.round((data.costUsd ?? 0) * 1000) / 1000;
  const empty = data.authorityScore === undefined && !data.topBacklinks.length && !data.keywordIdeas.length;
  return empty ? { note: notes.join(' ') || 'No search data was returned.' } : { data };
}
