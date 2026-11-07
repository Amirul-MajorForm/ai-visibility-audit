import { chromium, type Browser } from 'playwright';
import { BROWSER_UA } from './http.js';

export interface Rendered {
  html: string;
  requests: string[];
  error?: string;
}

export async function withBrowser<T>(fn: (render: (url: string) => Promise<Rendered>) => Promise<T>): Promise<T> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser: Browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const context = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1366, height: 900 }, locale: 'en-SG' });
  const render = async (url: string): Promise<Rendered> => {
    const page = await context.newPage();
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
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
      return { html: await page.content(), requests };
    } catch (e: any) {
      return { html: '', requests, error: e?.message?.split('\n')[0] ?? String(e) };
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
