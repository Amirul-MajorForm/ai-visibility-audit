import { BRAND } from '../brand.js';
import { PROFILES } from '../profiles.js';
import { impactOf } from '../score.js';
import type { AuditResult, BotResult, Check, Status } from '../types.js';
import type { Job } from './jobs.js';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });

const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, '');

/** Score band → CSS class used for colour. */
const band = (s: number) => (s >= 85 ? 'strong' : s >= 70 ? 'good' : s >= 50 ? 'work' : 'risk');

const CSS = `
:root{
  --bg:#f6f7f9;--surface:#fff;--border:#e3e6ea;--border-strong:#cfd4da;
  --text:${BRAND.colors.ink};--muted:#5f6c75;--subtle:#8a959d;
  --primary:${BRAND.colors.ink};--accent:${BRAND.colors.teal};--mint:${BRAND.colors.mint};
  --good-bg:#e5f5ec;--good-fg:#17663f;--warn-bg:#fdf3d1;--warn-fg:#7a5c00;--bad-bg:#fde6e1;--bad-fg:#a3301b;--info-bg:#eef0f3;--info-fg:#45525b;
  --strong:#22a37a;--good:#7cc79a;--work:#e8b931;--risk:#e2674e;
  --radius:10px;--shadow:0 1px 2px rgba(16,24,40,.05);
}
*{box-sizing:border-box}
[hidden]{display:none !important}
html,body{margin:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:inherit}
h1,h2,h3,h4{margin:0;font-weight:600;letter-spacing:-0.01em}
h1{font-size:22px} h2{font-size:16px} h3{font-size:14.5px}
p{margin:0}
.muted{color:var(--muted)} .subtle{color:var(--subtle)} .small{font-size:12.5px}

/* Nav */
.nav{height:56px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:24px;padding:0 24px;position:sticky;top:0;z-index:10}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:600}
.logo .mark{width:26px;height:26px;border-radius:7px;background:var(--primary);color:var(--mint);display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px}
.logo img{height:22px}
.logo .app{color:var(--muted);font-weight:500}
.nav .links{display:flex;gap:4px}
.nav .links a{text-decoration:none;color:var(--muted);padding:6px 10px;border-radius:6px;font-weight:500}
.nav .links a.on,.nav .links a:hover{color:var(--text);background:var(--bg)}
.nav .grow{flex:1}

.page{max-width:1120px;margin:0 auto;padding:28px 24px 64px}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.head p{margin-top:4px}
.crumbs{font-size:12.5px;color:var(--muted);margin-bottom:8px}
.crumbs a{text-decoration:none} .crumbs a:hover{text-decoration:underline}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

/* Controls */
.btn{font:inherit;font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{background:#f1f3f5}
.btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}
.btn.primary:hover{background:#0b3242}
.btn.sm{height:30px;padding:0 10px;font-size:12.5px}
.btn:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,.tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input,select{font:inherit;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);width:100%}
input::placeholder{color:var(--subtle)}
label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px}
.field-hint{font-size:12px;color:var(--subtle);margin-top:4px}

.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.card-pad{padding:18px 20px}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border)}

.alert{border-radius:8px;padding:10px 12px;font-size:13.5px;margin-bottom:14px}
.alert.err{background:var(--bad-bg);color:var(--bad-fg)}
.alert.note{background:var(--info-bg);color:var(--info-fg)}

/* New audit form */
.new-audit{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:12px;align-items:end}

/* Tables */
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;font-weight:600;color:var(--muted);padding:10px 16px;border-bottom:1px solid var(--border);background:#fafbfc;white-space:nowrap}
td{padding:12px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr.link{cursor:pointer}
tbody tr.link:hover td{background:#fafbfc}
td.num,th.num{text-align:right}
.row-title{font-weight:600;text-decoration:none}
.row-title:hover{text-decoration:underline}
.empty{padding:36px 20px;text-align:center;color:var(--muted)}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;line-height:1.6}
.badge.pass{background:var(--good-bg);color:var(--good-fg)}
.badge.warn{background:var(--warn-bg);color:var(--warn-fg)}
.badge.fail{background:var(--bad-bg);color:var(--bad-fg)}
.badge.info{background:var(--info-bg);color:var(--info-fg)}
.badge.outline{background:transparent;border:1px solid var(--border-strong);color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);background:var(--surface);border:1px solid var(--border);padding:3px 10px;border-radius:999px}

/* Score */
.score-num{font-family:'Space Grotesk',sans-serif;font-weight:700;font-variant-numeric:tabular-nums}
.meter{height:6px;border-radius:99px;background:#eceef1;overflow:hidden}
.meter span{display:block;height:100%;border-radius:99px}
.meter .strong,.c-strong{background:var(--strong)} .meter .good,.c-good{background:var(--good)} .meter .work,.c-work{background:var(--work)} .meter .risk,.c-risk{background:var(--risk)}
.score-cell{display:flex;align-items:center;gap:10px;min-width:130px}
.score-cell .score-num{width:28px;text-align:right}
.score-cell .meter{flex:1;max-width:90px}

.overview{display:grid;grid-template-columns:280px 1fr;gap:16px;margin-bottom:20px}
.total{padding:20px}
.total .big{font-size:56px;line-height:1;margin:6px 0 8px}
.total .big small{font-size:18px;color:var(--subtle);font-weight:500}
.total .counts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.cats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cat{padding:14px 14px 12px;text-align:left;font:inherit;color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:8px}
.cat:hover{border-color:var(--border-strong)}
.cat .name{font-size:12.5px;font-weight:600;color:var(--muted);min-height:36px}
.cat .score-num{font-size:26px;line-height:1}
.cat .hint{font-size:11.5px;color:var(--subtle)}

/* Tabs */
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{font:inherit;font-weight:600;color:var(--muted);background:none;border:0;border-bottom:2px solid transparent;padding:10px 14px;cursor:pointer;white-space:nowrap;margin-bottom:-1px}
.tab:hover{color:var(--text)}
.tab[aria-selected=true]{color:var(--text);border-bottom-color:var(--accent)}
.tab .count{font-weight:500;color:var(--subtle);margin-left:4px}
.panel[hidden]{display:none}

/* Priorities */
.prio{border-bottom:1px solid var(--border)}
.prio:last-child{border-bottom:0}
.prio summary{list-style:none;display:grid;grid-template-columns:32px 1fr auto;gap:12px;align-items:center;padding:14px 20px;cursor:pointer}
.prio summary::-webkit-details-marker{display:none}
.prio summary:hover{background:#fafbfc}
.prio .rank{width:26px;height:26px;border-radius:50%;background:var(--bg);display:grid;place-items:center;font-weight:700;font-size:12.5px;color:var(--muted)}
.prio .meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
.prio .chev{color:var(--subtle);transition:transform .15s}
.prio[open] .chev{transform:rotate(90deg)}
.prio .body{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:2px 20px 18px 64px}
.prio .body h4{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--subtle);margin-bottom:4px}
.prio .fix{background:var(--good-bg);border-radius:8px;padding:10px 12px}
.prio .fix h4{color:var(--good-fg)}

/* Checks */
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border)}
.seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:8px;overflow:hidden}
.seg button{font:inherit;font-size:12.5px;font-weight:600;border:0;background:var(--surface);padding:6px 11px;cursor:pointer;color:var(--muted);border-right:1px solid var(--border)}
.seg button:last-child{border-right:0}
.seg button[aria-pressed=true]{background:var(--primary);color:#fff}
.toolbar select{width:auto;height:32px}
.check{display:grid;grid-template-columns:86px 1fr;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border)}
.check:last-child{border-bottom:0}
.check .cat-label{font-size:11.5px;color:var(--subtle);font-weight:500;margin-left:6px}
.check p{color:var(--muted);margin-top:2px}
.check .fixline{margin-top:6px;font-size:13px}
.check .fixline b{color:var(--good-fg)}
.check details{margin-top:6px}
.check details summary{font-size:12px;color:var(--subtle);cursor:pointer}
.check ul{margin:6px 0 0;padding:0;list-style:none;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--muted)}
.check li{word-break:break-all;padding:1px 0}

/* Business type */
.biz{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px;margin-bottom:20px}
.biz form{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.biz select{width:auto;height:32px}

/* Progress */
.steps{list-style:none;margin:0;padding:0}
.steps li{display:flex;align-items:center;gap:12px;padding:9px 0;color:var(--subtle)}
.steps li .ic{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--border-strong);display:grid;place-items:center;flex:none;font-size:11px}
.steps li.done{color:var(--text)}
.steps li.done .ic{background:var(--accent);border-color:var(--accent);color:#fff}
.steps li.active{color:var(--text);font-weight:600}
.steps li.active .ic{border-color:var(--accent);border-top-color:transparent;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
pre.log{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);background:var(--bg);border-radius:8px;padding:10px 12px;max-height:220px;overflow:auto;white-space:pre-wrap;margin:8px 0 0}

code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}

@media (max-width:960px){
  .overview{grid-template-columns:1fr}
  .cats{grid-template-columns:repeat(3,1fr)}
  .new-audit{grid-template-columns:1fr 1fr}
  .prio .body{grid-template-columns:1fr;padding-left:20px}
}
@media (max-width:640px){
  .nav{padding:0 16px;gap:12px} .nav .links,.logo .app{display:none}
  .page{padding:20px 16px 48px}
  .cats{grid-template-columns:1fr 1fr}
  .new-audit{grid-template-columns:1fr}
  .hide-sm{display:none}
  td,th{padding:10px 12px}
  .check{grid-template-columns:1fr;gap:6px}
  .biz select{width:100%}
  .tab{padding:10px 10px}
  .table-scroll{overflow-x:auto}
}
`;

