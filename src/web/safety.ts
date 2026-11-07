import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Blocks loopback, private, link-local and other internal ranges so the app can't be used to probe its own network. */
function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Normalises user input to an https URL and rejects anything that isn't a public website. */
export async function validateTarget(input: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a website address.' };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'That does not look like a website address.' };
  }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Only http and https websites can be audited.' };
  if (u.username || u.password) return { ok: false, error: 'Remove the username or password from the address.' };
  if (u.port && !['80', '443'].includes(u.port)) return { ok: false, error: 'Only standard web ports are supported.' };
  const host = u.hostname;
  if (!host.includes('.') || /\.(local|internal|localhost)$/i.test(host)) return { ok: false, error: 'Enter a public website address.' };
  // Behind an outbound proxy DNS may not resolve locally; the proxy then does the resolving.
  if (process.env.DNS_CHECK === 'off') return isIP(host) && isPrivate(host) ? { ok: false, error: 'That address points to a private network.' } : { ok: true, url: u.toString() };
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length) return { ok: false, error: `Could not find ${host}.` };
    if (addrs.some((a) => isPrivate(a.address))) return { ok: false, error: 'That address points to a private network.' };
  } catch {
    return { ok: false, error: `Could not find ${host}. Check the spelling.` };
  }
  return { ok: true, url: u.toString() };
}
