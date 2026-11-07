import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

async function fontFace(pkg: string, family: string, file: string, weight: number) {
  const dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  const b64 = (await readFile(join(dir, file))).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

/** Brand fonts inlined so the report renders identically offline and in PDF. */
export async function embeddedFonts(): Promise<string> {
  const faces = await Promise.all([
    ...[500, 600, 700].map((w) => fontFace('@fontsource/space-grotesk', 'Space Grotesk', `space-grotesk-latin-${w}-normal.woff2`, w)),
    ...[400, 500, 600, 700].map((w) => fontFace('@fontsource/dm-sans', 'DM Sans', `dm-sans-latin-${w}-normal.woff2`, w)),
  ]);
  return faces.join('\n');
}

export async function logoDataUri(variant: 'light' | 'dark'): Promise<string | undefined> {
  const base = resolve('assets/brand', variant === 'light' ? 'logo-light' : 'logo');
  for (const [ext, mime] of [['svg', 'image/svg+xml'], ['png', 'image/png']] as const) {
    const p = `${base}.${ext}`;
    if (existsSync(p)) return `data:${mime};base64,${(await readFile(p)).toString('base64')}`;
  }
  return undefined;
}
