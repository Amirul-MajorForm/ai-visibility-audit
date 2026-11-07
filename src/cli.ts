#!/usr/bin/env node
import { resolve } from 'node:path';
import { runAudit } from './audit.js';

function usage(): never {
  console.log(`Usage: npm run audit -- <url> [--client "Name"] [--out reports] [--no-pdf]

Audits how readable a website is for AI assistants and writes:
  report.json   raw results
  report.html   branded client report
  report.pdf    print version (unless --no-pdf)

To run the web app instead: npm start`);
  process.exit(1);
}

const args = process.argv.slice(2);
const valueFlags = ['--client', '--out'];
const url = args.find((a, i) => !a.startsWith('--') && !valueFlags.includes(args[i - 1]));
if (!url || args.includes('--help')) usage();
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

const t0 = Date.now();
const log = (s: string) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s}`);

const { result, dir } = await runAudit(
  url,
  {
    client: opt('--client'),
    pdf: !args.includes('--no-pdf'),
    dir: (r, host) => resolve(opt('--out') ?? 'reports', `${host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_')}-${r.auditedAt.slice(0, 10)}`),
  },
  log,
);

console.log(`\n  ${result.clientName}: ${result.overall}/100 (${result.grade})`);
for (const c of result.categories) console.log(`    ${c.name.padEnd(22)} ${String(c.score).padStart(3)}`);
console.log(`\n  Report: ${dir}`);
