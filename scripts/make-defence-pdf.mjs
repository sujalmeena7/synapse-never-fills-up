/**
 * make-defence-pdf.mjs — render DEFENCE.md into a print-ready HTML study guide
 * and multi-page DEFENCE.pdf.
 *
 * Run: npm run defence-pdf
 */

import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const markdownPath = resolve(root, 'DEFENCE.md');
const htmlPath = resolve(root, 'defence.html');
const pdfPath = resolve(root, 'DEFENCE.pdf');

const markdown = await readFile(markdownPath, 'utf8');
const required = [
  'Three-minute presentation script',
  'You cannot simply',
  '10-symbol value vocabulary',
  'crossover heuristic',
  'Gated DeltaNet',
  'Day-of checklist',
  'Emergency fallback',
];
const missing = required.filter((phrase) => !markdown.includes(phrase));
if (missing.length) {
  throw new Error(`DEFENCE.md is missing required content: ${missing.join(', ')}`);
}

// The first markdown block is represented as a designed cover, so body content
// starts at section 1 rather than repeating the title and metadata.
const divider = markdown.indexOf('\n---\n');
const bodyMarkdown = divider === -1 ? markdown : markdown.slice(divider + 5);
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
let article = md.render(bodyMarkdown);

// Start major rehearsal units on fresh pages. Natural flow handles the smaller
// sections while these explicit breaks keep derivation, evidence, and day-of
// prep easy to find under pressure.
for (const section of ['4.', '7.', '10.']) {
  article = article.replace(`<h2>${section}`, `<h2 class="major-break">${section}`);
}

