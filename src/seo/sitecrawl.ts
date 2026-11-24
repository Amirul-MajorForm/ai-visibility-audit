import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { get, type FetchResult } from '../http.js';
import { isChallenge, type Ctx } from '../crawl.js';
import { wordCount } from '../page.js';

const robotsParser: (url: string, body: string) => import('robots-parser').Robot = createRequire(import.meta.url)('robots-parser');

/** Everything the SEO checks need about one crawled URL. */
export interface SeoPage {
  url: string;
  finalUrl: string;
  status: number;
  redirectHops: number;
  redirectLoop: boolean;
  ms: number;
  depth: number | null;
  inSitemap: boolean;
  isHtml: boolean;
  challenged: boolean;
  error?: string;
  // HTML only
  title: string;
  metaDescription: string;
  h1: string[];
  canonical: string;
  noindex: boolean;
  words: number;
  textHash: string;
  images: number;
  imagesNoAlt: number;
  hasViewport: boolean;
  lang: string;
  mixed: string[];
  jsonLdErrors: number;
  schemaTypes: string[];
  hsts: boolean;
  /** Internal links found on this page (normalised, same site). */
  links: string[];
  /** Links to other sites */
  externalLinks: number;
}

export interface SiteCrawl {
  pages: SeoPage[];
  /** url -> number of internal pages linking to it */
  inlinks: Map<string, number>;
  /** url -> pages that link to it (first few) */
  linkedFrom: Map<string, string[]>;
  sitemapUrls: string[];
  limit: number;
  limitReached: boolean;
  /** Links seen but not crawled because they carried query parameters */
  paramLinks: number;
  /** Probes of http:// and www/non-www variants of the homepage */
  variants: { url: string; finalUrl: string; status: number; error?: string }[];
}

const SKIP_EXT = /\.(pdf|jpe?g|png|webp|gif|svg|ico|mp4|mp3|zip|rar|docx?|xlsx?|pptx?|css|js|json|xml|txt)$/i;
const SKIP_PATH = /\/(wp-admin|wp-json|cdn-cgi|cart|checkout|my-account|login|logout|register|wishlist|feed)(\/|$)/i;

const siteKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Normalise a URL for de-duplication: no hash, consistent trailing slash handling kept as-is. */
export function normUrl(u: string): string {
  const x = new URL(u);
  x.hash = '';
  return x.toString();
}

function parseHtml(r: FetchResult, base: string) {
  const $ = cheerio.load(r.body);
  const links: string[] = [];
  let external = 0;
  let params = 0;
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    if (!href || /^(mailto|tel|javascript|whatsapp|sms):/i.test(href) || href.startsWith('#')) return;
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = '';
      if (siteKey(u.host) !== siteKey(new URL(base).host)) return void external++;
      if (u.search) return void params++;
      links.push(u.toString());
    } catch {}
  });
  let jsonLdErrors = 0;
  const schemaTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: any) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === 'object') {
          const t = n['@type'];
          (Array.isArray(t) ? t : [t]).filter(Boolean).forEach((x: string) => schemaTypes.add(String(x)));
          Object.values(n).forEach((v) => typeof v === 'object' && walk(v));
        }
      };
      walk(JSON.parse($(el).text()));
    } catch {
      jsonLdErrors++;
    }
  });
  const isHttps = base.startsWith('https:');
  const mixed = isHttps
    ? $('img[src^="http:"], script[src^="http:"], link[rel=stylesheet][href^="http:"], iframe[src^="http:"], video[src^="http:"], audio[src^="http:"], source[src^="http:"]')
        .map((_, el) => $(el).attr('src') ?? $(el).attr('href') ?? '')
        .get()
    : [];
  const images = $('img');
  const imagesNoAlt = images.filter((_, el) => ($(el).attr('alt') ?? '').trim() === '' && $(el).attr('role') !== 'presentation').length;
  const robotsMeta = ($('meta[name="robots"]').attr('content') ?? '') + ' ' + ($('meta[name="googlebot"]').attr('content') ?? '');
  $('script, style, noscript, template, svg').remove();
  $('br').replaceWith(' ');
  $('body *').after(' ');
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return {
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    metaDescription: ($('meta[name="description"]').attr('content') ?? '').replace(/\s+/g, ' ').trim(),
    h1: $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get(),
    canonical: (() => {
      const c = $('link[rel="canonical"]').attr('href');
      try {
        return c ? new URL(c, base).toString() : '';
      } catch {
        return c ?? '';
      }
    })(),
    noindex: /noindex/i.test(robotsMeta) || /noindex/i.test(r.headers['x-robots-tag'] ?? ''),
    words: wordCount(text),
    textHash: createHash('sha1').update(text.toLowerCase()).digest('hex'),
    images: images.length,
    imagesNoAlt,
    hasViewport: $('meta[name="viewport"]').length > 0,
    lang: $('html').attr('lang') ?? '',
    mixed,
    jsonLdErrors,
    schemaTypes: [...schemaTypes],
    links: [...new Set(links)],
    externalLinks: external,
    params,
  };
}

