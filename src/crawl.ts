import { createRequire } from 'node:module';
const robotsParser: (url: string, body: string) => import('robots-parser').Robot = createRequire(import.meta.url)('robots-parser');
import { get, type FetchResult } from './http.js';
import { BOTS } from './bots.js';
import { parsePage, type PageInfo } from './page.js';
import { withBrowser } from './render.js';
import { detectWidgets } from './widgets.js';
import type { BotResult } from './types.js';
import { PAGE_KINDS, detectProfile, profileById, type Detection, type PageKind, type Profile } from './profiles.js';

export interface AnalyzedPage {
  url: string;
  label: string;
  kind?: PageKind;
  fetch: FetchResult;
  raw: PageInfo;
  rendered?: PageInfo;
  widgets: string[];
  renderError?: string;
  /** Raw fetch kept returning a bot challenge / loading page, so raw content is unknown. */
  challenged?: boolean;
}

export interface Ctx {
  inputUrl: string;
  origin: string;
  host: string;
  home: FetchResult;
  robots: FetchResult;
  robotsState: 'ok' | 'missing' | 'broken';
  robotsProblem?: string;
  sitemapsInRobots: string[];
  bots: BotResult[];
  pages: AnalyzedPage[];
  sitemap: { found: boolean; url?: string; urlCount: number; listedInRobots: boolean };
  llmsTxt: { found: boolean; url: string };
  detection: Detection;
  profile: Profile;
  /** Every time a plain fetch got a challenge or loading page instead of content. */
  challenges: { url: string; title: string; recovered: boolean }[];
}

export interface CrawlOptions {
  /** Profile id to force, or undefined / 'auto' to detect. */
  businessType?: string;
}

const SKIP = /\.(pdf|jpe?g|png|webp|gif|svg|mp4|zip|docx?)$|\/wp-(content|admin|json)|\/cdn-cgi\/|\/(feed|tag|author|category|blog|news|cart|checkout|my-account|login|privacy|terms)\b|\/\d{4}\/\d{2}\/|\?/i;

/** Blog posts and articles are not key pages: long slugs or "Read more" links. */
const looksLikeArticle = (u: URL, text: string) => /read more|continue reading/i.test(text) || (u.pathname.split('/').filter(Boolean).pop() ?? '').split('-').length >= 6;

export function pickKeyPages(links: { href: string; text: string }[], origin: string, homeUrl: string, profile: Profile, max = 7) {
  const host = new URL(origin).host.replace(/^www\./, '');
  const candidates = links.filter((l) => {
    try {
      const u = new URL(l.href);
      return u.host.replace(/^www\./, '') === host && /^https?:$/.test(u.protocol) && !SKIP.test(u.pathname + u.search) && !looksLikeArticle(u, l.text) && u.pathname !== '/' && l.href !== homeUrl;
    } catch {
      return false;
    }
  });
  // Expected page kinds for this business first, then anything else useful.
  const order = [...profile.pages, ...(Object.keys(PAGE_KINDS) as PageKind[]).filter((k) => !profile.pages.includes(k))];
  const chosen: { url: string; label: string; kind: PageKind }[] = [];
  const used = new Set<string>();
  for (const kind of order) {
    const { re, label } = PAGE_KINDS[kind];
    // Prefer a match in the URL path; fall back to link text.
    const hit =
      candidates.find((c) => !used.has(norm(c.href)) && re.test(new URL(c.href).pathname)) ??
      candidates.find((c) => !used.has(norm(c.href)) && c.text.length < 40 && re.test(c.text));
    if (hit) {
      used.add(norm(hit.href));
      chosen.push({ url: hit.href, label, kind });
    }
    if (chosen.length >= max) break;
  }
  return chosen;
}

const norm = (u: string) => u.replace(/\/$/, '').toLowerCase();

const CHALLENGE = /just a moment|one moment,? please|attention required|cf-chl|captcha|access denied|are you a robot|verify you are human|checking your browser|ddos protection|please wait while/i;

/** A bot challenge or loading screen served in place of the real page (often with a 200 status). */
export function isChallenge(r: FetchResult): boolean {
  if (r.headers['cf-mitigated'] === 'challenge') return true;
  const head = r.body.slice(0, 6000);
  const title = head.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '';
  return (CHALLENGE.test(title) || CHALLENGE.test(head)) && parsePage(r.body, r.finalUrl).words < 80;
}

