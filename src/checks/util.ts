import type { Check, Status } from '../types.js';

export const statusFor = (score: number): Status => (score >= 0.8 ? 'pass' : score >= 0.5 ? 'warn' : 'fail');
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
export const path = (u: string) => {
  const p = new URL(u).pathname;
  return p === '/' ? 'Homepage' : p;
};

export function mk(c: Omit<Check, 'status'> & { status?: Status }): Check {
  return { ...c, status: c.status ?? statusFor(c.score) };
}
