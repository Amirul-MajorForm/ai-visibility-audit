import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import type { Facts } from '../page.js';
import { mk, pct, path, list } from './util.js';

export const FACT_LABELS: Record<keyof Facts, string> = {
  price: 'prices', hours: 'opening or class times', phone: 'phone number', postal: 'address', email: 'email address',
};

export function hiddenFacts(p: Ctx['pages'][number]): (keyof Facts)[] {
  if (!p.rendered) return [];
  return (Object.keys(FACT_LABELS) as (keyof Facts)[]).filter((k) => p.rendered!.facts[k].length > 0 && p.raw.facts[k].length === 0);
}

export function renderingChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  const rendered = ctx.pages.filter((p) => p.rendered && p.rendered.words > 0);

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
    evidence: ratios.map((x) => `${path(x.p.url)}: ${x.p.raw.words} words in HTML vs ${x.p.rendered!.words} after JavaScript`) }));

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
    why: invisible.length ? 'These are exactly the details people ask AI about: "how much is a class at X", "where is X", "how do I contact X".' : undefined,
    fix: invisible.length
      ? [onlyEmail ? '' : 'Put prices, address and opening hours in plain text on the page, not only inside sliders, tabs or embedded widgets.',
         invisible.includes('email') && cfEmail ? 'For the email: either turn off Email Address Obfuscation in Cloudflare (Scrape Shield), or accept the trade-off and make sure phone and WhatsApp are in plain text.' : ''].filter(Boolean).join(' ')
      : undefined,
    effort: invisible.length ? (onlyEmail ? 'Quick win' : 'Moderate') : undefined,
    evidence: hidden.map((h) => `${path(h.p.url)}: ${FACT_LABELS[h.k]} only after JavaScript`) }));

  const widgets = [...new Set(ctx.pages.flatMap((p) => p.widgets))];
  const booking = widgets.filter((w) => w !== 'ClassPass');
  if (booking.length) {
    const hasHoursText = ctx.pages.some((p) => p.raw.facts.hours.length > 0);
    checks.push(mk({ id: 'booking-widget', category: 'rendering', title: 'Class timetable and booking', weight: 2, score: hasHoursText ? 0.8 : 0.4,
      finding: `Your timetable or booking runs on ${list(booking)}, which loads inside a JavaScript widget. ${hasHoursText ? 'You also have some times in plain text, which helps.' : 'There is no plain-text version of your class schedule, so AI cannot tell what classes run when.'}`,
      why: 'People ask AI "which studios have 7am classes near Tanjong Pagar". AI can only answer that if your schedule exists as readable text.',
      fix: 'Keep the booking widget, but add a short plain-text summary next to it: class types, typical weekly times and how to book.',
      effort: 'Moderate' }));
  } else {
    checks.push(mk({ id: 'booking-widget', category: 'rendering', title: 'Class timetable and booking', weight: 2, score: 1, status: 'info',
      finding: 'We did not detect a third-party booking widget on the pages we reviewed.' }));
  }
  return checks;
}