const titleOf = (r: FetchResult) => (r.body.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim();

/** Fetch a page, retrying if a challenge / loading page comes back instead of content. */
async function getContent(url: string, challenges: Ctx['challenges']): Promise<{ fetch: FetchResult; challenged: boolean }> {
  let r = await get(url);
  for (let attempt = 0; attempt < 3 && r.status > 0 && isChallenge(r); attempt++) {
    challenges.push({ url, title: titleOf(r) || 'challenge page', recovered: false });
    await new Promise((res) => setTimeout(res, 2500 + attempt * 2000));
    r = await get(url);
    if (!isChallenge(r)) {
      challenges[challenges.length - 1].recovered = true;
      return { fetch: r, challenged: false };
    }
  }
  return { fetch: r, challenged: r.status > 0 && isChallenge(r) };
}

async function liveBotTest(url: string, browserWords: number): Promise<Map<string, { live: BotResult['live']; detail: string }>> {
  const out = new Map<string, { live: BotResult['live']; detail: string }>();
  await Promise.all(
    BOTS.filter((b) => b.ua).map(async (b) => {
      const r = await get(url, { ua: b.ua!, timeoutMs: 20000 });
      if (r.status === 0) return out.set(b.token, { live: 'error', detail: r.error ?? 'No response' });
      const words = r.body ? parsePage(r.body, url).words : 0;
      const challenged = r.headers['cf-mitigated'] === 'challenge' || (CHALLENGE.test(r.body.slice(0, 5000)) && words < browserWords * 0.5);
      if (challenged) return out.set(b.token, { live: 'challenged', detail: `HTTP ${r.status}, bot challenge page shown` });
      if (r.status >= 400) return out.set(b.token, { live: 'blocked', detail: `HTTP ${r.status}` });
      if (words < browserWords * 0.5) return out.set(b.token, { live: 'blocked', detail: `HTTP ${r.status}, only ${words} words vs ${browserWords} for a browser` });
      out.set(b.token, { live: 'ok', detail: `HTTP ${r.status}, ${words} words` });
    }),
  );
  return out;
}

async function findSitemap(origin: string, fromRobots: string[]) {
  const tries = [...fromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  for (const url of [...new Set(tries)]) {
    const r = await get(url, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' });
    if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.body)) continue;
    let urlCount = 0;
    if (/<sitemapindex/i.test(r.body)) {
      const children = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 10);
      const subs = await Promise.all(children.map((c) => get(c, { accept: 'application/xml,*/*' })));
      urlCount = subs.reduce((n, s) => n + (s.body.match(/<url>/gi)?.length ?? 0), 0);
    } else urlCount = r.body.match(/<url>/gi)?.length ?? 0;
    return { found: true, url: r.finalUrl, urlCount, listedInRobots: fromRobots.length > 0 };
  }
  return { found: false, urlCount: 0, listedInRobots: fromRobots.length > 0 };
}

