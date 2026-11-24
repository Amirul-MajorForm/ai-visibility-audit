import type { AuditResult, Category, CategoryId, Check, ModuleId, Scorecard, SearchData, SiteCrawlSummary, SpeedResult } from './types.js';
import type { Ctx } from './crawl.js';
import type { SiteCrawl } from './seo/sitecrawl.js';
import { normUrl } from './seo/sitecrawl.js';
import { accessChecks } from './checks/access.js';
import { renderingChecks, hiddenFacts, FACT_LABELS } from './checks/rendering.js';
import { schemaChecks, businessNode, fieldsFor } from './checks/schema.js';
import { contentChecks } from './checks/content.js';
import { discoveryChecks } from './checks/discovery.js';
import { seoChecks } from './seo/checks.js';
import { list } from './checks/util.js';
import { typesOf } from './page.js';
import { brandFromTitle, buildExamples } from './examples.js';
import { comparePage } from './compare.js';
import { buildIssueGroups } from './issues.js';

export const CATEGORY_META: Record<CategoryId, { name: string; blurb: string; weight: number; module: ModuleId }> = {
  access: { module: 'ai', name: 'AI Crawler Access', blurb: 'Can ChatGPT, Claude, Gemini and Perplexity get into the site at all?', weight: 30 },
  rendering: { module: 'ai', name: 'Content Visibility', blurb: 'Once in, can they actually read the content without running JavaScript?', weight: 20 },
  content: { module: 'ai', name: 'Content Clarity', blurb: 'Does the site clearly answer what customers ask AI: what, where, when, how much?', weight: 20 },
  schema: { module: 'ai', name: 'Structured Data', blurb: 'Is there a machine-readable fact sheet about the business?', weight: 15 },
  discovery: { module: 'ai', name: 'Discoverability', blurb: 'Can crawlers find, index and load every important page?', weight: 15 },
  indexing: { module: 'seo', name: 'Crawling & Indexing', blurb: 'Can Google reach every page, and is it allowed to index the right ones?', weight: 30 },
  onpage: { module: 'seo', name: 'On-page', blurb: 'Do pages have clear, unique titles, descriptions, headings and enough content?', weight: 25 },
  structure: { module: 'seo', name: 'Site Structure', blurb: 'Are important pages easy to reach and well linked?', weight: 15 },
  speed: { module: 'seo', name: 'Speed & Mobile', blurb: 'Is the site fast and usable on phones?', weight: 20 },
  technical: { module: 'seo', name: 'Technical', blurb: 'HTTPS, structured data for rich results, and other technical basics.', weight: 10 },
};

export const MODULE_NAMES: Record<ModuleId, string> = { ai: 'AI visibility', seo: 'SEO' };

/** AI checks that cover the same fix as an SEO check. */
const AI_TOPICS = new Set(['titles', 'meta-desc', 'h1', 'alt-text', 'lang', 'sitemap', 'canonical', 'https', 'schema-present', 'speed', 'indexable']);

export const VERSION = '0.2.0';

const categoryScore = (checks: Check[]) => {
  const scored = checks.filter((c) => c.status !== 'info' && c.weight > 0);
  const w = scored.reduce((s, c) => s + c.weight, 0);
  return w ? Math.round((scored.reduce((s, c) => s + c.score * c.weight, 0) / w) * 100) : 100;
};

export function grade(score: number) {
  return score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'At risk';
}

/** Expected points gained on its own scorecard if this check were fixed. */
export function impactOf(c: Check, cats: Category[]): number {
  const cat = cats.find((k) => k.id === c.category);
  if (!cat) return 0;
  const w = cat.checks.filter((x) => x.status !== 'info').reduce((s, x) => s + x.weight, 0) || 1;
  const totalW = cats.reduce((s, k) => s + k.weight, 0);
  return ((1 - c.score) * c.weight) / w * (cat.weight / totalW) * 100;
}

/** Impact of a check within the result it belongs to (looks up its scorecard). */
export function impactIn(c: Check, r: Pick<AuditResult, 'scorecards'>): number {
  const sc = r.scorecards.find((s) => s.categories.some((k) => k.id === c.category));
  return sc ? impactOf(c, sc.categories) : 0;
}

function clientName(ctx: Ctx): string {
  const biz = businessNode(ctx);
  const strip = (s: string) => s.replace(/\s[-|–:]\s(Singapore|SG)$/i, '').trim();
  if (biz?.name && typeof biz.name === 'string') return strip(biz.name);
  const home = ctx.pages[0].raw;
  if (home.og['og:site_name']) return strip(home.og['og:site_name']);
  // The part of the title that matches the domain (e.g. "Kee Song" for shop.keesong.com), not the tagline.
  const fromTitle = brandFromTitle(home.title, ctx.host);
  if (fromTitle) return strip(fromTitle);
  const first = home.title.split(/\s[|\-–—:]\s/)[0]?.trim();
  return first && first.split(' ').length <= 4 ? strip(first) : ctx.host.replace(/^(www|shop|store)\./, '');
}

