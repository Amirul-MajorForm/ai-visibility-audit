import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crawl } from './crawl.js';
import { buildResult } from './score.js';
import { renderReport } from './report/html.js';
import { writePdf } from './report/pdf.js';
import type { AuditResult } from './types.js';

export interface RunOptions {
  client?: string;
  /** Business profile id, or 'auto' */
  businessType?: string;
  /** Folder to write report.json / report.html / report.pdf into. */
  dir: string | ((r: AuditResult, host: string) => string);
  pdf?: boolean;
}

/** Runs a full Layer 1 audit and writes the report files. Shared by the CLI and the web app. */
export async function runAudit(url: string, opts: RunOptions, log: (s: string) => void = () => {}) {
  const ctx = await crawl(url, log, { businessType: opts.businessType });
  log('Scoring');
  const result = buildResult(ctx, opts.client || undefined);
  const dir = typeof opts.dir === 'string' ? opts.dir : opts.dir(result, ctx.host);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.json'), JSON.stringify(result, null, 2));
  log('Building report');
  const html = await renderReport(result);
  await writeFile(join(dir, 'report.html'), html);
  if (opts.pdf !== false) {
    log('Writing PDF');
    await writePdf(html, join(dir, 'report.pdf'), result.clientName);
  }
  return { result, dir };
}
