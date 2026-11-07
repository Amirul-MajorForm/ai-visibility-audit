import type { AuditResult, Category, CategoryId, Check } from './types.js';
import type { Ctx } from './crawl.js';
import { accessChecks } from './checks/access.js';
import { renderingChecks, hiddenFacts, FACT_LABELS } from './checks/rendering.js';
import { schemaChecks, businessNode, BUSINESS_FIELDS } from './checks/schema.js';
import { contentChecks } from './checks/content.js';
import { discoveryChecks } from './checks/discovery.js';
import { list } from './checks/util.js';
import { typesOf } from './page.js';

export const CATEGORY_META: Record<CategoryId, { name: string; blurb: string; weight: number }> = {
  access: { name: 'AI Crawler Access', blurb: 'Can ChatGPT, Claude, Gemini and Perplexity get into the site at all?', weight: 30 },
  rendering: { name: 'Content Visibility', blurb: 'Once in, can they actually read the content without running JavaScript?', weight: 20 },
  content: { name: 'Content Clarity', blurb: 'Does the site clearly answer what customers ask AI: what, where, when, how much?', weight: 20 },
  schema: { name: 'Structured Data', blurb: 'Is there a machine-readable fact sheet about the business?', weight: 15 },
  discovery: { name: 'Discoverability', blurb: 'Can crawlers find, index and load every important page?', weight: 15 },
};

export const VERSION = '0.1.0';

const categoryScore = (checks: Check[]) => {
  const scored = checks.filter((c) => c.status !== 'info' && c.weight > 0);
  const w = scored.reduce((s, c) => s + c.weight, 0);
  return w ? Math.round((scored.reduce((s, c) => s + c.score * c.weight, 0) / w) * 100) : 100;
};

export function grade(score: number) {
  return score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'At risk';
}

/** Expected points gained if this check were fixed, on the 0..100 overall scale. */
export function impactOf(c: Check, cats: Category[]): number {
  const cat = cats.find((k) => k.id === c.category)!;
  const w = cat.checks.filter((x) => x.status !== 'info').reduce((s, x) => s + x.weight, 0);
  const totalW = cats.reduce((s, k) => s + k.weight, 0);
  return ((1 - c.score) * c.weight) / w * (cat.weight / totalW) * 100;
}

function clientName(ctx: Ctx): string {
  const biz = businessNode(ctx);
  const strip = (s: string) => s.replace(/\s[-|–:]\s(Singapore|SG)$/i, '').trim();
  if (biz?.name && typeof biz.name === 'string') return strip(biz.name);
  const home = ctx.pages[0].raw;
  if (home.og['og:site_name']) return home.og['og:site_name'];
  const t = home.title.split(/\s[|\-–:]\s/).map((s) => s.trim()).filter(Boolean);
  return strip(t.length > 1 ? t[t.length - 1] : ctx.host.replace(/^www\./, ''));
}

export function buildResult(ctx: Ctx, clientOverride?: string): AuditResult {
  const all = [...accessChecks(ctx), ...renderingChecks(ctx), ...contentChecks(ctx), ...schemaChecks(ctx), ...discoveryChecks(ctx)];
  const categories: Category[] = (Object.keys(CATEGORY_META) as CategoryId[]).map((id) => {
    const checks = all.filter((c) => c.category === id);
    return { id, ...CATEGORY_META[id], score: categoryScore(checks), checks };
  });
  const totalW = categories.reduce((s, c) => s + c.weight, 0);
  const overall = Math.round(categories.reduce((s, c) => s + c.score * c.weight, 0) / totalW);

  const priorities = all
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .filter((c) => c.fix)
    .sort((a, b) => impactOf(b, categories) - impactOf(a, categories))
    .slice(0, 7);

  const name = clientOverride ?? clientName(ctx);
  const g = grade(overall);
  const sorted = [...categories].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted.slice(-2).reverse();

  const answerBots = ctx.bots.filter((b) => b.purpose !== 'training');
  const okBots = answerBots.filter((b) => b.robots === 'allowed' && (b.live === 'ok' || b.live === 'not-tested'));
  const rendered = ctx.pages.filter((p) => p.rendered && p.rendered.words);
  const vis = rendered.length ? rendered.reduce((s, p) => s + Math.min(1, p.raw.words / p.rendered!.words), 0) / rendered.length : 1;
  const biz = businessNode(ctx);
  const bizFields = biz ? BUSINESS_FIELDS.filter((f) => f.test(biz)).length : 0;

  const summary =
    `${name}'s website scores ${overall} out of 100 for AI readiness, which we rate as "${g}". ` +
    `${best.score >= 70 ? `${best.name} is a relative strength (${best.score}/100). ` : ''}` +
    `The biggest gaps are in ${list(worst.map((c) => `${c.name.toLowerCase().replace(/\bai\b/g, 'AI')} (${c.score}/100)`))}. ` +
    (priorities.length
      ? `The ${Math.min(3, priorities.length)} most valuable fixes are: ${list(priorities.slice(0, 3).map((p) => (/^[A-Z][a-z]/.test(p.title) ? p.title.charAt(0).toLowerCase() + p.title.slice(1) : p.title)))}.`
      : 'There are no significant issues to fix.');

  return {
    version: VERSION,
    auditedAt: new Date().toISOString(),
    inputUrl: ctx.inputUrl,
    finalUrl: ctx.pages[0].url,
    host: ctx.host,
    clientName: name,
    overall,
    grade: g,
    summary,
    categories,
    bots: ctx.bots,
    pages: ctx.pages.map((p) => ({
      url: p.url,
      label: p.label,
      status: p.fetch.status,
      rawWords: p.raw.words,
      renderedWords: p.rendered?.words ?? p.raw.words,
      title: p.raw.title,
      schemaTypes: p.raw.schemaTypes,
      widgets: p.widgets,
      hiddenFacts: hiddenFacts(p).map((k) => FACT_LABELS[k]),
    })),
    priorities,
    stats: [
      { label: 'AI search crawlers confirmed allowed', value: `${okBots.length}/${answerBots.length}`, note: ctx.robotsState === 'broken' ? 'robots.txt is unreadable' : 'robots.txt and live test' },
      { label: 'Content readable without JavaScript', value: `${Math.round(vis * 100)}%`, note: `across ${rendered.length} pages` },
      { label: 'Business details in structured data', value: `${bizFields}/${BUSINESS_FIELDS.length}`, note: biz ? `as ${typesOf(biz).join(', ')}` : 'no business markup' },
      { label: 'Pages reviewed', value: String(ctx.pages.length), note: 'homepage and key pages' },
    ],
  };
}