function makeScorecard(module: ModuleId, checks: Check[], name: string, stats: Scorecard['stats'], summaryFor: (s: Omit<Scorecard, 'summary'>) => string): Scorecard {
  const ids = (Object.keys(CATEGORY_META) as CategoryId[]).filter((id) => CATEGORY_META[id].module === module);
  const categories: Category[] = ids.map((id) => {
    const cs = checks.filter((c) => c.category === id);
    return { id, name: CATEGORY_META[id].name, blurb: CATEGORY_META[id].blurb, weight: CATEGORY_META[id].weight, score: categoryScore(cs), checks: cs };
  });
  const totalW = categories.reduce((s, c) => s + c.weight, 0);
  const overall = Math.round(categories.reduce((s, c) => s + c.score * c.weight, 0) / totalW);
  const base = { module, name: MODULE_NAMES[module], overall, grade: grade(overall), categories, stats };
  return { ...base, summary: summaryFor(base) };
}

const lcFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

function scorecardSummary(clientName: string, what: string, s: Omit<Scorecard, 'summary'>, priorities: Check[]) {
  const sorted = [...s.categories].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted.slice(-2).reverse();
  return (
    `${clientName}'s website scores ${s.overall} out of 100 for ${what}, which we rate as "${s.grade}". ` +
    `${best.score >= 70 ? `${best.name} is a relative strength (${best.score}/100). ` : ''}` +
    `The biggest gaps are in ${list(worst.map((c) => `${c.name.toLowerCase().replace(/\bai\b/g, 'AI')} (${c.score}/100)`))}. ` +
    (priorities.length ? `The most valuable fixes: ${list(priorities.slice(0, 3).map((p) => lcFirst(p.title)))}.` : 'There are no significant issues to fix.')
  );
}

export interface BuildOptions {
  client?: string;
  modules: ModuleId[];
  siteCrawl?: SiteCrawl;
  speed?: SpeedResult[];
  speedNote?: string;
  search?: SearchData;
  searchNote?: string;
}

