#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { crawl } from './crawl.js';
import { buildResult } from './score.js';
import { renderReport } from './report/html.js';
import { writePdf } from './report/pdf.js';

function usage(): never {
  console.log(`Usage: npm run audit -- <url> [--client "Name"] [--out reports] [--no-pdf]

Audits how readable a website is for AI assistants and writes:
  report.json   raw results
  report.html   branded client report
  report.pdf    print version (unless --no-pdf)`);
  process.exit(1);
}

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--client' && args[args.indexOf(a) - 1] !== '--out');
if (!url || args.includes('--help')) usage();
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

const t0 = Date.now();
const log = (s: string) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s}`);

const ctx = await crawl(url, log);
const result = buildResult(ctx, opt('--client'));
const slug = ctx.host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_');
const dir = resolve(opt('--out') ?? 'reports', `${slug}-${result.auditedAt.slice(0, 10)}`);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
const html = await renderReport(result);
await writeFile(join(dir, 'report.html'), html);
if (!args.includes('--no-pdf')) {
  log('Writing PDF');
  await writePdf(html, join(dir, 'report.pdf'), result.clientName);
}

console.log(`\n  ${result.clientName}: ${result.overall}/100 (${result.grade})`);
for (const c of result.categories) console.log(`    ${c.name.padEnd(22)} ${String(c.score).padStart(3)}`);
console.log(`\n  Report: ${dir}`);
