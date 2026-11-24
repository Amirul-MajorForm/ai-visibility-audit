import type { Check, CategoryId, SpeedResult } from '../types.js';
import type { Ctx } from '../crawl.js';
import type { SiteCrawl, SeoPage } from './sitecrawl.js';
import { normUrl } from './sitecrawl.js';
import { mk, list, pct } from '../checks/util.js';

const short = (u: string) => {
  try {
    const x = new URL(u);
    const p = decodeURI(x.pathname + x.search);
    return p === '/' ? 'Homepage' : p;
  } catch {
    return u;
  }
};
const sample = (urls: string[], n = 5) => urls.slice(0, n).map(short);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const seo = (c: Omit<Check, 'status' | 'module'> & { status?: Check['status']; category: CategoryId }) => ({ ...mk(c), module: 'seo' as const });

/** Share of `bad` in `total`, mapped to a score where a little is tolerated and a lot is a fail. */
const ratioScore = (bad: number, total: number, tolerance = 0.02) => (total ? Math.max(0, Math.min(1, 1 - Math.max(0, bad / total - tolerance) * 2.5)) : 1);

export function seoChecks(ctx: Ctx, crawl: SiteCrawl, speed: SpeedResult[]): Check[] {
  const checks: Check[] = [];
  const all = crawl.pages;
  const html = all.filter((p) => p.isHtml);
  const indexable = html.filter((p) => !p.noindex && (!p.canonical || normUrl(p.canonical) === normUrl(p.finalUrl)));
  const n = html.length || 1;
  const p = ctx.platform;

  // ---------------------------------------------------------------- Crawling & indexing
  const broken = all.filter((x) => x.status >= 400 || x.status === 0 || x.redirectLoop);
  const brokenLinked = broken.filter((x) => (crawl.inlinks.get(x.url) ?? 0) > 0);
  checks.push(seo({ id: 'seo-broken', category: 'indexing', title: 'Broken pages and links', weight: 4, score: ratioScore(broken.length, all.length, 0),
    finding: broken.length
      ? `${plural(broken.length, 'URL')} returned an error${brokenLinked.length ? `, and ${plural(brokenLinked.length, 'of them is', 'of them are')} linked from other pages on your site` : ''}: ${list(sample(broken.map((x) => `${short(x.url)} (${x.redirectLoop ? 'redirect loop' : x.status || 'no response'})`)))}.`
      : `All ${all.length} URLs we crawled loaded without errors.`,
    why: broken.length ? 'Broken pages waste the time search engines spend on your site and send visitors to dead ends. Links pointing to them pass no value.' : undefined,
    fix: broken.length ? 'Fix or remove links to these URLs, and redirect any removed pages to the closest live page.' : undefined,
    effort: broken.length ? 'Quick win' : undefined,
    evidence: broken.slice(0, 10).map((x) => `${x.url} → ${x.status || x.error}${crawl.linkedFrom.get(x.url)?.length ? ` (linked from ${short(crawl.linkedFrom.get(x.url)![0])})` : ''}`) }));

  const redirected = all.filter((x) => x.redirectHops > 0 && x.status === 200 && (crawl.inlinks.get(x.url) ?? 0) > 0);
  const chains = all.filter((x) => x.redirectHops > 1);
  checks.push(seo({ id: 'seo-redirects', category: 'indexing', title: 'Internal links that redirect', weight: 1.5, score: Math.min(ratioScore(redirected.length, all.length, 0.05), chains.length ? 0.6 : 1),
    finding: redirected.length || chains.length
      ? `${redirected.length + chains.length <= 5 && !chains.length ? 'Only ' : ''}${plural(redirected.length, 'internal link target redirects', 'internal link targets redirect')} somewhere else${chains.length ? `, and ${plural(chains.length, 'URL goes', 'URLs go')} through more than one redirect` : ''}. Examples: ${list(sample([...chains, ...redirected].map((x) => `${short(x.url)} → ${short(x.finalUrl)}`), 3))}.`
      : 'Internal links point straight to their final pages, without redirects.',
    why: redirected.length || chains.length ? 'Each redirect slows crawling and loading a little and leaks some link value. Chains make it worse.' : undefined,
    fix: redirected.length || chains.length ? 'Update internal links (menus, footers, content) to point directly at the final URL.' : undefined,
    effort: redirected.length || chains.length ? 'Quick win' : undefined }));

  const noindexInSitemap = html.filter((x) => x.noindex && x.inSitemap);
  const noindexAll = html.filter((x) => x.noindex);
  const homeNoindex = html.find((x) => normUrl(x.url) === normUrl(ctx.pages[0].url))?.noindex;
  checks.push(seo({ id: 'seo-noindex', category: 'indexing', topic: 'indexable', title: 'Pages hidden from Google', weight: 3,
    score: homeNoindex ? 0 : noindexInSitemap.length ? 0.4 : 1,
    status: !homeNoindex && !noindexInSitemap.length && noindexAll.length ? 'info' : undefined,
    finding: homeNoindex
      ? 'Your homepage is marked "noindex", which tells Google not to show it in search results.'
      : noindexInSitemap.length
        ? `${plural(noindexInSitemap.length, 'page is', 'pages are')} listed in your sitemap but marked "noindex": ${list(sample(noindexInSitemap.map((x) => x.url)))}. The two signals contradict each other.`
        : noindexAll.length
          ? `${plural(noindexAll.length, 'page is', 'pages are')} deliberately marked "noindex" (e.g. ${list(sample(noindexAll.map((x) => x.url), 3))}). Check this is intended.`
          : 'None of the pages we crawled are hidden from search results.',
    why: homeNoindex || noindexInSitemap.length ? 'A noindexed page cannot rank, and Google gets mixed signals when a sitemap asks it to index a page the page itself refuses.' : undefined,
    fix: homeNoindex || noindexInSitemap.length ? 'Remove "noindex" from pages that should appear in Google, or remove them from the sitemap if they should not.' : undefined,
    effort: homeNoindex || noindexInSitemap.length ? 'Quick win' : undefined }));

  const missingCanon = html.filter((x) => !x.canonical);
  const canonElsewhere = html.filter((x) => x.canonical && normUrl(x.canonical) !== normUrl(x.finalUrl));
  const pagesByUrl = new Map(all.map((x) => [normUrl(x.finalUrl), x]));
  const canonBroken = canonElsewhere.filter((x) => {
    const t = pagesByUrl.get(normUrl(x.canonical));
    return t && (t.status >= 400 || t.noindex);
  });
  const canonScore = Math.min(1 - Math.min(1, missingCanon.length / n) * 0.5, canonBroken.length ? 0.4 : 1);
  checks.push(seo({ id: 'seo-canonical', category: 'indexing', topic: 'canonical', title: 'Canonical tags', weight: 2, score: canonScore,
    finding: `${pct(1 - missingCanon.length / n)} of pages declare a canonical URL. ${canonElsewhere.length ? `${plural(canonElsewhere.length, 'page points', 'pages point')} its canonical at a different URL${canonBroken.length ? `, and ${plural(canonBroken.length, 'of these points', 'of these point')} at a broken or noindexed page` : ''}.` : ''}`.trim(),
    why: canonScore < 0.8 ? 'The canonical tag tells Google which version of a page to rank when the same content is reachable at several URLs (filters, tracking codes, http/https).' : undefined,
    fix: canonScore < 0.8 ? 'Give every page a self-referencing canonical tag, and make sure canonicals only ever point at live, indexable pages.' : undefined,
    effort: canonScore < 0.8 ? 'Quick win' : undefined,
    evidence: [...canonBroken, ...canonElsewhere].slice(0, 6).map((x) => `${short(x.url)} → canonical ${x.canonical}`) }));

  const sm = crawl.sitemapUrls;
  const smCrawled = all.filter((x) => x.inSitemap);
  const smBad = smCrawled.filter((x) => x.status !== 200 || x.redirectHops > 0 || x.noindex);
  const smScore = !ctx.sitemap.found ? 0 : Math.min(ctx.sitemap.listedInRobots ? 1 : 0.8, ratioScore(smBad.length, smCrawled.length || 1, 0.02));
  checks.push(seo({ id: 'seo-sitemap', category: 'indexing', topic: 'sitemap', title: 'XML sitemap', weight: 2, score: smScore,
    finding: !ctx.sitemap.found
      ? 'No XML sitemap found.'
      : `Your sitemap lists ${plural(sm.length, 'URL')}.${smCrawled.length ? ` Of the ${smCrawled.length} we checked, ${smBad.length ? `${smBad.length} redirect, return an error or are noindexed` : 'all load correctly'}.` : ''}${ctx.sitemap.listedInRobots ? '' : ' It is not referenced in robots.txt.'}`,
    why: smScore < 0.8 ? 'The sitemap is how you tell Google which pages matter. It should list only live, indexable pages, and be referenced in robots.txt.' : undefined,
    fix: smScore < 0.8 ? (ctx.sitemap.found ? 'Remove redirected, broken and noindexed URLs from the sitemap, and add a "Sitemap:" line to robots.txt.' : `Generate an XML sitemap${p.cms === 'WordPress' ? ' (Yoast or Rank Math can do this)' : p.cms ? ` (${p.cms} can generate one)` : ''} and reference it in robots.txt.`) : undefined,
    effort: smScore < 0.8 ? 'Quick win' : undefined,
    evidence: smBad.slice(0, 6).map((x) => `${x.url} → ${x.noindex ? 'noindex' : x.redirectHops ? `redirects to ${x.finalUrl}` : x.status}`) }));

  // http -> https and www consistency
  const mainHost = new URL(ctx.pages[0].url).host;
  const tested = crawl.variants.filter((v) => v.status > 0);
  const duplicates = tested.filter((v) => v.status === 200 && !(new URL(v.finalUrl).host === mainHost && v.finalUrl.startsWith('https:')));
  const erroring = tested.filter((v) => v.status >= 400);
  const vScore = duplicates.length ? 0.3 : erroring.length ? 0.5 : 1;
  checks.push(seo({ id: 'seo-variants', category: 'indexing', title: 'One version of the site', weight: 1.5, score: vScore, status: tested.length ? undefined : 'info',
    finding: !tested.length
      ? 'We could not test whether the http:// and www versions of your address redirect to the main site.'
      : [
          duplicates.length ? `${list(duplicates.map((v) => v.url))} ${duplicates.length > 1 ? 'load' : 'loads'} the site without redirecting to your main address (${ctx.pages[0].url}), so the same pages exist twice.` : '',
          erroring.length ? `${list(erroring.map((v) => `${v.url} (error ${v.status})`))} ${erroring.length > 1 ? 'return' : 'returns'} an error instead of redirecting to your main address, so anyone who types or links to that version gets an error page.` : '',
        ].filter(Boolean).join(' ') || 'The http:// and www/non-www versions of your address redirect to one main version.',
    why: vScore < 1 ? 'Every version of your address should land on the same site: otherwise Google may index duplicates, and links or visitors using the other version are lost.' : undefined,
    fix: vScore < 1 ? `Add permanent (301) redirects so every version of the address lands on ${ctx.pages[0].url}${p.cdn ? ` (this can be done in ${p.cdn})` : ''}.` : undefined,
    effort: vScore < 1 ? 'Developer needed' : undefined }));

  // ---------------------------------------------------------------- On-page
  const titleCount = new Map<string, number>();
  html.forEach((x) => x.title && titleCount.set(x.title.toLowerCase(), (titleCount.get(x.title.toLowerCase()) ?? 0) + 1));
  const tMissing = html.filter((x) => !x.title);
  const tDup = html.filter((x) => x.title && (titleCount.get(x.title.toLowerCase()) ?? 0) > 1);
  const tLong = html.filter((x) => x.title.length > 65);
  const tShort = html.filter((x) => x.title && x.title.length < 20);
  const tBad = new Set([...tMissing, ...tDup, ...tLong, ...tShort]);
  checks.push(seo({ id: 'seo-titles', category: 'onpage', topic: 'titles', title: 'Page titles', weight: 3, score: ratioScore(tMissing.length * 2 + tDup.length + (tLong.length + tShort.length) * 0.5, n, 0.05),
    finding: tBad.size
      ? `Across ${plural(html.length, 'page')}: ${[tMissing.length && `${tMissing.length} missing`, tDup.length && `${tDup.length} duplicated`, tLong.length && `${tLong.length} too long (over 65 characters, cut off in Google)`, tShort.length && `${tShort.length} very short`].filter(Boolean).join(', ')}.`
      : `All ${plural(html.length, 'page')} have unique titles of a sensible length.`,
    why: tBad.size ? 'The title is the headline Google shows in results and one of the strongest signals of what a page is about. Duplicates make pages compete with each other.' : undefined,
    fix: tBad.size ? 'Give every page a unique title under 65 characters that leads with what the page offers.' : undefined,
    effort: tBad.size ? (tBad.size > 20 ? 'Moderate' : 'Quick win') : undefined,
    evidence: [...tDup.slice(0, 3).map((x) => `Duplicate: ${short(x.url)} "${x.title}"`), ...tLong.slice(0, 3).map((x) => `Long (${x.title.length}): ${short(x.url)}`), ...tMissing.slice(0, 2).map((x) => `Missing: ${short(x.url)}`)] }));

  const dCount = new Map<string, number>();
  html.forEach((x) => x.metaDescription && dCount.set(x.metaDescription.toLowerCase(), (dCount.get(x.metaDescription.toLowerCase()) ?? 0) + 1));
  const dMissing = html.filter((x) => !x.metaDescription);
  const dDup = html.filter((x) => x.metaDescription && (dCount.get(x.metaDescription.toLowerCase()) ?? 0) > 1);
  const dLong = html.filter((x) => x.metaDescription.length > 160);
  checks.push(seo({ id: 'seo-meta', category: 'onpage', topic: 'meta-desc', title: 'Meta descriptions', weight: 2, score: ratioScore(dMissing.length + dDup.length + dLong.length * 0.3, n, 0.05),
    finding: dMissing.length || dDup.length || dLong.length
      ? `${[dMissing.length && `${dMissing.length} missing`, dDup.length && `${dDup.length} duplicated`, dLong.length && `${dLong.length} longer than 160 characters`].filter(Boolean).join(', ')}, out of ${plural(html.length, 'page')}.`
      : 'Every page has a unique meta description of a good length.',
    why: dMissing.length || dDup.length ? 'Google often shows the meta description under your title. A good one earns more clicks; missing ones get replaced with random page text.' : undefined,
    fix: dMissing.length || dDup.length || dLong.length ? 'Write a unique 120 to 155 character description for each important page, saying what it offers and why to click.' : undefined,
    effort: dMissing.length + dDup.length > 20 ? 'Moderate' : 'Quick win',
    evidence: [...dMissing.slice(0, 4).map((x) => `Missing: ${short(x.url)}`), ...dDup.slice(0, 3).map((x) => `Duplicate: ${short(x.url)}`)] }));

  const h1None = html.filter((x) => x.h1.length === 0);
  const h1Multi = html.filter((x) => x.h1.length > 1);
  checks.push(seo({ id: 'seo-h1', category: 'onpage', topic: 'h1', title: 'Main headings (H1)', weight: 1.5, score: ratioScore(h1None.length + h1Multi.length * 0.5, n, 0.05),
    finding: h1None.length || h1Multi.length
      ? `${[h1None.length && `${h1None.length} pages have no H1`, h1Multi.length && `${h1Multi.length} have more than one`].filter(Boolean).join(', ')}, out of ${html.length}.`
      : 'Every page has exactly one main heading.',
    fix: h1None.length || h1Multi.length ? 'Give each page one H1 that states its topic plainly; use H2s for sections.' : undefined,
    effort: h1None.length || h1Multi.length ? 'Quick win' : undefined,
    evidence: [...h1None, ...h1Multi].slice(0, 6).map((x) => `${short(x.url)}: ${x.h1.length} H1`) }));

  const thin = indexable.filter((x) => x.words < 150);
  checks.push(seo({ id: 'seo-thin', category: 'onpage', title: 'Thin pages', weight: 2, score: ratioScore(thin.length, indexable.length || 1, 0.1),
    finding: thin.length
      ? `${plural(thin.length, 'indexable page has', 'indexable pages have')} fewer than 150 words in the HTML (including menus): ${list(sample(thin.map((x) => x.url)))}.`
      : 'Indexable pages have a reasonable amount of text.',
    why: thin.length ? 'Pages with very little text rarely rank. If the content is loaded by JavaScript, Google may see it late or not at all, and most AI crawlers never see it.' : undefined,
    fix: thin.length ? 'Add useful text to important thin pages (descriptions, FAQs, details), make sure content is in the HTML rather than loaded later, and noindex pages that have no search value.' : undefined,
    effort: thin.length ? 'Moderate' : undefined }));

  const byHash = new Map<string, SeoPage[]>();
  indexable.filter((x) => x.words >= 50).forEach((x) => byHash.set(x.textHash, [...(byHash.get(x.textHash) ?? []), x]));
  const dupGroups = [...byHash.values()].filter((g) => g.length > 1);
  const dupPages = dupGroups.reduce((s, g) => s + g.length - 1, 0);
  checks.push(seo({ id: 'seo-duplicates', category: 'onpage', title: 'Duplicate pages', weight: 1.5, score: ratioScore(dupPages, indexable.length || 1, 0.02),
    finding: dupGroups.length
      ? `${plural(dupPages, 'page is an exact copy', 'pages are exact copies')} of another page, in ${plural(dupGroups.length, 'group')}. Example: ${list(dupGroups[0].slice(0, 3).map((x) => short(x.url)))}.`
      : 'No exact duplicate pages found.',
    why: dupGroups.length ? 'When several URLs show the same content, Google picks one to rank, and it may not be the one you want.' : undefined,
    fix: dupGroups.length ? 'Point duplicates at the main version with a canonical tag, or redirect them.' : undefined,
    effort: dupGroups.length ? 'Quick win' : undefined,
    evidence: dupGroups.slice(0, 4).map((g) => g.map((x) => short(x.url)).join(' = ')) }));

  const imgs = html.reduce((s, x) => s + x.images, 0);
  const noAlt = html.reduce((s, x) => s + x.imagesNoAlt, 0);
  checks.push(seo({ id: 'seo-alt', category: 'onpage', topic: 'alt-text', title: 'Image alt text', weight: 1, score: imgs ? 1 - noAlt / imgs : 1,
    finding: imgs ? `${pct(1 - noAlt / imgs)} of ${imgs} images across the crawl have alt text.` : 'No images found in the HTML.',
    fix: imgs && noAlt / imgs > 0.2 ? 'Add short, descriptive alt text to product, service and team images. It helps Google Images and accessibility.' : undefined,
    effort: imgs && noAlt / imgs > 0.2 ? 'Quick win' : undefined }));

  // ---------------------------------------------------------------- Site structure
  const reachable = html.filter((x) => x.depth !== null);
  const deep = reachable.filter((x) => (x.depth ?? 0) > 3);
  checks.push(seo({ id: 'seo-depth', category: 'structure', title: 'Clicks from the homepage', weight: 2, score: ratioScore(deep.length, reachable.length || 1, 0.1),
    finding: deep.length
      ? `${plural(deep.length, 'page is', 'pages are')} more than 3 clicks from the homepage (e.g. ${list(sample(deep.map((x) => x.url), 3))}).`
      : `Every page we reached is within 3 clicks of the homepage.`,
    why: deep.length ? 'Pages buried deep in the site get crawled less often and are seen as less important.' : undefined,
    fix: deep.length ? 'Link important deep pages from menus, category pages or the homepage.' : undefined,
    effort: deep.length ? 'Moderate' : undefined }));

  const orphans = html.filter((x) => x.depth === null && x.inSitemap && !x.noindex);
  checks.push(seo({ id: 'seo-orphans', category: 'structure', title: 'Pages nothing links to', weight: 2, score: ratioScore(orphans.length, html.length || 1, 0.03),
    finding: orphans.length
      ? `${plural(orphans.length, 'page in your sitemap is', 'pages in your sitemap are')} not linked from any page we crawled (e.g. ${list(sample(orphans.map((x) => x.url), 3))}).${crawl.limitReached ? ' Some may be linked from pages beyond our crawl limit.' : ''}`
      : 'Every sitemap page we checked is linked from somewhere on the site.',
    why: orphans.length ? 'Pages with no internal links are hard for Google to find and are treated as unimportant.' : undefined,
    fix: orphans.length ? 'Link these pages from relevant category or content pages, or remove them from the sitemap if they are no longer needed.' : undefined,
    effort: orphans.length ? 'Moderate' : undefined }));

  const homeN = normUrl(ctx.pages[0].url);
  const weak = indexable.filter((x) => normUrl(x.url) !== homeN && x.depth !== null && (crawl.inlinks.get(x.url) ?? 0) <= 1);
  checks.push(seo({ id: 'seo-inlinks', category: 'structure', title: 'Internal linking', weight: 1.5, score: ratioScore(weak.length, indexable.length || 1, 0.15),
    finding: weak.length ? `${plural(weak.length, 'page has', 'pages have')} only one internal link pointing to ${weak.length === 1 ? 'it' : 'them'}, out of ${indexable.length} indexable pages.` : 'Pages are well linked internally.',
    fix: weak.length > indexable.length * 0.15 ? 'Add contextual links between related pages (e.g. related products, services or articles).' : undefined,
    effort: weak.length > indexable.length * 0.15 ? 'Moderate' : undefined }));

  const badUrls = all.filter((x) => {
    const path = new URL(x.url).pathname;
    return /[A-Z]/.test(path) || /_/.test(path) || x.url.length > 115 || /%20|\s/.test(path);
  });
  checks.push(seo({ id: 'seo-urls', category: 'structure', title: 'URL format', weight: 0.75, score: ratioScore(badUrls.length, all.length || 1, 0.1),
    finding: badUrls.length ? `${plural(badUrls.length, 'URL has', 'URLs have')} capital letters, underscores, spaces or excessive length (e.g. ${list(sample(badUrls.map((x) => x.url), 3))}).` : 'URLs are short, lowercase and readable.',
    fix: badUrls.length > all.length * 0.1 ? 'Use short, lowercase, hyphenated URLs for new pages. Only change existing URLs with redirects in place.' : undefined,
    effort: badUrls.length > all.length * 0.1 ? 'Developer needed' : undefined }));

  // ---------------------------------------------------------------- Speed & mobile
  const ok = speed.filter((s) => !s.error);
  const fieldRes = ok.filter((s) => s.field && (s.field.lcpMs || s.field.inpMs));
  if (fieldRes.length) {
    const worst = (k: 'lcpMs' | 'inpMs' | 'cls') => Math.max(...fieldRes.map((s) => s.field![k] ?? 0));
    const lcp = worst('lcpMs'), inp = worst('inpMs'), cls = worst('cls');
    const rate = (v: number, good: number, poor: number) => (v <= good ? 1 : v <= poor ? 0.55 : 0.1);
    const sc = (rate(lcp, 2500, 4000) + (inp ? rate(inp, 200, 500) : 1) + rate(cls, 0.1, 0.25)) / 3;
    checks.push(seo({ id: 'seo-cwv', category: 'speed', topic: 'speed', title: 'Core Web Vitals (real users)', weight: 4, score: sc,
      finding: `Google's real-user data: loading (LCP) ${(lcp / 1000).toFixed(1)}s, responsiveness (INP) ${inp ? `${Math.round(inp)}ms` : 'n/a'}, visual stability (CLS) ${cls.toFixed(2)}. Good is under 2.5s, 200ms and 0.1.`,
      why: sc < 0.8 ? 'Core Web Vitals are a Google ranking factor and directly affect how many visitors stay.' : undefined,
      fix: sc < 0.8 ? 'Compress and resize large images, defer non-essential scripts (chat widgets, trackers), and reserve space for images and banners so the page does not jump.' : undefined,
      effort: sc < 0.8 ? 'Developer needed' : undefined }));
  }
  if (ok.length) {
    const lcps = ok.map((s) => s.lab.lcpMs ?? 0).filter(Boolean);
    const worstLcp = lcps.length ? Math.max(...lcps) : 0;
    const perf = ok.map((s) => s.performance).filter((x): x is number => typeof x === 'number');
    const minPerf = perf.length ? Math.min(...perf) : undefined;
    const sc = minPerf !== undefined ? minPerf / 100 : worstLcp ? (worstLcp <= 2500 ? 1 : worstLcp <= 4000 ? 0.6 : 0.25) : 0.7;
    const browserOnly = ok.every((s) => s.source === 'browser');
    checks.push(seo({ id: 'seo-speed', category: 'speed', topic: 'speed', title: 'Page speed on mobile', weight: fieldRes.length ? 2 : 4, score: sc,
      finding: `${minPerf !== undefined ? `Lowest Google PageSpeed score: ${minPerf}/100. ` : ''}Slowest main content load (LCP) on mobile: ${worstLcp ? `${(worstLcp / 1000).toFixed(1)}s` : 'not measured'}.${browserOnly ? ' Measured in our own browser on a fast connection; real phones on mobile data are usually slower.' : ''}`,
      why: sc < 0.8 ? 'Slow pages rank lower and lose visitors: most people leave a mobile page that takes more than 3 seconds.' : undefined,
      fix: sc < 0.8 ? 'Compress and resize images (WebP), lazy-load images below the fold, remove unused scripts and enable caching.' : undefined,
      effort: sc < 0.8 ? 'Developer needed' : undefined,
      evidence: ok.map((s) => `${s.label}: ${s.performance !== undefined ? `score ${s.performance}, ` : ''}LCP ${s.lab.lcpMs ? (s.lab.lcpMs / 1000).toFixed(1) + 's' : 'n/a'}, CLS ${s.lab.cls ?? 'n/a'}${s.lab.bytes ? `, ${(s.lab.bytes / 1e6).toFixed(1)} MB` : ''}`) }));
    const heavy = ok.filter((s) => (s.lab.bytes ?? 0) > 4e6);
    if (heavy.length || ok.some((s) => s.lab.bytes)) {
      checks.push(seo({ id: 'seo-weight', category: 'speed', title: 'Page weight', weight: 1, score: heavy.length ? 0.4 : 1,
        finding: heavy.length ? `${list(heavy.map((s) => `${s.label} (${((s.lab.bytes ?? 0) / 1e6).toFixed(1)} MB)`))} ${heavy.length > 1 ? 'are' : 'is'} heavy for mobile.` : 'Page sizes are reasonable for mobile.',
        fix: heavy.length ? 'Compress images and video, and remove scripts the page does not need.' : undefined,
        effort: heavy.length ? 'Moderate' : undefined }));
    }
  } else {
    checks.push(seo({ id: 'seo-speed', category: 'speed', topic: 'speed', title: 'Page speed on mobile', weight: 0, score: 1, status: 'info',
      finding: `Speed could not be measured this time${speed[0]?.error ? ` (${speed[0].error})` : ''}.` }));
  }
  const noViewport = html.filter((x) => !x.hasViewport);
  checks.push(seo({ id: 'seo-mobile', category: 'speed', title: 'Mobile-friendly setup', weight: 1.5, score: noViewport.length ? Math.max(0, 1 - noViewport.length / n * 3) : 1,
    finding: noViewport.length ? `${plural(noViewport.length, 'page is', 'pages are')} missing the mobile viewport tag, so phones show a zoomed-out desktop page.` : 'Pages are set up for mobile screens.',
    fix: noViewport.length ? 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to every page template.' : undefined,
    effort: noViewport.length ? 'Quick win' : undefined }));

  // ---------------------------------------------------------------- Technical
  const httpsOk = ctx.origin.startsWith('https:');
  const mixed = html.filter((x) => x.mixed.length);
  checks.push(seo({ id: 'seo-https', category: 'technical', topic: 'https', title: 'HTTPS and mixed content', weight: 2, score: !httpsOk ? 0 : mixed.length ? 0.6 : 1,
    finding: !httpsOk ? 'The site is not served over HTTPS.' : mixed.length ? `${plural(mixed.length, 'page loads', 'pages load')} images or scripts over insecure http:// (e.g. ${short(mixed[0].url)}).` : 'The site is fully served over HTTPS.',
    fix: !httpsOk ? 'Install an SSL certificate and redirect all traffic to HTTPS.' : mixed.length ? 'Change the http:// resource links to https://.' : undefined,
    effort: !httpsOk ? 'Developer needed' : mixed.length ? 'Quick win' : undefined,
    evidence: mixed.slice(0, 4).map((x) => `${short(x.url)}: ${x.mixed[0]}`) }));

  const jsonErr = html.filter((x) => x.jsonLdErrors > 0);
  const types = new Set(html.flatMap((x) => x.schemaTypes));
  const rich = ['Product', 'BreadcrumbList', 'FAQPage', 'Organization', 'LocalBusiness', 'Article', 'BlogPosting', 'Review', 'AggregateRating', 'Event', 'Recipe', 'VideoObject'].filter((t) => types.has(t));
  checks.push(seo({ id: 'seo-schema', category: 'technical', topic: 'schema-present', title: 'Structured data and rich results', weight: 2, score: jsonErr.length ? 0.4 : rich.length >= 2 ? 1 : rich.length ? 0.75 : 0.3,
    finding: `${rich.length ? `Markup that can earn rich results in Google: ${list(rich)}.` : 'No markup that qualifies for Google rich results (stars, prices, breadcrumbs, FAQs).'}${jsonErr.length ? ` ${plural(jsonErr.length, 'page has', 'pages have')} broken structured data that Google ignores.` : ''}`,
    why: rich.length < 2 || jsonErr.length ? 'Rich results (prices, ratings, breadcrumbs) take more space in Google and get more clicks.' : undefined,
    fix: rich.length < 2 || jsonErr.length ? `${jsonErr.length ? 'Fix the invalid JSON-LD (check with Google\'s Rich Results Test). ' : ''}Add Organization and BreadcrumbList markup site-wide, plus Product, FAQPage or LocalBusiness where relevant.` : undefined,
    effort: rich.length < 2 || jsonErr.length ? 'Moderate' : undefined }));

  const hsts = html.some((x) => x.hsts);
  checks.push(seo({ id: 'seo-hsts', category: 'technical', title: 'Security header (HSTS)', weight: 0.5, score: hsts ? 1 : 0.5,
    finding: hsts ? 'Browsers are told to always use HTTPS (HSTS).' : 'The HSTS security header is not set.',
    fix: hsts ? undefined : `Enable HSTS${p.cdn === 'Cloudflare' ? ' in Cloudflare (SSL/TLS > Edge Certificates)' : ' on your server or CDN'} once the whole site works on HTTPS.`,
    effort: hsts ? undefined : 'Quick win' }));

  const noLang = html.filter((x) => !x.lang);
  checks.push(seo({ id: 'seo-lang', category: 'technical', topic: 'lang', title: 'Language declared', weight: 0.5, score: noLang.length ? 0.3 : 1,
    finding: noLang.length ? `${plural(noLang.length, 'page does', 'pages do')} not declare a language.` : 'Pages declare their language.',
    fix: noLang.length ? 'Add lang="en" (or lang="en-SG") to the <html> tag in your templates.' : undefined,
    effort: noLang.length ? 'Quick win' : undefined }));

  return checks;
}
