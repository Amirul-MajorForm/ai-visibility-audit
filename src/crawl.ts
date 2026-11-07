import { createRequire } from 'node:module';
const robotsParser: (url: string, body: string) => import('robots-parser').Robot = createRequire(import.meta.url)('robots-parser');
import { get, type FetchResult } from './http.js';
import { BOTS } from './bots.js';
import { parsePage, type PageInfo } from './page.js';
import { withBrowser } from './render.js';
import { detectWidgets } from './widgets.js';
import type { BotResult } from './types.js';

export interface AnalyzedPage {
  url: string;
  label: string;
  fetch: FetchResult;
  raw: PageInfo;
  rendered?: PageInfo;
  widgets: string[];
  renderError?: string;
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
}

const PAGE_TYPES: { label: string; re: RegExp }[] = [
  { label: 'Pricing', re: /pric|rates|membership|package|plans?\b|fees?\b|passes/i },
  { label: 'Schedule', re: /schedul|timetable|calendar|class-?times|book-?(a|now|class)/i },
  { label: 'Classes / services', re: /class|program|service|training|personal|group|workout|bootcamp|pilates|yoga|hiit|strength/i },
  { label: 'About', re: /about|our-?story|team|coaches|trainers/i },
  { label: 'FAQ', re: /faq|questions/i },
  { label: 'Contact / location', re: /contact|location|find-?us|visit/i },
  { label: 'Trial / offer', re: /trial|intro|first-?(class|timer|visit)|new-?here|promo|free/i },
];

const SKIP = /\.(pdf|jpe?g|png|webp|gif|svg|mp4|zip|docx?)$|\/wp-(content|admin|json)|\/cdn-cgi\/|\/(feed|tag|author|category|blog|news|cart|checkout|my-account|login|privacy|terms)\b|\/\d{4}\/\d{2}\/|\?/i;

/** Blog posts and articles are not key pages: long slugs or "Read more" links. */
const looksLikeArticle = (u: URL, text: string) => /read more|continue reading/i.test(text) || (u.pathname.split('/').filter(Boolean).pop() ?? '').split('-').length >= 6;

export function pickKeyPages(links: { href: string; text: string }[], origin: string, homeUrl: string, max = 7) {
  const host = new URL(origin).host.replace(/^www\./, '');
  const candidates = links.filter((l) => {
    try {
      const u = new URL(l.href);
      return u.host.replace(/^www\./, '') === host && /^https?:$/.test(u.protocol) && !SKIP.test(u.pathname + u.search) && !looksLikeArticle(u, l.text) && u.pathname !== '/' && l.href !== homeUrl;
    } catch {
      return false;
    }
  });
  const chosen: { url: string; label: string }[] = [];
  const used = new Set<string>();
  for (const t of PAGE_TYPES) {
    const hit = candidates.find((c) => !used.has(norm(c.href)) && t.re.test(new URL(c.href).pathname + ' ' + c.text));
    if (hit) {
      used.add(norm(hit.href));
      chosen.push({ url: hit.href, label: t.label });
    }
    if (chosen.length >= max) break;
  }
  return chosen;
}

const norm = (u: string) => u.replace(/\/$/, '').toLowerCase();

const CHALLENGE = /just a moment|attention required|cf-chl|captcha|access denied|are you a robot|verify you are human/i;

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

export async function crawl(inputUrl: string, log: (s: string) => void): Promise<Ctx> {
  const start = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;
  log(`Fetching ${start}`);
  const home = await get(start);
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
  await withBrowser(async (render) => {
    const homeRaw = parsePage(home.body, home.finalUrl);
    const homeRendered = await render(home.finalUrl);
    const homeRenderedInfo = homeRendered.html ? parsePage(homeRendered.html, home.finalUrl) : undefined;
    pages.push({
      url: home.finalUrl,
      label: 'Homepage',
      fetch: home,
      raw: homeRaw,
      rendered: homeRenderedInfo,
      widgets: detectWidgets([...homeRendered.requests, ...homeRaw.resourceUrls]),
      renderError: homeRendered.error,
    });

    const keyPages = pickKeyPages([...(homeRenderedInfo?.links ?? []), ...homeRaw.links], origin, home.finalUrl);
    for (const kp of keyPages) {
      log(`Analysing ${kp.label}: ${kp.url}`);
      const f = await get(kp.url);
      if (f.status === 0 || f.status >= 400) continue;
      if (pages.some((p) => norm(p.url) === norm(f.finalUrl))) continue;
      const raw = parsePage(f.body, f.finalUrl);
      const r = await render(f.finalUrl);
      pages.push({
        url: f.finalUrl,
        label: kp.label,
        fetch: f,
        raw,
        rendered: r.html ? parsePage(r.html, f.finalUrl) : undefined,
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

  return { inputUrl: start, origin, host, home, robots, robotsState, robotsProblem, sitemapsInRobots, bots, pages, sitemap, llmsTxt };
}