/**
 * Crawl the site like a search engine: follow internal links breadth-first from the homepage,
 * then add sitemap URLs nothing links to. Raw HTML only (no browser), politely concurrent.
 */
export async function crawlSite(ctx: Ctx, opts: { limit: number; log: (s: string) => void }): Promise<SiteCrawl> {
  const home = ctx.pages[0].url;
  const homeHost = new URL(home).host;
  const parser = ctx.robotsState === 'ok' ? robotsParser(`${ctx.origin}/robots.txt`, ctx.robots.body) : undefined;
  const sitemapUrls = ctx.sitemap.urls.filter((u) => {
    try {
      return siteKey(new URL(u).host) === siteKey(homeHost);
    } catch {
      return false;
    }
  });
  const sitemapSet = new Set(sitemapUrls.map(normUrl));

  const seen = new Set<string>();
  const queue: { url: string; depth: number | null }[] = [];
  const enqueue = (url: string, depth: number | null) => {
    const n = normUrl(url);
    if (seen.has(n)) return;
    const u = new URL(n);
    if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) return;
    if (parser && parser.isAllowed(n, 'Googlebot') === false) return;
    seen.add(n);
    queue.push({ url: n, depth });
  };
  enqueue(home, 0);

  const pages: SeoPage[] = [];
  const inlinks = new Map<string, number>();
  const linkedFrom = new Map<string, string[]>();
  let paramLinks = 0;
  let sitemapAdded = false;
  let lastLog = 0;

  const worker = async () => {
    while (pages.length < opts.limit) {
      let job = queue.shift();
      if (!job) {
        // Links exhausted: add sitemap URLs nothing linked to (possible orphans), once.
        if (!sitemapAdded && inFlight === 0) {
          sitemapAdded = true;
          sitemapUrls.forEach((u) => enqueue(u, null));
          continue;
        }
        if (inFlight === 0 && queue.length === 0) return;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      inFlight++;
      try {
        let r = await get(job.url, { timeoutMs: 20000 });
        let challenged = false;
        if (r.status > 0 && isChallenge(r)) {
          await new Promise((res) => setTimeout(res, 2500));
          r = await get(job.url, { timeoutMs: 20000 });
          challenged = isChallenge(r);
        }
        const ct = r.headers['content-type'] ?? '';
        const isHtml = r.status === 200 && /html/i.test(ct) && !challenged;
        const base: SeoPage = {
          url: job.url, finalUrl: r.finalUrl, status: r.status, redirectHops: r.redirects.length, redirectLoop: r.redirectLoop,
          ms: r.ttfbMs, depth: job.depth, inSitemap: sitemapSet.has(job.url), isHtml, challenged, error: r.error,
          title: '', metaDescription: '', h1: [], canonical: '', noindex: false, words: 0, textHash: '', images: 0, imagesNoAlt: 0,
          hasViewport: true, lang: '', mixed: [], jsonLdErrors: 0, schemaTypes: [], hsts: !!r.headers['strict-transport-security'], links: [], externalLinks: 0,
        };
        if (isHtml) {
          const h = parseHtml(r, r.finalUrl);
          Object.assign(base, h);
          paramLinks += h.params;
          // Only follow links from pages on this site (a redirect may have left it).
          if (siteKey(new URL(r.finalUrl).host) === siteKey(homeHost)) {
            for (const l of h.links) {
              const n = normUrl(l);
              if (n === normUrl(r.finalUrl)) continue;
              inlinks.set(n, (inlinks.get(n) ?? 0) + 1);
              const from = linkedFrom.get(n) ?? [];
              if (from.length < 5) from.push(job.url);
              linkedFrom.set(n, from);
              enqueue(n, job.depth === null ? null : job.depth + 1);
            }
          }
        }
        pages.push(base);
        if (pages.length - lastLog >= 25) {
          lastLog = pages.length;
          opts.log(`Crawled ${pages.length} pages`);
        }
      } finally {
        inFlight--;
      }
    }
  };
  let inFlight = 0;
  await Promise.all(Array.from({ length: 5 }, worker));

  // Homepage variants: http:// and the other www form should redirect to the main version.
  const u = new URL(home);
  const altHost = u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`;
  const variants = await Promise.all(
    [`http://${u.host}/`, `https://${altHost}/`].map(async (v) => {
      const r = await get(v, { timeoutMs: 15000 });
      return { url: v, finalUrl: r.finalUrl, status: r.status, error: r.error };
    }),
  );

  return { pages, inlinks, linkedFrom, sitemapUrls, limit: opts.limit, limitReached: pages.length >= opts.limit && queue.length > 0, paramLinks, variants };
}
