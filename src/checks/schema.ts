import type { Check } from '../types.js';
import type { Ctx } from '../crawl.js';
import type { Profile } from '../profiles.js';
import { PROFILES } from '../profiles.js';
import { flattenLd, typesOf } from '../page.js';
import { mk, list } from './util.js';

const GENERIC = ['Organization', 'Corporation', 'LocalBusiness', 'Store'];
/** Every specific business type any profile knows about, plus generic LocalBusiness-style types. */
const ALL_BUSINESS = [...new Set([...PROFILES.flatMap((p) => p.schemaTypes), 'LocalBusiness', 'ProfessionalService', 'HealthAndBeautyBusiness', 'FoodEstablishment', 'SportsOrganization'])];
const ORG = ['Organization', 'Corporation', 'NGO'];

export function allNodes(ctx: Ctx): any[] {
  // AI crawlers read raw HTML, so only structured data present without JavaScript counts.
  return ctx.pages.flatMap((p) => flattenLd(p.raw.jsonLd));
}

export function businessNode(ctx: Ctx) {
  const nodes = allNodes(ctx);
  const has = (n: any, set: string[]) => typesOf(n).some((t) => set.includes(t));
  const byRichness = (a: any, b: any) => Object.keys(b).length - Object.keys(a).length;
  const specific = ctx.profile.schemaTypes.filter((t) => !GENERIC.includes(t));
  return (
    nodes.filter((n) => has(n, specific)).sort(byRichness)[0] ??
    nodes.filter((n) => has(n, ALL_BUSINESS.filter((t) => !ORG.includes(t)))).sort(byRichness)[0] ??
    nodes.filter((n) => has(n, ORG)).sort(byRichness)[0]
  );
}

type Field = { key: string; label: string; test: (n: any) => boolean };

const F: Record<string, Field> = {
  name: { key: 'name', label: 'name', test: (n) => !!n.name },
  url: { key: 'url', label: 'website', test: (n) => !!n.url },
  description: { key: 'description', label: 'description', test: (n) => typeof n.description === 'string' && n.description.length > 20 },
  telephone: { key: 'telephone', label: 'phone', test: (n) => !!n.telephone },
  contact: { key: 'contact', label: 'contact details', test: (n) => !!(n.telephone || n.email || n.contactPoint) },
  address: { key: 'address', label: 'street address', test: (n) => !!(n.address && (typeof n.address === 'string' || n.address.streetAddress)) },
  geo: { key: 'geo', label: 'map coordinates', test: (n) => !!n.geo },
  hours: { key: 'hours', label: 'opening hours', test: (n) => !!(n.openingHoursSpecification || n.openingHours) },
  priceRange: { key: 'priceRange', label: 'price range', test: (n) => !!n.priceRange },
  image: { key: 'image', label: 'logo or image', test: (n) => !!(n.image || n.logo) },
  sameAs: { key: 'sameAs', label: 'social profiles', test: (n) => !!n.sameAs && (n.sameAs.length ?? 1) > 0 },
  rating: { key: 'rating', label: 'review rating', test: (n) => !!n.aggregateRating },
};

/** Which business details matter depends on whether customers visit in person. */
export function fieldsFor(p: Profile): Field[] {
  return p.physical
    ? [F.name, F.url, F.telephone, F.address, F.geo, ...(p.hoursLabel ? [F.hours] : []), F.priceRange, F.image, F.sameAs, F.rating]
    : [F.name, F.url, F.description, F.contact, F.image, F.sameAs, F.address, F.rating];
}

const OFFER_FIX: Record<string, string> = {
  food: 'Add a Menu (with MenuItem prices) or link your menu with the hasMenu property on your Restaurant structured data.',
  ecommerce: 'Make sure every product page has Product structured data with price, currency (SGD) and availability. Most Shopify and WooCommerce themes can do this; check it is switched on.',
  retail: 'Add Product structured data with prices for your main products, or an OfferCatalog listing your ranges.',
  saas: 'Add SoftwareApplication structured data with your plans as Offers (price and currency), plus a link to your pricing page.',
  hospitality: 'Add HotelRoom and Offer structured data for your room types with nightly rates.',
};