export function buildResult(ctx: Ctx, opts: BuildOptions = { modules: ['ai'] }): AuditResult {
  const modules: ModuleId[] = opts.modules.length ? opts.modules : ['ai'];
  const name = opts.client || clientName(ctx);
  const home = ctx.pages[0].rendered ?? ctx.pages[0].raw;
  ctx.examples = buildExamples({
    title: ctx.pages[0].raw.title || home.title,
    description: ctx.pages[0].raw.metaDescription || home.metaDescription,
    host: ctx.host,
    brand: name,
    categoryNoun: ctx.profile.categoryNoun,
    physical: ctx.profile.physical,
  });

  const scorecards: Scorecard[] = [];
  const byModule: Partial<Record<ModuleId, Check[]>> = {};
  const topPriorities = (checks: Check[], cats: Category[]) =>
    checks.filter((c) => (c.status === 'fail' || c.status === 'warn') && c.fix).sort((a, b) => impactOf(b, cats) - impactOf(a, cats));

  if (modules.includes('ai')) {
    const ai = [...accessChecks(ctx), ...renderingChecks(ctx), ...contentChecks(ctx), ...schemaChecks(ctx), ...discoveryChecks(ctx)].map((c) => ({
      ...c,
      module: 'ai' as const,
      topic: AI_TOPICS.has(c.id) ? c.id : undefined,
    }));
    byModule.ai = ai;
    const answerBots = ctx.bots.filter((b) => b.purpose !== 'training');
    const okBots = answerBots.filter((b) => b.robots === 'allowed' && (b.live === 'ok' || b.live === 'not-tested'));
    const rendered = ctx.pages.filter((p) => p.rendered && p.rendered.words && !p.challenged);
    const vis = rendered.length ? rendered.reduce((s, p) => s + Math.min(1, p.raw.words / p.rendered!.words), 0) / rendered.length : 1;
    const biz = businessNode(ctx);
    const fields = fieldsFor(ctx.profile);
    const bizFields = biz ? fields.filter((f) => f.test(biz)).length : 0;
    scorecards.push(
      makeScorecard('ai', ai, 'AI visibility', [
        { label: 'AI search crawlers confirmed allowed', value: `${okBots.length}/${answerBots.length}`, note: ctx.robotsState === 'broken' ? 'robots.txt is unreadable' : 'robots.txt and live test' },
        { label: 'Content readable without JavaScript', value: rendered.length ? `${Math.round(vis * 100)}%` : 'n/a', note: rendered.length ? `across ${rendered.length} pages` : 'browser check did not run' },
        { label: 'Business details in structured data', value: `${bizFields}/${fields.length}`, note: biz ? `as ${typesOf(biz).join(', ')}` : 'no business markup' },
        { label: 'Key pages reviewed', value: String(ctx.pages.length), note: 'homepage and key pages' },
      ], (s) => scorecardSummary(name, 'AI readiness', s, topPriorities(ai, s.categories))),
    );
  }

  let siteCrawl: SiteCrawlSummary | undefined;
  if (modules.includes('seo') && opts.siteCrawl) {
    const crawl = opts.siteCrawl;
    const seo = seoChecks(ctx, crawl, opts.speed ?? []);
    byModule.seo = seo;
    const html = crawl.pages.filter((p) => p.isHtml);
    const errors = crawl.pages.filter((p) => p.status >= 400 || p.status === 0).length;
    const fastest = (opts.speed ?? []).filter((s) => !s.error);
    const perf = fastest.map((s) => s.performance).filter((x): x is number => typeof x === 'number');
    const lcp = fastest.map((s) => s.lab.lcpMs ?? 0).filter(Boolean);
    const issuesFor = (p: (typeof crawl.pages)[number]) =>
      [
        p.status >= 400 || p.status === 0 ? `Error ${p.status || 'no response'}` : '',
        p.redirectHops ? 'Redirects' : '',
        p.isHtml && !p.title ? 'No title' : '',
        p.isHtml && p.title.length > 65 ? 'Long title' : '',
        p.isHtml && !p.metaDescription ? 'No description' : '',
        p.isHtml && p.h1.length !== 1 ? `${p.h1.length} H1` : '',
        p.noindex ? 'Noindex' : '',
        p.isHtml && p.words < 150 ? 'Thin' : '',
        p.depth === null && p.inSitemap ? 'Not linked' : '',
        p.challenged ? 'Bot challenge' : '',
      ].filter(Boolean);
    siteCrawl = {
      pagesCrawled: crawl.pages.length,
      limit: crawl.limit,
      limitReached: crawl.limitReached,
      sitemapUrls: crawl.sitemapUrls.length,
      statusCounts: crawl.pages.reduce<Record<string, number>>((m, p) => {
        const k = p.status === 0 ? 'Error' : p.redirectHops && p.status === 200 ? 'Redirected' : String(p.status);
        m[k] = (m[k] ?? 0) + 1;
        return m;
      }, {}),
      pages: crawl.pages.map((p) => ({
        url: p.url, finalUrl: p.finalUrl, status: p.status, depth: p.depth, ms: p.ms, redirects: p.redirectHops, title: p.title,
        metaDescription: p.metaDescription, h1: p.h1.length, words: p.words, canonical: p.canonical, noindex: p.noindex, inSitemap: p.inSitemap,
        inlinks: crawl.inlinks.get(normUrl(p.url)) ?? 0, issues: issuesFor(p),
      })),
    };
    scorecards.push(
      makeScorecard('seo', seo, 'SEO', [
        { label: 'Pages crawled', value: String(crawl.pages.length), note: crawl.limitReached ? `limit of ${crawl.limit} reached` : 'whole site' },
        { label: 'Pages with errors', value: String(errors), note: `of ${crawl.pages.length} URLs` },
        { label: 'Mobile speed', value: perf.length ? `${Math.min(...perf)}/100` : lcp.length ? `${(Math.max(...lcp) / 1000).toFixed(1)}s` : 'n/a', note: perf.length ? 'lowest PageSpeed score' : lcp.length ? 'slowest main content load' : 'not measured' },
        { label: 'Pages missing a meta description', value: String(html.filter((p) => !p.metaDescription).length), note: `of ${html.length} pages` },
      ], (s) => scorecardSummary(name, 'SEO', s, topPriorities(seo, s.categories))),
    );
  }

  // Combined priorities: rank each check on its own scorecard, show a shared fix once.
  const candidates = scorecards.flatMap((sc) => topPriorities(byModule[sc.module] ?? [], sc.categories).map((c) => ({ c, impact: impactOf(c, sc.categories) })));
  candidates.sort((a, b) => b.impact - a.impact);
  const priorities: Check[] = [];
  const takenTopics = new Map<string, Check>();
  for (const { c } of candidates) {
    if (c.topic && takenTopics.has(c.topic)) {
      const first = takenTopics.get(c.topic)!;
      if (first.module !== c.module) first.alsoAffects = c.module;
      continue;
    }
    const copy = { ...c };
    if (c.topic) takenTopics.set(c.topic, copy);
    priorities.push(copy);
  }
  const top = priorities.slice(0, modules.length > 1 ? 10 : 7);

  const summary =
    scorecards.length > 1
      ? `${name}'s website scores ${scorecards.map((s) => `${s.overall}/100 for ${s.name}`).join(' and ')}. ` +
        (top.length ? `The most valuable fixes across both: ${list(top.slice(0, 3).map((p) => lcFirst(p.title)))}.` : '')
      : scorecards[0].summary;

  return {
    version: VERSION,
    auditedAt: new Date().toISOString(),
    inputUrl: ctx.inputUrl,
    finalUrl: ctx.pages[0].url,
    host: ctx.host,
    clientName: name,
    business: { id: ctx.profile.id, label: ctx.profile.label, detected: ctx.detection.detected, confidence: ctx.detection.confidence, reason: ctx.detection.reason, offering: ctx.examples.offering, query: ctx.examples.query },
    modules,
    scorecards,
    priorities: top,
    modulePriorities: Object.fromEntries(scorecards.map((sc) => [sc.module, topPriorities(byModule[sc.module] ?? [], sc.categories).slice(0, 7)])),
    issueGroups: buildIssueGroups(ctx, opts.siteCrawl, modules),
    summary,
    bots: modules.includes('ai') ? ctx.bots : [],
    pages: modules.includes('ai')
      ? ctx.pages.map((p) => ({
          url: p.url,
          label: p.label,
          status: p.fetch.status,
          rawWords: p.raw.words,
          renderedWords: p.rendered?.words || -1, // -1 = could not render
          title: p.raw.title,
          schemaTypes: p.raw.schemaTypes,
          widgets: p.widgets,
          hiddenFacts: hiddenFacts(p).map((k) => FACT_LABELS[k]),
          compare: p.challenged ? undefined : comparePage(p.raw, p.rendered, p.failedData),
        }))
      : [],
    siteCrawl,
    speed: opts.speed,
    search: opts.search,
    searchNote: opts.searchNote,
  };
}