const css = String.raw`
  :root {
    --ink: #172033;
    --dim: #526079;
    --muted: #75819a;
    --line: #d9e0ec;
    --paper: #ffffff;
    --soft: #f3f6fb;
    --blue: #315fda;
    --purple: #714ed6;
    --green: #168b67;
    --red: #c34356;
    --amber: #9a6500;
    --mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    --sans: Inter, "Segoe UI", Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body {
    margin: 0;
    background: #e9edf4;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 9.35pt;
    line-height: 1.43;
  }
  .screen-note {
    max-width: 210mm;
    margin: 10mm auto -2mm;
    padding: 10px 14px;
    border: 1px solid #a9bff5;
    border-radius: 8px;
    background: #edf3ff;
    color: #274998;
    font-size: 9pt;
  }
  .document {
    width: 210mm;
    margin: 8mm auto 16mm;
    padding: 13mm;
    background: var(--paper);
    box-shadow: 0 12px 45px rgba(20, 31, 55, .18);
  }
  .cover {
    min-height: 244mm;
    page-break-after: always;
    break-after: page;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    padding: 16mm 12mm;
    border: 1px solid var(--line);
    border-radius: 6mm;
    background:
      radial-gradient(circle at 85% 10%, rgba(113,78,214,.16), transparent 32%),
      radial-gradient(circle at 12% 90%, rgba(49,95,218,.14), transparent 34%),
      linear-gradient(145deg, #fbfcff, #f3f6ff);
  }
  .cover::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4mm;
    background: linear-gradient(90deg, var(--blue), var(--purple));
  }
  .eyebrow {
    margin: 0 0 7mm;
    color: var(--blue);
    font-family: var(--mono);
    font-size: 7.6pt;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .cover h1 {
    margin: 0;
    max-width: 160mm;
    font-size: 31pt;
    line-height: 1.04;
    letter-spacing: -.035em;
  }
  .cover .subtitle {
    margin: 4mm 0 0;
    color: var(--purple);
    font-size: 15pt;
    font-weight: 700;
  }
  .claim {
    margin: 12mm 0 8mm;
    max-width: 155mm;
    padding: 5mm 6mm;
    border-left: 3px solid var(--blue);
    border-radius: 0 3mm 3mm 0;
    background: rgba(255,255,255,.78);
    box-shadow: 0 5px 20px rgba(35, 52, 95, .08);
    font-size: 12pt;
    line-height: 1.5;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    max-width: 155mm;
    margin-top: 3mm;
  }
  .meta {
    padding: 3.5mm 4mm;
    border: 1px solid var(--line);
    border-radius: 2.5mm;
    background: rgba(255,255,255,.68);
  }
  .meta b {
    display: block;
    margin-bottom: .8mm;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 7pt;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .cover .rule {
    margin-top: 10mm;
    color: var(--dim);
    font-size: 9pt;
  }
  .article { padding: 0 2mm; }
  h2 {
    margin: 7mm 0 3mm;
    padding-bottom: 1.5mm;
    border-bottom: 1.5px solid var(--line);
    color: #233256;
    font-size: 16pt;
    line-height: 1.16;
    letter-spacing: -.015em;
    break-after: avoid;
  }
  h2:first-child { margin-top: 0; }
  h2.major-break {
    break-before: page;
    page-break-before: always;
    margin-top: 0;
  }
  h3 {
    margin: 4mm 0 1.5mm;
    color: var(--blue);
    font-size: 11.4pt;
    line-height: 1.25;
    break-after: avoid;
  }
  h4 { margin: 3mm 0 1mm; font-size: 10pt; break-after: avoid; }
  p { margin: 0 0 2.3mm; orphans: 3; widows: 3; }
  strong { font-weight: 700; color: #10182b; }
  em { color: #374565; }
  a { color: var(--blue); text-decoration: none; }
  blockquote {
    margin: 3mm 0 4mm;
    padding: 3mm 4mm;
    border-left: 3px solid var(--blue);
    background: #eef3ff;
    color: #24375f;
    break-inside: avoid;
  }
  blockquote p { margin: 0; }
  code {
    padding: .2mm .8mm;
    border-radius: 1mm;
    background: #eef1f6;
    color: #284b9c;
    font-family: var(--mono);
    font-size: 8.2pt;
  }
  pre {
    margin: 2.5mm 0 4mm;
    padding: 3mm 3.5mm;
    border: 1px solid #2f3d5b;
    border-radius: 2.5mm;
    background: #141c2c;
    color: #e8eefc;
    line-height: 1.45;
    white-space: pre-wrap;
    break-inside: avoid;
  }
  pre code { padding: 0; background: transparent; color: inherit; font-size: 7.9pt; }
  ul, ol { margin: 1.5mm 0 3mm; padding-left: 6mm; }
  li { margin: 0 0 1.2mm; }
  table {
    width: 100%;
    margin: 3mm 0 5mm;
    border-collapse: collapse;
    font-size: 8.15pt;
    line-height: 1.35;
    break-inside: avoid;
  }
  th, td { padding: 2mm 2.2mm; border: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { background: #eaf0ff; color: #253864; font-weight: 700; }
  tr:nth-child(even) td { background: #f8f9fc; }
  hr { margin: 6mm 0; border: 0; border-top: 1px solid var(--line); }
  .article > p:last-child {
    margin-top: 4mm;
    padding: 4mm;
    border: 1px solid #b9c8ec;
    border-radius: 3mm;
    background: #f0f4ff;
    color: #24375f;
    font-size: 10.5pt;
    font-weight: 600;
  }
  @media print {
    body { background: #fff; }
    .screen-note { display: none; }
    .document { width: auto; margin: 0; padding: 0; box-shadow: none; }
    .cover { min-height: 250mm; }
    @page { size: A4; }
  }
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataForge 2026 — Final Presentation Defence</title>
  <style>${css}</style>
</head>
<body>
  <div class="screen-note"><strong>Print-ready defence pack.</strong> The generated PDF is <code>DEFENCE.pdf</code>. Source: <code>DEFENCE.md</code>.</div>
  <main class="document">
    <section class="cover">
      <p class="eyebrow">DataForge 2026 · Pathway Track · Final Presentation Round</p>
      <h1>The synapse that never fills up</h1>
      <p class="subtitle">Live defence & judge Q&amp;A playbook</p>
      <div class="claim">A fixed-size synaptic weight matrix can process a sequence of unbounded duration without allocating a new slot per token—but retrieval degrades through interference between stored associations.</div>
      <div class="meta-grid">
        <div class="meta"><b>Round</b>12 September 2026 · 8:00 AM–6:00 PM IST</div>
        <div class="meta"><b>Core demo</b>3 minutes + judge questions</div>
        <div class="meta"><b>Verified seed</b>42 · deterministic stress case included</div>
        <div class="meta"><b>Artifact</b>sujalmeena7.github.io/synapse-never-fills-up</div>
      </div>
      <p class="rule"><strong>Room rule:</strong> never guess a number. Predict, measure, then explain.</p>
    </section>
    <article class="article">${article}</article>
  </main>
</body>
</html>`;

await writeFile(htmlPath, html, 'utf8');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `
    <div style="width:100%;padding:0 13mm;font:7px Arial;color:#748096;display:flex;justify-content:space-between;">
      <span>DataForge 2026 · Final Presentation Defence</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
  margin: { top: '12mm', right: '13mm', bottom: '16mm', left: '13mm' },
});
await browser.close();

const pdf = await PDFDocument.load(await readFile(pdfPath));
const pages = pdf.getPageCount();
const words = markdown.split(/\s+/).filter(Boolean).length;

console.log(`wrote ${htmlPath}`);
console.log(`wrote ${pdfPath}`);
console.log(`pages: ${pages}`);
console.log(`source words: ${words}`);
if (pages < 4 || pages > 12) {
  console.error(`✗ unexpected defence-pack length: ${pages} pages (expected 4–12)`);
  process.exit(1);
}
console.log('✓ defence PDF length is readable and within the expected range');
