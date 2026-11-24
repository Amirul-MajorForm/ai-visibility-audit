import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crawl } from './crawl.js';
import { buildResult } from './score.js';
import { renderReport } from './report/html.js';
import { writePdf } from './report/pdf.js';
import { crawlSite } from './seo/sitecrawl.js';
import { measureSpeed } from './seo/speed.js';
import { fetchSearchData, searchDataAvailable } from './seo/search.js';
import type { AuditResult, CompetitorScore, ModuleId } from './types.js';

export interface RunOptions {
  client?: string;
  /** Business profile id, or 'auto' */
  businessType?: string;
  /** Which audits to run. Default: AI visibility only. */
  modules?: ModuleId[];
  /** SEO: max pages to crawl */
  crawlLimit?: number;
  /** SEO: fetch Semrush data via Apify, and for which country database */
  searchData?: boolean;
  searchDb?: string;
  /** Up to 2 competitor URLs to score the same way (scores only, no report). */
  competitors?: string[];
  /** Folder to write report.json / report.html / report.pdf into. */
  dir: string | ((r: AuditResult, host: string) => string);
  pdf?: boolean;
}

const SPEED_KINDS = ['products', 'services', 'pricing', 'menu', 'booking', 'features'];
const speedPagesFor = (ctx: Awaited<ReturnType<typeof crawl>>) =>
  [ctx.pages[0], ...ctx.pages.filter((p) => p.kind && SPEED_KINDS.includes(p.kind)).slice(0, 2)].map((p) => ({ url: p.url, label: p.label }));

export const COMPETITOR_CRAWL_LIMIT = 50;

/** Score a competitor with the same audits and business type as the client. Never throws. */
async function scoreCompetitor(url: string, modules: ModuleId[], businessType: string, log: (s: string) => void): Promise<CompetitorScore> {
  const host = (() => {
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host;
    } catch {
      return url;
    }
  })();
  try {
    const quiet = () => {};
    const ctx = await crawl(url, quiet, { businessType, skipBotTests: !modules.includes('ai') });
    let siteCrawl, speed;
    if (modules.includes('seo')) {
      log(`Competitor ${host}: crawling up to ${COMPETITOR_CRAWL_LIMIT} pages`);
      siteCrawl = await crawlSite(ctx, { limit: COMPETITOR_CRAWL_LIMIT, log: quiet });
      speed = (await measureSpeed(speedPagesFor(ctx), quiet)).results;
    }
    const r = buildResult(ctx, { modules, siteCrawl, speed });
    return {
      url: ctx.pages[0].url,
      host: ctx.host,
      name: r.clientName,
      pagesCrawled: siteCrawl?.pages.length,
      scorecards: r.scorecards.map((sc) => ({ module: sc.module, overall: sc.overall, grade: sc.grade, categories: sc.categories.map((c) => ({ id: c.id, name: c.name, score: c.score })) })),
    };
  } catch (e: any) {
    log(`Competitor ${host}: could not be scored (${e?.message ?? e})`);
    return { url, host, name: host.replace(/^www\./, ''), scorecards: [], error: e?.message ?? String(e) };
  }
}

/** Runs the selected audits and writes the report files. Shared by the CLI and the web app. */
export async function runAudit(url: string, opts: RunOptions, log: (s: string) => void = () => {}) {
  const modules: ModuleId[] = opts.modules?.length ? opts.modules : ['ai'];
  const ctx = await crawl(url, log, { businessType: opts.businessType, skipBotTests: !modules.includes('ai') });

  let siteCrawl, speed, searchNote: string | undefined, search;
  if (modules.includes('seo')) {
    const limit = Math.min(1000, Math.max(10, opts.crawlLimit ?? 150));
    log(`Crawling the site (up to ${limit} pages)`);
    siteCrawl = await crawlSite(ctx, { limit, log });
    log(`Crawled ${siteCrawl.pages.length} pages`);
    // Speed: homepage plus up to two key pages that matter most for this business.
    const sp = await measureSpeed(speedPagesFor(ctx), log);
    speed = sp.results;
    if (opts.searchData !== false && searchDataAvailable()) {
      // Client name and offering come from the same logic the report uses.
      const draft = buildResult(ctx, { client: opts.client, modules: ['ai'] });
      const r = await fetchSearchData({ host: ctx.host, db: opts.searchDb ?? 'sg', brand: draft.clientName, offering: draft.business.offering, log });
      search = r.data;
      searchNote = r.note;
    } else if (opts.searchData) searchNote = 'Search data was requested but no Apify token is configured.';
  }

  log('Scoring');
  const result = buildResult(ctx, { client: opts.client, modules, siteCrawl, speed, search, searchNote });

  const competitorUrls = (opts.competitors ?? []).filter(Boolean).slice(0, 2);
  if (competitorUrls.length) {
    result.competitors = [];
    for (const [i, u] of competitorUrls.entries()) {
      log(`Scoring competitor ${i + 1} of ${competitorUrls.length}: ${u}`);
      result.competitors.push(await scoreCompetitor(u, modules, result.business.id, log));
    }
  }
  const dir = typeof opts.dir === 'string' ? opts.dir : opts.dir(result, ctx.host);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
  log('Building report');
  const html = await renderReport(result);
  await writeFile(join(dir, 'report.html'), html);
  if (opts.pdf !== false) {
    log('Writing PDF');
    await writePdf(html, join(dir, 'report.pdf'), result.clientName, modules.length > 1 ? 'Website Audit' : modules[0] === 'seo' ? 'SEO Audit' : 'AI Visibility Audit');
  }
  return { result, dir };
}
