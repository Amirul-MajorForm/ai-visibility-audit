import type { AuditResult, BotResult, Category, Check, Scorecard, Status } from '../types.js';
import { BRAND } from '../brand.js';
import { impactOf, impactIn, normalizeResult, MODULE_NAMES } from '../score.js';
import { embeddedFonts, logoDataUri } from './assets.js';

const C = BRAND.colors;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' });

const pathOf = (u: string) => {
  const p = new URL(u).pathname;
  return p === '/' ? '/' : p.replace(/\/$/, '');
};

const gradeColor = (score: number) => (score >= 85 ? C.teal : score >= 70 ? C.mint : score >= 50 ? C.yellow : C.coral);

const STATUS: Record<Status, { label: string; cls: string }> = {
  pass: { label: 'Good', cls: 'pass' },
  warn: { label: 'Improve', cls: 'warn' },
  fail: { label: 'Fix', cls: 'fail' },
  info: { label: 'Note', cls: 'info' },
};

const ROBOTS: Record<BotResult['robots'], [string, string]> = {
  allowed: ['Allowed', 'pass'],
  partial: ['Partly blocked', 'warn'],
  blocked: ['Blocked', 'fail'],
  unknown: ['Unreadable', 'warn'],
};
const LIVE: Record<BotResult['live'], [string, string]> = {
  ok: ['Got through', 'pass'],
  blocked: ['Blocked', 'fail'],
  challenged: ['Challenged', 'fail'],
  error: ['No response', 'warn'],
  'not-tested': ['Rules only', 'info'],
};
const PURPOSE: Record<BotResult['purpose'], string> = {
  search: 'Search index',
  user: 'Live browsing',
  training: 'Model training',
};

