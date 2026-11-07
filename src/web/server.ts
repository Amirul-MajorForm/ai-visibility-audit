import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { initJobs, createJob, getJob, listJobs, queuePosition, jobDir } from './jobs.js';
import { homePage, progressPage, failedPage, resultPage, progressOf } from './ui.js';
import { validateTarget } from './safety.js';
import { logoDataUri } from '../report/assets.js';

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.APP_PASSWORD ?? '';
const ID = /^\d{8}-[0-9a-f]{8}$/;

if (!PASSWORD) console.warn('WARNING: APP_PASSWORD is not set. Anyone with the URL can run audits.');

function authorised(req: IncomingMessage): boolean {
  if (!PASSWORD) return true;
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pass);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Request too large');
  }
  return new URLSearchParams(body);
}

function sendFile(res: ServerResponse, path: string, type: string, extra: Record<string, string> = {}) {
  if (!existsSync(path)) return send(res, 404, 'Not found', 'text/plain');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=300', ...extra });
  createReadStream(path).pipe(res);
}

const safeName = (s: string) => s.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-') || 'report';

let logo: string | undefined;

const server = createServer(async (req, res) => {
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;

  if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
  if (!authorised(req)) {
    return send(res, 401, 'Password required', 'text/plain', { 'www-authenticate': 'Basic realm="AI Visibility Audit", charset="UTF-8"' });
  }

  try {
    if (req.method === 'GET' && p === '/') return send(res, 200, homePage(listJobs(), { logo }));

    if (req.method === 'POST' && p === '/audits') {
      const form = await readForm(req);
      const input = form.get('url') ?? '';
      const client = (form.get('client') ?? '').slice(0, 120);
      const v = await validateTarget(input);
      if (!v.ok) return send(res, 400, homePage(listJobs(), { error: v.error, url: input, client, logo }));
      const job = await createJob(v.url, client);
      res.writeHead(303, { location: `/audits/${job.id}` });
      return res.end();
    }

    const m = p.match(/^\/(api\/)?audits\/([^/]+)(\/(report\.(html|pdf|json)))?$/);
    if (req.method === 'GET' && m && ID.test(m[2])) {
      const [, api, id, , file, ext] = m;
      const job = getJob(id);
      if (!job) return send(res, 404, homePage(listJobs(), { error: 'That audit could not be found.', logo }));

      if (api) {
        return send(res, 200, JSON.stringify({ status: job.status, position: queuePosition(id), progress: progressOf(job), log: job.log, error: job.error }), 'application/json');
      }
      if (file) {
        if (job.status !== 'done') return send(res, 409, 'Report not ready', 'text/plain');
        const name = `AI-Visibility-Audit-${safeName(job.clientName ?? 'report')}-${job.createdAt.slice(0, 10)}.${ext}`;
        const types: Record<string, string> = { html: 'text/html; charset=utf-8', pdf: 'application/pdf', json: 'application/json' };
        return sendFile(res, join(jobDir(id), file), types[ext], ext === 'pdf' ? { 'content-disposition': `attachment; filename="${name}"` } : {});
      }
      if (job.status === 'done') return send(res, 200, resultPage(job, logo));
      if (job.status === 'failed') return send(res, 200, failedPage(job, logo));
      return send(res, 200, progressPage(job, queuePosition(id), logo));
    }

    return send(res, 404, homePage(listJobs(), { error: 'Page not found.', logo }));
  } catch (e: any) {
    console.error(e);
    return send(res, 500, 'Something went wrong', 'text/plain');
  }
});

await initJobs();
logo = await logoDataUri('light');
server.listen(PORT, () => console.log(`AI Visibility Audit running on http://localhost:${PORT}`));
