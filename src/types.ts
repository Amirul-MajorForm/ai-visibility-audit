import type { Comparison } from './compare.js';

export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type ModuleId = 'ai' | 'seo';
export type CategoryId =
  // AI visibility
  | 'access' | 'rendering' | 'schema' | 'content' | 'discovery'
  // SEO
  | 'indexing' | 'onpage' | 'structure' | 'speed' | 'technical';
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
  /** Which audit this check belongs to (missing on audits saved before SEO existed = 'ai'). */
  module?: ModuleId;
  /** Checks with the same topic in both audits are one fix; the priority list shows it once. */
  topic?: string;
  /** Set on a merged priority when the same fix also helps the other audit. */
  alsoAffects?: ModuleId;
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
  /** -1 when the page could not be rendered in a browser */
  renderedWords: number;
  title: string;
  schemaTypes: string[];
  widgets: string[];
  hiddenFacts: string[];
  /** AI view vs visitor view. Absent if the page could not be rendered or was stuck behind a challenge. */
  compare?: Comparison;
}

export interface Scorecard {
  module: ModuleId;
  name: string;
  overall: number;
  grade: string;
  summary: string;
  categories: Category[];
  stats: { label: string; value: string; note: string }[];
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  depth: number | null;
  ms: number;
  redirects: number;
  title: string;
  metaDescription: string;
  h1: number;
  words: number;
  canonical: string;
  noindex: boolean;
  inSitemap: boolean;
  inlinks: number;
  issues: string[];
}

export interface SiteCrawlSummary {
  pagesCrawled: number;
  limit: number;
  limitReached: boolean;
  sitemapUrls: number;
  statusCounts: Record<string, number>;
  pages: CrawledPage[];
}

export interface SpeedResult {
  url: string;
  label: string;
  source: 'pagespeed' | 'browser';
  /** Lighthouse performance score 0..100 (PageSpeed only) */
  performance?: number;
  lab: { lcpMs?: number; cls?: number; tbtMs?: number; fcpMs?: number; ttfbMs?: number; bytes?: number };
  /** Real-user Chrome data (PageSpeed only, when Google has enough traffic data) */
  field?: { lcpMs?: number; inpMs?: number; cls?: number; overall?: string };
  error?: string;
}

export interface SearchData {
  db: string;
  domain: string;
  authorityScore?: number;
  backlinks?: number;
  trafficTrend: { month: string; traffic: number }[];
  topKeywords: { phrase: string; position?: number; volume?: number; url?: string; trafficPercent?: number }[];
  competitors: { domain: string; commonKeywords?: number; level?: number }[];
  topBacklinks: { sourceUrl: string; sourceTitle?: string; authority?: number; anchor?: string; targetUrl?: string }[];
  keywordIdeas: { phrase: string; volume?: number; difficulty?: number; cpc?: number }[];
  seeds: string[];
  notes: string[];
  costUsd?: number;
}

/** A list of URLs affected by one specific issue, for the "Affected URLs" view. */
export interface IssueGroup {
  id: string;
  /** The check this list belongs to */
  checkId: string;
  module: ModuleId;
  label: string;
  description: string;
  severity: 'fail' | 'warn' | 'info';
  /** What the detail column means, e.g. "Title" or "Links from" */
  detailLabel?: string;
  urls: { url: string; detail?: string }[];
}

export interface AuditResult {
  version: string;
  auditedAt: string;
  inputUrl: string;
  finalUrl: string;
  host: string;
  clientName: string;
  business: { id: string; label: string; detected: boolean; confidence: string; reason: string; offering?: string; query?: string };
  modules: ModuleId[];
  scorecards: Scorecard[];
  /** Combined, de-duplicated priorities across the selected audits. */
  priorities: Check[];
  /** Each audit's own top priorities, for the single-audit views. */
  modulePriorities?: Partial<Record<ModuleId, Check[]>>;
  /** URLs behind each issue, grouped. */
  issueGroups?: IssueGroup[];
  summary: string;
  /** AI visibility: crawler access per bot, and the key pages compared raw vs rendered. */
  bots: BotResult[];
  pages: PageResult[];
  /** SEO */
  siteCrawl?: SiteCrawlSummary;
  speed?: SpeedResult[];
  search?: SearchData;
  /** Why search data is missing, if it was requested. */
  searchNote?: string;

  // Legacy fields (audits saved before scorecards). Use normalizeResult().
  overall?: number;
  grade?: string;
  categories?: Category[];
  stats?: { label: string; value: string; note: string }[];
}
