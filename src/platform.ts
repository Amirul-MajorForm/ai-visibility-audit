import type { FetchResult } from './http.js';

export interface Platform {
  /** CDN / firewall in front of the site, if recognisable. */
  cdn?: string;
  /** Website platform, if recognisable. */
  cms?: string;
  /** WooCommerce on WordPress. */
  woo?: boolean;
}

/** Recognise the CDN and website platform so advice only names tools the client actually uses. */
export function detectPlatform(home: FetchResult): Platform {
  const h = home.headers;
  const server = (h['server'] ?? '').toLowerCase();
  const body = home.body;
  const cdn =
    server.includes('cloudflare') || h['cf-ray'] ? 'Cloudflare'
    : h['x-amz-cf-id'] || server.includes('cloudfront') ? 'Amazon CloudFront'
    : server.includes('akamai') || h['x-akamai-transformed'] ? 'Akamai'
    : h['x-sucuri-id'] || server.includes('sucuri') ? 'Sucuri'
    : h['x-vercel-id'] ? 'Vercel'
    : h['x-served-by']?.includes('cache-') || h['x-fastly-request-id'] ? 'Fastly'
    : undefined;
  const cms =
    /cdn\.shopify\.com|Shopify\.theme/i.test(body) ? 'Shopify'
    : /wp-content|wp-includes/i.test(body) ? 'WordPress'
    : /static\.wixstatic\.com|wix\.com/i.test(body) ? 'Wix'
    : /squarespace\.com|static1\.squarespace/i.test(body) ? 'Squarespace'
    : /webflow\.(com|io)|data-wf-site/i.test(body) ? 'Webflow'
    : undefined;
  return { cdn, cms, woo: cms === 'WordPress' && /woocommerce/i.test(body) };
}
