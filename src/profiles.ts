import { typesOf } from './page.js';

/** Kinds of key page the crawler looks for. Each business profile says which ones it expects. */
export type PageKind =
  | 'pricing' | 'menu' | 'services' | 'products' | 'booking' | 'about' | 'faq'
  | 'contact' | 'work' | 'reviews' | 'shipping' | 'offer' | 'features' | 'team';

export const PAGE_KINDS: Record<PageKind, { label: string; re: RegExp }> = {
  pricing: { label: 'Pricing', re: /pric|rates|packages?\b|plans?\b|fees?\b|membership|passes|cost/i },
  menu: { label: 'Menu', re: /\bmenus?\b|food|drinks|dishes/i },
  services: { label: 'Services', re: /service|class|program|treatment|course|solution|what-?we-?do|practice-?areas|offering|therap|procedure/i },
  products: { label: 'Products', re: /shop|products?\b|collections?\b|store\b|catalog|all-?items/i },
  booking: { label: 'Booking', re: /book|reserv|appointment|schedul|timetable|calendar|enquir/i },
  about: { label: 'About', re: /about|our-?story|who-?we-?are|company/i },
  team: { label: 'Team', re: /team|doctors?|coaches|trainers|people|staff|our-?(lawyers|dentists|tutors)/i },
  faq: { label: 'FAQ', re: /faq|questions|help-?cent/i },
  contact: { label: 'Contact / location', re: /contact|locations?\b|find-?us|visit|outlets|branches|stores/i },
  work: { label: 'Work / case studies', re: /our-?work|portfolio|case-?stud|projects|clients/i },
  reviews: { label: 'Reviews', re: /reviews?|testimonials?/i },
  shipping: { label: 'Shipping / returns', re: /shipping|delivery|returns?|refund/i },
  offer: { label: 'Trial / offer', re: /trial|promo|offers?\b|first-?(class|timer|visit)|new-?(here|patients?|customers?)|deals/i },
  features: { label: 'Features', re: /features?(?![a-z])|how-?it-?works|platform|integrations?|product-?tour/i },
};

export interface Profile {
  id: string;
  label: string;
  /** "a fitness studio" style noun used in copy */
  noun: string;
  /** Customers visit a physical location, so address and hours matter. */
  physical: boolean;
  /** Most specific schema.org types, best first. */
  schemaTypes: string[];
  /** Key pages we expect, in priority order. */
  pages: PageKind[];
  /** What "hours" means for this business; undefined = not relevant. */
  hoursLabel?: string;
  /** How much publishing prices matters (0..1 multiplier on the pricing check). */
  pricingImportance: number;
  /** Structured data types that describe the offer. */
  offerTypes: string[];
  offerLabel: string;
  // Example copy. Site-specific examples come from examples.ts; these are category-level only.
  /** Plain category name used when the site's own wording gives no clear offering, e.g. "gym or fitness studio". */
  categoryNoun?: string;
  /** What to publish about pricing, without invented figures. */
  pricingGuide: string;
  faqExamples: string[];
  /** Detection: keywords in the homepage title, description and headings. */
  keywords: RegExp;
}

const LOCAL_OFFER = ['Service', 'Offer', 'OfferCatalog', 'Product', 'Course', 'Event'];