function ring(score: number, size: number, stroke: number, track: string, text: string, sub?: string) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - score / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Score ${score} out of 100">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${gradeColor(score)}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="${sub ? '47%' : '50%'}" text-anchor="middle" dominant-baseline="central" class="ring-num" fill="${text}" style="font-size:${size * 0.3}px">${score}</text>
    ${sub ? `<text x="50%" y="68%" text-anchor="middle" class="ring-sub" fill="${text}" style="font-size:${size * 0.085}px">${esc(sub)}</text>` : ''}
  </svg>`;
}

const pill = (label: string, cls: string) => `<span class="pill ${cls}">${esc(label)}</span>`;

function impactLabel(c: Check, r: AuditResult) {
  const v = impactIn(c, r);
  return v >= 4 ? ['High impact', 'fail'] : v >= 1.5 ? ['Medium impact', 'warn'] : ['Low impact', 'info'];
}

function priorityCard(c: Check, i: number, r: AuditResult) {
  const [imp, impCls] = impactLabel(c, r);
  const cat = r.scorecards.flatMap((s) => s.categories).find((k) => k.id === c.category);
  const scope = c.alsoAffects ? 'SEO + AI visibility' : r.modules.length > 1 ? MODULE_NAMES[c.module ?? 'ai'] : '';
  return `<article class="prio">
    <div class="prio-num">${String(i + 1).padStart(2, '0')}</div>
    <div class="prio-body">
      <div class="prio-head">
        <h3>${esc(c.title)}</h3>
        <div class="tags">${pill(imp, impCls)}${c.effort ? pill(c.effort, 'neutral') : ''}${scope ? pill(scope, c.alsoAffects ? 'both' : 'scope') : ''}<span class="cat-tag">${esc(cat?.name ?? '')}</span></div>
      </div>
      <dl>
        <dt>What we found</dt><dd>${esc(c.finding)}</dd>
        ${c.why ? `<dt>Why it matters</dt><dd>${esc(c.why)}</dd>` : ''}
        <dt>What to do</dt><dd class="fix">${esc(c.fix)}</dd>
      </dl>
    </div>
  </article>`;
}

function checkRow(c: Check) {
  const s = STATUS[c.status];
  return `<div class="check">
    <div class="check-status">${pill(s.label, s.cls)}</div>
    <div class="check-body">
      <h4>${esc(c.title)}</h4>
      <p>${esc(c.finding)}</p>
      ${c.evidence?.length ? `<ul class="evidence">${c.evidence.slice(0, 4).map((e) => `<li>${esc(e.length > 150 ? e.slice(0, 147) + '...' : e)}</li>`).join('')}${c.evidence.length > 4 ? `<li>+ ${c.evidence.length - 4} more</li>` : ''}</ul>` : ''}
    </div>
  </div>`;
}

function botTable(bots: BotResult[]) {
  const companies = [...new Set(bots.map((b) => b.company))];
  return `<table class="bots">
    <thead><tr><th>Company</th><th>Crawler</th><th>Used for</th><th>robots.txt</th><th>Live test</th></tr></thead>
    <tbody>
      ${companies
        .map((co) =>
          bots
            .filter((b) => b.company === co)
            .map(
              (b, i, arr) => `<tr class="${i === arr.length - 1 ? 'grp-end' : ''}">
                ${i === 0 ? `<td rowspan="${arr.length}" class="co">${esc(co)}</td>` : ''}
                <td><code>${esc(b.token)}</code><div class="muted small">${esc(b.product)}</div></td>
                <td><span class="purpose ${b.purpose}">${PURPOSE[b.purpose]}</span></td>
                <td>${pill(...ROBOTS[b.robots])}</td>
                <td>${pill(...LIVE[b.live])}</td>
              </tr>`,
            )
            .join(''),
        )
        .join('')}
    </tbody>
  </table>`;
}

export async function renderReport(input: AuditResult): Promise<string> {
  const r = normalizeResult(input);
  const hasAI = r.modules.includes('ai');
  const hasSEO = r.modules.includes('seo');
  const reportTitle = hasAI && hasSEO ? 'Website Audit' : hasSEO ? 'SEO Audit' : 'AI Visibility Audit';
  const reportSub = hasAI && hasSEO ? 'SEO and AI visibility' : hasSEO ? 'Search engine optimisation' : 'Layer 1: Technical readiness';
  const [fonts, logoLight, logoDark] = await Promise.all([embeddedFonts(), logoDataUri('light'), logoDataUri('dark')]);
  const wordmark = (variant: 'light' | 'dark') => {
    const src = variant === 'light' ? logoLight : logoDark;
    return src ? `<img class="logo" src="${src}" alt="${esc(BRAND.name)}">` : `<span class="wordmark">${esc(BRAND.name)}</span>`;
  };
  const date = fmtDate(r.auditedAt);
  const domain = r.host.replace(/^www\./, '');

  const catBars = (cats: Category[]) =>
    cats
      .map(
        (c) => `<div class="cat">
      <div class="cat-top"><span class="cat-name">${esc(c.name)}</span><span class="cat-score">${c.score}</span></div>
      <div class="bar"><span style="width:${c.score}%;background:${gradeColor(c.score)}"></span></div>
      <div class="cat-blurb">${esc(c.blurb)}</div>
    </div>`,
      )
      .join('');
  const statTiles = (stats: Scorecard['stats']) =>
    stats.map((s) => `<div class="stat"><div class="stat-val">${esc(s.value)}</div><div class="stat-label">${esc(s.label)}</div><div class="stat-note">${esc(s.note)}</div></div>`).join('');
  const glance = r.scorecards
    .map(
      (sc) => `<div class="glance-block">
      ${r.scorecards.length > 1 ? `<h3 class="glance-h">${esc(sc.name)}</h3>` : ''}
      <div class="glance">
        <div class="glance-score">
          ${ring(sc.overall, r.scorecards.length > 1 ? 140 : 170, 14, '#e9eaf0', C.ink, sc.module === 'seo' ? 'SEO' : r.scorecards.length > 1 ? 'AI' : 'OVERALL')}
          <div class="grade">${esc(sc.grade)}</div>
        </div>
        <div>${catBars(sc.categories)}</div>
      </div>
      <div class="stats">${statTiles(sc.stats)}</div>
    </div>`,
    )
    .join('');
  const bands = `<div class="bands-row"><span><i style="background:${C.teal}"></i>85 to 100 Strong</span><span><i style="background:${C.mint}"></i>70 to 84 Good</span><span><i style="background:${C.yellow}"></i>50 to 69 Needs work</span><span><i style="background:${C.coral}"></i>0 to 49 At risk</span></div>`;

  // Side-by-side "what AI sees" for the pages where the gap matters most (max 2, to keep the PDF short).
  const ratioOf = (p: (typeof r.pages)[number]) => (p.renderedWords >= 0 ? Math.min(100, Math.round((p.rawWords / Math.max(1, p.renderedWords)) * 100)) : 101);
  const showcase = r.pages
    .filter((p) => p.compare && (ratioOf(p) < 70 || p.compare.conflicts.length) && (p.compare.visitorOnly.length || p.compare.conflicts.length))
    .sort((a, b) => ratioOf(a) - ratioOf(b))
    .slice(0, 2);
  const compareBoxes = showcase
    .map((p) => {
      const c = p.compare!;
      const excerpt = c.aiExcerpt.length > 420 ? c.aiExcerpt.slice(0, 420).replace(/\s+\S*$/, '') + '…' : c.aiExcerpt;
      return `<div class="cmp">
        <div class="cmp-title"><strong>${esc(p.label)}</strong> <span class="muted small">${esc(pathOf(p.url))} · AI can read ${ratioOf(p)}%</span></div>
        ${c.conflicts.map((x) => `<div class="cmp-conflict"><strong>${esc(x.label)} differ:</strong> AI sees ${x.ai.map((v) => `<b class="ai">${esc(v)}</b>`).join(' ')}, visitors see ${x.visitors.slice(0, 4).map((v) => `<b class="vis">${esc(v)}</b>`).join(' ')}</div>`).join('')}
        <div class="cmp-grid">
          <div class="cmp-side"><h4>What AI crawlers see <span>${c.aiWords} words</span></h4><p>${esc(excerpt)}</p></div>
          <div class="cmp-side vis"><h4>Only visitors see <span>${c.visitorOnlyWords} words</span></h4>
            ${c.visitorOnly.length ? `<ul>${c.visitorOnly.slice(0, 14).map((t) => `<li>${esc(t.length > 70 ? t.slice(0, 67) + '...' : t)}</li>`).join('')}</ul>${c.visitorOnlyCount > 14 ? `<p class="more">+ ${c.visitorOnlyCount - 14} more</p>` : ''}` : '<p>Nothing significant.</p>'}
          </div>
        </div>
      </div>`;
    })
    // Close the intro wrapper after the first box, so the heading never sits alone at the bottom of a page.
    .map((box, i) => (i === 0 ? box + '</div>' : box))
    .join('');

  const pagesTable = `<table class="pages">
    <thead><tr><th>Page</th><th class="num">Words in HTML</th><th class="num">After JavaScript</th><th class="num">AI can read</th><th>Notes</th></tr></thead>
    <tbody>${r.pages
      .map((p) => {
        const ok = p.renderedWords >= 0;
        const ratio = ok ? Math.min(100, Math.round((p.rawWords / Math.max(1, p.renderedWords)) * 100)) : 0;
        const notes = [
          p.widgets.length ? `Uses ${p.widgets.join(', ')}` : '',
          p.hiddenFacts.length ? `Hidden from AI: ${p.hiddenFacts.join(', ')}` : '',
        ].filter(Boolean);
        return `<tr>
          <td><strong>${esc(p.label)}</strong><div class="muted small url">${esc(pathOf(p.url))}</div></td>
          <td class="num">${p.rawWords}</td><td class="num">${ok ? p.renderedWords : '<span class="muted">n/a</span>'}</td>
          <td class="num">${ok ? `<span class="ratio" style="--c:${gradeColor(ratio)}">${ratio}%</span>` : '<span class="muted">n/a</span>'}</td>
          <td class="small">${notes.length ? esc(notes.join('. ')) : '<span class="muted">None</span>'}</td>
        </tr>`;
      })
      .join('')}</tbody></table>`;

  // ---------------------------------------------------------------- SEO sections
  const fmtNum = (n?: number) => (n === undefined || n === null ? '–' : n >= 1000 ? n.toLocaleString('en-SG') : String(n));
  const sec = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : '–');
  const vital = (v: number | undefined, good: number, poor: number, f: (x: number) => string) =>
    v === undefined ? '<span class="muted">–</span>' : `<span class="vital ${v <= good ? 'good' : v <= poor ? 'ok' : 'poor'}">${f(v)}</span>`;

  const crawl = r.siteCrawl;
  const crawlSection = crawl
    ? (() => {
        const order = ['200', 'Redirected', '301', '302', '404', '410', '403', '500', 'Error'];
        const counts = Object.entries(crawl.statusCounts).sort((a, b) => (order.indexOf(a[0]) + 99 * +(order.indexOf(a[0]) < 0)) - (order.indexOf(b[0]) + 99 * +(order.indexOf(b[0]) < 0)));
        const label = (k: string) => (k === '200' ? 'OK' : k === 'Redirected' ? 'Redirected' : k === 'Error' ? 'No response' : `Error ${k}`);
        const worst = [...crawl.pages].filter((p) => p.issues.length).sort((a, b) => b.issues.length - a.issues.length).slice(0, 14);
        return `<div class="crawl-top">
          <div class="crawl-kpis">
            <div><b>${crawl.pagesCrawled}</b><span>pages crawled${crawl.limitReached ? ` (limit ${crawl.limit})` : ''}</span></div>
            <div><b>${crawl.sitemapUrls}</b><span>URLs in sitemap</span></div>
            <div><b>${crawl.pages.filter((p) => p.issues.length).length}</b><span>pages with issues</span></div>
          </div>
          <div class="status-bars">${counts.map(([k, n]) => `<div class="sb"><span class="sb-l">${label(k)}</span><span class="sb-bar"><i class="${k === '200' ? 'ok' : k === 'Redirected' ? 'mid' : 'bad'}" style="width:${Math.max(2, (n / crawl.pagesCrawled) * 100)}%"></i></span><span class="sb-n">${n}</span></div>`).join('')}</div>
        </div>
        ${worst.length ? `<h3 class="sub-h">Pages with the most issues</h3>
        <table class="pages"><thead><tr><th>Page</th><th>Issues</th><th class="num">Words</th><th class="num">Clicks deep</th></tr></thead>
        <tbody>${worst.map((p) => `<tr><td class="url small">${esc(pathOf(p.url))}</td><td class="small">${p.issues.map((i) => `<span class="issue">${esc(i)}</span>`).join(' ')}</td><td class="num">${p.words || '–'}</td><td class="num">${p.depth ?? 'not linked'}</td></tr>`).join('')}</tbody></table>` : ''}`;
      })()
    : '';

  const speedRows = (r.speed ?? []).filter((x) => !x.error);
  const psi = speedRows.some((x) => x.source === 'pagespeed');
  const anyField = speedRows.some((x) => x.field);
  const speedSection = speedRows.length
    ? `<table class="pages speed"><thead><tr><th>Page</th>${psi ? '<th class="num">Score</th>' : ''}<th class="num">Main content (LCP)</th><th class="num">Layout shift (CLS)</th>${anyField ? '<th class="num">Real users: LCP / INP</th>' : ''}<th class="num">Page weight</th></tr></thead>
      <tbody>${speedRows.map((x) => `<tr><td><strong>${esc(x.label)}</strong><div class="muted small url">${esc(pathOf(x.url))}</div></td>
        ${psi ? `<td class="num">${x.performance !== undefined ? vital(100 - x.performance, 10, 50, () => String(x.performance)) : '–'}</td>` : ''}
        <td class="num">${vital(x.lab.lcpMs, 2500, 4000, sec)}</td>
        <td class="num">${vital(x.lab.cls, 0.1, 0.25, (v) => v.toFixed(2))}</td>
        ${anyField ? `<td class="num">${x.field ? `${vital(x.field.lcpMs, 2500, 4000, sec)} / ${vital(x.field.inpMs, 200, 500, (v) => `${Math.round(v)}ms`)}` : '<span class="muted">not enough data</span>'}</td>` : ''}
        <td class="num">${x.lab.bytes ? `${(x.lab.bytes / 1e6).toFixed(1)} MB` : '–'}</td></tr>`).join('')}</tbody></table>
      <p class="note">${psi ? 'Measured with Google PageSpeed Insights on a simulated mid-range phone.' : 'Measured in our own browser on a phone-sized screen over a fast connection. Real phones on mobile data are usually slower.'} Good: LCP under 2.5s, CLS under 0.1${anyField ? ', INP under 200ms' : ''}.</p>`
    : '';

  const sd = r.search;
  const dbName = (db: string) => ({ sg: 'Singapore', my: 'Malaysia', id: 'Indonesia', th: 'Thailand', ph: 'Philippines', vn: 'Vietnam', hk: 'Hong Kong', au: 'Australia', uk: 'United Kingdom', us: 'United States' } as Record<string, string>)[db] ?? db.toUpperCase();
  const trafficNonZero = sd?.trafficTrend.some((t) => t.traffic > 0);
  const maxT = sd ? Math.max(1, ...sd.trafficTrend.map((t) => t.traffic)) : 1;
  const searchSection = sd
    ? `<div class="kpi-row">
        <div class="kpi"><b>${fmtNum(sd.authorityScore)}</b><span>Authority score</span><small>Semrush, 0 to 100</small></div>
        <div class="kpi"><b>${fmtNum(sd.backlinks)}</b><span>Backlinks</span><small>links from other sites</small></div>
        <div class="kpi"><b>${sd.topKeywords.length ? fmtNum(sd.topKeywords.filter((k) => (k.position ?? 99) <= 10).length) : '–'}</b><span>Top-10 keywords</span><small>among top keywords shown</small></div>
        <div class="kpi"><b>${trafficNonZero ? fmtNum(sd.trafficTrend[sd.trafficTrend.length - 1]?.traffic) : '–'}</b><span>Est. monthly organic visits</span><small>${trafficNonZero ? 'latest month' : 'no estimate available'}</small></div>
      </div>
      ${trafficNonZero ? `<div class="trend">${sd.trafficTrend.map((t) => `<div class="tb"><i style="height:${Math.max(2, (t.traffic / maxT) * 100)}%"></i><span>${t.month.slice(5)}</span></div>`).join('')}</div>` : ''}
      <div class="two">
        <div class="box"><h3>Keywords ${esc(r.clientName)} ranks for</h3>${sd.topKeywords.length ? `<table class="mini"><thead><tr><th>Keyword</th><th class="num">Pos.</th><th class="num">Searches/mo</th></tr></thead><tbody>${sd.topKeywords.slice(0, 10).map((k) => `<tr><td>${esc(k.phrase)}</td><td class="num">${k.position ?? '–'}</td><td class="num">${fmtNum(k.volume)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No ranking keywords found in this database.</p>'}</div>
        <div class="box"><h3>Organic competitors</h3>${sd.competitors.length ? `<table class="mini"><thead><tr><th>Site</th><th class="num">Shared keywords</th></tr></thead><tbody>${sd.competitors.map((c) => `<tr><td>${esc(c.domain)}</td><td class="num">${fmtNum(c.commonKeywords)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No competitors identified.</p>'}</div>
      </div>
      ${sd.keywordIdeas.length ? `<div class="box" style="margin-top:12px"><h3>Keyword opportunities <span class="muted small">related to ${esc(sd.seeds.map((x) => `"${x}"`).join(' and '))}</span></h3><table class="mini"><thead><tr><th>Keyword</th><th class="num">Searches/mo</th><th class="num">Difficulty</th><th class="num">CPC (USD)</th></tr></thead><tbody>${sd.keywordIdeas.slice(0, 12).map((k) => `<tr><td>${esc(k.phrase)}</td><td class="num">${fmtNum(k.volume)}</td><td class="num">${typeof k.difficulty === 'number' ? k.difficulty : '–'}</td><td class="num">${typeof k.cpc === 'number' ? k.cpc.toFixed(2) : '–'}</td></tr>`).join('')}</tbody></table><p class="note">Difficulty is 0 to 100: under 30 is realistic for a smaller site to rank for.</p></div>` : ''}
      ${sd.topBacklinks.length ? `<div class="box" style="margin-top:12px"><h3>Strongest backlinks</h3><table class="mini"><thead><tr><th>Linking page</th><th>Anchor text</th><th class="num">Authority</th></tr></thead><tbody>${sd.topBacklinks.slice(0, 8).map((b) => `<tr><td class="url">${esc(b.sourceTitle || b.sourceUrl)}<div class="muted small">${esc(new URL(b.sourceUrl).host)}</div></td><td class="small">${esc(b.anchor || '–')}</td><td class="num">${b.authority ?? '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="note">Search data: Semrush estimates for the ${esc(dbName(sd.db))} database, for ${esc(sd.domain)}. These are modelled estimates, not your actual Google traffic, and are not part of the score.${sd.notes.length ? ' ' + esc(sd.notes.join(' ')) : ''}</p>`
    : '';

  let secNo = 0;
  const nextNum = () => String(++secNo).padStart(2, '0');
  const blockedAny = r.bots.some((b) => b.live === 'blocked' || b.live === 'challenged' || b.robots === 'blocked');
  const robotsBroken = r.bots.every((b) => b.robots === 'unknown');

  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${reportTitle}: ${esc(r.clientName)}</title>
<style>
${fonts}
:root{
  --ink:${C.ink};--ink-soft:${C.inkSoft};--mint:${C.mint};--mint-soft:${C.mintSoft};--paper:${C.paper};
  --yellow:${C.yellow};--coral:${C.coral};--teal:${C.teal};--lilac:${C.lilac};
  --line:#dcdde6;--muted:#5d6b75;--card:#ffffff;
  --h:'${BRAND.fonts.heading}',system-ui,sans-serif;--b:'${BRAND.fonts.body}',system-ui,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e7e8ee;color:var(--ink);font-family:var(--b);font-size:14px;line-height:1.55}
h1,h2,h3,h4{font-family:var(--h);font-weight:600;letter-spacing:-0.01em;margin:0}
p{margin:0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.muted{color:var(--muted)} .small{font-size:12px}
.sheet{width:210mm;min-height:297mm;margin:24px auto;background:var(--paper);padding:18mm 16mm;position:relative;box-shadow:0 8px 30px rgba(4,32,44,.12)}
.sheet + .sheet{margin-top:24px}

/* Cover */
.cover{background:var(--ink);color:#fff;display:flex;flex-direction:column;padding:16mm;overflow:hidden}
.cover .wordmark{font-family:var(--h);font-weight:700;font-size:22px;letter-spacing:-0.02em;color:#fff}
.cover .logo{height:30px}
.cover-top{display:flex;justify-content:space-between;align-items:center}
.cover-top .conf{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mint-soft)}
.cover-main{margin-top:auto;margin-bottom:auto}
.kicker{font-family:var(--h);font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--mint);font-weight:600}
.cover h1{font-size:54px;line-height:1.02;margin:14px 0 10px;letter-spacing:-0.03em}
.cover .domain{font-size:18px;color:var(--mint-soft)}
.cover-score{display:flex;align-items:center;gap:22px;margin-top:22mm}
.cover-score .label{font-family:var(--h);font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mint-soft)}
.cover-score .grade{font-family:var(--h);font-size:30px;font-weight:600;margin-top:4px}
.cover-score .gnote{color:#c9d6db;max-width:300px;margin-top:6px;font-size:13px}
.ring-num{font-family:var(--h);font-weight:700}
.ring-sub{font-family:var(--b);font-weight:500;letter-spacing:.06em}
.cover-foot{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,.18);padding-top:14px;font-size:12.5px;color:#c9d6db}
.cover-foot strong{color:#fff;font-weight:600}
.cover .blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.9}
.cover .b1{width:420px;height:420px;right:-160px;top:120px;background:radial-gradient(circle at 30% 30%,var(--mint),transparent 65%)}
.cover .b2{width:300px;height:300px;right:60px;top:-120px;background:radial-gradient(circle at 50% 50%,var(--teal),transparent 65%);opacity:.45}
.cover .b3{width:260px;height:260px;right:-60px;bottom:120px;background:radial-gradient(circle at 50% 50%,var(--yellow),transparent 65%);opacity:.35}
.cover > *{position:relative;z-index:1}

/* Section heads */
.sec-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:18px}
.sec-head h2{font-size:28px}
.sec-head .sec-num{font-family:var(--h);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.lede{font-size:15.5px;line-height:1.6;max-width:165mm;margin-bottom:18px}
.running{position:absolute;bottom:9mm;left:16mm;right:16mm;display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);letter-spacing:.04em}
.running b{font-family:var(--h);color:var(--ink);font-weight:600}

/* Summary */
.glance{display:grid;grid-template-columns:200px 1fr;gap:26px;align-items:start;background:var(--card);border-radius:16px;padding:22px}
.glance-score{text-align:center}
.glance-score .grade{font-family:var(--h);font-size:20px;font-weight:600;margin-top:8px}
.glance-score .bands{margin-top:14px;font-size:11px;color:var(--muted);text-align:left;display:grid;gap:3px}
.glance-score .bands span{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:middle}
.cat{padding:9px 0;border-bottom:1px solid var(--line)}
.cat:last-child{border-bottom:none}
.cat-top{display:flex;justify-content:space-between;font-family:var(--h);font-weight:600;font-size:15px}
.cat-score{font-size:17px}
.bar{height:8px;border-radius:99px;background:#e9eaf0;margin:6px 0 5px;overflow:hidden}
.bar span{display:block;height:100%;border-radius:99px}
.cat-blurb{font-size:12px;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.stat{background:var(--ink);color:#fff;border-radius:14px;padding:14px 14px 12px}
.stat-val{font-family:var(--h);font-size:28px;font-weight:700;color:var(--mint);line-height:1.1}
.stat-label{font-size:12.5px;font-weight:600;margin-top:6px;line-height:1.3}
.stat-note{font-size:11px;color:#a9bcc4;margin-top:3px}
.callout{margin-top:16px;background:var(--yellow);border-radius:14px;padding:14px 16px;font-size:13.5px}
.callout strong{font-family:var(--h)}

/* Pills */
.pill{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;white-space:nowrap;letter-spacing:.01em;line-height:1.5}
.pill.pass{background:#d3efdd;color:#0d4a2c}
.pill.warn{background:var(--yellow);color:#5b4a00}
.pill.fail{background:#fcd5cc;color:#8a2412}
.pill.info{background:#e4e6ee;color:#3b4852}
.pill.neutral{background:transparent;color:var(--ink);border:1px solid #b7bec6}

/* Bots */
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:14px;overflow:hidden;font-size:13px}
th{font-family:var(--h);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;text-align:left;background:var(--ink);color:#fff;padding:9px 12px}
td{padding:3px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
tr.grp-end td{border-bottom:1.5px solid #c4c8d2}
tbody tr:last-child td{border-bottom:none}
td.co{font-family:var(--h);font-weight:600;font-size:13.5px;background:#fafafc;border-right:1px solid var(--line);vertical-align:top;padding-top:8px}
.purpose{font-size:12px;font-weight:500;white-space:nowrap}
.purpose.search,.purpose.user{color:var(--ink)}
.purpose.training{color:var(--muted)}
.legend{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
table.bots .small{line-height:1.25}
.legend div{background:var(--card);border-radius:12px;padding:9px 12px;font-size:12px;line-height:1.4}
.legend b{font-family:var(--h);display:block;font-size:14px;margin-bottom:2px}
.note{font-size:11.5px;color:var(--muted);margin-top:10px}

/* Priorities */
.prio{display:grid;grid-template-columns:54px 1fr;gap:14px;background:var(--card);border-radius:16px;padding:18px 20px;margin-bottom:12px;break-inside:avoid}
.prio-num{font-family:var(--h);font-weight:700;font-size:30px;color:var(--teal);line-height:1}
.prio-head{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}
.prio-head h3{font-size:18px}
.tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cat-tag{font-size:11px;color:var(--muted);margin-left:4px}
dl{margin:0;display:grid;grid-template-columns:120px 1fr;gap:6px 14px;font-size:13.5px}
dt{font-family:var(--h);font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding-top:2px}
dd{margin:0}
dd.fix{background:#e3f4e9;border-left:3px solid var(--teal);padding:7px 10px;border-radius:0 8px 8px 0}

/* Findings */
.cat-block{margin-bottom:22px;break-inside:auto}
.cat-block-head{display:flex;align-items:center;gap:14px;margin-bottom:8px;break-after:avoid}
.cat-block-head h3{font-size:20px}
.cat-block-head p{font-size:12.5px;color:var(--muted)}
.checks{background:var(--card);border-radius:14px;padding:4px 16px}
.check{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);break-inside:avoid}
.check:last-child{border-bottom:none}
.check h4{font-size:14px;margin-bottom:2px}
.check p{font-size:13px}
.evidence{margin:6px 0 0;padding:0;list-style:none;font-size:11.5px;color:var(--muted);font-family:ui-monospace,Menlo,monospace}
.evidence li{padding:1px 0;word-break:break-all}

/* Pages */
.num{text-align:right;white-space:nowrap}
.url{word-break:break-all}
.ratio{font-family:var(--h);font-weight:600;border-bottom:3px solid var(--c);padding-bottom:1px}

/* Multi-audit layout */
.keep,.next{break-inside:avoid}
.cover-scores{display:flex;flex-direction:column;gap:18px;margin-top:16mm}
.cover-scores .cover-score{margin-top:0}
.glance-block{margin-bottom:18px;break-inside:avoid}
.glance-h{font-size:19px;margin:6px 0 10px}
.bands-row{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:var(--muted);margin:2px 0 8px}
.bands-row i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle}
.pill.both{background:var(--ink);color:var(--mint)}
.pill.scope{background:#e4e6ee;color:#3b4852}
.sc-h{font-size:22px;margin:8px 0 14px;padding-bottom:6px;border-bottom:1px solid var(--line);break-after:avoid}
.sc-h span{font-size:15px;color:var(--muted);font-weight:500}
.sub-h{font-size:16px;margin:20px 0 8px;break-after:avoid}

/* Site health */
.crawl-top{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;background:var(--card);border-radius:14px;padding:16px 18px;break-inside:avoid}
.crawl-kpis{display:grid;gap:10px}
.crawl-kpis div{display:flex;align-items:baseline;gap:10px}
.crawl-kpis b{font-family:var(--h);font-size:26px;min-width:64px}
.crawl-kpis span{font-size:12.5px;color:var(--muted)}
.status-bars{display:grid;gap:7px;align-content:center}
.sb{display:grid;grid-template-columns:96px 1fr 40px;gap:8px;align-items:center;font-size:12px}
.sb-bar{height:9px;background:#eceef2;border-radius:99px;overflow:hidden}
.sb-bar i{display:block;height:100%;border-radius:99px}
.sb-bar i.ok{background:var(--teal)} .sb-bar i.mid{background:var(--yellow)} .sb-bar i.bad{background:var(--coral)}
.sb-n{text-align:right;font-weight:600}
.issue{display:inline-block;font-size:10.5px;background:#fdf0d2;color:#6b5300;border-radius:4px;padding:0 5px;margin:1px 0;white-space:nowrap}
.vital{font-weight:600;padding:1px 6px;border-radius:5px}
.vital.good{background:#d3efdd;color:#0d4a2c} .vital.ok{background:var(--yellow);color:#5b4a00} .vital.poor{background:#fcd5cc;color:#8a2412}
table.speed td{vertical-align:middle}

/* Search visibility */
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.kpi{background:var(--ink);color:#fff;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column}
.kpi b{font-family:var(--h);font-size:24px;color:var(--mint);line-height:1.1}
.kpi span{font-size:12.5px;font-weight:600;margin-top:4px}
.kpi small{font-size:10.5px;color:#a9bcc4}
.trend{display:flex;align-items:flex-end;gap:5px;height:90px;background:var(--card);border-radius:12px;padding:10px 14px 22px;margin-bottom:12px}
.tb{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative}
.tb i{display:block;width:100%;background:var(--teal);border-radius:3px 3px 0 0}
.tb span{position:absolute;bottom:-17px;font-size:9.5px;color:var(--muted)}
table.mini{font-size:12px;background:transparent;border-radius:0}
table.mini th{background:transparent;color:var(--muted);padding:4px 6px;border-bottom:1px solid var(--line);font-size:10.5px}
table.mini td{padding:4px 6px}
.box h3 .small{font-family:var(--b);font-weight:400}

/* AI vs visitor comparison */
.cmp-intro{break-inside:avoid}
.cmp-h{font-size:18px;margin:22px 0 4px}
.cmp-lede{font-size:13px;color:var(--muted);margin-bottom:12px}
.cmp{background:var(--card);border-radius:14px;padding:14px 16px;margin-bottom:12px;break-inside:avoid}
.cmp-title{margin-bottom:8px}
.cmp-conflict{background:var(--yellow);border-radius:8px;padding:7px 10px;font-size:12.5px;margin-bottom:8px}
.cmp-conflict b{border-radius:4px;padding:0 4px}
.cmp-conflict b.ai{background:#fcd5cc;color:#8a2412}
.cmp-conflict b.vis{background:#d3efdd;color:#0d4a2c}
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cmp-side{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--muted);background:#fafafc}
.cmp-side.vis{background:#eef8f2;border-color:#cfe9da}
.cmp-side h4{font-size:12.5px;color:var(--ink);margin-bottom:6px;display:flex;justify-content:space-between}
.cmp-side h4 span{font-family:var(--b);font-weight:500;color:var(--muted);font-size:11px}
.cmp-side ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.cmp-side li{background:#fff;border:1px solid #cfe9da;border-radius:5px;padding:1px 6px;color:var(--ink)}
.cmp-side .more{margin-top:5px;font-size:11px}

/* About */
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.box{background:var(--card);border-radius:14px;padding:16px 18px}
.box h3{font-size:16px;margin-bottom:8px}
.box ul{margin:0;padding-left:18px;font-size:13px}
.box li{margin-bottom:5px}
.next{margin-top:18px;background:var(--ink);color:#fff;border-radius:18px;padding:22px 24px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center}
.next .kicker{font-size:11.5px}
.next h3{font-size:22px;margin:6px 0 8px}
.next p{color:#c9d6db;font-size:13.5px}
.next .cta{font-family:var(--h);font-weight:600;background:var(--mint);color:var(--ink);padding:10px 16px;border-radius:99px;white-space:nowrap}

@page{size:A4;margin:14mm 0 16mm}
@page cover{margin:0}
@media print{
  html,body{background:var(--paper)}
  .sheet,.sheet + .sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:2mm 16mm 0;break-before:page}
  .cover{page:cover;height:297mm;padding:16mm;break-before:auto}
  .running{display:none}
}
@media screen and (max-width:820px){
  .sheet{width:auto;min-height:0;margin:0;padding:24px 16px}
  .sheet + .sheet{margin-top:0;border-top:8px solid #e7e8ee}
  .cover{min-height:100vh}
  .cover h1{font-size:38px}
  .glance,.two,.next,.cmp-grid,.crawl-top{grid-template-columns:1fr}
  .kpi-row{grid-template-columns:1fr 1fr}
  .stats,.legend{grid-template-columns:1fr 1fr}
  dl{grid-template-columns:1fr}
  table{display:block;overflow-x:auto}
  .running{position:static;margin-top:20px}
}
</style>
</head>
<body>

<section class="sheet cover">
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="cover-top">${wordmark('light')}<span class="conf">Confidential · Prepared for ${esc(r.clientName)}</span></div>
  <div class="cover-main">
    <div class="kicker">${reportTitle}${hasAI && hasSEO ? ': SEO and AI visibility' : ''}</div>
    <h1>${esc(r.clientName)}</h1>
    <div class="domain">${esc(domain)} · ${esc(r.business.label)}</div>
    <div class="cover-scores">
      ${r.scorecards
        .map(
          (sc) => `<div class="cover-score">
        ${ring(sc.overall, r.scorecards.length > 1 ? 128 : 150, 12, 'rgba(255,255,255,.14)', '#ffffff', 'OUT OF 100')}
        <div>
          <div class="label">${sc.module === 'seo' ? 'SEO score' : 'AI readiness score'}</div>
          <div class="grade">${esc(sc.grade)}</div>
          <div class="gnote">${sc.module === 'seo' ? 'How well search engines can crawl, index and rank this website.' : 'How easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand this website.'}</div>
        </div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
  <div class="cover-foot">
    <div>Prepared by <strong>${esc(BRAND.name)}</strong><br>${esc(BRAND.website)}</div>
    <div style="text-align:right">${esc(date)}<br>${reportSub}</div>
  </div>
</section>

<section class="sheet flow">
  <div class="sec-head"><h2>At a glance</h2><span class="sec-num">${nextNum()} · Summary</span></div>
  <p class="lede">${esc(r.summary)}</p>
  ${glance}
  ${bands}
  ${r.priorities.length ? `<div class="callout"><strong>Start here:</strong> ${esc(r.priorities[0].title)}. ${esc(r.priorities[0].fix)}</div>` : ''}
</section>

${
  hasAI
    ? `<section class="sheet">
  <div class="sec-head"><h2>Can AI assistants get in?</h2><span class="sec-num">${nextNum()} · Crawler access</span></div>
  <p class="lede">Every AI assistant sends automated "crawlers" to read websites. We checked two things for each one: whether your <code>robots.txt</code> file permits it, and whether your server actually lets it through when it visits.</p>
  <div class="legend">
    <div><b>Search index</b>Builds the index an assistant searches when answering. Blocked means you are not cited.</div>
    <div><b>Live browsing</b>Visits your page in real time when someone asks the assistant about you.</div>
    <div><b>Model training</b>Teaches future models about your brand. Blocking is a business choice.</div>
  </div>
  <p class="note" style="margin:0 0 12px">${robotsBroken ? 'robots.txt could not be read, so permissions are shown as "Unreadable". ' : ''}"Rules only" crawlers never visit sites; they exist only as robots.txt settings. Live tests imitate each crawler from our servers. Some firewalls treat imitations differently from the real crawler${blockedAny ? ', so confirm any blocks in your CDN or firewall settings' : ''}.</p>
  ${botTable(r.bots)}
</section>`
    : ''
}

<section class="sheet flow">
  <div class="sec-head"><h2>Top priorities</h2><span class="sec-num">${nextNum()} · Action plan</span></div>
  <p class="lede">These fixes are ranked by how much each would improve the score${r.modules.length > 1 ? 's. Where one fix helps both SEO and AI visibility, it appears once' : ''}. Quick wins can usually be done in an afternoon; others need a web developer.</p>
  ${r.priorities.map((c, i) => priorityCard(c, i, r)).join('')}
</section>

${
  hasSEO && (crawlSection || speedSection)
    ? `<section class="sheet flow">
  <div class="sec-head"><h2>Site health</h2><span class="sec-num">${nextNum()} · SEO crawl</span></div>
  <p class="lede">We crawled the site the way Google does, following internal links from the homepage and checking every page in the sitemap.</p>
  ${crawlSection}
  ${speedSection ? `<div class="keep"><h3 class="sub-h">Speed on mobile</h3>${speedSection}</div>` : ''}
</section>`
    : ''
}

${
  hasSEO && (sd || r.searchNote)
    ? `<section class="sheet flow">
  <div class="sec-head"><h2>Search visibility</h2><span class="sec-num">${nextNum()} · Rankings and links</span></div>
  ${sd ? searchSection : `<p class="lede">${esc(r.searchNote)}</p>`}
</section>`
    : ''
}

<section class="sheet flow">
  <div class="sec-head"><h2>Detailed findings</h2><span class="sec-num">${nextNum()} · All checks</span></div>
  ${r.scorecards
    .map(
      (sc) => `${r.scorecards.length > 1 ? `<h3 class="sc-h">${esc(sc.name)} <span>${sc.overall}/100</span></h3>` : ''}${sc.categories
        .map(
          (c) => `<div class="cat-block">
      <div class="cat-block-head">${ring(c.score, 54, 6, '#e1e3ea', C.ink)}<div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p></div></div>
      <div class="checks">${c.checks.map(checkRow).join('')}</div>
    </div>`,
        )
        .join('')}`,
    )
    .join('')}
</section>

<section class="sheet flow">
  ${
    hasAI
      ? `<div class="sec-head"><h2>Pages reviewed</h2><span class="sec-num">${nextNum()} · AI coverage</span></div>
  <p class="lede">We read each key page twice: once as raw HTML (what most AI crawlers see) and once in a full browser (what a visitor sees). The gap between the two is content AI may miss.</p>
  ${pagesTable}
  ${compareBoxes ? `<div class="cmp-intro"><h3 class="cmp-h">What AI sees vs what visitors see</h3><p class="cmp-lede">The pages with the biggest gap. On the left is the text in the HTML your server sends, which is all most AI crawlers read. On the right is text that only appears after JavaScript runs.</p>${compareBoxes}` : ''}
  <div style="height:28px"></div>`
      : ''
  }
  <div class="sec-head"><h2>About this audit</h2><span class="sec-num">${nextNum()} · Method</span></div>
  <div class="two">
    <div class="box"><h3>What we checked</h3><ul>
      ${hasAI ? `<li>Access rules and live access for ${r.bots.length} AI and search crawlers</li>
      <li>How much content AI can read without running JavaScript</li>
      <li>Structured data describing the business, offers and FAQs</li>
      <li>Whether the site answers what customers ask: location, prices, hours, contact</li>` : ''}
      ${hasSEO ? `<li>A crawl of ${r.siteCrawl?.pagesCrawled ?? 0} pages: errors, redirects, indexing, canonicals and sitemap</li>
      <li>Titles, descriptions, headings, thin and duplicate pages across the whole crawl</li>
      <li>Site structure, mobile speed and technical basics</li>
      ${r.search ? '<li>Search visibility estimates from Semrush</li>' : ''}` : ''}
    </ul></div>
    <div class="box"><h3>Good to know</h3><ul>
      <li>We assessed the site as <strong>${esc(r.business.label)}</strong> (${r.business.detected ? esc(r.business.reason) : 'chosen by the auditor'}), which decides which pages and details we expect.</li>
      <li>This is a point-in-time technical check, run on ${esc(date)}.</li>
      ${hasAI ? '<li>A strong AI score means AI <em>can</em> read the site. It does not guarantee AI will recommend it.</li>' : ''}
      ${hasSEO ? '<li>Google rankings also depend on backlinks, competition and content quality, which a technical audit can only partly measure.</li>' : ''}
      <li>Speed is measured from our test servers and may differ for local visitors.</li>
    </ul></div>
  </div>
  ${
    hasAI
      ? `<div class="next">
    <div>
      <div class="kicker">Next step · Layer 2</div>
      <h3>Is AI actually recommending you?</h3>
      <p>The next stage of this audit puts real customer questions to ChatGPT, Claude and Gemini, ${r.business.query ? `such as "${esc(r.business.query)}", ` : 'the kind your customers ask, '}and measures how often ${esc(r.clientName)} is mentioned against competitors.</p>
    </div>
    <div class="cta">Talk to ${esc(BRAND.name)}</div>
  </div>`
      : ''
  }
</section>

</body>
</html>`;
}