/** Audits saved before SEO existed have a single AI score at the top level. */
export function normalizeResult(r: AuditResult): AuditResult {
  if (r.scorecards?.length) {
    // Saved before per-audit priorities existed: derive them from the combined list.
    if (!r.modulePriorities) r = { ...r, modulePriorities: Object.fromEntries(r.modules.map((m) => [m, r.priorities.filter((p) => p.module === m || p.alsoAffects === m)])) };
    return { ...r, issueGroups: r.issueGroups ?? [] };
  }
  const categories = (r.categories ?? []).map((c) => ({ ...c, checks: c.checks.map((k) => ({ ...k, module: k.module ?? ('ai' as const) })) }));
  return {
    ...r,
    modules: ['ai'],
    scorecards: [{ module: 'ai', name: MODULE_NAMES.ai, overall: r.overall ?? 0, grade: r.grade ?? grade(r.overall ?? 0), summary: r.summary, categories, stats: r.stats ?? [] }],
    priorities: (r.priorities ?? []).map((k) => ({ ...k, module: k.module ?? 'ai' })),
    modulePriorities: { ai: (r.priorities ?? []).map((k) => ({ ...k, module: k.module ?? ('ai' as const) })) },
    issueGroups: [],
  };
}

/** A copy of the result limited to one audit, for the single-audit views and reports. */
export function viewResult(input: AuditResult, view: ModuleId | 'all'): AuditResult {
  const r = normalizeResult(input);
  if (view === 'all' || !r.modules.includes(view) || r.modules.length === 1) return r;
  const sc = r.scorecards.find((s) => s.module === view)!;
  return {
    ...r,
    modules: [view],
    scorecards: [sc],
    summary: sc.summary,
    priorities: (r.modulePriorities?.[view] ?? []).map((p) => ({ ...p, alsoAffects: undefined })),
    issueGroups: (r.issueGroups ?? []).filter((g) => g.module === view),
    competitors: r.competitors?.map((c) => ({ ...c, scorecards: c.scorecards.filter((s) => s.module === view) })),
    bots: view === 'ai' ? r.bots : [],
    pages: view === 'ai' ? r.pages : [],
    siteCrawl: view === 'seo' ? r.siteCrawl : undefined,
    speed: view === 'seo' ? r.speed : undefined,
    search: view === 'seo' ? r.search : undefined,
    searchNote: view === 'seo' ? r.searchNote : undefined,
  };
}
