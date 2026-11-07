import type { AuditResult, BotResult, Category, Check, Status } from '../types.js';
import { BRAND } from '../brand.js';
import { impactOf } from '../score.js';
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

function impactLabel(c: Check, cats: Category[]) {
  const v = impactOf(c, cats);
  return v >= 4 ? ['High impact', 'fail'] : v >= 1.5 ? ['Medium impact', 'warn'] : ['Low impact', 'info'];
}

function priorityCard(c: Check, i: number, cats: Category[]) {
  const [imp, impCls] = impactLabel(c, cats);
  const cat = cats.find((k) => k.id === c.category)!;
  return `<article class="prio">
    <div class="prio-num">${String(i + 1).padStart(2, '0')}</div>
    <div class="prio-body">
      <div class="prio-head">
        <h3>${esc(c.title)}</h3>
        <div class="tags">${pill(imp, impCls)}${c.effort ? pill(c.effort, 'neutral') : ''}<span class="cat-tag">${esc(cat.name)}</span></div>
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
      ${c.evidence?.length ? `<ul class="evidence">${c.evidence.slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
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

export async function renderReport(r: AuditResult): Promise<string> {
  const [fonts, logoLight, logoDark] = await Promise.all([embeddedFonts(), logoDataUri('light'), logoDataUri('dark')]);
  const wordmark = (variant: 'light' | 'dark') => {
    const src = variant === 'light' ? logoLight : logoDark;
    return src ? `<img class="logo" src="${src}" alt="${esc(BRAND.name)}">` : `<span class="wordmark">${esc(BRAND.name)}</span>`;
  };
  const date = fmtDate(r.auditedAt);
  const domain = r.host.replace(/^www\./, '');

  const cats = r.categories;
  const catBars = cats
    .map(
      (c) => `<div class="cat">
      <div class="cat-top"><span class="cat-name">${esc(c.name)}</span><span class="cat-score">${c.score}</span></div>
      <div class="bar"><span style="width:${c.score}%;background:${gradeColor(c.score)}"></span></div>
      <div class="cat-blurb">${esc(c.blurb)}</div>
    </div>`,
    )
    .join('');

  const stats = r.stats
    .map((s) => `<div class="stat"><div class="stat-val">${esc(s.value)}</div><div class="stat-label">${esc(s.label)}</div><div class="stat-note">${esc(s.note)}</div></div>`)
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

  const blockedAny = r.bots.some((b) => b.live === 'blocked' || b.live === 'challenged' || b.robots === 'blocked');
  const robotsBroken = r.bots.every((b) => b.robots === 'unknown');

  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Visibility Audit: ${esc(r.clientName)}</title>
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
  .glance,.two,.next{grid-template-columns:1fr}
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
    <div class="kicker">AI Visibility Audit</div>
    <h1>${esc(r.clientName)}</h1>
    <div class="domain">${esc(domain)}</div>
    <div class="cover-score">
      ${ring(r.overall, 150, 13, 'rgba(255,255,255,.14)', '#ffffff', 'OUT OF 100')}
      <div>
        <div class="label">AI readiness score</div>
        <div class="grade">${esc(r.grade)}</div>
        <div class="gnote">How easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand this website.</div>
      </div>
    </div>
  </div>
  <div class="cover-foot">
    <div>Prepared by <strong>${esc(BRAND.name)}</strong><br>${esc(BRAND.website)}</div>
    <div style="text-align:right">${esc(date)}<br>Layer 1: Technical readiness</div>
  </div>
</section>

<section class="sheet">
  <div class="sec-head"><h2>At a glance</h2><span class="sec-num">01 · Summary</span></div>
  <p class="lede">${esc(r.summary)}</p>
  <div class="glance">
    <div class="glance-score">
      ${ring(r.overall, 170, 15, '#e9eaf0', C.ink, 'OVERALL')}
      <div class="grade">${esc(r.grade)}</div>
      <div class="bands">
        <div><span style="background:${C.teal}"></span>85 to 100 · Strong</div>
        <div><span style="background:${C.mint}"></span>70 to 84 · Good</div>
        <div><span style="background:${C.yellow}"></span>50 to 69 · Needs work</div>
        <div><span style="background:${C.coral}"></span>0 to 49 · At risk</div>
      </div>
    </div>
    <div>${catBars}</div>
  </div>
  <div class="stats">${stats}</div>
  ${
    r.priorities.length
      ? `<div class="callout"><strong>Start here:</strong> ${esc(r.priorities[0].title)}. ${esc(r.priorities[0].fix)}</div>`
      : ''
  }
  <div class="running"><span><b>${esc(BRAND.name)}</b> · AI Visibility Audit</span><span>${esc(r.clientName)} · ${esc(date)}</span></div>
</section>

<section class="sheet">
  <div class="sec-head"><h2>Can AI assistants get in?</h2><span class="sec-num">02 · Crawler access</span></div>
  <p class="lede">Every AI assistant sends automated "crawlers" to read websites. We checked two things for each one: whether your <code>robots.txt</code> file permits it, and whether your server actually lets it through when it visits.</p>
  <div class="legend">
    <div><b>Search index</b>Builds the index an assistant searches when answering. Blocked means you are not cited.</div>
    <div><b>Live browsing</b>Visits your page in real time when someone asks the assistant about you.</div>
    <div><b>Model training</b>Teaches future models about your brand. Blocking is a business choice.</div>
  </div>
  <p class="note" style="margin:0 0 12px">${robotsBroken ? 'robots.txt could not be read, so permissions are shown as "Unreadable". ' : ''}"Rules only" crawlers never visit sites; they exist only as robots.txt settings. Live tests imitate each crawler from our servers. Some firewalls treat imitations differently from the real crawler${blockedAny ? ', so confirm any blocks in your CDN or firewall settings' : ''}.</p>
  ${botTable(r.bots)}
  <div class="running"><span><b>${esc(BRAND.name)}</b> · AI Visibility Audit</span><span>${esc(r.clientName)} · ${esc(date)}</span></div>
</section>

<section class="sheet flow">
  <div class="sec-head"><h2>Top priorities</h2><span class="sec-num">03 · Action plan</span></div>
  <p class="lede">These fixes are ranked by how much each would improve the score. Quick wins can usually be done in an afternoon; others need a web developer.</p>
  ${r.priorities.map((c, i) => priorityCard(c, i, cats)).join('')}
</section>

<section class="sheet flow">
  <div class="sec-head"><h2>Detailed findings</h2><span class="sec-num">04 · All checks</span></div>
  ${cats
    .map(
      (c) => `<div class="cat-block">
      <div class="cat-block-head">${ring(c.score, 54, 6, '#e1e3ea', C.ink)}<div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p></div></div>
      <div class="checks">${c.checks.map(checkRow).join('')}</div>
    </div>`,
    )
    .join('')}
</section>

<section class="sheet flow">
  <div class="sec-head"><h2>Pages reviewed</h2><span class="sec-num">05 · Coverage</span></div>
  <p class="lede">We read each page twice: once as raw HTML (what most AI crawlers see) and once in a full browser (what a visitor sees). The gap between the two is content AI may miss.</p>
  ${pagesTable}

  <div class="sec-head" style="margin-top:28px"><h2>About this audit</h2><span class="sec-num">06 · Method</span></div>
  <div class="two">
    <div class="box"><h3>What we checked</h3><ul>
      <li>Access rules and live access for ${r.bots.length} AI and search crawlers</li>
      <li>How much content is readable without JavaScript</li>
      <li>Structured data describing the business, offers and FAQs</li>
      <li>Whether the site answers what customers ask: location, prices, hours, contact</li>
      <li>Sitemap, indexing, canonical tags and server speed</li>
    </ul></div>
    <div class="box"><h3>Good to know</h3><ul>
      <li>This is a point-in-time technical check of ${r.pages.length} key pages, run on ${esc(date)}.</li>
      <li>A strong score means AI <em>can</em> read the site. It does not guarantee AI will recommend it.</li>
      <li>Off-site signals (Google reviews, directories, press, Reddit) also shape AI answers and are not scored here.</li>
      <li>Speed is measured from our test servers and may differ for local visitors.</li>
    </ul></div>
  </div>
  <div class="next">
    <div>
      <div class="kicker">Next step · Layer 2</div>
      <h3>Is AI actually recommending you?</h3>
      <p>The next stage of this audit puts real customer questions to ChatGPT, Claude and Gemini, such as "best personal training studio in Singapore", and measure how often ${esc(r.clientName)} is mentioned against competitors.</p>
    </div>
    <div class="cta">Talk to ${esc(BRAND.name)}</div>
  </div>
</section>

</body>
</html>`;
}
