import * as cheerio from 'cheerio';

export interface Facts {
  phone: string[];
  email: string[];
  postal: string[];
  price: string[];
  hours: string[];
}

export interface PageInfo {
  url: string;
  lang: string;
  title: string;
  metaDescription: string;
  canonical: string;
  robotsMeta: string;
  h1: string[];
  h2: string[];
  questionHeadings: string[];
  text: string;
  words: number;
  images: number;
  imagesWithAlt: number;
  jsonLd: any[];
  jsonLdErrors: number;
  schemaTypes: string[];
  og: Record<string, string>;
  links: { href: string; text: string }[];
  resourceUrls: string[];
  facts: Facts;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

/** Flatten JSON-LD into a list of typed nodes (handles arrays, @graph and nesting). */
export function flattenLd(input: any, out: any[] = []): any[] {
  if (Array.isArray(input)) input.forEach((x) => flattenLd(x, out));
  else if (input && typeof input === 'object') {
    if (input['@type']) out.push(input);
    for (const [k, v] of Object.entries(input)) if (k !== '@context' && typeof v === 'object') flattenLd(v, out);
  }
  return out;
}

export function typesOf(node: any): string[] {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
}

const PHONE = /(?:\+65[\s-]?)?\b[689]\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const POSTAL = /\b(?:Singapore|S)\s?\(?(\d{6})\)?/gi;
const PRICE = /(?:S\$|SGD\s?|\$)\s?\d{1,4}(?:[.,]\d{2})?/g;
// Handles 6am-9pm, 6.30am to 9.30pm, 06:30 - 21:00
const T = '(?:[01]?\\d(?:[.:][0-5]\\d)?\\s?(?:am|pm)|[0-2]\\d:[0-5]\\d)';
const HOURS = new RegExp(`\\b${T}\\s?(?:-|–|to)\\s?${T}`, 'gi');

const uniq = (a: string[]) => [...new Set(a.map(clean))].slice(0, 10);

export function extractFacts(text: string): Facts {
  return {
    phone: uniq(text.match(PHONE) ?? []),
    email: uniq((text.match(EMAIL) ?? []).filter((e) => !/\.(png|jpe?g|webp|svg|gif)$/i.test(e))),
    postal: uniq([...text.matchAll(POSTAL)].map((m) => m[0])),
    price: uniq(text.match(PRICE) ?? []),
    hours: uniq(text.match(HOURS) ?? []),
  };
}

export function parsePage(html: string, url: string): PageInfo {
  const $ = cheerio.load(html);

  const jsonLd: any[] = [];
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      jsonLdErrors++;
    }
  });
  const nodes = flattenLd(jsonLd);
  const microTypes = $('[itemtype]').map((_, el) => String($(el).attr('itemtype')).split('/').pop()!).get();
  const schemaTypes = [...new Set([...nodes.flatMap(typesOf), ...microTypes])];

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    og[$(el).attr('property')!] = $(el).attr('content') ?? '';
  });

  const links: { href: string; text: string }[] = [];
  $('a[href]').each((_, el) => {
    try {
      const href = new URL($(el).attr('href')!, url);
      href.hash = '';
      links.push({ href: href.toString(), text: clean($(el).text()) });
    } catch {}
  });

  const resourceUrls = $('script[src], iframe[src], link[href]')
    .map((_, el) => $(el).attr('src') ?? $(el).attr('href') ?? '')
    .get()
    .filter(Boolean);

  const images = $('img');
  const imagesWithAlt = images.filter((_, el) => clean($(el).attr('alt') ?? '').length > 0).length;

  const headings = (sel: string) => $(sel).map((_, el) => clean($(el).text())).get().filter(Boolean);
  const allHeadings = headings('h1, h2, h3, h4, summary, dt, [class*="accordion"] button, [class*="faq"] button');

  $('script, style, noscript, template, svg, iframe').remove();
  const text = clean($('body').text() || $.root().text());

  return {
    url,
    lang: $('html').attr('lang') ?? '',
    title: clean($('title').first().text()),
    metaDescription: clean($('meta[name="description"]').attr('content') ?? ''),
    canonical: $('link[rel="canonical"]').attr('href') ?? '',
    robotsMeta: ($('meta[name="robots"]').attr('content') ?? '').toLowerCase(),
    h1: headings('h1'),
    h2: headings('h2'),
    questionHeadings: allHeadings.filter((h) => h.endsWith('?') && h.length < 200),
    text,
    words: wordCount(text),
    images: images.length,
    imagesWithAlt,
    jsonLd,
    jsonLdErrors,
    schemaTypes,
    og,
    links,
    resourceUrls,
    facts: extractFacts(text),
  };
}
