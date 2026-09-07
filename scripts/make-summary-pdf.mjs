/**
 * make-summary-pdf.mjs — render summary.html to ONE_PAGE_SUMMARY.pdf.
 *
 * Dev-only tool (needs: npm i puppeteer --no-save). Produces the exact PDF
 * submitted, and reports the page count so the "one-page" requirement is
 * verified rather than assumed.
 *
 * Run:  node scripts/make-summary-pdf.mjs
 */

import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'summary.html');
const out = resolve(root, 'ONE_PAGE_SUMMARY.pdf');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle0' });
// give webfonts a moment so metrics match the on-screen layout
await page.evaluateHandle('document.fonts.ready');

await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();

// report word count + page count
const html = await readFile(src, 'utf8');
const bodyText = html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<div class="screen-note">[\s\S]*?<\/div>/i, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ');
const words = bodyText.split(/\s+/).filter(Boolean).length;

const pdf = await PDFDocument.load(await readFile(out));
const pages = pdf.getPageCount();

console.log(`wrote ${out}`);
console.log(`pages: ${pages}`);
console.log(`approx words in document: ${words}`);
if (pages !== 1) {
  console.error(`✗ expected exactly 1 page, generated ${pages}`);
  process.exit(1);
}
console.log('✓ fits one A4 page');
