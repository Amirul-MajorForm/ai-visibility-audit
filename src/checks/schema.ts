import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import { flattenLd, typesOf } from '../page.js';
import { mk, list } from './util.js';

const FITNESS = ['ExerciseGym', 'HealthClub', 'SportsActivityLocation', 'SportsClub', 'SportsOrganization'];
const LOCAL = ['LocalBusiness', 'HealthAndBeautyBusiness', 'DaySpa', 'MedicalBusiness', 'ProfessionalService', 'Store'];
const ORG = ['Organization', 'Corporation'];

export function allNodes(ctx: Ctx): any[] {
  return ctx.pages.flatMap((p) => flattenLd(p.raw.jsonLd));
}

export function businessNode(ctx: Ctx) {
  const nodes = allNodes(ctx);
  const has = (n: any, set: string[]) => typesOf(n).some((t) => set.includes(t));
  const byRichness = (a: any, b: any) => Object.keys(b).length - Object.keys(a).length;
  return (
    nodes.filter((n) => has(n, FITNESS)).sort(byRichness)[0] ??
    nodes.filter((n) => has(n, LOCAL)).sort(byRichness)[0] ??
    nodes.filter((n) => has(n, ORG)).sort(byRichness)[0]
  );
}

export const BUSINESS_FIELDS: { key: string; label: string; test: (n: any) => boolean }[] = [
  { key: 'name', label: 'name', test: (n) => !!n.name },
  { key: 'url', label: 'website', test: (n) => !!n.url },
  { key: 'telephone', label: 'phone', test: (n) => !!n.telephone },
  { key: 'address', label: 'street address', test: (n) => !!(n.address && (typeof n.address === 'string' || n.address.streetAddress)) },
  { key: 'geo', label: 'map coordinates', test: (n) => !!n.geo },
  { key: 'hours', label: 'opening hours', test: (n) => !!(n.openingHoursSpecification || n.openingHours) },
  { key: 'priceRange', label: 'price range', test: (n) => !!n.priceRange },
  { key: 'image', label: 'logo or image', test: (n) => !!(n.image || n.logo) },
  { key: 'sameAs', label: 'social profiles', test: (n) => !!n.sameAs && (n.sameAs.length ?? 1) > 0 },
  { key: 'rating', label: 'review rating', test: (n) => !!n.aggregateRating },
];

export function schemaChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  const nodes = allNodes(ctx);
  const types = [...new Set(nodes.flatMap(typesOf))];
  const errors = ctx.pages.reduce((s, p) => s + p.raw.jsonLdErrors, 0);

  checks.push(mk({ id: 'schema-present', category: 'schema', title: 'Structured data present', weight: 2, score: nodes.length ? (errors ? 0.6 : 1) : 0,
    finding: nodes.length
      ? `Found structured data describing: ${list(types.slice(0, 8))}.${errors ? ` ${errors} block(s) contain errors and will be ignored.` : ''}`
      : 'No structured data (schema.org) found.',
    why: nodes.length && !errors ? undefined : 'Structured data is a machine-readable fact sheet about your business. AI systems and Google use it to confirm who you are, where you are and what you offer.',
    fix: nodes.length && !errors ? undefined : errors ? 'Fix the invalid JSON-LD blocks (test with Google\'s Rich Results Test).' : 'Add JSON-LD structured data. On WordPress, an SEO plugin such as Yoast or Rank Math can do most of it.',
    effort: nodes.length && !errors ? undefined : 'Moderate' }));

  const biz = businessNode(ctx);
  const bizTypes = biz ? typesOf(biz) : [];
  const isFitness = bizTypes.some((t) => FITNESS.includes(t));
  const isLocal = bizTypes.some((t) => LOCAL.includes(t));
  checks.push(mk({ id: 'business-type', category: 'schema', title: 'Business described as a fitness studio', weight: 3,
    score: isFitness ? 1 : isLocal ? 0.6 : biz ? 0.35 : 0,
    finding: isFitness
      ? `Your business is marked up as ${list(bizTypes)}, which tells AI exactly what kind of business you are.`
      : isLocal
        ? `Your business is marked up as a generic ${list(bizTypes)}, not specifically as a gym or fitness studio.`
        : biz
          ? `Your business is only described as a generic ${list(bizTypes)}. Nothing tells machines it is a gym with a physical location in Singapore.`
          : 'There is no structured data describing your business at all.',
    why: isFitness ? undefined : 'Marking your business as an ExerciseGym (a type of LocalBusiness) links your name to a category and a location. That is what AI needs to recommend you for "gyms in [area]" questions.',
    fix: isFitness ? undefined : 'Add ExerciseGym structured data for each studio location, including address, opening hours and phone.',
    effort: isFitness ? undefined : 'Moderate' }));

  const present = biz ? BUSINESS_FIELDS.filter((f) => f.test(biz)) : [];
  const missing = BUSINESS_FIELDS.filter((f) => !present.includes(f));
  checks.push(mk({ id: 'business-details', category: 'schema', title: 'Business details in structured data', weight: 3, score: present.length / BUSINESS_FIELDS.length,
    finding: biz
      ? `${present.length} of ${BUSINESS_FIELDS.length} key details are included.${missing.length ? ` Missing: ${list(missing.map((f) => f.label))}.` : ''}`
      : `None of the ${BUSINESS_FIELDS.length} key business details are provided as structured data.`,
    why: missing.length ? 'Each missing detail is a question AI has to guess at or look up elsewhere, often from a less accurate directory listing.' : undefined,
    fix: missing.length ? `Add ${list(missing.map((f) => f.label))} to your business structured data.` : undefined,
    effort: missing.length ? 'Moderate' : undefined }));

  const offerTypes = types.filter((t) => ['Service', 'Offer', 'OfferCatalog', 'Product', 'Course', 'Event', 'EducationEvent', 'ExerciseAction'].includes(t));
  checks.push(mk({ id: 'offer-schema', category: 'schema', title: 'Classes, services and pricing in structured data', weight: 1.5, score: offerTypes.length ? 1 : 0,
    finding: offerTypes.length ? `Your offering is described with ${list(offerTypes)} markup.` : 'Your classes, memberships and prices are not described in structured data.',
    why: offerTypes.length ? undefined : 'Structured offers (class types, membership prices, trial deals) let AI answer "how much" and "what do they offer" questions with confidence.',
    fix: offerTypes.length ? undefined : 'Add Service or Offer structured data for main programmes and membership packages, including price in SGD.',
    effort: offerTypes.length ? undefined : 'Moderate' }));

  const faq = types.includes('FAQPage');
  checks.push(mk({ id: 'faq-schema', category: 'schema', title: 'FAQ structured data', weight: 1, score: faq ? 1 : 0.3,
    finding: faq ? 'FAQ structured data is present.' : 'No FAQ structured data found.',
    why: faq ? undefined : 'FAQ markup packages your answers as clean question-and-answer pairs, the exact format AI assistants answer in.',
    fix: faq ? undefined : 'Mark up your FAQ section with FAQPage structured data.',
    effort: faq ? undefined : 'Quick win' }));

  return checks;
}
