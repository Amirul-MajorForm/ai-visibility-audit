import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import type { Facts } from '../page.js';
import { mk, pct, path, list } from './util.js';
import { widgetKind, WIDGET_KIND_LABEL } from '../widgets.js';

export const FACT_LABELS: Record<keyof Facts, string> = {
  price: 'prices', hours: 'opening hours or times', phone: 'phone number', postal: 'address', email: 'email address',
};

export function hiddenFacts(p: Ctx['pages'][number]): (keyof Facts)[] {
  if (!p.rendered) return [];
  return (Object.keys(FACT_LABELS) as (keyof Facts)[]).filter((k) => p.rendered!.facts[k].length > 0 && p.raw.facts[k].length === 0);
}

export function renderingChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  // Pages stuck behind a challenge are excluded: their raw content is unknown, and the challenge is reported under access.
  const rendered = ctx.pages.filter((p) => p.rendered && p.rendered.words > 0 && !p.challenged);

  if (!rendered.length) {
    checks.push(mk({ id: 'js-content', category: 'rendering', title: 'Content visible without JavaScript', weight: 4, score: 1, status: 'info',
      finding: 'We could not load the pages in a full browser this time, so we could not compare what AI sees with what visitors see. Re-run the audit to complete this check.' }));
    checks.push(mk({ id: 'hidden-facts', category: 'rendering', title: 'Key business facts readable by AI', weight: 3, score: 1, status: 'info',
      finding: 'Skipped because the browser comparison could not run.' }));
    return checks;
  }
  const failed = ctx.pages.filter((p) => !p.rendered || !p.rendered.words);
  const ratios = rendered.map((p) => ({ p, r: Math.min(1, p.raw.words / Math.max(1, p.rendered!.words)) }));
  const avg = ratios.length ? ratios.reduce((s, x) => s + x.r, 0) / ratios.length : 1;
  const worst = ratios.filter((x) => x.r < 0.7);
  checks.push(mk({ id: 'js-content', category: 'rendering', title: 'Content visible without JavaScript', weight: 4, score: avg >= 0.9 ? 1 : avg,
    finding: worst.length
      ? `On average, AI crawlers can see ${pct(avg)} of the text a visitor sees. ${list(worst.map((x) => `${path(x.p.url)} (${pct(x.r)})`))} rely heavily on JavaScript.`
      : `AI crawlers can see ${pct(avg)} of the text a visitor sees. Your pages do not depend on JavaScript to show content.`,
    why: worst.length ? 'Most AI crawlers read the raw HTML and do not run JavaScript. Anything that only appears after scripts run is invisible to them.' : undefined,
    fix: worst.length ? 'Make sure key text is in the page HTML itself (server-side rendering, or turning off "load on scroll" effects for text sections).' : undefined,
    effort: worst.length ? 'Developer needed' : undefined,
    evidence: [
      ...ratios.map((x) => `${path(x.p.url)}: ${x.p.raw.words} words in HTML vs ${x.p.rendered!.words} after JavaScript`),
      ...failed.map((p) => `${path(p.url)}: could not be loaded in a browser, not compared`),
    ] }));

  const hidden = ctx.pages.flatMap((p) => hiddenFacts(p).map((k) => ({ p, k })));
  const hiddenKinds = [...new Set(hidden.map((h) => h.k))];
  const allKinds = (Object.keys(FACT_LABELS) as (keyof Facts)[]).filter((k) => ctx.pages.some((p) => (p.rendered ?? p.raw).facts[k].length));
  const visibleKinds = allKinds.filter((k) => ctx.pages.some((p) => p.raw.facts[k].length));
  const hscore = allKinds.length ? visibleKinds.length / allKinds.length : 1;
  const invisible = hiddenKinds.filter((k) => !visibleKinds.includes(k));
  const cfEmail = ctx.pages.some((p) => p.fetch.body.includes('/cdn-cgi/l/email-protection'));
  const onlyEmail = invisible.length === 1 && invisible[0] === 'email';
  checks.push(mk({ id: 'hidden-facts', category: 'rendering', title: 'Key business facts readable by AI', weight: 3, score: onlyEmail ? Math.max(hscore, 0.7) : hscore,
    finding: invisible.length
      ? `Your ${list(invisible.map((k) => FACT_LABELS[k]))} ${invisible.length > 1 ? 'only appear' : 'only appears'} after JavaScript runs, so AI assistants cannot read ${invisible.length > 1 ? 'them' : 'it'}.${invisible.includes('email') && cfEmail ? ' Your email is scrambled by Cloudflare\'s "Email Address Obfuscation" feature, which hides it from all bots, including AI.' : ''}`
      : 'Your key facts (such as contact details, address and prices, where shown) are readable without JavaScript.',
    why: invisible.length ? 'These are exactly the details people ask AI about: "how much does X cost", "where is X", "how do I contact X".' : undefined,
    fix: invisible.length
      ? [onlyEmail ? '' : 'Put prices, address and opening hours in plain text on the page, not only inside sliders, tabs or embedded widgets.',
         invisible.includes('email') && cfEmail ? 'For the email: either turn off Email Address Obfuscation in Cloudflare (Scrape Shield), or accept the trade-off and make sure phone and WhatsApp are in plain text.' : ''].filter(Boolean).join(' ')
      : undefined,
    effort: invisible.length ? (onlyEmail ? 'Quick win' : 'Moderate') : undefined,
    evidence: hidden.map((h) => `${path(h.p.url)}: ${FACT_LABELS[h.k]} only after JavaScript`) }));

  const widgets = [...new Set(ctx.pages.flatMap((p) => p.widgets))];
  if (widgets.length) {
    const kinds = [...new Set(widgets.map(widgetKind))];
    const what = list(kinds.map((k) => WIDGET_KIND_LABEL[k]));
    const hasHoursText = ctx.pages.some((p) => p.raw.facts.hours.length > 0);
    const hasPriceText = ctx.pages.some((p) => p.raw.facts.price.length > 0);
    const textual = (hasHoursText ? 1 : 0) + (hasPriceText ? 1 : 0);
    checks.push(mk({ id: 'booking-widget', category: 'rendering', title: 'Booking and third-party widgets', weight: 2, score: textual === 2 ? 0.9 : textual === 1 ? 0.65 : 0.4,
      finding: `Your ${what} runs on ${list(widgets)}, which loads inside a JavaScript widget that AI crawlers cannot read. ${textual === 2 ? 'Times and prices also appear in plain text, which helps.' : textual === 1 ? 'Some details also appear in plain text, but not all of what the widget shows.' : 'There is no plain-text version of what the widget shows (availability, times, prices).'}`,
      why: `People ask AI things like "${ctx.profile.query}". AI can only use details that exist as readable text on your pages.`,
      fix: 'Keep the widget, but add a short plain-text summary next to it: what can be booked or ordered, typical availability or hours, starting prices and how to book.',
      effort: 'Moderate' }));
  } else {
    checks.push(mk({ id: 'booking-widget', category: 'rendering', title: 'Booking and third-party widgets', weight: 2, score: 1, status: 'info',
      finding: 'We did not detect a third-party booking, reservation or ordering widget on the pages we reviewed.' }));
  }
  return checks;
}