export const PROFILES: Profile[] = [
  {
    id: 'fitness', label: 'Fitness and wellness studio', noun: 'a fitness studio', physical: true,
    schemaTypes: ['ExerciseGym', 'HealthClub', 'SportsActivityLocation', 'SportsClub'],
    pages: ['services', 'pricing', 'booking', 'contact', 'about', 'faq', 'offer'],
    hoursLabel: 'opening hours or class times', pricingImportance: 1,
    offerTypes: LOCAL_OFFER, offerLabel: 'classes, memberships and prices',
    categoryNoun: 'gym or fitness studio', pricingGuide: 'class or session prices, membership options and any trial offer',
    faqExamples: ['Do I need experience?', 'What should I bring?', 'Is there a trial class?', 'How much is a membership?'],
    keywords: /\b(gyms?|fitness|pilates|yoga|crossfit|hiit|personal train\w*|training|trainers?|bootcamp|boxing|martial|muay thai|barre|spin|cycling studio|workouts?|strength|conditioning|athletes?)\b/gi,
  },
  {
    id: 'food', label: 'Restaurant, cafe or bar', noun: 'a restaurant', physical: true,
    schemaTypes: ['Restaurant', 'CafeOrCoffeeShop', 'BarOrPub', 'Bakery', 'FoodEstablishment'],
    pages: ['menu', 'booking', 'contact', 'about', 'faq', 'offer'],
    hoursLabel: 'opening hours', pricingImportance: 0.8,
    offerTypes: ['Menu', 'MenuSection', 'MenuItem', 'Offer'], offerLabel: 'menu and prices',
    categoryNoun: 'restaurant', pricingGuide: 'typical price ranges for mains or set menus',
    faqExamples: ['Do you take reservations?', 'Do you cater to dietary needs?', 'Is it suitable for groups?', 'Is there parking nearby?'],
    keywords: /\b(restaurants?|cafe|café|coffee shop|bistro|bar|brunch|dining|dine-in|reservations?|cuisine|eatery|omakase|hawker|chef)\b/gi,
  },
  {
    id: 'beauty', label: 'Beauty, salon or spa', noun: 'a salon', physical: true,
    schemaTypes: ['BeautySalon', 'HairSalon', 'NailSalon', 'DaySpa', 'HealthAndBeautyBusiness'],
    pages: ['services', 'pricing', 'booking', 'contact', 'about', 'faq', 'offer'],
    hoursLabel: 'opening hours', pricingImportance: 1,
    offerTypes: LOCAL_OFFER, offerLabel: 'treatments and prices',
    categoryNoun: 'salon or spa', pricingGuide: 'starting prices for each treatment and any first-visit offer',
    faqExamples: ['Is it suitable for sensitive skin?', 'How long does a session take?', 'Is there a first-trial price?', 'Do I need to book in advance?'],
    keywords: /\b(salon|spa|beauty|facial|hair|nails?|lash|brow|massage|skin ?care|aesthetic|waxing|manicure|pedicure)\b/gi,
  },
  {
    id: 'health', label: 'Clinic or healthcare provider', noun: 'a clinic', physical: true,
    schemaTypes: ['MedicalClinic', 'Dentist', 'Physician', 'Optician', 'Physiotherapy', 'VeterinaryCare', 'MedicalBusiness'],
    pages: ['services', 'team', 'booking', 'contact', 'pricing', 'faq', 'about'],
    hoursLabel: 'clinic hours', pricingImportance: 0.6,
    offerTypes: ['MedicalProcedure', 'MedicalTherapy', 'Service', 'Offer'], offerLabel: 'treatments, procedures and fees',
    categoryNoun: 'clinic', pricingGuide: 'consultation fees and typical costs for common treatments, plus whether insurance or Medisave applies',
    faqExamples: ['Do I need a referral?', 'Can I claim insurance or Medisave?', 'How long is a session?', 'What are your clinic hours?'],
    keywords: /\b(clinic|medical|doctor|dental|dentist|physio|physiotherap|chiropract|optometr|veterinar|vet|patients?|health ?care|specialist|surgery|therapy|tcm)\b/gi,
  },
  {
    id: 'education', label: 'Tuition, school or training provider', noun: 'a tuition centre', physical: true,
    schemaTypes: ['EducationalOrganization', 'School', 'Preschool', 'CollegeOrUniversity'],
    pages: ['services', 'pricing', 'team', 'contact', 'about', 'faq', 'reviews', 'offer'],
    hoursLabel: 'lesson times or opening hours', pricingImportance: 0.9,
    offerTypes: ['Course', 'CourseInstance', 'Service', 'Offer', 'Event'], offerLabel: 'courses, schedules and fees',
    categoryNoun: 'tuition centre', pricingGuide: 'fees per level or course, lesson frequency and class size',
    faqExamples: ['What is the class size?', 'Is there a trial lesson?', 'Which levels do you teach?', 'What are the tutors\' qualifications?'],
    keywords: /\b(tuition|tutor|school|academy|enrichment|courses?|classes|lessons|psle|o-?level|a-?level|ib|preschool|childcare|learning centre|education|training provider)\b/gi,
  },
  {
    id: 'hospitality', label: 'Hotel or accommodation', noun: 'a hotel', physical: true,
    schemaTypes: ['Hotel', 'Resort', 'BedAndBreakfast', 'Hostel', 'LodgingBusiness'],
    pages: ['services', 'booking', 'pricing', 'contact', 'about', 'faq', 'offer'],
    hoursLabel: 'check-in and check-out times', pricingImportance: 0.8,
    offerTypes: ['HotelRoom', 'Suite', 'Offer', 'LodgingReservation'], offerLabel: 'rooms, rates and amenities',
    categoryNoun: 'hotel', pricingGuide: 'room rates from, and what is included',
    faqExamples: ['What time is check-in?', 'Is breakfast included?', 'Is there parking?', 'Are pets allowed?'],
    keywords: /\b(hotel|resort|rooms?|suites?|stay|accommodation|hostel|villa|check-?in|guests?|lodging)\b/gi,
  },
  {
    id: 'retail', label: 'Shop or showroom', noun: 'a shop', physical: true,
    schemaTypes: ['Store', 'ClothingStore', 'FurnitureStore', 'ElectronicsStore', 'JewelryStore', 'HomeGoodsStore', 'Florist', 'PetStore'],
    pages: ['products', 'contact', 'about', 'pricing', 'faq', 'shipping', 'offer'],
    hoursLabel: 'opening hours', pricingImportance: 0.9,
    offerTypes: ['Product', 'Offer', 'OfferCatalog', 'AggregateOffer'], offerLabel: 'products and prices',
    pricingGuide: 'starting prices for your main product ranges, plus delivery charges',
    faqExamples: ['Can I visit the showroom?', 'Do you deliver island-wide?', 'What is the warranty?', 'Can I return an item?'],
    keywords: /\b(showroom|store|shop|boutique|outlet|retail|florist|furniture|appliances?|jewell?ery)\b/gi,
  },
  {
    id: 'ecommerce', label: 'Online store / e-commerce', noun: 'an online store', physical: false,
    schemaTypes: ['OnlineStore', 'Store', 'Organization'],
    pages: ['products', 'shipping', 'faq', 'about', 'contact', 'reviews', 'offer'],
    pricingImportance: 1,
    offerTypes: ['Product', 'Offer', 'AggregateOffer', 'ProductGroup'], offerLabel: 'products, prices and availability',
    pricingGuide: 'the price on every product page, plus delivery fees and any free-delivery threshold',
    faqExamples: ['How long does delivery take?', 'What is the return policy?', 'Do you ship overseas?', 'Which payment methods do you accept?'],
    keywords: /\b(shop now|shop all|shop online|online store|online shop|add to (cart|bag)|free shipping|free delivery|delivery|delivered|deliver(?:ed)? to your door|checkout|buy online|buy now|order online|best ?sellers|new arrivals)\b/gi,
  },
  {
    id: 'saas', label: 'Software or tech product', noun: 'a software company', physical: false,
    schemaTypes: ['SoftwareApplication', 'WebApplication', 'Organization'],
    pages: ['features', 'pricing', 'about', 'faq', 'contact', 'work', 'reviews'],
    pricingImportance: 0.8,
    offerTypes: ['SoftwareApplication', 'WebApplication', 'Offer', 'Product'], offerLabel: 'product, plans and pricing',
    pricingGuide: 'plan prices (per user or per month) and whether there is a free trial',
    faqExamples: ['Is there a free trial?', 'Which tools does it integrate with?', 'Is my data stored in Singapore?', 'Can I cancel any time?'],
    keywords: /\b(software|platform|saas|app|api|integrations?|dashboard|automat|cloud|free trial|sign up|demo|workflow)\b/gi,
  },
  {
    id: 'professional', label: 'Professional or B2B services', noun: 'a professional services firm', physical: false,
    schemaTypes: ['ProfessionalService', 'LegalService', 'AccountingService', 'FinancialService', 'InsuranceAgency', 'RealEstateAgent', 'EmploymentAgency'],
    pages: ['services', 'work', 'team', 'about', 'contact', 'faq', 'reviews'],
    hoursLabel: 'office hours', pricingImportance: 0.5,
    offerTypes: ['Service', 'Offer', 'OfferCatalog'], offerLabel: 'services and how engagements work',
    pricingGuide: 'starting fees or typical ranges for your main services, and how fees are structured',
    faqExamples: ['Who do you typically work with?', 'How does an engagement start?', 'How are fees structured?', 'How long does it take?'],
    keywords: /\b(agency|consult|law|legal|lawyers?|accounting|accountants?|audit|tax|advisory|marketing|recruit|insurance|financial|architect|interior design|real estate|property|corporate secretar)\b/gi,
  },
  {
    id: 'home', label: 'Home and trade services', noun: 'a home services company', physical: false,
    schemaTypes: ['HomeAndConstructionBusiness', 'Plumber', 'Electrician', 'HVACBusiness', 'HousePainter', 'Locksmith', 'MovingCompany', 'GeneralContractor'],
    pages: ['services', 'pricing', 'work', 'contact', 'reviews', 'faq', 'about'],
    hoursLabel: 'operating hours', pricingImportance: 0.9,
    offerTypes: ['Service', 'Offer', 'OfferCatalog'], offerLabel: 'services and prices',
    pricingGuide: 'starting prices for each service and any call-out or transport fees',
    faqExamples: ['Which areas do you cover?', 'Do you offer same-day service?', 'Is there a warranty?', 'How do I get a quote?'],
    keywords: /\b(aircon|plumb|electric|renovat|contractor|cleaning|movers?|moving|handyman|pest control|painting|locksmith|interior)\b/gi,
  },
  {
    id: 'general', label: 'Other business', noun: 'a business', physical: false,
    schemaTypes: ['LocalBusiness', 'Organization'],
    pages: ['services', 'products', 'pricing', 'about', 'contact', 'faq'],
    pricingImportance: 0.7,
    offerTypes: ['Service', 'Product', 'Offer', 'OfferCatalog'], offerLabel: 'products, services and prices',
    pricingGuide: 'starting prices for your main products or services',
    faqExamples: ['What exactly do you offer?', 'Who is it for?', 'How much does it cost?', 'How do I get started?'],
    keywords: /$^/g,
  },
];

