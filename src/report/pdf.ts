import { chromium } from 'playwright';
import { BRAND } from '../brand.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function writePdf(html: string, outPath: string, clientName = ''): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      // The cover uses a zero-margin page, so this footer only appears from page 2 onwards.
      footerTemplate: `<div style="width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#5d6b75;letter-spacing:.03em">
        <span><b style="color:#04202c">${esc(BRAND.name)}</b> · AI Visibility Audit · ${esc(clientName)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}
