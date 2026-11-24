import { chromium, type Browser } from 'playwright';
import { BROWSER_UA } from './http.js';

export interface Rendered {
  html: string;
  requests: string[];
  /** Hosts of data requests (fetch/XHR) that failed while the page loaded, so the visitor view may be incomplete. */
  failedData: string[];
  error?: string;
}

export async function withBrowser<T>(fn: (render: (url: string) => Promise<Rendered>) => Promise<T>): Promise<T> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser: Browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const context = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1366, height: 900 }, locale: 'en-SG' });
  const render = async (url: string): Promise<Rendered> => {
    const page = await context.newPage();
    const requests: string[] = [];
    const failedData = new Set<string>();
    page.on('request', (r) => requests.push(r.url()));
    const noteFailure = (url: string, type: string) => {
      if (type !== 'xhr' && type !== 'fetch') return;
      const host = new URL(url).host;
      // Analytics and ad beacons failing does not change what visitors see.
      if (/google|facebook|doubleclick|hotjar|clarity|cloudflareinsights|tiktok|segment|sentry|intercom|hubspot|analytics/i.test(host)) return;
      failedData.add(host);
    };
    page.on('requestfailed', (r) => noteFailure(r.url(), r.resourceType()));
    page.on('response', (r) => { if (r.status() >= 500 || r.status() === 403 || r.status() === 429) noteFailure(r.url(), r.request().resourceType()); });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      // Scroll to trigger lazy-loaded sections, then let them settle.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 800) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
      }).catch(() => {});
      await page.waitForTimeout(1500);
      return { html: await page.content(), requests, failedData: [...failedData] };
    } catch (e: any) {
      return { html: '', requests, failedData: [...failedData], error: e?.message?.split('\n')[0] ?? String(e) };
    } finally {
      await page.close();
    }
  };
  try {
    return await fn(render);
  } finally {
    await browser.close();
  }
}
