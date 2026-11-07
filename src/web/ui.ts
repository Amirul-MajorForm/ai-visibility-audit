import { BRAND } from '../brand.js';
import type { Job } from './jobs.js';

const C = BRAND.colors;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const gradeColor = (score: number) => (score >= 85 ? C.teal : score >= 70 ? C.mint : score >= 50 ? C.yellow : C.coral);

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });

function layout(title: string, body: string, opts: { full?: boolean; logo?: string } = {}) {
  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:${C.ink};--mint:${C.mint};--mint-soft:${C.mintSoft};--paper:${C.paper};--yellow:${C.yellow};--coral:${C.coral};--teal:${C.teal};--line:#dcdde6;--muted:#5d6b75}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--paper);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;font-size:15px;line-height:1.55;${opts.full ? 'display:flex;flex-direction:column' : ''}}
h1,h2,h3{font-family:'Space Grotesk',system-ui,sans-serif;font-weight:600;letter-spacing:-0.015em;margin:0}
a{color:inherit}
.top{background:var(--ink);color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff}
.brand .wm{font-family:'Space Grotesk';font-weight:700;font-size:19px;letter-spacing:-0.02em}
.brand img{height:24px}
.brand .tool{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mint)}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 64px}
.hero{background:var(--ink);color:#fff;border-radius:22px;padding:36px 32px;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;width:360px;height:360px;right:-120px;top:-140px;border-radius:50%;background:radial-gradient(circle,var(--mint),transparent 65%);opacity:.55}
.hero > *{position:relative;z-index:1}
.kicker{font-family:'Space Grotesk';font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--mint);font-weight:600}
.hero h1{font-size:36px;margin:8px 0 8px;line-height:1.1}
.hero p{color:#c9d6db;max-width:560px;margin:0 0 22px}
form.audit{display:grid;grid-template-columns:1.4fr 1fr auto;gap:10px;align-items:end}
label{display:block;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--mint-soft);margin-bottom:6px}
input{width:100%;font:inherit;padding:12px 14px;border-radius:12px;border:1.5px solid transparent;background:#fff;color:var(--ink)}
input:focus{outline:none;border-color:var(--mint)}
button,.btn{font-family:'Space Grotesk';font-weight:600;font-size:15px;border:0;border-radius:99px;padding:12px 22px;background:var(--mint);color:var(--ink);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
button:hover,.btn:hover{filter:brightness(1.05)}
.btn.ghost{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.35)}
.btn.small{font-size:13px;padding:8px 14px}
.error{background:#fcd5cc;color:#8a2412;border-radius:12px;padding:10px 14px;margin-bottom:14px;font-weight:500}
.card{background:#fff;border-radius:18px;padding:22px 24px;margin-top:22px}
.card h2{font-size:20px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-family:'Space Grotesk';font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1.5px solid var(--ink)}
td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
td a{font-weight:600;text-decoration:none}
td a:hover{text-decoration:underline}
.muted{color:var(--muted)} .small{font-size:12.5px}
.score{font-family:'Space Grotesk';font-weight:700;display:inline-block;min-width:42px;text-align:center;padding:2px 8px;border-radius:99px;color:var(--ink)}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px}
.pill.queued,.pill.running{background:var(--yellow);color:#5b4a00}
.pill.failed{background:#fcd5cc;color:#8a2412}
.empty{color:var(--muted);padding:12px 0}
.progress{height:10px;background:#e9eaf0;border-radius:99px;overflow:hidden;margin:18px 0 14px}
.progress span{display:block;height:100%;background:var(--teal);border-radius:99px;transition:width .6s ease}
.log{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--muted);background:var(--paper);border-radius:12px;padding:12px 14px;max-height:260px;overflow:auto;white-space:pre-wrap;margin:0}
.spin{width:18px;height:18px;border:2.5px solid var(--line);border-top-color:var(--teal);border-radius:50%;animation:s 0.9s linear infinite;display:inline-block;vertical-align:middle}
@keyframes s{to{transform:rotate(360deg)}}
.bar{background:var(--ink);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.bar .who{font-family:'Space Grotesk';font-weight:600;font-size:16px}
.bar .spacer{flex:1}
iframe.report{flex:1;width:100%;border:0;background:#e7e8ee}
@media (max-width:720px){
  form.audit{grid-template-columns:1fr}
  .hero{padding:26px 20px}
  .hero h1{font-size:28px}
  .wrap{padding:20px 16px 48px}
  .hide-sm{display:none}
}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="/">${opts.logo ? `<img src="${opts.logo}" alt="${esc(BRAND.name)}">` : `<span class="wm">${esc(BRAND.name)}</span>`}<span class="tool">AI Visibility Audit</span></a>
  <span class="small" style="color:#a9bcc4">Internal tool</span>
</header>
${body}
</body>
</html>`;
}

function scoreBadge(j: Job) {
  if (j.status === 'done') return `<span class="score" style="background:${gradeColor(j.overall ?? 0)}">${j.overall}</span>`;
  return `<span class="pill ${j.status}">${j.status === 'failed' ? 'Failed' : j.status === 'running' ? 'Running' : 'Queued'}</span>`;
}

export function homePage(jobs: Job[], opts: { error?: string; url?: string; client?: string; logo?: string } = {}) {
  const rows = jobs
    .map(
      (j) => `<tr>
      <td><a href="/audits/${esc(j.id)}">${esc(j.clientName ?? j.client ?? new URL(j.url).hostname.replace(/^www\./, ''))}</a><div class="muted small">${esc(new URL(j.url).hostname.replace(/^www\./, ''))}</div></td>
      <td>${scoreBadge(j)}</td>
      <td class="hide-sm">${esc(j.grade ?? '')}</td>
      <td class="muted small">${esc(fmt(j.createdAt))}</td>
      <td style="text-align:right">${j.status === 'done' ? `<a class="small" href="/audits/${esc(j.id)}/report.pdf">PDF</a>` : ''}</td>
    </tr>`,
    )
    .join('');
  return layout(
    'AI Visibility Audit',
    `<main class="wrap">
  <section class="hero">
    <div class="kicker">Layer 1 · Technical readiness</div>
    <h1>How visible is this website to AI?</h1>
    <p>Enter a website to check how easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand it. Takes about a minute and produces a branded client report.</p>
    ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
    <form class="audit" method="post" action="/audits">
      <div><label for="url">Website</label><input id="url" name="url" placeholder="e.g. revltraining.sg" value="${esc(opts.url ?? '')}" required autofocus inputmode="url" autocomplete="off"></div>
      <div><label for="client">Client name (optional)</label><input id="client" name="client" placeholder="Taken from the site if blank" value="${esc(opts.client ?? '')}" autocomplete="off"></div>
      <button type="submit">Run audit →</button>
    </form>
  </section>
  <section class="card">
    <h2>Recent audits</h2>
    ${
      jobs.length
        ? `<table><thead><tr><th>Client</th><th>Score</th><th class="hide-sm">Rating</th><th>Run</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty">No audits yet. Run your first one above.</div>'
    }
  </section>
</main>`,
    { logo: opts.logo },
  );
}

const STAGES = ['Fetching', 'Checking robots', 'Rendering homepage', 'Analysing', 'Testing access', 'Looking for sitemap', 'Scoring', 'Building report', 'Writing PDF', 'Done'];

export function progressOf(job: Job): number {
  let idx = -1;
  for (const line of job.log) {
    const i = STAGES.findIndex((s) => line.includes(s));
    if (i > idx) idx = i;
  }
  const analysed = job.log.filter((l) => l.includes('Analysing')).length;
  return Math.min(100, Math.round(((idx + 1 + Math.min(analysed, 7) * 0.4) / (STAGES.length + 2.8)) * 100));
}

export function progressPage(job: Job, position: number, logo?: string) {
  const host = new URL(job.url).hostname.replace(/^www\./, '');
  return layout(
    `Auditing ${host}`,
    `<main class="wrap">
  <section class="card" style="margin-top:0">
    <div class="kicker" style="color:var(--teal)">Audit in progress</div>
    <h2 style="font-size:26px;margin:6px 0 4px">${esc(job.client ?? host)}</h2>
    <div class="muted">${esc(job.url)}</div>
    <div class="progress"><span id="bar" style="width:${progressOf(job)}%"></span></div>
    <p id="status"><span class="spin"></span>&nbsp; <span id="msg">${position > 0 ? `Waiting in queue (position ${position})` : 'Working. This usually takes about a minute.'}</span></p>
    <pre class="log" id="log">${esc(job.log.join('\n'))}</pre>
  </section>
</main>
<script>
(function(){
  var id=${JSON.stringify(job.id)};
  function tick(){
    fetch('/api/audits/'+id,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
      if(j.status==='done'||j.status==='failed'){location.reload();return}
      document.getElementById('bar').style.width=j.progress+'%';
      document.getElementById('msg').textContent=j.position>0?'Waiting in queue (position '+j.position+')':'Working. This usually takes about a minute.';
      var l=document.getElementById('log');l.textContent=j.log.join('\\n');l.scrollTop=l.scrollHeight;
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
  return layout(
    'Audit failed',
    `<main class="wrap">
  <section class="card" style="margin-top:0">
    <div class="kicker" style="color:var(--coral)">Audit failed</div>
    <h2 style="font-size:24px;margin:6px 0 10px">${esc(job.client ?? new URL(job.url).hostname)}</h2>
    <div class="error">${esc(job.error ?? 'Something went wrong.')}</div>
    <p class="muted">Common causes: the site is down, blocks automated visitors entirely, or took too long to respond.</p>
    <form method="post" action="/audits" style="margin-top:14px">
      <input type="hidden" name="url" value="${esc(job.url)}"><input type="hidden" name="client" value="${esc(job.client ?? '')}">
      <button type="submit">Try again</button> &nbsp; <a href="/">Back to all audits</a>
    </form>
    ${job.log.length ? `<pre class="log" style="margin-top:16px">${esc(job.log.join('\n'))}</pre>` : ''}
  </section>
</main>`,
    { logo },
  );
}

export function resultPage(job: Job, logo?: string) {
  return layout(
    `${job.clientName}: AI Visibility Audit`,
    `<div class="bar">
  <a class="btn ghost small" href="/">← All audits</a>
  <span class="who">${esc(job.clientName)}</span>
  <span class="score" style="background:${gradeColor(job.overall ?? 0)}">${job.overall}</span>
  <span class="small hide-sm" style="color:#c9d6db">${esc(job.grade)} · ${esc(fmt(job.finishedAt ?? job.createdAt))}</span>
  <span class="spacer"></span>
  <a class="btn ghost small hide-sm" href="/audits/${esc(job.id)}/report.html" target="_blank" rel="noopener">Open full page</a>
  <a class="btn small" href="/audits/${esc(job.id)}/report.pdf">Download PDF</a>
</div>
<iframe class="report" src="/audits/${esc(job.id)}/report.html" title="Report"></iframe>`,
    { full: true, logo },
  );
}
