import { chromium, devices } from 'playwright';
import { fetch, EnvHttpProxyAgent } from 'undici';
import type { SpeedResult } from '../types.js';

const hasProxy = ['HTTPS_PROXY', 'https_proxy'].some((k) => process.env[k]);
const dispatcher = hasProxy ? new EnvHttpProxyAgent() : undefined;

/** Google PageSpeed Insights (mobile). Returns undefined if it can't be used, so we fall back to our own browser. */
async function pageSpeed(url: string): Promise<Omit<SpeedResult, 'label'> | { error: string }> {
  const key = process.env.PAGESPEED_API_KEY;
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', 'mobile');
  api.searchParams.set('category', 'performance');
  if (key) api.searchParams.set('key', key);
  try {
    const res = await fetch(api, { dispatcher, signal: AbortSignal.timeout(120000) });
    const j: any = await res.json();
    if (!res.ok) return { error: j?.error?.message?.slice(0, 160) ?? `HTTP ${res.status}` };
    const a = j.lighthouseResult?.audits ?? {};
    const num = (k: string) => (typeof a[k]?.numericValue === 'number' ? a[k].numericValue : undefined);
    const m = j.loadingExperience?.metrics;
    const field =
      m && j.loadingExperience?.origin_fallback !== true
        ? {
            lcpMs: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
            inpMs: m.INTERACTION_TO_NEXT_PAINT?.percentile,
            cls: m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined,
            overall: j.loadingExperience?.overall_category,
          }
        : undefined;
    return {
      url,
      source: 'pagespeed',
      performance: typeof j.lighthouseResult?.categories?.performance?.score === 'number' ? Math.round(j.lighthouseResult.categories.performance.score * 100) : undefined,
      lab: { lcpMs: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbtMs: num('total-blocking-time'), fcpMs: num('first-contentful-paint'), ttfbMs: num('server-response-time'), bytes: num('total-byte-weight') },
      field,
    };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

/** Fallback: load the page on a phone-sized screen in our own browser and read the browser's own timings. */
async function browserSpeed(urls: string[]): Promise<Omit<SpeedResult, 'label'>[]> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    const out: Omit<SpeedResult, 'label'>[] = [];
    for (const url of urls) {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      let bytes = 0;
      page.on('response', async (r) => {
        const len = Number(r.headers()['content-length'] ?? 0);
        if (len) bytes += len;
      });
      try {
        await page.addInitScript(() => {
          (window as any).__lcp = 0;
          (window as any).__cls = 0;
          new PerformanceObserver((l) => l.getEntries().forEach((e: any) => ((window as any).__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e: any) => { if (!e.hadRecentInput) (window as any).__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const m = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
          const transfer = performance.getEntriesByType('resource').reduce((n, r: any) => n + (r.transferSize || 0), nav?.transferSize ?? 0);
          return { lcp: (window as any).__lcp, cls: (window as any).__cls, fcp, ttfb: nav ? nav.responseStart - nav.requestStart : undefined, transfer };
        });
        out.push({ url, source: 'browser', lab: { lcpMs: m.lcp || undefined, cls: Math.round(m.cls * 1000) / 1000, fcpMs: m.fcp, ttfbMs: m.ttfb, bytes: Math.max(m.transfer, bytes) || undefined } });
      } catch (e: any) {
        out.push({ url, source: 'browser', lab: {}, error: e?.message?.split('\n')[0] ?? String(e) });
      } finally {
        await context.close();
      }
    }
    return out;
  } finally {
    await browser.close();
  }
}

/** Speed for the homepage and a couple of key pages. PageSpeed when configured, our own browser otherwise. */
export async function measureSpeed(pages: { url: string; label: string }[], log: (s: string) => void): Promise<{ results: SpeedResult[]; note?: string }> {
  const usePsi = !!process.env.PAGESPEED_API_KEY;
  if (usePsi) {
    log('Running Google PageSpeed Insights');
    const psi = await Promise.all(pages.map((p) => pageSpeed(p.url)));
    const ok = psi.map((r, i) => ('error' in r ? undefined : { ...r, label: pages[i].label })).filter(Boolean) as SpeedResult[];
    if (ok.length === pages.length) return { results: ok };
    const failed = pages.filter((_, i) => 'error' in psi[i]);
    const err = psi.find((r) => 'error' in r) as { error: string } | undefined;
    log(`PageSpeed failed for ${failed.length} page(s) (${err?.error}); measuring those in our browser`);
    const fb = await browserSpeed(failed.map((p) => p.url));
    return { results: [...ok, ...fb.map((r, i) => ({ ...r, label: failed[i].label }))], note: `Google PageSpeed was unavailable for some pages (${err?.error}).` };
  }
  log('Measuring page speed on a mobile screen');
  const fb = await browserSpeed(pages.map((p) => p.url));
  return { results: fb.map((r, i) => ({ ...r, label: pages[i].label })) };
}
