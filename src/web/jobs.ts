import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { runAudit } from '../audit.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  url: string;
  client?: string;
  /** Profile id or 'auto' */
  businessType?: string;
  status: JobStatus;
  createdAt: string;
  finishedAt?: string;
  log: string[];
  error?: string;
  // Filled in when done
  clientName?: string;
  host?: string;
  overall?: number;
  grade?: string;
  businessLabel?: string;
}

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const AUDITS = join(DATA_DIR, 'audits');
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_AUDITS) || 1);

const jobs = new Map<string, Job>();
const queue: string[] = [];
let running = 0;

export const jobDir = (id: string) => join(AUDITS, id);
const save = (j: Job) => writeFile(join(jobDir(j.id), 'job.json'), JSON.stringify(j, null, 2));

/** Load past audits from disk. Anything interrupted by a restart is marked failed. */
export async function initJobs() {
  await mkdir(AUDITS, { recursive: true });
  for (const id of await readdir(AUDITS)) {
    const f = join(AUDITS, id, 'job.json');
    if (!existsSync(f)) continue;
    try {
      const j: Job = JSON.parse(await readFile(f, 'utf8'));
      if (j.status === 'queued' || j.status === 'running') {
        j.status = 'failed';
        j.error = 'The server restarted before this audit finished. Please run it again.';
        await save(j);
      }
      jobs.set(j.id, j);
    } catch {}
  }
}

export function getJob(id: string) {
  return jobs.get(id);
}

export function listJobs(limit = 50) {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function queuePosition(id: string) {
  return queue.indexOf(id) + 1;
}

export async function createJob(url: string, client?: string, businessType = 'auto'): Promise<Job> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `${stamp}-${randomBytes(4).toString('hex')}`;
  const job: Job = { id, url, client: client?.trim() || undefined, businessType, status: 'queued', createdAt: new Date().toISOString(), log: [] };
  jobs.set(id, job);
  await mkdir(jobDir(id), { recursive: true });
  await save(job);
  queue.push(id);
  pump();
  return job;
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    running++;
    run(jobs.get(id)!).finally(() => {
      running--;
      pump();
    });
  }
}

async function run(job: Job) {
  job.status = 'running';
  const t0 = Date.now();
  const log = (s: string) => {
    job.log.push(`${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s  ${s}`);
  };
  await save(job);
  try {
    const { result } = await runAudit(job.url, { client: job.client, businessType: job.businessType, dir: jobDir(job.id) }, log);
    Object.assign(job, { status: 'done', clientName: result.clientName, host: result.host, overall: result.overall, grade: result.grade, businessLabel: result.business.label });
    log('Done');
  } catch (e: any) {
    job.status = 'failed';
    job.error = e?.message ?? String(e);
    console.error(`[audit ${job.id}]`, e);
  }
  job.finishedAt = new Date().toISOString();
  await save(job);
}
