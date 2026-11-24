import { BRAND } from '../brand.js';
import { PROFILES } from '../profiles.js';
import { SEARCH_DBS } from '../seo/search.js';
import { normalizeResult, viewResult, impactIn, MODULE_NAMES } from '../score.js';
import type { AuditResult, BotResult, Check, IssueGroup, ModuleId, Status } from '../types.js';
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

/* Audit selection */
.audit-types{border:0;padding:0;margin:16px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.audit-types legend{font-size:12.5px;font-weight:600;margin-bottom:6px;padding:0}
.type-card{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border-strong);border-radius:10px;padding:12px 14px;cursor:pointer;margin:0;font-weight:400}
.type-card:has(input:checked){border-color:var(--accent);background:#f2fbf8}
.type-card input{width:16px;height:16px;margin-top:2px;accent-color:var(--primary);flex:none}
.type-card b{display:block;font-size:14px}
.type-card small{display:block;color:var(--muted);font-size:12.5px;line-height:1.45;margin-top:2px}
.seo-opts{display:grid;grid-template-columns:180px 1fr 200px;gap:12px;align-items:end;margin-top:12px;padding:12px 14px;background:var(--bg);border-radius:10px}
label.check{display:flex;align-items:center;gap:8px;font-weight:500;font-size:13.5px;margin-bottom:9px;cursor:pointer}
label.check input{width:16px;height:16px;accent-color:var(--primary)}
label.check.disabled{color:var(--subtle);cursor:not-allowed}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.score-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;padding:2px 9px 2px 8px;font-size:12.5px;background:var(--surface)}
.score-chip .lbl{color:var(--muted);font-weight:600;font-size:11.5px}
.score-chip .score-num{font-size:13.5px}
.dotband{width:8px;height:8px;border-radius:50%}
.dotband.strong{background:var(--strong)} .dotband.good{background:var(--good)} .dotband.work{background:var(--work)} .dotband.risk{background:var(--risk)}
.badge.both{background:var(--primary);color:var(--mint)}
.badge.mod{background:#eef0f3;color:#45525b}

/* SEO panels */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpi{padding:14px 16px;display:flex;flex-direction:column}
.kpi b{font-family:'Space Grotesk',sans-serif;font-size:26px;line-height:1.1}
.kpi span{font-weight:600;font-size:13px;margin-top:4px}
.kpi small{color:var(--subtle);font-size:12px}
.status-kpi{gap:6px;justify-content:center}
.sb{display:grid;grid-template-columns:84px 1fr 32px;gap:8px;align-items:center;font-size:12px}
.sb b{font-size:12.5px;text-align:right;font-family:inherit}
.sb-bar{height:8px;background:#eceef1;border-radius:99px;overflow:hidden}
.sb-bar i{display:block;height:100%;border-radius:99px}
.sb-bar i.ok{background:var(--strong)} .sb-bar i.mid{background:var(--work)} .sb-bar i.bad{background:var(--risk)}
.issue{display:inline-block;font-size:11.5px;background:var(--warn-bg);color:var(--warn-fg);border-radius:5px;padding:1px 6px;margin:1px 0;white-space:nowrap}
.vital{font-weight:600;padding:1px 7px;border-radius:6px;font-size:12.5px}
.vital.good{background:var(--good-bg);color:var(--good-fg)} .vital.ok{background:var(--warn-bg);color:var(--warn-fg)} .vital.poor{background:var(--bad-bg);color:var(--bad-fg)}
.crawl-table td{padding:9px 16px}
.url-cell{max-width:380px}
.url-cell a{text-decoration:none;font-weight:500;word-break:break-all}
.url-cell a:hover{text-decoration:underline}
.ellip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table.compact td{padding:8px 16px}
.trend{display:flex;align-items:flex-end;gap:6px;height:120px;padding-bottom:20px}
.tb{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative}
.tb i{display:block;width:100%;background:var(--accent);border-radius:4px 4px 0 0}
.tb span{position:absolute;bottom:-18px;font-size:11px;color:var(--subtle)}

/* Competitors */
.compete{margin-top:14px;border-top:1px solid var(--border);padding-top:12px}
.compete summary{cursor:pointer;font-weight:600;font-size:13.5px}
.comp-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.compare-card{margin-bottom:20px}
.compare-card tr.you td{background:#f4fbf8}
.lead-tag{font-size:11px;font-weight:600;color:var(--good-fg);background:var(--good-bg);border-radius:99px;padding:1px 7px;white-space:nowrap}
.cat-compare{border-top:1px solid var(--border)}
.cat-compare summary{cursor:pointer;padding:12px 20px;font-weight:600;font-size:13px;color:var(--muted)}
.cat-compare .lead{font-weight:700;color:var(--good-fg)}

/* View switch */
.viewbar{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.view-seg a{font-size:12.5px;font-weight:600;padding:6px 12px;color:var(--muted);text-decoration:none;border-right:1px solid var(--border);background:var(--surface)}
.view-seg a:last-child{border-right:0}
.view-seg a[aria-pressed=true]{background:var(--primary);color:#fff}

/* Affected URLs */
.urls-link{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:600;color:var(--primary);text-decoration:none;border-bottom:1px solid var(--accent)}
.urls-link:hover{color:var(--accent)}
.urls-layout{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start}
.issue-nav{padding:6px;position:sticky;top:72px;max-height:calc(100vh - 90px);overflow:auto}
.issue-item{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;font:inherit;font-size:13px;background:none;border:0;border-radius:7px;padding:8px 10px;cursor:pointer;color:var(--text)}
.issue-item:hover{background:var(--bg)}
.issue-item.on{background:#eef7f4;font-weight:600}
.issue-item small{display:block;font-size:11px;color:var(--subtle);font-weight:500}
.issue-item .ic{font-size:12px;font-weight:600;color:var(--muted);background:var(--bg);border-radius:99px;padding:1px 8px}
.sev{width:8px;height:8px;border-radius:50%}
.sev.fail{background:var(--risk)} .sev.warn{background:var(--work)} .sev.info{background:#a8b2b9}
.issue-main{min-width:0}
.issue-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--border)}
.issue-head h2 .subtle{font-weight:500}
.ext{color:var(--subtle);font-size:11px}

/* Pages: AI view vs visitor view */
.pg-head{display:grid;grid-template-columns:minmax(0,1.4fr) 260px minmax(0,1fr) 20px;gap:16px;padding:8px 20px;font-size:12px;font-weight:600;color:var(--muted);background:#fafbfc;border-bottom:1px solid var(--border)}
.pg{border-bottom:1px solid var(--border)}
.pg:last-child{border-bottom:0}
.pg summary{list-style:none;display:grid;grid-template-columns:minmax(0,1.4fr) 260px minmax(0,1fr) 20px;gap:16px;align-items:center;padding:13px 20px;cursor:pointer}
.pg summary::-webkit-details-marker{display:none}
.pg summary:hover{background:#fafbfc}
.pg .pg-name{display:flex;flex-direction:column;min-width:0}
.pg .pg-name a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.pg .pg-name a:hover{text-decoration:underline}
.pg .pg-ratio{display:flex;align-items:center;gap:10px}
.pg .chev{color:var(--subtle);transition:transform .15s}
.pg[open] .chev{transform:rotate(90deg)}
.pg-body{padding:0 20px 18px}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.side{border:1px solid var(--border);border-radius:10px;padding:14px;min-width:0;background:#fbfbfc}
.side.vis{background:#f3faf6;border-color:#cfe9da}
.side-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.side-head h4{font-size:13.5px}
.side-note{font-size:12px;color:var(--subtle);margin:2px 0 10px}
.excerpt{font-size:12.5px;line-height:1.6;color:var(--muted);max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.blocks{list-style:none;margin:0;padding:0;max-height:300px;overflow:auto;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start}
.blocks li{font-size:12.5px;background:#fff;border:1px solid #cfe9da;border-radius:6px;padding:3px 8px;max-width:100%;overflow-wrap:anywhere}
.good-note{font-size:13px;color:var(--good-fg)}
.alert.warn-alert{background:var(--warn-bg);color:#5c4500}
mark{border-radius:4px;padding:0 4px;font-weight:600}
mark.ai{background:#fde6e1;color:var(--bad-fg)}
mark.vis{background:#dff3e8;color:var(--good-fg)}


@media (max-width:960px){
  .overview{grid-template-columns:1fr}
  .cats{grid-template-columns:repeat(3,1fr)}
  .new-audit{grid-template-columns:1fr 1fr}
  .prio .body{grid-template-columns:1fr;padding-left:20px}
  .compare,.grid2,.urls-layout,.comp-inputs{grid-template-columns:1fr}
  .issue-nav{position:static;max-height:260px}
  .kpis{grid-template-columns:1fr 1fr}
  .seo-opts,.audit-types{grid-template-columns:1fr}
  .pg summary,.pg-head{grid-template-columns:minmax(0,1fr) 150px 20px}
  .pg .pg-notes,.pg-head span:nth-child(3){display:none}
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
<title>${esc(title)} · Website Audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<nav class="nav">
  <a class="logo" href="/">${opts.logo ? `<img src="${opts.logo}" alt="${esc(BRAND.name)}">` : `<span class="mark">M</span><span>${esc(BRAND.name)}</span>`}<span class="app">Website Audit</span></a>
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

export interface HomeOptions {
  error?: string;
  url?: string;
  client?: string;
  businessType?: string;
  modules?: ModuleId[];
  crawlLimit?: number;
  searchData?: boolean;
  searchDb?: string;
  logo?: string;
  /** Apify token configured on the server */
  searchAvailable?: boolean;
  competitors?: string[];
}

function scoreChips(j: Job) {
  if (j.status !== 'done') return statusBadge(j);
  const scores = j.scores ?? { ai: j.overall };
  return `<div class="chips">${(['ai', 'seo'] as ModuleId[])
    .filter((m) => scores[m] !== undefined)
    .map((m) => `<span class="score-chip"><span class="lbl">${m === 'ai' ? 'AI' : 'SEO'}</span><span class="score-num">${scores[m]}</span><span class="dotband ${band(scores[m]!)}"></span></span>`)
    .join('')}</div>`;
}

export function homePage(jobs: Job[], opts: HomeOptions = {}) {
  const mods = opts.modules ?? ['ai', 'seo'];
  const rows = jobs
    .map((j) => {
      const name = j.clientName ?? j.client ?? hostOf(j.url);
      const search = `${name} ${hostOf(j.url)} ${j.businessLabel ?? ''}`.toLowerCase();
      return `<tr class="link" data-href="/audits/${esc(j.id)}" data-search="${esc(search)}">
        <td><a class="row-title" href="/audits/${esc(j.id)}">${esc(name)}</a><div class="subtle small">${esc(hostOf(j.url))}</div></td>
        <td class="hide-sm muted">${esc(j.businessLabel ?? '')}</td>
        <td>${scoreChips(j)}</td>
        <td class="muted small">${esc(fmt(j.createdAt))}</td>
        <td class="num">${j.status === 'done' ? `<a class="btn sm" href="/audits/${esc(j.id)}/report.pdf" title="Download PDF">PDF</a>` : ''}</td>
      </tr>`;
    })
    .join('');
  const limits = [50, 150, 300, 500];
  const lim = opts.crawlLimit ?? 150;

  return layout(
    'Audits',
    `<main class="page">
  <div class="head">
    <div><h1>Audits</h1><p class="muted">Check a website's SEO and how easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand it.</p></div>
  </div>

  <section class="card card-pad" id="new" style="margin-bottom:20px">
    <h2 style="margin-bottom:14px">New audit</h2>
    ${opts.error ? `<div class="alert err">${esc(opts.error)}</div>` : ''}
    <form method="post" action="/audits" id="newform">
      <div class="new-audit">
        <div><label for="url">Website</label><input id="url" name="url" placeholder="example.com.sg" value="${esc(opts.url ?? '')}" required inputmode="url" autocomplete="off" ${opts.error || !jobs.length ? 'autofocus' : ''}></div>
        <div><label for="client">Client name <span class="subtle">(optional)</span></label><input id="client" name="client" placeholder="Taken from the site" value="${esc(opts.client ?? '')}" autocomplete="off"></div>
        <div><label for="business_type">Business type</label>${businessSelect('business_type', opts.businessType)}</div>
        <button class="btn primary" type="submit" style="height:36px">Run audit</button>
      </div>
      <fieldset class="audit-types">
        <legend>Audits to run</legend>
        <label class="type-card"><input type="checkbox" name="audits" value="ai"${mods.includes('ai') ? ' checked' : ''}><span><b>AI visibility</b><small>AI crawler access, content AI can read, structured data, answers to customer questions</small></span></label>
        <label class="type-card"><input type="checkbox" name="audits" value="seo"${mods.includes('seo') ? ' checked' : ''}><span><b>SEO</b><small>Site crawl, broken pages, indexing, titles and descriptions, speed on mobile, site structure</small></span></label>
      </fieldset>
      <div class="seo-opts" id="seoopts"${mods.includes('seo') ? '' : ' hidden'}>
        <div><label for="pages">Pages to crawl</label><select id="pages" name="pages">${limits.map((n) => `<option value="${n}"${n === lim ? ' selected' : ''}>Up to ${n}</option>`).join('')}</select></div>
        <div class="search-opt">
          <label class="check${opts.searchAvailable ? '' : ' disabled'}"><input type="checkbox" name="search" value="on"${opts.searchAvailable && opts.searchData !== false ? ' checked' : ''}${opts.searchAvailable ? '' : ' disabled'}> Include search data <span class="subtle">(Semrush via Apify, about US$0.20)</span></label>
          ${opts.searchAvailable ? '' : '<div class="field-hint">Not set up: add an APIFY_TOKEN to enable rankings, competitors and backlinks.</div>'}
        </div>
        <div><label for="db">Search data country</label><select id="db" name="db"${opts.searchAvailable ? '' : ' disabled'}>${SEARCH_DBS.map((d) => `<option value="${d.id}"${d.id === (opts.searchDb ?? 'sg') ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>
      </div>
      <details class="compete"${opts.competitors?.length ? ' open' : ''}>
        <summary>Compare with competitors <span class="subtle">(optional, up to 2)</span></summary>
        <p class="field-hint" style="margin:4px 0 10px">Competitors get the same audits and business type, scores only. Each adds 1 to 2 minutes.</p>
        <div class="comp-inputs">
          <div><label for="comp1">Competitor 1</label><input id="comp1" name="competitor" placeholder="competitor.com.sg" value="${esc(opts.competitors?.[0] ?? '')}" inputmode="url" autocomplete="off"></div>
          <div><label for="comp2">Competitor 2</label><input id="comp2" name="competitor" placeholder="another-competitor.sg" value="${esc(opts.competitors?.[1] ?? '')}" inputmode="url" autocomplete="off"></div>
        </div>
      </details>
      <p class="field-hint" id="timehint"></p>
    </form>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>All audits <span class="subtle" style="font-weight:500">${jobs.length}</span></h2>
      ${jobs.length ? '<input id="filter" type="search" placeholder="Filter by client, site or type" style="max-width:260px;height:32px">' : ''}
    </div>
    ${
      jobs.length
        ? `<div class="table-scroll"><table>
            <thead><tr><th>Client</th><th class="hide-sm">Business type</th><th>Scores</th><th>Run</th><th></th></tr></thead>
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
(function(){
  var boxes=[].slice.call(document.querySelectorAll('input[name=audits]')),seo=document.querySelector('input[name=audits][value=seo]'),opts=document.getElementById('seoopts'),hint=document.getElementById('timehint'),pages=document.getElementById('pages');
  function upd(){
    opts.hidden=!seo.checked;
    var any=boxes.some(function(b){return b.checked});
    boxes.forEach(function(b){b.setCustomValidity(any?'':'Choose at least one audit')});
    var nComp=[].slice.call(document.querySelectorAll('input[name=competitor]')).filter(function(c){return c.value.trim()}).length;
    var mins=(boxes[0].checked?1:0)+(seo.checked?Math.ceil(Number(pages.value)/100)+1:0)+nComp*((boxes[0].checked?1:0)+(seo.checked?1:0));
    hint.textContent=any?'Takes about '+Math.max(1,mins)+' minute'+(mins>1?'s':'')+'. The business type decides which pages and details are expected.':'';
  }
  var comps=[].slice.call(document.querySelectorAll('input[name=competitor]'));
  comps.forEach(function(c){c.addEventListener('input',upd)});
  boxes.concat([pages]).forEach(function(b){b.addEventListener('change',upd)});upd();
})();
</script>`,
    { logo: opts.logo, nav: 'audits' },
  );
}

// ---------------------------------------------------------------- Progress

const STAGES: { re: RegExp; label: string; module?: ModuleId }[] = [
  { re: /Fetching https?:/, label: 'Loading the website' },
  { re: /Checking robots/, label: 'Reading robots.txt' },
  { re: /Rendering homepage/, label: 'Rendering the homepage in a browser' },
  { re: /Business type/, label: 'Identifying the business type' },
  { re: /Analysing/, label: 'Reviewing key pages' },
  { re: /Testing access/, label: 'Visiting as each AI crawler', module: 'ai' },
  { re: /Looking for sitemap/, label: 'Checking sitemap and llms.txt' },
  { re: /Crawling the site|Crawled \d+/, label: 'Crawling the site', module: 'seo' },
  { re: /page speed|PageSpeed/i, label: 'Measuring speed on mobile', module: 'seo' },
  { re: /Fetching search data/, label: 'Fetching search data', module: 'seo' },
  { re: /^\s*\d+s\s+Scoring$/, label: 'Scoring' },
  { re: /Scoring competitor 1/, label: 'Scoring competitor 1' },
  { re: /Scoring competitor 2/, label: 'Scoring competitor 2' },
  { re: /Building report|Writing PDF/, label: 'Building the client report' },
];

function stagesFor(job: Job) {
  const mods = job.modules ?? ['ai'];
  const n = job.competitors?.length ?? 0;
  return STAGES.filter((s) => !s.module || mods.includes(s.module))
    .filter((s) => !/search data/.test(s.label) || job.searchData)
    .filter((s) => !/competitor (\d)/.test(s.label) || Number(s.label.slice(-1)) <= n);
}

function stageIndex(job: Job) {
  const stages = stagesFor(job);
  let idx = -1;
  for (const line of job.log) {
    const i = stages.findIndex((s) => s.re.test(line));
    if (i > idx) idx = i;
  }
  return idx;
}

export function progressOf(job: Job): number {
  if (job.status === 'done') return 100;
  const stages = stagesFor(job);
  const analysed = job.log.filter((l) => l.includes('Analysing')).length;
  const crawled = Number([...job.log].reverse().find((l) => /Crawled \d+/.test(l))?.match(/Crawled (\d+)/)?.[1] ?? 0);
  const crawlShare = job.crawlLimit ? Math.min(1, crawled / job.crawlLimit) * 3 : 0;
  return Math.min(98, Math.round(((stageIndex(job) + 1 + Math.min(analysed, 7) * 0.5 + crawlShare) / (stages.length + 3.5 + (job.modules?.includes('seo') ? 3 : 0))) * 100));
}

export function stepsHtml(job: Job) {
  const stages = stagesFor(job);
  const idx = stageIndex(job);
  const pages = job.log.filter((l) => l.includes('Analysing')).length;
  const crawled = [...job.log].reverse().find((l) => /Crawled \d+/.test(l))?.match(/Crawled (\d+)/)?.[1];
  return stages
    .map((s, i) => {
      const state = i < idx ? 'done' : i === idx ? (job.status === 'running' ? 'active' : 'done') : '';
      const extra = /Reviewing key pages/.test(s.label) && pages ? ` <span class="subtle">(${pages})</span>` : /Crawling/.test(s.label) && crawled ? ` <span class="subtle">(${crawled} pages)</span>` : '';
      return `<li class="${state}"><span class="ic">${state === 'done' ? '✓' : ''}</span>${esc(s.label)}${extra}</li>`;
    })
    .join('');
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
      <span class="subtle small">${(job.modules ?? ['ai']).includes('seo') ? 'Usually 2 to 5 minutes' : 'Usually about a minute'}</span>
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

// ---------------------------------------------------------------- SEO panels

const fmtNum = (n?: number) => (n === undefined || n === null ? '–' : n.toLocaleString('en-SG'));
const secs = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : '–');
const vital = (v: number | undefined, good: number, poor: number, f: (x: number) => string) =>
  v === undefined ? '<span class="subtle">–</span>' : `<span class="vital ${v <= good ? 'good' : v <= poor ? 'ok' : 'poor'}">${f(v)}</span>`;
const pathOnly = (u: string) => {
  try {
    const x = new URL(u);
    return decodeURI(x.pathname + x.search);
  } catch {
    return u;
  }
};

function crawlPanel(r: AuditResult) {
  const c = r.siteCrawl!;
  const withIssues = c.pages.filter((p) => p.issues.length);
  const label = (k: string) => (k === '200' ? 'OK' : k === 'Redirected' ? 'Redirected' : k === 'Error' ? 'No response' : `Error ${k}`);
  const speed = (r.speed ?? []).filter((x) => !x.error);
  const psi = speed.some((x) => x.source === 'pagespeed');
  const field = speed.some((x) => x.field);
  const rows = [...c.pages]
    .sort((a, b) => b.issues.length - a.issues.length || (a.depth ?? 99) - (b.depth ?? 99))
    .map(
      (p) => `<tr data-issues="${p.issues.length}" data-search="${esc((p.url + ' ' + p.title + ' ' + p.issues.join(' ')).toLowerCase())}">
      <td class="url-cell"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(pathOnly(p.url))}</a><div class="subtle small ellip">${esc(p.title || '(no title)')}</div></td>
      <td>${p.status === 200 && !p.redirects ? '<span class="badge pass">200</span>' : p.status === 200 ? '<span class="badge warn">Redirect</span>' : `<span class="badge fail">${p.status || 'Error'}</span>`}</td>
      <td>${p.issues.map((i) => `<span class="issue">${esc(i)}</span>`).join(' ') || '<span class="subtle">–</span>'}</td>
      <td class="num">${p.words || '–'}</td>
      <td class="num">${p.depth ?? '<span class="subtle">–</span>'}</td>
      <td class="num">${p.inlinks}</td>
    </tr>`,
    )
    .join('');
  return `
  <div class="kpis">
    <div class="card kpi"><b>${c.pagesCrawled}</b><span>Pages crawled</span><small>${c.limitReached ? `limit of ${c.limit} reached` : 'whole site'}</small></div>
    <div class="card kpi"><b>${c.sitemapUrls}</b><span>URLs in sitemap</span><small>${c.sitemapUrls ? 'from your XML sitemap' : 'no sitemap found'}</small></div>
    <div class="card kpi"><b>${withIssues.length}</b><span>Pages with issues</span><small>of ${c.pagesCrawled}</small></div>
    <div class="card kpi status-kpi">${Object.entries(c.statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<div class="sb"><span>${label(k)}</span><span class="sb-bar"><i class="${k === '200' ? 'ok' : k === 'Redirected' ? 'mid' : 'bad'}" style="width:${Math.max(3, (n / c.pagesCrawled) * 100)}%"></i></span><b>${n}</b></div>`)
      .join('')}</div>
  </div>
  ${
    speed.length
      ? `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><h2>Speed on mobile</h2><span class="subtle small">${psi ? 'Google PageSpeed Insights' : 'Measured in our browser on a phone-sized screen (fast connection)'}</span></div>
    <div class="table-scroll"><table>
      <thead><tr><th>Page</th>${psi ? '<th class="num">Score</th>' : ''}<th class="num">Main content (LCP)</th><th class="num">Layout shift (CLS)</th>${field ? '<th class="num">Real users LCP / INP</th>' : ''}<th class="num">Page weight</th></tr></thead>
      <tbody>${speed
        .map(
          (x) => `<tr><td><strong>${esc(x.label)}</strong><div class="subtle small">${esc(pathOnly(x.url))}</div></td>
        ${psi ? `<td class="num">${x.performance !== undefined ? vital(100 - x.performance, 10, 50, () => String(x.performance)) : '–'}</td>` : ''}
        <td class="num">${vital(x.lab.lcpMs, 2500, 4000, secs)}</td><td class="num">${vital(x.lab.cls, 0.1, 0.25, (v) => v.toFixed(2))}</td>
        ${field ? `<td class="num">${x.field ? `${vital(x.field.lcpMs, 2500, 4000, secs)} / ${vital(x.field.inpMs, 200, 500, (v) => `${Math.round(v)}ms`)}` : '<span class="subtle">not enough data</span>'}</td>` : ''}
        <td class="num">${x.lab.bytes ? `${(x.lab.bytes / 1e6).toFixed(1)} MB` : '–'}</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </div>`
      : ''
  }
  <div class="card">
    <div class="toolbar">
      <label class="check" style="margin:0"><input type="checkbox" id="onlyissues" checked> Only pages with issues</label>
      <input id="crawlq" type="search" placeholder="Filter by URL, title or issue" style="max-width:280px;height:32px">
      <span class="subtle small" id="crawlcount"></span>
    </div>
    <div class="table-scroll"><table class="crawl-table">
      <thead><tr><th>Page</th><th>Status</th><th>Issues</th><th class="num">Words</th><th class="num">Clicks deep</th><th class="num">Links in</th></tr></thead>
      <tbody id="crawlrows">${rows}</tbody>
    </table></div>
  </div>`;
}

function searchPanel(r: AuditResult) {
  const d = r.search;
  if (!d) return `<div class="card card-pad"><p class="muted">${esc(r.searchNote ?? 'No search data.')}</p></div>`;
  const dbLabel = SEARCH_DBS.find((x) => x.id === d.db)?.label ?? d.db.toUpperCase();
  const hasTraffic = d.trafficTrend.some((t) => t.traffic > 0);
  const maxT = Math.max(1, ...d.trafficTrend.map((t) => t.traffic));
  const table = (head: string, body: string) => `<div class="table-scroll"><table class="compact"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  return `
  <div class="kpis">
    <div class="card kpi"><b>${fmtNum(d.authorityScore)}</b><span>Authority score</span><small>Semrush, 0 to 100</small></div>
    <div class="card kpi"><b>${fmtNum(d.backlinks)}</b><span>Backlinks</span><small>links from other sites</small></div>
    <div class="card kpi"><b>${d.topKeywords.filter((k) => (k.position ?? 99) <= 10).length}</b><span>Top-10 rankings</span><small>among top keywords</small></div>
    <div class="card kpi"><b>${hasTraffic ? fmtNum(d.trafficTrend[d.trafficTrend.length - 1].traffic) : '–'}</b><span>Est. organic visits / month</span><small>${hasTraffic ? 'latest month' : 'no estimate for this market'}</small></div>
  </div>
  ${hasTraffic ? `<div class="card card-pad" style="margin-bottom:16px"><h2 style="margin-bottom:10px">Organic traffic trend</h2><div class="trend">${d.trafficTrend.map((t) => `<div class="tb" title="${t.month}: ${fmtNum(t.traffic)}"><i style="height:${Math.max(2, (t.traffic / maxT) * 100)}%"></i><span>${t.month.slice(5)}</span></div>`).join('')}</div></div>` : ''}
  <div class="grid2">
    <div class="card"><div class="card-head"><h2>Keywords ${esc(r.clientName)} ranks for</h2></div>
      ${d.topKeywords.length ? table('<th>Keyword</th><th class="num">Position</th><th class="num">Searches/mo</th>', d.topKeywords.map((k) => `<tr><td>${esc(k.phrase)}${k.url ? `<div class="subtle small">${esc(k.url.replace(/^https?:\/\//, ''))}</div>` : ''}</td><td class="num">${k.position ?? '–'}</td><td class="num">${fmtNum(k.volume)}</td></tr>`).join('')) : '<div class="empty">No ranking keywords in this database.</div>'}
    </div>
    <div class="card"><div class="card-head"><h2>Organic competitors</h2></div>
      ${d.competitors.length ? table('<th>Site</th><th class="num">Shared keywords</th>', d.competitors.map((c) => `<tr><td><a href="https://${esc(c.domain)}" target="_blank" rel="noopener">${esc(c.domain)}</a></td><td class="num">${fmtNum(c.commonKeywords)}</td></tr>`).join('')) : '<div class="empty">No competitors identified.</div>'}
    </div>
  </div>
  ${d.keywordIdeas.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Keyword opportunities</h2><span class="subtle small">related to ${esc(d.seeds.map((x) => `"${x}"`).join(' and '))}</span></div>
    ${table('<th>Keyword</th><th class="num">Searches/mo</th><th class="num">Difficulty</th><th class="num">CPC (USD)</th>', d.keywordIdeas.map((k) => `<tr><td>${esc(k.phrase)}</td><td class="num">${fmtNum(k.volume)}</td><td class="num">${typeof k.difficulty === 'number' ? `<span class="vital ${k.difficulty < 30 ? 'good' : k.difficulty < 60 ? 'ok' : 'poor'}">${k.difficulty}</span>` : '–'}</td><td class="num">${typeof k.cpc === 'number' ? k.cpc.toFixed(2) : '–'}</td></tr>`).join(''))}</div>` : ''}
  ${d.topBacklinks.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Strongest backlinks</h2></div>
    ${table('<th>Linking page</th><th>Anchor text</th><th class="num">Authority</th>', d.topBacklinks.map((b) => `<tr><td><a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">${esc(b.sourceTitle || b.sourceUrl)}</a><div class="subtle small">${esc(new URL(b.sourceUrl).host)}</div></td><td class="muted">${esc(b.anchor || '–')}</td><td class="num">${b.authority ?? '–'}</td></tr>`).join(''))}</div>` : ''}
  <p class="subtle small" style="margin-top:12px">Semrush estimates for the ${esc(dbLabel)} database, for ${esc(d.domain)}, via Apify${d.costUsd ? ` (cost US$${d.costUsd.toFixed(2)})` : ''}. Modelled estimates, not the client's real Google data, and not part of the score.${d.notes.length ? ' ' + esc(d.notes.join(' ')) : ''}</p>`;
}

// ---------------------------------------------------------------- Affected URLs

const SEV: Record<IssueGroup['severity'], string> = { fail: 'fail', warn: 'warn', info: 'info' };

function urlsPanel(groups: IssueGroup[], multi: boolean) {
  const sorted = [...groups].sort((a, b) => ['fail', 'warn', 'info'].indexOf(a.severity) - ['fail', 'warn', 'info'].indexOf(b.severity) || b.urls.length - a.urls.length);
  const nav = sorted
    .map(
      (g, i) => `<button type="button" class="issue-item${i === 0 ? ' on' : ''}" data-group="${esc(g.id)}">
      <span class="sev ${SEV[g.severity]}"></span><span class="il">${esc(g.label)}${multi ? `<small>${g.module === 'ai' ? 'AI visibility' : 'SEO'}</small>` : ''}</span><span class="ic">${g.urls.length}</span>
    </button>`,
    )
    .join('');
  const bodies = sorted
    .map(
      (g, i) => `<div class="issue-body" data-group="${esc(g.id)}"${i === 0 ? '' : ' hidden'}>
      <div class="issue-head">
        <div><h2>${esc(g.label)} <span class="subtle">${g.urls.length}</span></h2><p class="muted small">${esc(g.description)}</p></div>
        <div class="actions"><input type="search" class="issue-q" placeholder="Filter URLs" style="width:200px;height:32px"><button type="button" class="btn sm csv">Download CSV</button></div>
      </div>
      <div class="table-scroll"><table class="compact">
        <thead><tr><th style="width:34px">#</th><th>URL</th>${g.urls.some((u) => u.detail) ? `<th>${esc(g.detailLabel ?? 'Detail')}</th>` : ''}</tr></thead>
        <tbody>${g.urls
          .map(
            (u, k) => `<tr data-url="${esc(u.url.toLowerCase())}"><td class="subtle">${k + 1}</td><td class="url-cell"><a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(pathOnly(u.url))}</a> <span class="ext">↗</span></td>${g.urls.some((x) => x.detail) ? `<td class="muted small">${esc(u.detail ?? '')}</td>` : ''}</tr>`,
          )
          .join('')}</tbody>
      </table></div>
    </div>`,
    )
    .join('');
  return `<div class="urls-layout"><nav class="card issue-nav" aria-label="Issues">${nav}</nav><div class="card issue-main">${bodies}</div></div>`;
}

/** "View 12 URLs" link for a check, when the crawl has a URL list for it. */
function urlsLink(groups: IssueGroup[], checkId: string) {
  const gs = groups.filter((g) => g.checkId === checkId);
  const n = new Set(gs.flatMap((g) => g.urls.map((u) => u.url))).size;
  return n ? `<a href="#urls" class="urls-link" data-group="${esc(gs.sort((a, b) => b.urls.length - a.urls.length)[0].id)}">View ${n} affected URL${n === 1 ? '' : 's'} →</a>` : '';
}

// ---------------------------------------------------------------- Competitors

function compareCard(r: AuditResult) {
  const comps = r.competitors ?? [];
  if (!comps.length) return '';
  const mods = r.scorecards.map((s) => s.module);
  const cell = (score?: number, best?: boolean) =>
    score === undefined ? '<span class="subtle">–</span>' : `<div class="score-cell"><span class="score-num">${score}</span><div class="meter"><span class="${band(score)}" style="width:${score}%"></span></div>${best ? '<span class="lead-tag">Highest</span>' : ''}</div>`;
  const rows = [
    { name: r.clientName, host: hostOf(r.finalUrl), you: true, error: undefined as string | undefined, cards: r.scorecards.map((s) => ({ module: s.module, overall: s.overall, categories: s.categories.map((c) => ({ id: c.id, name: c.name, score: c.score })) })) },
    ...comps.map((c) => ({ name: c.name, host: c.host.replace(/^www\./, ''), you: false, error: c.error, cards: c.scorecards })),
  ];
  const best = (m: string) => Math.max(...rows.map((x) => x.cards.find((c) => c.module === m)?.overall ?? -1));
  const cats = r.scorecards.flatMap((s) => s.categories.map((c) => ({ module: s.module, id: c.id, name: c.name })));
  const catBest = (id: string) => Math.max(...rows.map((x) => x.cards.flatMap((c) => c.categories).find((k) => k.id === id)?.score ?? -1));
  return `<section class="card compare-card">
    <div class="card-head"><h2>How ${esc(r.clientName)} compares</h2><span class="subtle small">Same audits and business type${mods.includes('seo') ? '; competitor SEO is based on a crawl of up to 50 pages' : ''}</span></div>
    <div class="table-scroll"><table>
      <thead><tr><th>Site</th>${mods.map((m) => `<th>${m === 'ai' ? 'AI readiness' : 'SEO'}</th>`).join('')}</tr></thead>
      <tbody>${rows
        .map(
          (x) => `<tr class="${x.you ? 'you' : ''}"><td><strong>${esc(x.name)}</strong>${x.you ? ' <span class="badge mod">Client</span>' : ''}<div class="subtle small">${esc(x.host)}</div></td>${
            x.error
              ? `<td colspan="${mods.length}" class="muted small">Could not be scored: ${esc(x.error.slice(0, 120))}</td>`
              : mods.map((m) => { const v = x.cards.find((c) => c.module === m)?.overall; return `<td>${cell(v, v === best(m) && rows.length > 1)}</td>`; }).join('')
          }</tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <details class="cat-compare"><summary>Compare by category</summary>
      <div class="table-scroll"><table class="compact">
        <thead><tr><th>Category</th>${rows.map((x) => `<th class="num">${esc(x.name)}</th>`).join('')}</tr></thead>
        <tbody>${cats
          .map(
            (c) => `<tr><td>${esc(c.name)}${mods.length > 1 ? ` <span class="subtle small">${c.module === 'ai' ? 'AI' : 'SEO'}</span>` : ''}</td>${rows
              .map((x) => {
                const v = x.cards.flatMap((k) => k.categories).find((k) => k.id === c.id)?.score;
                return `<td class="num">${v === undefined ? '<span class="subtle">–</span>' : `<span class="${v === catBest(c.id) ? 'lead' : ''}">${v}</span>`}</td>`;
              })
              .join('')}</tr>`,
          )
          .join('')}</tbody>
      </table></div>
    </details>
  </section>`;
}

// ---------------------------------------------------------------- Result

const STATUS: Record<Status, [string, string]> = { pass: ['Good', 'pass'], warn: ['Improve', 'warn'], fail: ['Fix', 'fail'], info: ['Note', 'info'] };
const ROBOTS: Record<BotResult['robots'], [string, string]> = { allowed: ['Allowed', 'pass'], partial: ['Partly blocked', 'warn'], blocked: ['Blocked', 'fail'], unknown: ['Unreadable', 'warn'] };
const LIVE: Record<BotResult['live'], [string, string]> = { ok: ['Got through', 'pass'], blocked: ['Blocked', 'fail'], challenged: ['Challenged', 'fail'], error: ['No response', 'warn'], 'not-tested': ['Rules only', 'info'] };
const PURPOSE: Record<BotResult['purpose'], string> = { search: 'Search index', user: 'Live browsing', training: 'Model training' };

const badge = ([label, cls]: [string, string]) => `<span class="badge ${cls}">${esc(label)}</span>`;

function impact(c: Check, r: AuditResult): [string, string] {
  const v = impactIn(c, r);
  return v >= 4 ? ['High impact', 'fail'] : v >= 1.5 ? ['Medium impact', 'warn'] : ['Low impact', 'info'];
}

/** Hidden fields so Re-run repeats the same audit options. */
function rerunFields(job: Job, opts: { businessType?: boolean } = {}) {
  const mods = job.modules ?? ['ai'];
  return [
    `<input type="hidden" name="url" value="${esc(job.url)}">`,
    `<input type="hidden" name="client" value="${esc(job.client ?? '')}">`,
    opts.businessType === false ? '' : `<input type="hidden" name="business_type" value="${esc(job.businessType ?? 'auto')}">`,
    ...mods.map((m) => `<input type="hidden" name="audits" value="${m}">`),
    job.crawlLimit ? `<input type="hidden" name="pages" value="${job.crawlLimit}">` : '',
    job.searchData ? '<input type="hidden" name="search" value="on">' : '',
    job.searchDb ? `<input type="hidden" name="db" value="${esc(job.searchDb)}">` : '',
    ...(job.competitors ?? []).map((c) => `<input type="hidden" name="competitor" value="${esc(c)}">`),
  ].join('');
}

export type View = ModuleId | 'all';

export function resultPage(job: Job, input: AuditResult, logo?: string, view: View = 'all') {
  const full = normalizeResult(input);
  const r = viewResult(full, view);
  const groups = r.issueGroups ?? [];
  const q = view === 'all' ? '' : `?view=${view}`;
  const hasAI = r.modules.includes('ai');
  const hasSEO = r.modules.includes('seo');
  const multi = r.scorecards.length > 1;
  const all = r.scorecards.flatMap((sc) => sc.categories.flatMap((c) => c.checks.map((k) => ({ ...k, module: sc.module, catName: c.name }))));
  const count = (s: Status) => all.filter((c) => c.status === s).length;
  const catName = (id: string) => r.scorecards.flatMap((sc) => sc.categories).find((c) => c.id === id)?.name ?? '';
  const answerBots = r.bots.filter((b) => b.purpose !== 'training');

  const priorities = r.priorities
    .map(
      (c, i) => `<details class="prio"${i === 0 ? ' open' : ''}>
      <summary>
        <span class="rank">${i + 1}</span>
        <div><h3>${esc(c.title)}</h3>
          <div class="meta">${badge(impact(c, r))}${c.effort ? `<span class="badge outline">${esc(c.effort)}</span>` : ''}${c.alsoAffects ? '<span class="badge both">SEO + AI visibility</span>' : multi ? `<span class="badge mod">${MODULE_NAMES[c.module ?? 'ai']}</span>` : ''}<span class="subtle small">${esc(catName(c.category))}</span></div></div>
        <span class="chev" aria-hidden="true">›</span>
      </summary>
      <div class="body">
        <div><h4>What we found</h4><p>${esc(c.finding)}</p>${urlsLink(groups, c.id)}</div>
        <div><h4>Why it matters</h4><p class="muted">${esc(c.why ?? '')}</p></div>
        <div class="fix"><h4>What to do</h4><p>${esc(c.fix)}</p></div>
      </div>
    </details>`,
    )
    .join('');

  const checks = all
    .map(
      (c) => `<div class="check" data-status="${c.status}" data-cat="${c.category}" data-module="${c.module}">
      <div>${badge(STATUS[c.status])}</div>
      <div>
        <h3>${esc(c.title)}<span class="cat-label">${multi ? `${MODULE_NAMES[c.module]} · ` : ''}${esc(c.catName)}</span></h3>
        <p>${esc(c.finding)}</p>
        ${c.fix && c.status !== 'pass' ? `<div class="fixline"><b>Fix:</b> ${esc(c.fix)}</div>` : ''}
        ${c.status === 'pass' ? '' : urlsLink(groups, c.id)}
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

  const ratioOf = (p: (typeof r.pages)[number]) => (p.renderedWords >= 0 ? Math.min(100, Math.round((p.rawWords / Math.max(1, p.renderedWords)) * 100)) : 101);
  const worst = [...r.pages].filter((p) => p.compare && (ratioOf(p) < 70 || p.compare.conflicts.length)).sort((x, y) => ratioOf(x) - ratioOf(y))[0];
  const pageRows = r.pages
    .map((p) => {
      const ok = p.renderedWords >= 0;
      const ratio = ratioOf(p);
      const cmp = p.compare;
      const notes = [
        cmp?.conflicts.length ? `${cmp.conflicts.map((c) => c.label).join(', ')} differ` : '',
        p.widgets.length ? `Uses ${p.widgets.join(', ')}` : '',
        p.hiddenFacts.length ? `Hidden from AI: ${p.hiddenFacts.join(', ')}` : '',
      ].filter(Boolean);
      const body = !cmp
        ? `<p class="muted small" style="padding:4px 0 16px">${ok ? 'This page was behind a bot challenge when we visited, so the two versions could not be compared.' : 'This page could not be loaded in a browser, so the two versions could not be compared.'}</p>`
        : `${cmp.incomplete ? `<div class="alert note">Some content did not load in our browser (${esc(cmp.incomplete.join(', '))}), so the visitor view below may be incomplete.</div>` : ''}${cmp.conflicts
            .map(
              (c) => `<div class="alert warn-alert"><strong>${esc(c.label)} differ.</strong> AI sees ${c.ai.map((v) => `<mark class="ai">${esc(v)}</mark>`).join(' ')}, but visitors see ${c.visitors.map((v) => `<mark class="vis">${esc(v)}</mark>`).join(' ')}.</div>`,
            )
            .join('')}
          <div class="compare">
            <div class="side">
              <div class="side-head"><h4>What AI crawlers see</h4><span class="subtle small">${cmp.aiWords} words</span></div>
              <p class="side-note">The text in the HTML your server sends. Most AI crawlers stop here.</p>
              <div class="excerpt">${esc(cmp.aiExcerpt)}${cmp.aiExcerpt.length >= 900 ? '…' : ''}</div>
            </div>
            <div class="side vis">
              <div class="side-head"><h4>Only visitors see</h4><span class="subtle small">${cmp.visitorOnlyWords} words in ${cmp.visitorOnlyCount} ${cmp.visitorOnlyCount === 1 ? 'block' : 'blocks'}</span></div>
              <p class="side-note">Added by JavaScript after the page loads. Invisible to most AI crawlers.</p>
              ${
                cmp.visitorOnly.length
                  ? `<ul class="blocks">${cmp.visitorOnly.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${cmp.visitorOnlyCount > cmp.visitorOnly.length ? `<p class="subtle small" style="margin-top:6px">+ ${cmp.visitorOnlyCount - cmp.visitorOnly.length} more</p>` : ''}`
                  : '<p class="good-note">Nothing significant. AI crawlers receive the same content visitors see.</p>'
              }
            </div>
          </div>`;
      let shownPath = new URL(p.url).pathname;
      try { shownPath = decodeURI(shownPath); } catch {}
      return `<details class="pg"${p === worst ? ' open' : ''}>
        <summary>
          <div class="pg-name"><strong>${esc(p.label)}</strong><a class="subtle small" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(shownPath)}</a></div>
          <div class="pg-ratio">${ok ? scoreCell(ratio).replace('<span class="score-num">' + ratio + '</span>', `<span class="score-num" style="width:40px">${ratio}%</span>`) : '<span class="subtle">n/a</span>'}<span class="subtle small hide-sm">${p.rawWords} of ${ok ? p.renderedWords : '?'} words</span></div>
          <div class="pg-notes muted small">${notes.length ? esc(notes.join('. ')) : ''}</div>
          <span class="chev" aria-hidden="true">›</span>
        </summary>
        <div class="pg-body">${body}</div>
      </details>`;
    })
    .join('');

  const b = r.business ?? { id: 'auto', label: 'Not recorded', detected: true, confidence: 'low', reason: 'this audit was run before business types were added', query: '' };
  return layout(
    r.clientName,
    `<main class="page">
  <div class="crumbs"><a href="/">Audits</a> / ${esc(r.clientName)}</div>
  ${
    full.modules.length > 1
      ? `<div class="viewbar"><span class="muted small">Show</span><div class="seg view-seg" role="group" aria-label="Which audit to show">${(['all', 'ai', 'seo'] as View[])
          .map((v) => `<a href="/audits/${esc(job.id)}${v === 'all' ? '' : `?view=${v}`}" class="view-link" aria-pressed="${v === view}">${v === 'all' ? 'Both audits' : v === 'ai' ? 'AI visibility only' : 'SEO only'}</a>`)
          .join('')}</div></div>`
      : ''
  }
  <div class="head">
    <div>
      <h1>${esc(r.clientName)}</h1>
      <div class="actions" style="margin-top:8px">
        <a class="chip" href="${esc(r.finalUrl)}" target="_blank" rel="noopener">${esc(hostOf(r.finalUrl))} ↗</a>
        <span class="chip">${esc(b.label)}</span>
        ${r.modules.map((m) => `<span class="chip">${MODULE_NAMES[m]}</span>`).join('')}
        <span class="chip">${esc(fmt(r.auditedAt))}</span>
      </div>
    </div>
    <div class="actions">
      <form method="post" action="/audits" style="display:contents">
        ${rerunFields(job)}
        <button class="btn" type="submit" title="Run this audit again with the same options">Re-run</button>
      </form>
      <a class="btn" href="/audits/${esc(job.id)}/report.html${q}" target="_blank" rel="noopener">Client report${view === 'all' ? '' : ` (${MODULE_NAMES[view]})`} ↗</a>
      <a class="btn primary" href="/audits/${esc(job.id)}/report.pdf${q}">Download PDF${view === 'all' ? '' : ` (${MODULE_NAMES[view]})`}</a>
    </div>
  </div>

  ${r.scorecards
    .map((sc) => {
      const cs = sc.categories.flatMap((c) => c.checks);
      const n = (st: Status) => cs.filter((c) => c.status === st).length;
      return `<section class="overview">
    <div class="card total">
      <div class="muted small" style="font-weight:600">${sc.module === 'seo' ? 'SEO score' : 'AI readiness score'}</div>
      <div class="big score-num">${sc.overall}<small> / 100</small></div>
      <div class="meter" style="height:8px"><span class="${band(sc.overall)}" style="width:${sc.overall}%"></span></div>
      <div style="margin-top:10px;font-weight:600">${esc(sc.grade)}</div>
      <div class="counts">
        <span class="badge fail">${n('fail')} to fix</span>
        <span class="badge warn">${n('warn')} to improve</span>
        <span class="badge pass">${n('pass')} good</span>
      </div>
    </div>
    <div class="cats">
      ${sc.categories
        .map(
          (c) => `<button class="card cat" type="button" data-goto-cat="${c.id}" title="${esc(c.blurb)}">
          <span class="name">${esc(c.name)}</span>
          <span class="score-num">${c.score}</span>
          <div class="meter"><span class="${band(c.score)}" style="width:${c.score}%"></span></div>
          <span class="hint">${((k) => `${k} ${k === 1 ? 'issue' : 'issues'}`)(c.checks.filter((k) => k.status === 'fail' || k.status === 'warn').length)} · ${c.weight}% of score</span>
        </button>`,
        )
        .join('')}
    </div>
  </section>`;
    })
    .join('')}

  ${compareCard(r)}

  <section class="card biz">
    <div>
      <strong>Assessed as: ${esc(b.label)}</strong>
      <span class="muted small">${b.detected ? `Detected automatically (${esc(b.confidence)} confidence): ${esc(b.reason)}.` : 'Chosen when the audit was started.'}</span>
    </div>
    <form method="post" action="/audits">
      ${rerunFields(job, { businessType: false })}
      <label for="rt" class="small muted" style="margin:0;font-weight:500">Wrong type?</label>
      ${businessSelect('business_type', b.id).replace('id="business_type"', 'id="rt"')}
      <button class="btn sm" type="submit">Re-run as this type</button>
    </form>
  </section>

  <p class="muted" style="margin-bottom:18px;max-width:820px">${esc(r.summary)}</p>

  <div class="tabs" role="tablist">
    <button class="tab" role="tab" data-tab="priorities">Priorities<span class="count">${r.priorities.length}</span></button>
    <button class="tab" role="tab" data-tab="checks">All checks<span class="count">${all.length}</span></button>
    ${groups.length ? `<button class="tab" role="tab" data-tab="urls">Affected URLs<span class="count">${groups.length}</span></button>` : ''}
    ${hasSEO && r.siteCrawl ? `<button class="tab" role="tab" data-tab="crawl">Site crawl<span class="count">${r.siteCrawl.pagesCrawled}</span></button>` : ''}
    ${hasSEO && (r.search || r.searchNote) ? `<button class="tab" role="tab" data-tab="search">Search data</button>` : ''}
    ${hasAI ? `<button class="tab" role="tab" data-tab="crawlers">AI crawlers<span class="count">${answerBots.filter((x) => x.robots === 'allowed' && x.live !== 'blocked' && x.live !== 'challenged').length}/${answerBots.length}</span></button>
    <button class="tab" role="tab" data-tab="pages">AI vs visitors<span class="count">${r.pages.length}</span></button>` : ''}
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
      <select id="catf" aria-label="Filter by category"><option value="all">All categories</option>${r.scorecards.map((sc) => `${multi ? `<optgroup label="${sc.name}">` : ''}${sc.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}${multi ? '</optgroup>' : ''}`).join('')}</select>
    </div>
    <div id="checklist">${checks}</div>
    <div class="empty" id="nochecks" hidden>No checks match these filters.</div>
  </section>

  ${hasAI ? `<section class="panel card" data-panel="crawlers" hidden>
    <div class="card-head"><p class="muted small" style="max-width:760px">We checked whether <code>robots.txt</code> permits each crawler, then visited the homepage pretending to be it. Search and live-browsing crawlers decide whether AI can cite the site. "Rules only" crawlers never visit; they exist only as robots.txt settings.</p></div>
    <div class="table-scroll"><table>
      <thead><tr><th>Company</th><th>Crawler</th><th>Used for</th><th>robots.txt</th><th>Live test</th></tr></thead>
      <tbody>${botRows}</tbody>
    </table></div>
  </section>

  <section class="panel card" data-panel="pages" hidden>
    <div class="card-head"><p class="muted small">We read each page twice: as the raw HTML most AI crawlers receive, and in a full browser like a visitor. Open a page to compare the two.</p></div>
    <div class="pg-head hide-sm"><span>Page</span><span>AI can read</span><span>Notes</span><span></span></div>
    ${pageRows}
  </section>` : ''}
  ${groups.length ? `<section class="panel" data-panel="urls" hidden>${urlsPanel(groups, multi)}</section>` : ''}
  ${hasSEO && r.siteCrawl ? `<section class="panel" data-panel="crawl" hidden>${crawlPanel(r)}</section>` : ''}
  ${hasSEO && (r.search || r.searchNote) ? `<section class="panel" data-panel="search" hidden>${searchPanel(r)}</section>` : ''}
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
  var start=(location.hash||'').slice(1);show(tabs.some(function(t){return t.dataset.tab===start})?start:'priorities');

  var st='all',cat=document.getElementById('catf');
  function filter(){
    var n=0;document.querySelectorAll('#checklist .check').forEach(function(c){var m=(st==='all'||c.dataset.status===st)&&(cat.value==='all'||c.dataset.cat===cat.value);c.hidden=!m;if(m)n++});
    document.getElementById('nochecks').hidden=n>0;
  }
  document.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){st=b.dataset.status;document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});filter()})});
  cat.addEventListener('change',filter);
  // Affected URLs: pick an issue, filter, export
  function pickGroup(id){
    document.querySelectorAll('.issue-item').forEach(function(b){b.classList.toggle('on',b.dataset.group===id)});
    document.querySelectorAll('.issue-body').forEach(function(d){d.hidden=d.dataset.group!==id});
  }
  document.querySelectorAll('.issue-item').forEach(function(b){b.addEventListener('click',function(){pickGroup(b.dataset.group);if(innerWidth<960)document.querySelector('.issue-main').scrollIntoView({behavior:'smooth'})})});
  document.querySelectorAll('.urls-link').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();pickGroup(a.dataset.group);show('urls');document.querySelector('.tabs').scrollIntoView({behavior:'smooth'})})});
  document.querySelectorAll('.issue-q').forEach(function(inp){inp.addEventListener('input',function(){var v=inp.value.trim().toLowerCase();inp.closest('.issue-body').querySelectorAll('tbody tr').forEach(function(tr){tr.hidden=v&&tr.dataset.url.indexOf(v)<0})})});
  document.querySelectorAll('.issue-body .csv').forEach(function(btn){btn.addEventListener('click',function(){
    var body=btn.closest('.issue-body'),rows=[[ 'URL' ].concat([].slice.call(body.querySelectorAll('thead th')).slice(2).map(function(th){return th.textContent}))];
    body.querySelectorAll('tbody tr').forEach(function(tr){if(tr.hidden)return;var c=tr.querySelectorAll('td');rows.push([c[1].querySelector('a').href].concat([].slice.call(c).slice(2).map(function(td){return td.textContent})))});
    var csv=rows.map(function(r){return r.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"'}).join(',')}).join('\\n');
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=body.dataset.group+'.csv';a.click();
  })});
  // keep the current tab when switching views
  document.querySelectorAll('.view-link').forEach(function(a){a.addEventListener('click',function(){a.href=a.href.split('#')[0]+location.hash})});

  var only=document.getElementById('onlyissues'),cq=document.getElementById('crawlq');
  function crawlFilter(){
    if(!only)return;var q=cq.value.trim().toLowerCase(),n=0,rows=document.querySelectorAll('#crawlrows tr');
    rows.forEach(function(tr){var m=(!only.checked||tr.dataset.issues!=='0')&&(!q||tr.dataset.search.indexOf(q)>-1);tr.hidden=!m;if(m)n++});
    document.getElementById('crawlcount').textContent=n+' of '+rows.length+' pages';
  }
  if(only){only.addEventListener('change',crawlFilter);cq.addEventListener('input',crawlFilter);crawlFilter();}
  document.querySelectorAll('[data-goto-cat]').forEach(function(b){b.addEventListener('click',function(){cat.value=b.dataset.gotoCat;st='all';document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.status==='all')});filter();show('checks');document.querySelector('.tabs').scrollIntoView({behavior:'smooth'})})});
})();
</script>`,
    { logo },
  );
}
