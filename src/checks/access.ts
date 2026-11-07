import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import { mk, list } from './util.js';

export function accessChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];

  // robots.txt health
  if (ctx.robotsState === 'ok') {
    checks.push(mk({ id: 'robots-file', category: 'access', title: 'robots.txt file', weight: 2, score: 1,
      finding: 'Your robots.txt file loads correctly, so crawlers can read your access rules.' }));
  } else if (ctx.robotsState === 'missing') {
    checks.push(mk({ id: 'robots-file', category: 'access', title: 'robots.txt file', weight: 2, score: 0.7,
      finding: 'There is no robots.txt file. Crawlers are allowed in by default, but you are missing the chance to point them to your sitemap.',
      why: 'robots.txt is the first file every crawler asks for. It tells AI and search crawlers what they may read and where your sitemap is.',
      fix: 'Add a simple robots.txt that allows all crawlers and lists your sitemap URL.', effort: 'Quick win' }));
  } else {
    checks.push(mk({ id: 'robots-file', category: 'access', title: 'robots.txt file is broken', weight: 2, score: 0.1,
      finding: `${ctx.robotsProblem}. Crawlers cannot read your access rules, and each AI company handles this differently: some assume everything is allowed, others back off and crawl less.`,
      why: 'robots.txt is the first file every crawler asks for. When it fails to load, crawler behaviour becomes unpredictable and your sitemap is never discovered through it.',
      fix: 'Fix the server or CDN redirect rule that affects /robots.txt so it returns the file directly with a 200 status. On WordPress this is usually a redirect plugin, an SEO plugin setting, or a Cloudflare page rule.',
      effort: 'Developer needed', evidence: ctx.robots.redirects.map((r) => `${r.status} ${r.url}`).slice(0, 4) }));
  }

  // Search and live-browsing crawlers via robots.txt
  const answerBots = ctx.bots.filter((b) => b.purpose !== 'training');
  const blocked = answerBots.filter((b) => b.robots === 'blocked' || b.robots === 'partial');
  const unknown = answerBots.filter((b) => b.robots === 'unknown');
  if (unknown.length === answerBots.length) {
    checks.push(mk({ id: 'answer-bots-robots', category: 'access', title: 'AI search crawler permissions', weight: 4, score: 0.5,
      finding: 'Because robots.txt is broken, we cannot confirm whether ChatGPT, Claude, Gemini and Perplexity are permitted to read your site. This resolves once robots.txt is fixed; make sure the fixed file does not disallow OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Googlebot or Bingbot.',
      why: `These crawlers fetch the pages that AI assistants quote when answering questions like "${ctx.profile.query}". If they are not permitted, you will not be cited.`,
      // No separate fix: this resolves with the robots.txt fix, so it should not be a duplicate priority.
    }));
  } else {
    const score = answerBots.filter((b) => b.robots === 'allowed').length / answerBots.length;
    checks.push(mk({ id: 'answer-bots-robots', category: 'access', title: 'AI search crawler permissions', weight: 4, score,
      finding: blocked.length
        ? `robots.txt blocks ${list(blocked.map((b) => `${b.token} (${b.product})`))}.`
        : 'robots.txt allows every AI search and browsing crawler we checked.',
      why: blocked.length ? 'These crawlers fetch the pages AI assistants quote when answering questions. Blocking them means you will not be cited in those answers.' : undefined,
      fix: blocked.length ? `Remove the Disallow rules for ${list(blocked.map((b) => b.token))} in robots.txt.` : undefined,
      effort: blocked.length ? 'Quick win' : undefined }));
  }

  // Training crawlers (business choice, lower weight)
  const trainers = ctx.bots.filter((b) => b.purpose === 'training');
  const tBlocked = trainers.filter((b) => b.robots === 'blocked' || b.robots === 'partial');
  if (trainers.every((b) => b.robots === 'unknown')) {
    checks.push(mk({ id: 'training-bots', category: 'access', title: 'AI training crawler permissions', weight: 1, score: 0.5,
      finding: 'Unknown, because robots.txt could not be read.' }));
  } else {
    const score = trainers.filter((b) => b.robots === 'allowed').length / trainers.length;
    checks.push(mk({ id: 'training-bots', category: 'access', title: 'AI training crawler permissions', weight: 1, score,
      finding: tBlocked.length
        ? `robots.txt blocks ${list(tBlocked.map((b) => `${b.token} (${b.company})`))}.`
        : 'All AI training crawlers are allowed, so future AI models can learn about your business.',
      why: tBlocked.length ? 'Training crawlers shape what AI models "know" about your brand without searching. Blocking them is a legitimate business choice, but for a local business that wants to be recommended it usually costs more than it protects.' : undefined,
      fix: tBlocked.length ? 'Decide whether you want AI models to learn from your site. If yes, remove these Disallow rules.' : undefined,
      effort: tBlocked.length ? 'Quick win' : undefined }));
  }

  // Live firewall / CDN test
  const tested = ctx.bots.filter((b) => b.live !== 'not-tested' && b.live !== 'error');
  const liveBad = tested.filter((b) => b.live === 'blocked' || b.live === 'challenged');
  const ansTested = tested.filter((b) => b.purpose !== 'training');
  const ansOk = ansTested.filter((b) => b.live === 'ok').length;
  const trainOk = tested.filter((b) => b.purpose === 'training' && b.live === 'ok').length;
  const trainN = tested.filter((b) => b.purpose === 'training').length;
  const raw = tested.length ? (ansOk * 2 + trainOk) / (ansTested.length * 2 + trainN) : 0.5;
  // Any block is worth flagging, even if only one crawler is affected.
  const score = liveBad.length ? Math.min(raw, liveBad.some((b) => b.purpose !== 'training') ? 0.6 : 0.75) : raw;
  const okList = tested.filter((b) => b.live === 'ok').map((b) => b.token);
  checks.push(mk({ id: 'live-access', category: 'access', title: 'Firewall and CDN access', weight: 4, score,
    finding: liveBad.length
      ? `When we visited as ${list(liveBad.map((b) => `${b.token} (${b.company}${b.purpose === 'training' ? ' training' : ''})`))}, your server or CDN ${liveBad.some((b) => b.live === 'challenged') ? 'showed a bot challenge or blocked the request' : 'blocked the request'}. ${okList.length} other AI crawlers got through, so this looks like a rule aimed at specific crawlers.`
      : `Your homepage loaded normally for all ${tested.length} AI crawlers we imitated.`,
    why: liveBad.length ? 'Many CDNs (especially Cloudflare) now block AI crawlers by default, even when robots.txt allows them. A blocked crawler sees an error page instead of your content.' : undefined,
    fix: liveBad.length ? 'In Cloudflare, open Security > Bots and AI Crawl Control and allow the AI search crawlers. Then re-run this audit. Note: some firewalls treat our imitation differently from the real crawler, so confirm in your firewall logs.' : undefined,
    effort: liveBad.length ? 'Quick win' : undefined,
    evidence: liveBad.map((b) => `${b.token}: ${b.liveDetail}`) }));

  // Challenge / loading pages served instead of content
  const ch = ctx.challenges;
  if (ch.length) {
    const stuck = ch.filter((c) => !c.recovered);
    const pagesHit = [...new Set(ch.map((c) => c.url))];
    checks.push(mk({ id: 'bot-challenge', category: 'access', title: 'Bot protection blocks some visits', weight: 3, score: stuck.length ? 0.2 : 0.55,
      finding: `${pagesHit.length} of the ${ctx.pages.length} pages we requested sometimes returned a "${ch[0].title}" waiting or challenge page instead of your content${stuck.length ? ', and it did not clear after retrying' : ' (it cleared when we retried)'}.`,
      why: 'AI crawlers do not run the checks these pages require and do not retry like a person would. Whenever they hit this page, they see no content at all, so your site looks empty to them.',
      fix: 'Review your bot protection and loading settings: Cloudflare Bot Fight Mode or "Under Attack" mode, rate limiting, or a WordPress security or page-loader plugin. Allow verified search and AI crawlers through, and make sure the real HTML is served without a waiting screen.',
      effort: 'Moderate', evidence: ch.map((c) => `${c.url}: "${c.title}"${c.recovered ? ' (cleared on retry)' : ' (did not clear)'}`).slice(0, 6) }));
  }

  return checks;
}
