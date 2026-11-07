export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type CategoryId = 'access' | 'rendering' | 'schema' | 'content' | 'discovery';
export type Effort = 'Quick win' | 'Moderate' | 'Developer needed';

/** One scored finding. All text fields are client-facing copy. */
export interface Check {
  id: string;
  category: CategoryId;
  title: string;
  status: Status;
  /** 0..1, ignored when status is 'info' */
  score: number;
  /** relative importance within its category */
  weight: number;
  finding: string;
  why?: string;
  fix?: string;
  effort?: Effort;
  evidence?: string[];
}

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
  weight: number;
  score: number; // 0..100
  checks: Check[];
}

export interface BotResult {
  token: string;
  company: string;
  product: string;
  purpose: 'training' | 'search' | 'user';
  robots: 'allowed' | 'blocked' | 'partial' | 'unknown';
  live: 'ok' | 'blocked' | 'challenged' | 'error' | 'not-tested';
  liveDetail?: string;
}

export interface PageResult {
  url: string;
  label: string;
  status: number;
  rawWords: number;
  renderedWords: number;
  title: string;
  schemaTypes: string[];
  widgets: string[];
  hiddenFacts: string[];
}

export interface AuditResult {
  version: string;
  auditedAt: string;
  inputUrl: string;
  finalUrl: string;
  host: string;
  clientName: string;
  overall: number;
  grade: string;
  summary: string;
  categories: Category[];
  bots: BotResult[];
  pages: PageResult[];
  priorities: Check[];
  stats: { label: string; value: string; note: string }[];
}
