#!/usr/bin/env node
import { resolve } from 'node:path';
import { runAudit } from './audit.js';
import type { ModuleId } from './types.js';

function usage(): never {
  console.log(`Usage: npm run audit -- <url> [options]

Options:
  --audits ai,seo     Which audits to run: ai, seo or both (default: ai,seo)
  --client "Name"     Client name for the report (otherwise taken from the site)
  --type <id>         Business type (default: detect). e.g. fitness, food, ecommerce
  --pages <n>         SEO: max pages to crawl (default 150)
  --db <country>      SEO search data country, e.g. sg, my, au (default sg)
  --no-search         SEO: skip Semrush search data (Apify)
  --out <dir>         Output folder (default reports/)
  --no-pdf            Skip the PDF

Writes report.json, report.html and report.pdf. To run the web app instead: npm start`);
  process.exit(1);
}

const args = process.argv.slice(2);
const valueFlags = ['--client', '--out', '--audits', '--type', '--pages', '--db'];
const url = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
if (!url || args.includes('--help')) usage();
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const modules = (opt('--audits') ?? 'ai,seo').split(',').map((s) => s.trim()).filter((s): s is ModuleId => s === 'ai' || s === 'seo');

const t0 = Date.now();
const log = (s: string) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s}`);

const { result, dir } = await runAudit(
  url,
  {
    client: opt('--client'),
    businessType: opt('--type'),
    modules,
    crawlLimit: opt('--pages') ? Number(opt('--pages')) : undefined,
    searchData: !args.includes('--no-search'),
    searchDb: opt('--db'),
    pdf: !args.includes('--no-pdf'),
    dir: (r, host) => resolve(opt('--out') ?? 'reports', `${host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_')}-${r.auditedAt.slice(0, 10)}`),
  },
  log,
);

console.log(`\n  ${result.clientName}`);
for (const sc of result.scorecards) {
  console.log(`  ${sc.name}: ${sc.overall}/100 (${sc.grade})`);
  for (const c of sc.categories) console.log(`    ${c.name.padEnd(22)} ${String(c.score).padStart(3)}`);
}
if (result.searchNote) console.log(`  Search data: ${result.searchNote}`);
console.log(`\n  Report: ${dir}`);