export const profileById = (id: string) => PROFILES.find((p) => p.id === id);
export const GENERAL = profileById('general')!;

export interface Detection {
  profile: Profile;
  detected: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Guess the business type from structured data (strong signal) and homepage wording.
 * `text` should be the homepage title, description, headings and body.
 */
export function detectProfile(input: { jsonLd: any[]; title: string; description: string; headings: string[]; body: string; ecommerceSignals: number }): Detection {
  const nodes: any[] = input.jsonLd;
  const types = new Set(nodes.flatMap(typesOf));
  for (const p of PROFILES) {
    const hit = p.schemaTypes.find((t) => types.has(t) && !['Organization', 'LocalBusiness', 'Store'].includes(t));
    if (hit) return { profile: p, detected: true, confidence: 'high', reason: `the site's structured data says it is a ${hit}` };
  }

  const strong = `${input.title} ${input.description} ${input.headings.join(' ')}`;
  const scores = PROFILES.filter((p) => p.id !== 'general').map((p) => {
    const s = (strong.match(p.keywords) ?? []).length * 3 + (input.body.match(p.keywords) ?? []).length;
    return { p, s: p.id === 'ecommerce' ? s + input.ecommerceSignals * 6 : s };
  });
  scores.sort((a, b) => b.s - a.s);
  const [top, second] = scores;
  if (!top || top.s < 4) return { profile: GENERAL, detected: true, confidence: 'low', reason: 'no clear category signals were found' };
  const margin = top.s / Math.max(1, second?.s ?? 0);
  return {
    profile: top.p,
    detected: true,
    confidence: margin >= 2 && top.s >= 10 ? 'high' : margin >= 1.3 ? 'medium' : 'low',
    reason: `the homepage wording matches ${top.p.label.charAt(0).toLowerCase() + top.p.label.slice(1)}`,
  };
}