export async function crawl(inputUrl: string, log: (s: string) => void, opts: CrawlOptions = {}): Promise<Ctx> {
  const start = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;
  log(`Fetching ${start}`);
  const challenges: Ctx['challenges'] = [];
  const { fetch: home, challenged: homeChallenged } = await getContent(start, challenges);
  if (challenges.length) log(`Note: the site showed a challenge or loading page (${challenges.length}x)`);
  if (home.status === 0 || home.status >= 400) throw new Error(`Could not load ${start}: ${home.error ?? 'HTTP ' + home.status}`);
  const origin = new URL(home.finalUrl).origin;
  const host = new URL(origin).host;

  log('Checking robots.txt');
  const robots = await get(`${origin}/robots.txt`, { accept: 'text/plain,*/*;q=0.5' });
  let robotsState: Ctx['robotsState'];
  let robotsProblem: string | undefined;
  const looksHtml = /^\s*</.test(robots.body);
  if (robots.status === 200 && !looksHtml) robotsState = 'ok';
  else if (robots.status >= 400 && robots.status < 500) robotsState = 'missing';
  else {
    robotsState = 'broken';
    robotsProblem = robots.redirectLoop
      ? `robots.txt redirects to itself in an endless loop (${robots.redirects.map((r) => r.status).join(' → ')})`
      : robots.status === 200
        ? 'robots.txt returns a web page instead of a robots file'
        : `robots.txt could not be loaded (${robots.error ?? 'HTTP ' + robots.status})`;
  }
  const parser = robotsState === 'ok' ? robotsParser(`${origin}/robots.txt`, robots.body) : undefined;
  const sitemapsInRobots = parser?.getSitemaps() ?? [];

  log('Rendering homepage in a real browser');
  const pages: AnalyzedPage[] = [];
  let detection!: Detection;
  await withBrowser(async (render) => {
    const homeRendered = await render(home.finalUrl);
    if (homeRendered.error) log(`Warning: browser could not render the homepage (${homeRendered.error})`);
    const homeRenderedInfo = homeRendered.html ? parsePage(homeRendered.html, home.finalUrl) : undefined;
    // If we never got past the challenge, judge content on what the browser saw; the challenge itself is reported separately.
    const homeRaw = homeChallenged && homeRenderedInfo ? homeRenderedInfo : parsePage(home.body, home.finalUrl);
    pages.push({
      url: home.finalUrl,
      label: 'Homepage',
      fetch: home,
      raw: homeRaw,
      rendered: homeRenderedInfo,
      widgets: detectWidgets([...homeRendered.requests, ...homeRaw.resourceUrls]),
      renderError: homeRendered.error,
      challenged: homeChallenged,
    });

    const forced = opts.businessType && opts.businessType !== 'auto' ? profileById(opts.businessType) : undefined;
    const h = homeRenderedInfo ?? homeRaw;
    // Evidence that selling online is the main business, not just a plugin that happens to load.
    const ecommerceSignals =
      (/cdn\.shopify\.com|bigcommerce\.com|shopline/i.test(home.body) ? 2 : 0) +
      (/\badd to (cart|bag|basket)\b/i.test(h.text) ? 2 : 0) +
      (homeRaw.schemaTypes.some((t) => ['Product', 'ProductGroup', 'OnlineStore'].includes(t)) ? 1 : 0);
    detection = forced
      ? { profile: forced, detected: false, confidence: 'high', reason: 'chosen when the audit was started' }
      : detectProfile({ jsonLd: homeRaw.jsonLd, title: h.title, description: h.metaDescription, headings: [...h.h1, ...h.h2], body: h.text, ecommerceSignals: Math.min(ecommerceSignals, 3) });
    log(`Business type: ${detection.profile.label}${forced ? ' (chosen)' : ` (detected, ${detection.confidence} confidence)`}`);

    const keyPages = pickKeyPages([...(homeRenderedInfo?.links ?? []), ...homeRaw.links], origin, home.finalUrl, detection.profile);
    for (const kp of keyPages) {
      log(`Analysing ${kp.label}: ${kp.url}`);
      const before = challenges.length;
      const { fetch: f, challenged } = await getContent(kp.url, challenges);
      if (challenges.length > before) log(`Note: challenge or loading page on ${kp.url}${challenged ? ' (did not clear)' : ' (cleared on retry)'}`);
      if (f.status === 0 || f.status >= 400) continue;
      if (pages.some((p) => norm(p.url) === norm(f.finalUrl))) continue;
      const r = await render(f.finalUrl);
      if (r.error) log(`Warning: browser could not render ${f.finalUrl} (${r.error})`);
      const renderedInfo = r.html ? parsePage(r.html, f.finalUrl) : undefined;
      const raw = challenged && renderedInfo ? renderedInfo : parsePage(f.body, f.finalUrl);
      pages.push({
        challenged,
        url: f.finalUrl,
        label: kp.label,
        kind: kp.kind,
        fetch: f,
        raw,
        rendered: renderedInfo,
        widgets: detectWidgets([...r.requests, ...raw.resourceUrls]),
        renderError: r.error,
      });
    }
  });

  log('Testing access as each AI crawler');
  const live = await liveBotTest(home.finalUrl, pages[0].raw.words);
  const testUrls = pages.map((p) => p.url);
  const bots: BotResult[] = BOTS.map((b) => {
    let state: BotResult['robots'] = 'allowed';
    if (robotsState === 'broken') state = 'unknown';
    else if (parser) {
      const allowed = testUrls.map((u) => parser.isAllowed(u, b.token) !== false);
      state = allowed.every(Boolean) ? 'allowed' : allowed.some(Boolean) ? 'partial' : 'blocked';
    }
    const l = live.get(b.token);
    return { token: b.token, company: b.company, product: b.product, purpose: b.purpose, robots: state, live: l?.live ?? 'not-tested', liveDetail: l?.detail };
  });

  log('Looking for sitemap and llms.txt');
  const sitemap = await findSitemap(origin, sitemapsInRobots);
  const llms = await get(`${origin}/llms.txt`, { accept: 'text/plain,*/*' });
  const llmsTxt = { found: llms.status === 200 && !/^\s*</.test(llms.body) && llms.body.trim().length > 0, url: `${origin}/llms.txt` };

  return { challenges, inputUrl: start, origin, host, home, robots, robotsState, robotsProblem, sitemapsInRobots, bots, pages, sitemap, llmsTxt, detection, profile: detection.profile };
}