function layout(title: string, body: string, opts: { logo?: string; nav?: 'audits' } = {}) {
  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · AI Visibility Audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<nav class="nav">
  <a class="logo" href="/">${opts.logo ? `<img src="${opts.logo}" alt="${esc(BRAND.name)}">` : `<span class="mark">M</span><span>${esc(BRAND.name)}</span>`}<span class="app">AI Visibility Audit</span></a>
  <div class="links"><a href="/" class="${opts.nav === 'audits' ? 'on' : ''}">Audits</a></div>
  <div class="grow"></div>
  <a class="btn primary sm" href="/#new">+ New audit</a>
</nav>
${body}
</body>
</html>`;
}

function businessSelect(name: string, selected = 'auto') {
  return `<select name="${name}" id="${name}">
    <option value="auto"${selected === 'auto' ? ' selected' : ''}>Detect automatically</option>
    ${PROFILES.map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}
  </select>`;
}

function scoreCell(score: number) {
  return `<div class="score-cell"><span class="score-num">${score}</span><div class="meter"><span class="${band(score)}" style="width:${score}%"></span></div></div>`;
}

function statusBadge(j: Job) {
  if (j.status === 'failed') return '<span class="badge fail"><span class="dot"></span>Failed</span>';
  if (j.status === 'running') return '<span class="badge warn"><span class="dot"></span>Running</span>';
  if (j.status === 'queued') return '<span class="badge info"><span class="dot"></span>Queued</span>';
  return '';
}

// ---------------------------------------------------------------- Home

export function homePage(jobs: Job[], opts: { error?: string; url?: string; client?: string; businessType?: string; logo?: string } = {}) {
  const rows = jobs
    .map((j) => {
      const name = j.clientName ?? j.client ?? hostOf(j.url);
      const search = `${name} ${hostOf(j.url)} ${j.businessLabel ?? ''}`.toLowerCase();
      return `<tr class="link" data-href="/audits/${esc(j.id)}" data-search="${esc(search)}">
        <td><a class="row-title" href="/audits/${esc(j.id)}">${esc(name)}</a><div class="subtle small">${esc(hostOf(j.url))}</div></td>
        <td class="hide-sm muted">${esc(j.businessLabel ?? '')}</td>
        <td>${j.status === 'done' ? scoreCell(j.overall ?? 0) : statusBadge(j)}</td>
        <td class="hide-sm muted">${esc(j.grade ?? '')}</td>
        <td class="muted small">${esc(fmt(j.createdAt))}</td>
        <td class="num">${j.status === 'done' ? `<a class="btn sm" href="/audits/${esc(j.id)}/report.pdf" title="Download PDF">PDF</a>` : ''}</td>
      </tr>`;
    })
    .join('');

  return layout(
    'Audits',
    `<main class="page">
  <div class="head">
    <div><h1>Audits</h1><p class="muted">Check how easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand a website.</p></div>
  </div>

  <section class="card card-pad" id="new" style="margin-bottom:20px">
    <h2 style="margin-bottom:14px">New audit</h2>
    ${opts.error ? `<div class="alert err">${esc(opts.error)}</div>` : ''}
    <form class="new-audit" method="post" action="/audits">
      <div><label for="url">Website</label><input id="url" name="url" placeholder="example.com.sg" value="${esc(opts.url ?? '')}" required inputmode="url" autocomplete="off" ${opts.error || !jobs.length ? 'autofocus' : ''}></div>
      <div><label for="client">Client name <span class="subtle">(optional)</span></label><input id="client" name="client" placeholder="Taken from the site" value="${esc(opts.client ?? '')}" autocomplete="off"></div>
      <div><label for="business_type">Business type</label>${businessSelect('business_type', opts.businessType)}</div>
      <button class="btn primary" type="submit" style="height:36px">Run audit</button>
    </form>
    <p class="field-hint">Takes about a minute. The business type decides which pages and details are expected.</p>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>All audits <span class="subtle" style="font-weight:500">${jobs.length}</span></h2>
      ${jobs.length ? '<input id="filter" type="search" placeholder="Filter by client, site or type" style="max-width:260px;height:32px">' : ''}
    </div>
    ${
      jobs.length
        ? `<div class="table-scroll"><table>
            <thead><tr><th>Client</th><th class="hide-sm">Business type</th><th>Score</th><th class="hide-sm">Rating</th><th>Run</th><th></th></tr></thead>
            <tbody id="rows">${rows}</tbody></table></div>
            <div class="empty" id="nomatch" hidden>No audits match that filter.</div>`
        : '<div class="empty">No audits yet. Run your first one above.</div>'
    }
  </section>
</main>
<script>
document.querySelectorAll('tr.link').forEach(function(tr){tr.addEventListener('click',function(e){if(e.target.closest('a,button'))return;location.href=tr.dataset.href})});
var f=document.getElementById('filter');
if(f)f.addEventListener('input',function(){var q=f.value.trim().toLowerCase(),n=0;document.querySelectorAll('#rows tr').forEach(function(tr){var m=!q||tr.dataset.search.indexOf(q)>-1;tr.hidden=!m;if(m)n++});document.getElementById('nomatch').hidden=n>0});
</script>`,
    { logo: opts.logo, nav: 'audits' },
  );
}

// ---------------------------------------------------------------- Progress

const STAGES: { key: string; label: string }[] = [
  { key: 'Fetching', label: 'Loading the website' },
  { key: 'Checking robots', label: 'Reading robots.txt' },
  { key: 'Rendering homepage', label: 'Rendering the homepage in a browser' },
  { key: 'Business type', label: 'Identifying the business type' },
  { key: 'Analysing', label: 'Reviewing key pages' },
  { key: 'Testing access', label: 'Visiting as each AI crawler' },
  { key: 'Looking for sitemap', label: 'Checking sitemap and llms.txt' },
  { key: 'Scoring', label: 'Scoring' },
  { key: 'Building report', label: 'Building the client report' },
];

function stageIndex(job: Job) {
  let idx = -1;
  for (const line of job.log) {
    const i = STAGES.findIndex((s) => line.includes(s.key));
    if (i > idx) idx = i;
  }
  return idx;
}

export function progressOf(job: Job): number {
  if (job.status === 'done') return 100;
  const analysed = job.log.filter((l) => l.includes('Analysing')).length;
  return Math.min(98, Math.round(((stageIndex(job) + 1 + Math.min(analysed, 7) * 0.5) / (STAGES.length + 3.5)) * 100));
}

export function stepsHtml(job: Job) {
  const idx = stageIndex(job);
  const pages = job.log.filter((l) => l.includes('Analysing')).length;
  return STAGES.map((s, i) => {
    const state = i < idx ? 'done' : i === idx ? (job.status === 'running' ? 'active' : 'done') : '';
    const extra = s.key === 'Analysing' && pages ? ` <span class="subtle">(${pages})</span>` : '';
    return `<li class="${state}"><span class="ic">${state === 'done' ? '✓' : ''}</span>${esc(s.label)}${extra}</li>`;
  }).join('');
}

export function progressPage(job: Job, position: number, logo?: string) {
  const host = hostOf(job.url);
  return layout(
    `Auditing ${host}`,
    `<main class="page" style="max-width:720px">
  <div class="crumbs"><a href="/">Audits</a> / ${esc(job.client ?? host)}</div>
  <div class="head"><div><h1>${esc(job.client ?? host)}</h1><p class="muted">${esc(job.url)}</p></div></div>
  <section class="card card-pad">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <strong id="msg">${position > 0 ? `Waiting in queue (position ${position})` : 'Audit in progress'}</strong>
      <span class="subtle small">Usually about a minute</span>
    </div>
    <div class="meter" style="height:8px;margin-bottom:16px"><span id="bar" class="strong" style="width:${progressOf(job)}%;transition:width .6s"></span></div>
    <ul class="steps" id="steps">${stepsHtml(job)}</ul>
    <details style="margin-top:10px"><summary class="subtle small" style="cursor:pointer">Technical log</summary><pre class="log" id="log">${esc(job.log.join('\n'))}</pre></details>
  </section>
</main>
<script>
(function(){
  var id=${JSON.stringify(job.id)};
  function tick(){
    fetch('/api/audits/'+id,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
      if(j.status==='done'||j.status==='failed'){location.reload();return}
      document.getElementById('bar').style.width=j.progress+'%';
      document.getElementById('steps').innerHTML=j.steps;
      document.getElementById('msg').textContent=j.position>0?'Waiting in queue (position '+j.position+')':'Audit in progress';
      var l=document.getElementById('log');l.textContent=j.log.join('\\n');
      setTimeout(tick,2000);
    }).catch(function(){setTimeout(tick,4000)});
  }
  setTimeout(tick,1500);
})();
</script>`,
    { logo },
  );
}

export function failedPage(job: Job, logo?: string) {
  const host = hostOf(job.url);
  return layout(
    'Audit failed',
    `<main class="page" style="max-width:720px">
  <div class="crumbs"><a href="/">Audits</a> / ${esc(job.client ?? host)}</div>
  <div class="head"><div><h1>${esc(job.client ?? host)}</h1><p class="muted">${esc(job.url)}</p></div></div>
  <section class="card card-pad">
    <div class="alert err"><strong>The audit could not finish.</strong> ${esc(job.error ?? 'Something went wrong.')}</div>
    <p class="muted">Common causes: the site is down, blocks automated visitors entirely, or took too long to respond.</p>
    <form method="post" action="/audits" style="margin-top:14px;display:flex;gap:8px">
      <input type="hidden" name="url" value="${esc(job.url)}"><input type="hidden" name="client" value="${esc(job.client ?? '')}"><input type="hidden" name="business_type" value="${esc(job.businessType ?? 'auto')}">
      <button class="btn primary" type="submit">Try again</button><a class="btn" href="/">Back to audits</a>
    </form>
    ${job.log.length ? `<details style="margin-top:14px"><summary class="subtle small" style="cursor:pointer">Technical log</summary><pre class="log">${esc(job.log.join('\n'))}</pre></details>` : ''}
  </section>
