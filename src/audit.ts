import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crawl } from './crawl.js';
import { buildResult } from './score.js';
import { renderReport } from './report/html.js';
import { writePdf } from './report/pdf.js';
import { crawlSite } from './seo/sitecrawl.js';
import { measureSpeed } from './seo/speed.js';
import { fetchSearchData, searchDataAvailable } from './seo/search.js';
import type { AuditResult, ModuleId } from './types.js';

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
  /** Folder to write report.json / report.html / report.pdf into. */
  dir: string | ((r: AuditResult, host: string) => string);
  pdf?: boolean;
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
    const keyKinds = ['products', 'services', 'pricing', 'menu', 'booking', 'features'];
    const speedPages = [ctx.pages[0], ...ctx.pages.filter((p) => p.kind && keyKinds.includes(p.kind)).slice(0, 2)].map((p) => ({ url: p.url, label: p.label }));
    const sp = await measureSpeed(speedPages, log);
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