export function schemaChecks(ctx: Ctx): Check[] {
  const checks: Check[] = [];
  const profile = ctx.profile;
  const nodes = allNodes(ctx);
  const types = [...new Set(nodes.flatMap(typesOf))];
  const errors = ctx.pages.reduce((s, p) => s + p.raw.jsonLdErrors, 0);

  checks.push(mk({ id: 'schema-present', category: 'schema', title: 'Structured data present', weight: 2, score: nodes.length ? (errors ? 0.6 : 1) : 0,
    finding: nodes.length
      ? `Found structured data describing: ${list(types.slice(0, 8))}.${errors ? ` ${errors} block(s) contain errors and will be ignored.` : ''}`
      : 'No structured data (schema.org) found.',
    why: nodes.length && !errors ? undefined : 'Structured data is a machine-readable fact sheet about your business. AI systems and Google use it to confirm who you are, what you offer and how to reach you.',
    fix: nodes.length && !errors ? undefined : errors ? 'Fix the invalid JSON-LD blocks (test with Google\'s Rich Results Test).' : 'Add JSON-LD structured data. Most website platforms and SEO plugins (Yoast, Rank Math, Shopify apps) can do the basics.',
    effort: nodes.length && !errors ? undefined : 'Moderate' }));

  const biz = businessNode(ctx);
  const bizTypes = biz ? typesOf(biz) : [];
  const specific = profile.schemaTypes.filter((t) => !GENERIC.includes(t));
  const isSpecific = bizTypes.some((t) => specific.includes(t));
  const isBusinessType = bizTypes.some((t) => ALL_BUSINESS.includes(t) && !ORG.includes(t));
  const isOrg = bizTypes.some((t) => ORG.includes(t));
  const recommended = profile.schemaTypes[0];
  const score = isSpecific ? 1 : isBusinessType ? 0.7 : isOrg ? (profile.physical ? 0.35 : 0.75) : 0;
  checks.push(mk({ id: 'business-type', category: 'schema', title: 'Business type in structured data', weight: 3, score,
    finding: isSpecific
      ? `Your business is marked up as ${list(bizTypes)}, which tells AI exactly what kind of business you are.`
      : isBusinessType
        ? `Your business is marked up as ${list(bizTypes)}. A more specific type such as ${recommended} would describe it better.`
        : isOrg
          ? `Your business is only described as a generic ${list(bizTypes)}.${profile.physical ? ' Nothing tells machines what kind of business it is or that it has a physical location.' : ''}`
          : 'There is no structured data describing your business at all.',
    why: score >= 0.8 ? undefined : `A specific business type links your name to a category${profile.physical ? ' and a location' : ''}. That is what AI uses to recommend you for questions like "${profile.query}".`,
    fix: score >= 0.8 ? undefined : `Add ${recommended} structured data${profile.physical ? ' for each location, including address, opening hours and phone' : ' with your logo, description, contact details and social profiles'}.`,
    effort: score >= 0.8 ? undefined : 'Moderate' }));

  const fields = fieldsFor(profile);
  const present = biz ? fields.filter((f) => f.test(biz)) : [];
  const missing = fields.filter((f) => !present.includes(f));
  checks.push(mk({ id: 'business-details', category: 'schema', title: 'Business details in structured data', weight: 3, score: present.length / fields.length,
    finding: biz
      ? `${present.length} of ${fields.length} key details are included.${missing.length ? ` Missing: ${list(missing.map((f) => f.label))}.` : ''}`
      : `None of the ${fields.length} key business details are provided as structured data.`,
    why: missing.length ? 'Each missing detail is a question AI has to guess at or look up elsewhere, often from a less accurate directory listing.' : undefined,
    fix: missing.length ? `Add ${list(missing.map((f) => f.label))} to your business structured data.` : undefined,
    effort: missing.length ? 'Moderate' : undefined }));

  const offerTypes = types.filter((t) => profile.offerTypes.includes(t) || (biz && t !== bizTypes[0] && ['Offer', 'Service', 'Product'].includes(t)));
  const hasMenuLink = profile.id === 'food' && biz && (biz.hasMenu || biz.menu);
  const offerOk = offerTypes.length > 0 || !!hasMenuLink;
  checks.push(mk({ id: 'offer-schema', category: 'schema', title: 'What you offer, in structured data', weight: 1.5, score: offerOk ? 1 : 0,
    finding: offerOk ? `Your ${profile.offerLabel} are described with ${offerTypes.length ? list(offerTypes) : 'hasMenu'} markup.` : `Your ${profile.offerLabel} are not described in structured data.`,
    why: offerOk ? undefined : 'Structured offers let AI answer "what do they offer" and "how much" questions with confidence instead of guessing.',
    fix: offerOk ? undefined : OFFER_FIX[profile.id] ?? `Add Service or Offer structured data describing your ${profile.offerLabel}, including prices in SGD where you publish them.`,
    effort: offerOk ? undefined : 'Moderate' }));

  const faq = types.includes('FAQPage');
  checks.push(mk({ id: 'faq-schema', category: 'schema', title: 'FAQ structured data', weight: 1, score: faq ? 1 : 0.3,
    finding: faq ? 'FAQ structured data is present.' : 'No FAQ structured data found.',
    why: faq ? undefined : 'FAQ markup packages your answers as clean question-and-answer pairs, the exact format AI assistants answer in.',
    fix: faq ? undefined : 'Mark up your FAQ section with FAQPage structured data.',
    effort: faq ? undefined : 'Quick win' }));

  return checks;
}