</main>`,
    { logo },
  );
}

// ---------------------------------------------------------------- Result

const STATUS: Record<Status, [string, string]> = { pass: ['Good', 'pass'], warn: ['Improve', 'warn'], fail: ['Fix', 'fail'], info: ['Note', 'info'] };
const ROBOTS: Record<BotResult['robots'], [string, string]> = { allowed: ['Allowed', 'pass'], partial: ['Partly blocked', 'warn'], blocked: ['Blocked', 'fail'], unknown: ['Unreadable', 'warn'] };
const LIVE: Record<BotResult['live'], [string, string]> = { ok: ['Got through', 'pass'], blocked: ['Blocked', 'fail'], challenged: ['Challenged', 'fail'], error: ['No response', 'warn'], 'not-tested': ['Rules only', 'info'] };
const PURPOSE: Record<BotResult['purpose'], string> = { search: 'Search index', user: 'Live browsing', training: 'Model training' };

const badge = ([label, cls]: [string, string]) => `<span class="badge ${cls}">${esc(label)}</span>`;

function impact(c: Check, r: AuditResult): [string, string] {
  const v = impactOf(c, r.categories);
  return v >= 4 ? ['High impact', 'fail'] : v >= 1.5 ? ['Medium impact', 'warn'] : ['Low impact', 'info'];
}

export function resultPage(job: Job, r: AuditResult, logo?: string) {
  const all = r.categories.flatMap((c) => c.checks.map((k) => ({ ...k, catName: c.name })));
  const count = (s: Status) => all.filter((c) => c.status === s).length;
  const catName = (id: string) => r.categories.find((c) => c.id === id)!.name;
  const answerBots = r.bots.filter((b) => b.purpose !== 'training');

  const priorities = r.priorities
    .map(
      (c, i) => `<details class="prio"${i === 0 ? ' open' : ''}>
      <summary>
        <span class="rank">${i + 1}</span>
        <div><h3>${esc(c.title)}</h3>
          <div class="meta">${badge(impact(c, r))}${c.effort ? `<span class="badge outline">${esc(c.effort)}</span>` : ''}<span class="subtle small">${esc(catName(c.category))}</span></div></div>
        <span class="chev" aria-hidden="true">›</span>
      </summary>
      <div class="body">
        <div><h4>What we found</h4><p>${esc(c.finding)}</p></div>
        <div><h4>Why it matters</h4><p class="muted">${esc(c.why ?? '')}</p></div>
        <div class="fix"><h4>What to do</h4><p>${esc(c.fix)}</p></div>
      </div>
    </details>`,
    )
    .join('');

  const checks = all
    .map(
      (c) => `<div class="check" data-status="${c.status}" data-cat="${c.category}">
      <div>${badge(STATUS[c.status])}</div>
      <div>
        <h3>${esc(c.title)}<span class="cat-label">${esc(c.catName)}</span></h3>
        <p>${esc(c.finding)}</p>
        ${c.fix && c.status !== 'pass' ? `<div class="fixline"><b>Fix:</b> ${esc(c.fix)}</div>` : ''}
        ${c.evidence?.length ? `<details><summary>Evidence (${c.evidence.length})</summary><ul>${c.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}
      </div>
    </div>`,
    )
    .join('');

  const companies = [...new Set(r.bots.map((b) => b.company))];
  const botRows = companies
    .map((co) =>
      r.bots
        .filter((b) => b.company === co)
        .map(
          (b, i, arr) => `<tr>
          ${i === 0 ? `<td rowspan="${arr.length}" style="font-weight:600;vertical-align:top;border-right:1px solid var(--border)">${esc(co)}</td>` : ''}
          <td><code>${esc(b.token)}</code><div class="subtle small">${esc(b.product)}</div></td>
          <td class="muted">${PURPOSE[b.purpose]}</td>
          <td>${badge(ROBOTS[b.robots])}</td>
          <td>${badge(LIVE[b.live])}${b.liveDetail && b.live !== 'ok' ? `<div class="subtle small">${esc(b.liveDetail)}</div>` : ''}</td>
        </tr>`,
        )
        .join(''),
    )
    .join('');

  const pageRows = r.pages
    .map((p) => {
      const ok = p.renderedWords >= 0;
      const ratio = ok ? Math.min(100, Math.round((p.rawWords / Math.max(1, p.renderedWords)) * 100)) : 0;
      const notes = [p.widgets.length ? `Uses ${p.widgets.join(', ')}` : '', p.hiddenFacts.length ? `Hidden from AI: ${p.hiddenFacts.join(', ')}` : ''].filter(Boolean);
      return `<tr>
        <td><strong>${esc(p.label)}</strong><div class="small"><a class="subtle" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(new URL(p.url).pathname)}</a></div></td>
        <td class="num">${p.rawWords}</td>
        <td class="num">${ok ? p.renderedWords : '<span class="subtle">n/a</span>'}</td>
        <td>${ok ? scoreCell(ratio).replace('<span class="score-num">' + ratio + '</span>', `<span class="score-num" style="width:40px">${ratio}%</span>`) : '<span class="subtle">n/a</span>'}</td>
        <td class="muted small">${notes.length ? esc(notes.join('. ')) : '—'}</td>
      </tr>`;
    })
    .join('');

  const b = r.business ?? { id: 'auto', label: 'Not recorded', detected: true, confidence: 'low', reason: 'this audit was run before business types were added', query: '' };
  return layout(
    r.clientName,
    `<main class="page">
  <div class="crumbs"><a href="/">Audits</a> / ${esc(r.clientName)}</div>
  <div class="head">
    <div>
      <h1>${esc(r.clientName)}</h1>
      <div class="actions" style="margin-top:8px">
        <a class="chip" href="${esc(r.finalUrl)}" target="_blank" rel="noopener">${esc(hostOf(r.finalUrl))} ↗</a>
        <span class="chip">${esc(b.label)}</span>
        <span class="chip">${esc(fmt(r.auditedAt))}</span>
      </div>
    </div>
    <div class="actions">
      <form method="post" action="/audits" style="display:contents">
        <input type="hidden" name="url" value="${esc(job.url)}"><input type="hidden" name="client" value="${esc(job.client ?? '')}"><input type="hidden" name="business_type" value="${esc(job.businessType ?? 'auto')}">
        <button class="btn" type="submit" title="Run this audit again">Re-run</button>
      </form>
      <a class="btn" href="/audits/${esc(job.id)}/report.html" target="_blank" rel="noopener">Client report ↗</a>
      <a class="btn primary" href="/audits/${esc(job.id)}/report.pdf">Download PDF</a>
    </div>
  </div>

  <section class="overview">
    <div class="card total">
      <div class="muted small" style="font-weight:600">AI readiness score</div>
      <div class="big score-num">${r.overall}<small> / 100</small></div>
      <div class="meter" style="height:8px"><span class="${band(r.overall)}" style="width:${r.overall}%"></span></div>
      <div style="margin-top:10px;font-weight:600">${esc(r.grade)}</div>
      <div class="counts">
        <span class="badge fail">${count('fail')} to fix</span>
        <span class="badge warn">${count('warn')} to improve</span>
        <span class="badge pass">${count('pass')} good</span>
      </div>
    </div>
    <div class="cats">
      ${r.categories
        .map(
          (c) => `<button class="card cat" type="button" data-goto-cat="${c.id}" title="${esc(c.blurb)}">
          <span class="name">${esc(c.name)}</span>
          <span class="score-num">${c.score}</span>
          <div class="meter"><span class="${band(c.score)}" style="width:${c.score}%"></span></div>
          <span class="hint">${((n) => `${n} ${n === 1 ? 'issue' : 'issues'}`)(c.checks.filter((k) => k.status === 'fail' || k.status === 'warn').length)} · ${c.weight}% of score</span>
        </button>`,
        )
        .join('')}
    </div>
  </section>

  <section class="card biz">
    <div>
      <strong>Assessed as: ${esc(b.label)}</strong>
      <span class="muted small">${b.detected ? `Detected automatically (${esc(b.confidence)} confidence): ${esc(b.reason)}.` : 'Chosen when the audit was started.'}</span>
    </div>
    <form method="post" action="/audits">
      <input type="hidden" name="url" value="${esc(job.url)}"><input type="hidden" name="client" value="${esc(job.client ?? '')}">
      <label for="rt" class="small muted" style="margin:0;font-weight:500">Wrong type?</label>
      ${businessSelect('business_type', b.id).replace('id="business_type"', 'id="rt"')}
      <button class="btn sm" type="submit">Re-run as this type</button>
    </form>
  </section>

  <p class="muted" style="margin-bottom:18px;max-width:820px">${esc(r.summary)}</p>

  <div class="tabs" role="tablist">
    <button class="tab" role="tab" data-tab="priorities">Priorities<span class="count">${r.priorities.length}</span></button>
    <button class="tab" role="tab" data-tab="checks">All checks<span class="count">${all.length}</span></button>
    <button class="tab" role="tab" data-tab="crawlers">AI crawlers<span class="count">${answerBots.filter((x) => x.robots === 'allowed' && x.live !== 'blocked' && x.live !== 'challenged').length}/${answerBots.length}</span></button>
    <button class="tab" role="tab" data-tab="pages">Pages<span class="count">${r.pages.length}</span></button>
  </div>

  <section class="panel card" data-panel="priorities">
    ${priorities || '<div class="empty">Nothing significant to fix. Nice.</div>'}
  </section>

  <section class="panel card" data-panel="checks" hidden>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter by status">
        <button type="button" data-status="all" aria-pressed="true">All</button>
        <button type="button" data-status="fail" aria-pressed="false">Fix ${count('fail')}</button>
        <button type="button" data-status="warn" aria-pressed="false">Improve ${count('warn')}</button>
        <button type="button" data-status="pass" aria-pressed="false">Good ${count('pass')}</button>
      </div>
      <select id="catf" aria-label="Filter by category"><option value="all">All categories</option>${r.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    </div>
    <div id="checklist">${checks}</div>
    <div class="empty" id="nochecks" hidden>No checks match these filters.</div>
  </section>

  <section class="panel card" data-panel="crawlers" hidden>
    <div class="card-head"><p class="muted small" style="max-width:760px">We checked whether <code>robots.txt</code> permits each crawler, then visited the homepage pretending to be it. Search and live-browsing crawlers decide whether AI can cite the site. "Rules only" crawlers never visit; they exist only as robots.txt settings.</p></div>
    <div class="table-scroll"><table>
      <thead><tr><th>Company</th><th>Crawler</th><th>Used for</th><th>robots.txt</th><th>Live test</th></tr></thead>
      <tbody>${botRows}</tbody>
    </table></div>
  </section>

  <section class="panel card" data-panel="pages" hidden>
    <div class="card-head"><p class="muted small">Each page was read as raw HTML (what most AI crawlers see) and in a full browser (what visitors see).</p></div>
    <div class="table-scroll"><table>
      <thead><tr><th>Page</th><th class="num">Words in HTML</th><th class="num">After JavaScript</th><th>AI can read</th><th>Notes</th></tr></thead>
      <tbody>${pageRows}</tbody>
    </table></div>
  </section>
</main>
<script>
(function(){
  var tabs=[].slice.call(document.querySelectorAll('.tab')),panels=[].slice.call(document.querySelectorAll('.panel'));
  function show(name){
    tabs.forEach(function(t){t.setAttribute('aria-selected',t.dataset.tab===name)});
    panels.forEach(function(p){p.hidden=p.dataset.panel!==name});
    history.replaceState(null,'','#'+name);
  }
  tabs.forEach(function(t){t.addEventListener('click',function(){show(t.dataset.tab)})});
  var start=(location.hash||'').slice(1);show(['priorities','checks','crawlers','pages'].indexOf(start)>-1?start:'priorities');

  var st='all',cat=document.getElementById('catf');
  function filter(){
    var n=0;document.querySelectorAll('#checklist .check').forEach(function(c){var m=(st==='all'||c.dataset.status===st)&&(cat.value==='all'||c.dataset.cat===cat.value);c.hidden=!m;if(m)n++});
    document.getElementById('nochecks').hidden=n>0;
  }
  document.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){st=b.dataset.status;document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});filter()})});
  cat.addEventListener('change',filter);
  document.querySelectorAll('[data-goto-cat]').forEach(function(b){b.addEventListener('click',function(){cat.value=b.dataset.gotoCat;st='all';document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.status==='all')});filter();show('checks');document.querySelector('.tabs').scrollIntoView({behavior:'smooth'})})});
})();
</script>`,
    { logo },
  );
}
