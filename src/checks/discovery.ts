import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import { mk, list, path } from './util.js';

export function discoveryChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  const home = ctx.pages[0];
  const sm = ctx.sitemap;

  const smScore = sm.found ? (sm.listedInRobots ? 1 : 0.75) : 0;
  checks.push(mk({ id: 'sitemap', category: 'discovery', title: 'XML sitemap', weight: 2, score: smScore,
    finding: sm.found
      ? `Sitemap found at ${sm.url} listing about ${sm.urlCount} pages.${sm.listedInRobots ? '' : ' It is not referenced in robots.txt, so crawlers have to guess where it is.'}`
      : 'No XML sitemap found.',
    why: smScore < 1 ? 'A sitemap is the list of pages you want crawled. Crawlers find it through robots.txt.' : undefined,
    fix: smScore < 1 ? (sm.found ? `Add "Sitemap: ${sm.url}" to robots.txt (after robots.txt itself is fixed).` : 'Generate an XML sitemap (most SEO plugins do this) and reference it in robots.txt.') : undefined,
    effort: smScore < 1 ? 'Quick win' : undefined }));

  const noindex = ctx.pages.filter((p) => /noindex/.test(p.raw.robotsMeta) || /noindex/i.test(p.fetch.headers['x-robots-tag'] ?? ''));
  checks.push(mk({ id: 'indexable', category: 'discovery', title: 'Pages allowed in search indexes', weight: 3, score: noindex.length ? Math.max(0, 1 - noindex.length / ctx.pages.length * 2) : 1,
    finding: noindex.length ? `${list(noindex.map((p) => path(p.url)))} ${noindex.length > 1 ? 'are' : 'is'} marked "noindex", which tells search engines and AI search to leave ${noindex.length > 1 ? 'them' : 'it'} out.` : 'None of the pages we reviewed are hidden from search indexes.',
    why: noindex.length ? 'ChatGPT search, Gemini and Copilot all draw on search indexes. A noindexed page cannot be cited.' : undefined,
    fix: noindex.length ? 'Remove the noindex setting from these pages (often a checkbox in the SEO plugin).' : undefined,
    effort: noindex.length ? 'Quick win' : undefined }));

  const canon = home.raw.canonical;
  let canonOk = false;
  try {
    canonOk = !!canon && new URL(canon, home.url).host.replace(/^www\./, '') === ctx.host.replace(/^www\./, '');
  } catch {}
  checks.push(mk({ id: 'canonical', category: 'discovery', title: 'Canonical URL', weight: 1, score: canonOk ? 1 : canon ? 0.3 : 0.5,
    finding: canonOk ? 'The homepage declares its preferred (canonical) URL.' : canon ? `The homepage's canonical URL points to a different site: ${canon}.` : 'The homepage does not declare a canonical URL.',
    fix: canonOk ? undefined : 'Set a self-referencing canonical URL on each page (SEO plugins do this automatically).', effort: canonOk ? undefined : 'Quick win' }));

  const https = ctx.origin.startsWith('https:');
  checks.push(mk({ id: 'https', category: 'discovery', title: 'Secure connection (HTTPS)', weight: 1, score: https ? 1 : 0,
    finding: https ? 'The site is served securely over HTTPS.' : 'The site is not served over HTTPS.',
    fix: https ? undefined : 'Install an SSL certificate and redirect all traffic to HTTPS.', effort: https ? undefined : 'Developer needed' }));

  const ttfb = home.fetch.ttfbMs;
  checks.push(mk({ id: 'speed', category: 'discovery', title: 'Server response time', weight: 1.5, score: ttfb <= 800 ? 1 : ttfb <= 1800 ? 0.6 : 0.2,
    finding: `Your server took ${(ttfb / 1000).toFixed(2)}s to start responding.${ttfb > 800 ? ' AI crawlers work to tight time limits and may give up on slow pages.' : ''}`,
    fix: ttfb > 800 ? 'Enable page caching (e.g. a caching plugin or Cloudflare cache) and review hosting performance.' : undefined,
    effort: ttfb > 800 ? 'Moderate' : undefined }));

  const og = home.raw.og;
  const ogCount = ['og:title', 'og:description', 'og:image'].filter((k) => og[k]).length;
  checks.push(mk({ id: 'og', category: 'discovery', title: 'Link preview tags', weight: 0.5, score: ogCount / 3,
    finding: ogCount === 3 ? 'Open Graph tags (title, description, image) are set for link previews.' : `${ogCount} of 3 Open Graph tags are set.`,
    fix: ogCount < 3 ? 'Add og:title, og:description and og:image so links look right when shared and summarised.' : undefined,
    effort: ogCount < 3 ? 'Quick win' : undefined }));

  checks.push(mk({ id: 'llms-txt', category: 'discovery', title: 'llms.txt (optional)', weight: 0, score: ctx.llmsTxt.found ? 1 : 0, status: 'info',
    finding: ctx.llmsTxt.found
      ? 'An llms.txt file is present.'
      : 'No llms.txt file. This is an emerging, optional standard. No major AI assistant has confirmed it uses it, so it does not affect your score.' }));

  return checks;
}
