import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import { mk, list, path, pct } from './util.js';
import { PAGE_KINDS } from '../profiles.js';

export function contentChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  const pages = ctx.pages;
  const profile = ctx.profile;
  const home = pages[0];
  const n = pages.length;
  const rawText = pages.map((p) => p.raw.text).join(' ');
  const any = (k: keyof typeof home.raw.facts, src: 'raw' | 'rendered' = 'raw') => pages.some((p) => (src === 'raw' ? p.raw : p.rendered ?? p.raw).facts[k].length > 0);

  // Titles
  const titles = pages.map((p) => p.raw.title);
  const goodTitles = titles.filter((t, i) => t.length >= 20 && t.length <= 70 && titles.indexOf(t) === i);
  const tBad = pages.filter((p, i) => !goodTitles.includes(titles[i]));
  checks.push(mk({ id: 'titles', category: 'content', title: 'Page titles', weight: 1.5, score: goodTitles.length / n,
    finding: tBad.length ? `${tBad.length} of ${n} pages have a missing, duplicated, too short or too long title: ${list(tBad.map((p) => `${path(p.url)} ("${p.raw.title || 'none'}")`))}.` : 'Every page we reviewed has a clear, unique title.',
    why: tBad.length ? 'The page title is the strongest one-line summary of a page. AI and search engines use it to decide what the page is about.' : undefined,
    fix: tBad.length ? `Give each page a unique 20 to 70 character title that says what you offer${profile.physical ? ' and where' : ''}, e.g. "${profile.titleExample}".` : undefined,
    effort: tBad.length ? 'Quick win' : undefined }));

  // Meta descriptions
  const mdGood = pages.filter((p) => p.raw.metaDescription.length >= 50 && p.raw.metaDescription.length <= 170);
  const mdBad = pages.filter((p) => !mdGood.includes(p));
  checks.push(mk({ id: 'meta-desc', category: 'content', title: 'Page descriptions', weight: 1, score: mdGood.length / n,
    finding: mdBad.length ? `${mdBad.length} of ${n} pages are missing a good meta description: ${list(mdBad.map((p) => path(p.url)))}.` : 'Every page has a useful meta description.',
    why: mdBad.length ? 'The meta description is often the summary an AI or search engine shows next to your link.' : undefined,
    fix: mdBad.length ? 'Write a 1 to 2 sentence description for each page covering what it offers, where and for whom.' : undefined,
    effort: mdBad.length ? 'Quick win' : undefined }));

  // H1
  const h1Good = pages.filter((p) => p.raw.h1.length === 1);
  const h1Bad = pages.filter((p) => p.raw.h1.length !== 1);
  checks.push(mk({ id: 'h1', category: 'content', title: 'Main page headings', weight: 1.5, score: h1Good.length / n,
    finding: h1Bad.length ? `${h1Bad.length} of ${n} pages do not have exactly one main heading (H1): ${list(h1Bad.map((p) => `${path(p.url)} (${p.raw.h1.length})`))}.` : 'Every page has exactly one main heading.',
    why: h1Bad.length ? 'A single, clear H1 tells machines what the page is about. Missing or multiple H1s blur that signal.' : undefined,
    fix: h1Bad.length ? 'Give each page one H1 that states the topic plainly, and use H2s for sections.' : undefined,
    effort: h1Bad.length ? 'Quick win' : undefined }));

  // Homepage depth
  const hw = home.raw.words;
  checks.push(mk({ id: 'home-depth', category: 'content', title: 'Homepage explains the business', weight: 2, score: hw >= 400 ? 1 : hw >= 200 ? 0.6 : 0.2,
    finding: `Your homepage has ${hw} words of readable text.${hw < 400 ? ' That is thin for an AI trying to understand what you offer, who it is for and where you are.' : ''}`,
    why: hw < 400 ? 'AI builds its description of you mostly from your homepage. Image-heavy pages with little text leave it guessing.' : undefined,
    fix: hw < 400 ? 'Add a short "what we do" section in plain words: services, who they suit, location and what makes you different.' : undefined,
    effort: hw < 400 ? 'Moderate' : undefined }));

  // Location
  const sg = /singapore/i.test(rawText);
  const postal = any('postal');
  const locScore = (sg ? 0.4 : 0) + (postal ? 0.6 : 0);
  checks.push(mk({ id: 'location', category: 'content', title: profile.physical ? 'Location clearly stated' : 'Where you operate', weight: profile.physical ? 2 : 1, score: profile.physical ? locScore : Math.min(1, locScore + 0.3),
    finding: postal ? 'Your full address with postal code is in readable text.' : sg ? `You mention Singapore, but we could not find a full address with postal code in readable text.` : 'We could not find your location or service area stated in readable text.',
    why: postal ? undefined : profile.physical
      ? `Many searches for ${profile.noun.replace(/^an? /, '')}s are local ("${profile.query}"). Without a clear address, AI cannot place you on the map.`
      : 'AI often filters recommendations by country or city. Stating where you are based and who you serve helps you appear in "in Singapore" answers.',
    fix: postal ? undefined : profile.physical
      ? 'Show your full address (street, unit, postal code) in plain text in the footer and on the contact page, plus the neighbourhood and nearest MRT.'
      : 'State where you are based and which markets you serve (e.g. "Singapore-based, delivering island-wide") in plain text, and add your registered address to the footer.',
    effort: postal ? undefined : 'Quick win' }));

  // Pricing
  const priceRaw = any('price');
  const priceAny = any('price', 'rendered');
  checks.push(mk({ id: 'pricing', category: 'content', title: 'Pricing is public', weight: 2.5 * profile.pricingImportance, score: priceRaw ? 1 : priceAny ? 0.4 : 0,
    finding: priceRaw ? 'Prices are published in readable text.' : priceAny ? 'Prices appear only after JavaScript runs, so AI cannot read them.' : 'We could not find any prices on the pages we reviewed.',
    why: priceRaw ? undefined : '"How much does it cost" is one of the most common questions people ask AI. Without a price, AI says "contact them for a quote" or recommends a competitor whose prices it can see.',
    fix: priceRaw ? undefined : `Publish at least starting prices or typical ranges, e.g. "${profile.pricingExample}".${profile.pricingImportance < 0.7 ? ' If prices vary case by case, explain how they are worked out.' : ''}`,
    effort: priceRaw ? undefined : 'Quick win' }));

  // Hours
  const hours = any('hours');
  const days = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays|weekends)\b/i.test(rawText);
  const hoursLabel = profile.hoursLabel ?? 'opening hours';
  const Hours = hoursLabel.charAt(0).toUpperCase() + hoursLabel.slice(1);
  if (profile.hoursLabel) checks.push(mk({ id: 'hours', category: 'content', title: Hours, weight: profile.physical ? 1.5 : 0.75, score: hours ? 1 : days ? 0.4 : 0,
    finding: hours ? `${Hours} are in readable text.` : days ? `Days are mentioned, but we could not find actual ${hoursLabel} in readable text.` : `We could not find ${hoursLabel} in readable text.`,
    why: hours ? undefined : 'Questions like "open on Sundays" or "open late tonight" need times AI can read.',
    fix: hours ? undefined : `List ${hoursLabel} in plain text (e.g. "Mon to Fri 9am to 7pm, Sat 10am to 2pm").`,
    effort: hours ? undefined : 'Quick win' }));

  // Contact
  const contact = any('phone') || any('email');
  checks.push(mk({ id: 'contact', category: 'content', title: 'Contact details', weight: 1, score: contact ? 1 : 0,
    finding: contact ? 'A phone number or email address is in readable text.' : 'No phone number or email address in readable text.',
    fix: contact ? undefined : 'Show phone, WhatsApp and email as text (not only as icons or images).', effort: contact ? undefined : 'Quick win' }));

  // FAQ content
  const qs = [...new Set(pages.flatMap((p) => (p.rendered ?? p.raw).questionHeadings))];
  const qsRaw = [...new Set(pages.flatMap((p) => p.raw.questionHeadings))];
  checks.push(mk({ id: 'faq-content', category: 'content', title: 'Answers to common questions', weight: 2, score: qsRaw.length >= 5 ? 1 : qsRaw.length >= 2 ? 0.6 : qs.length ? 0.4 : 0,
    finding: qsRaw.length ? `We found ${qsRaw.length} question-style headings, e.g. "${qsRaw[0]}".` : qs.length ? `There are ${qs.length} FAQ-style questions, but they only appear after JavaScript runs.` : 'We did not find a FAQ or question-and-answer content.',
    why: qsRaw.length >= 5 ? undefined : 'AI answers questions, and it favours sources that already phrase content as questions and direct answers.',
    fix: qsRaw.length >= 5 ? undefined : `Add a FAQ answering what new customers ask, e.g. ${profile.faqExamples.map((q) => `"${q}"`).join(', ')}.`,
    effort: qsRaw.length >= 5 ? undefined : 'Moderate',
    evidence: qsRaw.slice(0, 6) }));

  // Key pages
  const want = profile.pages.slice(0, 6).map((k) => PAGE_KINDS[k].label);
  const found = want.filter((w) => pages.some((p) => p.label === w));
  const missingPages = want.filter((w) => !found.includes(w));
  checks.push(mk({ id: 'key-pages', category: 'content', title: 'Essential pages linked from the homepage', weight: 1.5, score: found.length / want.length,
    finding: missingPages.length ? `We found ${list(found) || 'none'} pages, but no clearly linked ${list(missingPages)} page.` : 'All the essential pages a customer (or AI) looks for are linked from your homepage.',
    why: missingPages.length ? `These are the pages people (and AI) expect from ${profile.noun}. AI follows the same links people do, and dedicated pages make the right answer easy to find.` : undefined,
    fix: missingPages.length ? `Add (or link from the main menu) a ${list(missingPages)} page.` : undefined,
    effort: missingPages.length ? 'Moderate' : undefined }));

  // Alt text
  const imgs = pages.reduce((s, p) => s + p.raw.images, 0);
  const alts = pages.reduce((s, p) => s + p.raw.imagesWithAlt, 0);
  const altScore = imgs ? alts / imgs : 1;
  checks.push(mk({ id: 'alt-text', category: 'content', title: 'Image descriptions (alt text)', weight: 1, score: altScore,
    finding: imgs ? `${pct(altScore)} of ${imgs} images have a text description.` : 'No images found in the HTML.',
    why: altScore < 0.8 ? `AI cannot see images. Alt text is how it learns that a photo shows "${profile.altExample}".` : undefined,
    fix: altScore < 0.8 ? 'Add short, descriptive alt text to photos of your products, premises, team and work.' : undefined,
    effort: altScore < 0.8 ? 'Quick win' : undefined }));

  // Language
  checks.push(mk({ id: 'lang', category: 'content', title: 'Page language declared', weight: 0.5, score: home.raw.lang ? 1 : 0,
    finding: home.raw.lang ? `Language is declared as "${home.raw.lang}".` : 'The page language is not declared.',
    fix: home.raw.lang ? undefined : 'Add lang="en-SG" to the <html> tag.', effort: home.raw.lang ? undefined : 'Quick win' }));

  return checks;
}
