import { fetch, EnvHttpProxyAgent, type Dispatcher } from 'undici';

// Quietly route through HTTP(S)_PROXY when one is configured (e.g. cloud sandboxes).
const origEmit = process.emitWarning.bind(process);
process.emitWarning = ((w: any, ...rest: any[]) => {
  const code = typeof rest[0] === 'object' ? rest[0]?.code : rest[1];
  if (code === 'UNDICI-EHPA' || String(w).includes('EnvHttpProxyAgent')) return;
  return (origEmit as any)(w, ...rest);
}) as typeof process.emitWarning;

const hasProxy = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].some((k) => process.env[k]);
const dispatcher: Dispatcher | undefined = hasProxy ? new EnvHttpProxyAgent() : undefined;

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number; // 0 = network error
  headers: Record<string, string>;
  body: string;
  ttfbMs: number;
  totalMs: number;
  redirects: { url: string; status: number }[];
  redirectLoop: boolean;
  error?: string;
}

export async function get(
  url: string,
  opts: { ua?: string; maxRedirects?: number; timeoutMs?: number; accept?: string } = {},
): Promise<FetchResult> {
  const { ua = BROWSER_UA, maxRedirects = 8, timeoutMs = 20000 } = opts;
  const accept = opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const redirects: { url: string; status: number }[] = [];
  const seen = new Set<string>();
  const start = Date.now();
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    seen.add(current);
    const t0 = Date.now();
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': ua, accept, 'accept-language': 'en-SG,en;q=0.9' },
      });
      const ttfbMs = Date.now() - t0;
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      if (res.status >= 300 && res.status < 400 && headers.location) {
        await res.body?.cancel();
        const next = new URL(headers.location, current).toString();
        redirects.push({ url: current, status: res.status });
        if (seen.has(next)) {
          return { requestedUrl: url, finalUrl: next, status: res.status, headers, body: '', ttfbMs, totalMs: Date.now() - start, redirects, redirectLoop: true, error: 'Redirect loop' };
        }
        current = next;
        continue;
      }
      const body = await res.text();
      return { requestedUrl: url, finalUrl: current, status: res.status, headers, body, ttfbMs, totalMs: Date.now() - start, redirects, redirectLoop: false };
    } catch (e: any) {
      return { requestedUrl: url, finalUrl: current, status: 0, headers: {}, body: '', ttfbMs: 0, totalMs: Date.now() - start, redirects, redirectLoop: false, error: e?.cause?.message ?? e?.message ?? String(e) };
    }
  }
  return { requestedUrl: url, finalUrl: current, status: 0, headers: {}, body: '', ttfbMs: 0, totalMs: Date.now() - start, redirects, redirectLoop: false, error: 'Too many redirects' };
}
