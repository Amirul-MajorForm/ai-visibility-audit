import type { IssueGroup } from './types.js';
import type { Ctx } from './crawl.js';
import type { SiteCrawl, SeoPage } from './seo/sitecrawl.js';
import { normUrl } from './seo/sitecrawl.js';
import { hiddenFacts, FACT_LABELS } from './checks/rendering.js';

type G = Omit<IssueGroup, 'urls'> & { urls: IssueGroup['urls'] };

const cut = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Groups of URLs per issue, so the team can open and fix each page. Empty groups are dropped. */
export function buildIssueGroups(ctx: Ctx, crawl?: SiteCrawl, modules: string[] = ['ai']): IssueGroup[] {
  const groups: G[] = [];
  const add = (g: Omit<G, 'urls'>, urls: G['urls']) => urls.length && groups.push({ ...g, urls });

  if (crawl && modules.includes('seo')) {
    const all = crawl.pages;
    const html = all.filter((p) => p.isHtml);
    const from = (p: SeoPage) => {
      const f = crawl.linkedFrom.get(normUrl(p.url));
      return f?.length ? `Linked from ${f.slice(0, 2).map((u) => new URL(u).pathname).join(', ')}${f.length > 2 ? ' and more' : ''}` : 'Found in sitemap';
    };

    add({ id: 'broken', checkId: 'seo-broken', module: 'seo', severity: 'fail', label: 'Broken pages', description: 'URLs that return an error. Fix the page or update the links pointing to it.', detailLabel: 'Status and where it is linked from' },
      all.filter((p) => p.status >= 400 || p.status === 0 || p.redirectLoop).map((p) => ({ url: p.url, detail: `${p.redirectLoop ? 'Redirect loop' : p.status ? `Error ${p.status}` : p.error ?? 'No response'}. ${from(p)}` })));
    add({ id: 'redirect-chains', checkId: 'seo-redirects', module: 'seo', severity: 'warn', label: 'Redirect chains', description: 'URLs that go through more than one redirect before reaching the final page.', detailLabel: 'Ends at' },
      all.filter((p) => p.redirectHops > 1).map((p) => ({ url: p.url, detail: `${p.redirectHops} redirects to ${p.finalUrl}` })));
    add({ id: 'redirected-links', checkId: 'seo-redirects', module: 'seo', severity: 'warn', label: 'Internal links to redirects', description: 'Pages linked from your site that redirect elsewhere. Point the links at the final URL.', detailLabel: 'Redirects to' },
      all.filter((p) => p.redirectHops > 0 && p.status === 200 && (crawl.inlinks.get(p.url) ?? 0) > 0).map((p) => ({ url: p.url, detail: `→ ${p.finalUrl}. ${from(p)}` })));
    add({ id: 'noindex', checkId: 'seo-noindex', module: 'seo', severity: 'warn', label: 'Noindexed pages', description: 'Pages that tell Google not to show them in search. Check each one is intended.', detailLabel: 'Note' },
      html.filter((p) => p.noindex).map((p) => ({ url: p.url, detail: p.inSitemap ? 'Also listed in the sitemap (contradicts noindex)' : '' })));
    add({ id: 'canonical-elsewhere', checkId: 'seo-canonical', module: 'seo', severity: 'warn', label: 'Canonical points to another URL', description: 'Pages that ask Google to rank a different URL instead. Fine for duplicates, a problem for unique pages.', detailLabel: 'Canonical URL' },
      html.filter((p) => p.canonical && normUrl(p.canonical) !== normUrl(p.finalUrl)).map((p) => ({ url: p.url, detail: p.canonical })));
    add({ id: 'no-canonical', checkId: 'seo-canonical', module: 'seo', severity: 'info', label: 'No canonical tag', description: 'Pages without a canonical tag.' },
      html.filter((p) => !p.canonical).map((p) => ({ url: p.url })));
    add({ id: 'sitemap-bad', checkId: 'seo-sitemap', module: 'seo', severity: 'warn', label: 'Sitemap URLs that should not be there', description: 'URLs in the sitemap that redirect, return an error or are noindexed.', detailLabel: 'Problem' },
      all.filter((p) => p.inSitemap && (p.status !== 200 || p.redirectHops > 0 || p.noindex)).map((p) => ({ url: p.url, detail: p.noindex ? 'Noindexed' : p.redirectHops ? `Redirects to ${p.finalUrl}` : `Error ${p.status}` })));

    // Titles
    const byTitle = new Map<string, SeoPage[]>();
    html.forEach((p) => p.title && byTitle.set(p.title.toLowerCase(), [...(byTitle.get(p.title.toLowerCase()) ?? []), p]));
    add({ id: 'title-missing', checkId: 'seo-titles', module: 'seo', severity: 'fail', label: 'Missing title', description: 'Pages with no title tag.' }, html.filter((p) => !p.title).map((p) => ({ url: p.url })));
    add({ id: 'title-duplicate', checkId: 'seo-titles', module: 'seo', severity: 'warn', label: 'Duplicate titles', description: 'Pages sharing the same title. Give each a unique one.', detailLabel: 'Shared title' },
      [...byTitle.values()].filter((g) => g.length > 1).flatMap((g) => g.map((p) => ({ url: p.url, detail: `"${cut(p.title)}" (${g.length} pages)` }))));
    add({ id: 'title-long', checkId: 'seo-titles', module: 'seo', severity: 'warn', label: 'Titles over 65 characters', description: 'Google cuts these off in search results.', detailLabel: 'Title' },
      html.filter((p) => p.title.length > 65).map((p) => ({ url: p.url, detail: `${p.title.length} chars: "${cut(p.title)}"` })));
    add({ id: 'title-short', checkId: 'seo-titles', module: 'seo', severity: 'info', label: 'Very short titles', description: 'Titles under 20 characters rarely describe the page well.', detailLabel: 'Title' },
      html.filter((p) => p.title && p.title.length < 20).map((p) => ({ url: p.url, detail: `"${p.title}"` })));

    // Meta descriptions
    const byDesc = new Map<string, SeoPage[]>();
    html.forEach((p) => p.metaDescription && byDesc.set(p.metaDescription.toLowerCase(), [...(byDesc.get(p.metaDescription.toLowerCase()) ?? []), p]));
    add({ id: 'desc-missing', checkId: 'seo-meta', module: 'seo', severity: 'warn', label: 'Missing meta description', description: 'Pages with no meta description.', detailLabel: 'Title' },
      html.filter((p) => !p.metaDescription).map((p) => ({ url: p.url, detail: p.title ? `"${cut(p.title, 70)}"` : '' })));
    add({ id: 'desc-duplicate', checkId: 'seo-meta', module: 'seo', severity: 'warn', label: 'Duplicate meta descriptions', description: 'Pages sharing the same description.', detailLabel: 'Shared description' },
      [...byDesc.values()].filter((g) => g.length > 1).flatMap((g) => g.map((p) => ({ url: p.url, detail: `"${cut(p.metaDescription, 80)}" (${g.length} pages)` }))));
    add({ id: 'desc-long', checkId: 'seo-meta', module: 'seo', severity: 'info', label: 'Meta descriptions over 160 characters', description: 'Google usually cuts these off.', detailLabel: 'Length' },
      html.filter((p) => p.metaDescription.length > 160).map((p) => ({ url: p.url, detail: `${p.metaDescription.length} chars` })));

    // Headings and content
    add({ id: 'h1-missing', checkId: 'seo-h1', module: 'seo', severity: 'warn', label: 'No H1 heading', description: 'Pages without a main heading.', detailLabel: 'Title' },
      html.filter((p) => p.h1.length === 0).map((p) => ({ url: p.url, detail: p.title ? `"${cut(p.title, 70)}"` : '' })));
    add({ id: 'h1-multiple', checkId: 'seo-h1', module: 'seo', severity: 'warn', label: 'More than one H1', description: 'Pages with several main headings. Keep one H1 and use H2s for sections.', detailLabel: 'H1 headings' },
      html.filter((p) => p.h1.length > 1).map((p) => ({ url: p.url, detail: `${p.h1.length}: ${p.h1.slice(0, 3).map((h) => `"${cut(h, 40)}"`).join(', ')}${p.h1.length > 3 ? '…' : ''}` })));
    add({ id: 'thin', checkId: 'seo-thin', module: 'seo', severity: 'warn', label: 'Thin pages', description: 'Indexable pages with fewer than 150 words in the HTML (including menus).', detailLabel: 'Words' },
      html.filter((p) => !p.noindex && p.words < 150).map((p) => ({ url: p.url, detail: `${p.words} words` })));
    const byHash = new Map<string, SeoPage[]>();
    html.filter((p) => !p.noindex && p.words >= 50).forEach((p) => byHash.set(p.textHash, [...(byHash.get(p.textHash) ?? []), p]));
    add({ id: 'duplicate-content', checkId: 'seo-duplicates', module: 'seo', severity: 'warn', label: 'Duplicate pages', description: 'Pages whose text is identical to another page. Use a canonical tag or redirect.', detailLabel: 'Same content as' },
      [...byHash.values()].filter((g) => g.length > 1).flatMap((g) => g.map((p) => ({ url: p.url, detail: g.filter((x) => x !== p).slice(0, 2).map((x) => new URL(x.url).pathname).join(', ') + (g.length > 3 ? ` and ${g.length - 3} more` : '') }))));
    add({ id: 'alt-missing', checkId: 'seo-alt', module: 'seo', severity: 'info', label: 'Images without alt text', description: 'Pages with images that have no alt text.', detailLabel: 'Images missing alt' },
      html.filter((p) => p.imagesNoAlt > 0).sort((a, b) => b.imagesNoAlt - a.imagesNoAlt).map((p) => ({ url: p.url, detail: `${p.imagesNoAlt} of ${p.images}` })));

    // Structure
    add({ id: 'deep', checkId: 'seo-depth', module: 'seo', severity: 'warn', label: 'More than 3 clicks deep', description: 'Pages that take more than 3 clicks to reach from the homepage.', detailLabel: 'Clicks' },
      html.filter((p) => (p.depth ?? 0) > 3).map((p) => ({ url: p.url, detail: String(p.depth) })));
    add({ id: 'orphans', checkId: 'seo-orphans', module: 'seo', severity: 'warn', label: 'Pages nothing links to', description: 'In the sitemap, but not linked from any page we crawled.' },
      html.filter((p) => p.depth === null && p.inSitemap && !p.noindex).map((p) => ({ url: p.url })));
    const homeN = normUrl(ctx.pages[0].url);
    add({ id: 'weak-links', checkId: 'seo-inlinks', module: 'seo', severity: 'info', label: 'Only one internal link', description: 'Indexable pages with a single internal link pointing to them.', detailLabel: 'Linked from' },
      html.filter((p) => !p.noindex && normUrl(p.url) !== homeN && p.depth !== null && (crawl.inlinks.get(p.url) ?? 0) <= 1).map((p) => ({ url: p.url, detail: crawl.linkedFrom.get(normUrl(p.url))?.[0] ? new URL(crawl.linkedFrom.get(normUrl(p.url))![0]).pathname : '' })));
    add({ id: 'bad-urls', checkId: 'seo-urls', module: 'seo', severity: 'info', label: 'Untidy URLs', description: 'URLs with capitals, underscores, spaces or excessive length.' },
      all.filter((p) => { const path = new URL(p.url).pathname; return /[A-Z]/.test(path) || /_/.test(path) || p.url.length > 115 || /%20|\s/.test(path); }).map((p) => ({ url: p.url })));

    // Technical
    add({ id: 'mixed', checkId: 'seo-https', module: 'seo', severity: 'warn', label: 'Insecure (http://) resources', description: 'Pages loading images or scripts over http:// on an https:// page.', detailLabel: 'First insecure resource' },
      html.filter((p) => p.mixed.length).map((p) => ({ url: p.url, detail: p.mixed[0] })));
    add({ id: 'no-viewport', checkId: 'seo-mobile', module: 'seo', severity: 'fail', label: 'No mobile viewport tag', description: 'Pages that show a zoomed-out desktop layout on phones.' }, html.filter((p) => !p.hasViewport).map((p) => ({ url: p.url })));
    add({ id: 'schema-errors', checkId: 'seo-schema', module: 'seo', severity: 'warn', label: 'Broken structured data', description: 'Pages with JSON-LD that cannot be read.', detailLabel: 'Broken blocks' },
      html.filter((p) => p.jsonLdErrors > 0).map((p) => ({ url: p.url, detail: String(p.jsonLdErrors) })));
    add({ id: 'no-lang', checkId: 'seo-lang', module: 'seo', severity: 'info', label: 'No language declared', description: 'Pages without a lang attribute.' }, html.filter((p) => !p.lang).map((p) => ({ url: p.url })));
  }

  if (modules.includes('ai')) {
    const ratio = (p: Ctx['pages'][number]) => (p.rendered?.words ? Math.min(1, p.raw.words / p.rendered.words) : 1);
    add({ id: 'ai-js-hidden', checkId: 'js-content', module: 'ai', severity: 'fail', label: 'Content hidden from AI crawlers', description: 'Key pages where most text only appears after JavaScript runs.', detailLabel: 'AI can read' },
      ctx.pages.filter((p) => !p.challenged && ratio(p) < 0.7).map((p) => ({ url: p.url, detail: `${Math.round(ratio(p) * 100)}% (${p.raw.words} of ${p.rendered!.words} words)` })));
    add({ id: 'ai-hidden-facts', checkId: 'hidden-facts', module: 'ai', severity: 'warn', label: 'Key facts only shown with JavaScript', description: 'Prices, hours, phone, address or email that AI crawlers cannot read on these pages.', detailLabel: 'Hidden' },
      ctx.pages.filter((p) => hiddenFacts(p).length).map((p) => ({ url: p.url, detail: hiddenFacts(p).map((k) => FACT_LABELS[k]).join(', ') })));
    add({ id: 'ai-h1', checkId: 'h1', module: 'ai', severity: 'warn', label: 'Key pages without exactly one H1', description: 'Key pages AI relies on to understand the business.', detailLabel: 'H1 count' },
      ctx.pages.filter((p) => p.raw.h1.length !== 1).map((p) => ({ url: p.url, detail: String(p.raw.h1.length) })));
    add({ id: 'ai-meta', checkId: 'meta-desc', module: 'ai', severity: 'info', label: 'Key pages without a good description', description: 'Key pages with a missing, too short or too long meta description.' },
      ctx.pages.filter((p) => !(p.raw.metaDescription.length >= 50 && p.raw.metaDescription.length <= 170)).map((p) => ({ url: p.url, detail: p.raw.metaDescription ? `${p.raw.metaDescription.length} chars` : 'Missing' })));
  }

  return groups.map((g) => ({ ...g, urls: g.urls.slice(0, 500) }));
}
