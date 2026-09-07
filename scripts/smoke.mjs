/**
 * smoke.mjs — DOM smoke test (dev-only, not shipped in the artifact).
 *
 * Loads the real index.html into jsdom, stubs the canvas 2D context and
 * requestAnimationFrame, then imports and runs app.js exactly as the browser
 * would. Catches: missing element IDs, bad selectors, runtime errors in the
 * initial render, and the vendored Motion import resolving.
 *
 * Run:  node scripts/smoke.mjs   (requires: npm i jsdom --no-save)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

// ---- stub the bits jsdom lacks ----
const stubCtx = new Proxy(
  {
    canvas: { width: 360, height: 360, clientWidth: 360, clientHeight: 360 },
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText() {},
    setLineDash() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 360 }),
  },
  { get: (t, p) => (p in t ? t[p] : () => {}), set: () => true }
);
window.HTMLCanvasElement.prototype.getContext = () => stubCtx;
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {} }));
// Fire the callback immediately on observe, so reveal/animation code paths are
// actually exercised rather than silently skipped.
window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) {
    this.cb(
      [{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: { height: 100 } }],
      this
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

// route errors to our collector
window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));

// expose globals the modules expect
global.window = window;
global.document = window.document;
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.IntersectionObserver = window.IntersectionObserver;
global.Element = window.Element;
global.performance = window.performance || global.performance;
global.queueMicrotask = global.queueMicrotask || ((fn) => Promise.resolve().then(fn));

// ---- check every id/selector app.js references actually exists ----
const requiredIds = [
  'matrix-canvas', 'write-scrub', 'write-count',
  'footprint-canvas', 'npairs', 'npairs-out', 'ro-state', 'ro-kv', 'footprint-insight',
  'interference-canvas', 'decode-canvas', 'cue-select', 'load-slider', 'load-out',
  'recall-verdict', 'expected-symbol', 'decode-insight',
  'regime-canvas', 'regime-dense', 'regime-sparse', 'sparsity', 'sparsity-out',
  'sparsity-row', 'bdh-verdict',
  'reseed', 'seed-display',
  'scroll-progress', 'hero-net',
];
const missing = requiredIds.filter((id) => !window.document.getElementById(id));
if (missing.length) {
  console.error('MISSING ELEMENT IDS:', missing.join(', '));
  process.exit(1);
}
console.log(`✓ all ${requiredIds.length} referenced element IDs present in index.html`);

// ---- actually run the app modules ----
try {
  await import(pathToFileURL(resolve(root, 'src/app.js')).href);
  console.log('✓ app.js imported and initial render completed without throwing');
} catch (e) {
  console.error('APP.JS THREW:', e.stack || e.message);
  process.exit(1);
}

// ---- exercise the interactive paths by firing input events ----
function fire(id, value, type = 'input') {
  const el = window.document.getElementById(id);
  if (value !== undefined) el.value = value;
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
}
try {
  fire('write-scrub', '5');
  fire('npairs', '150');
  fire('load-slider', '30');
  fire('cue-select', undefined, 'change');
  window.document.getElementById('regime-sparse').dispatchEvent(new window.Event('click', { bubbles: true }));
  fire('sparsity', '12');
  window.document.getElementById('regime-dense').dispatchEvent(new window.Event('click', { bubbles: true }));
  console.log('✓ interactive controls (sliders, toggle, select) fired without throwing');
} catch (e) {
  console.error('INTERACTION THREW:', e.stack || e.message);
  process.exit(1);
}

if (errors.length) {
  console.error('WINDOW ERRORS:', errors);
  process.exit(1);
}

// ---- reveal regression guard ----
// Every [data-reveal] element starts at opacity:0 in CSS. If the motion layer
// fails to mark them .in-view (or set an inline opacity), content ships invisible.
// This is the exact failure mode that made the hero look un-animated.
await new Promise((r) => setTimeout(r, 60));
const revealEls = Array.from(window.document.querySelectorAll('[data-reveal]'));
const stranded = revealEls.filter(
  (el) => !el.classList.contains('in-view') && el.style.opacity !== '1'
);
if (stranded.length) {
  console.error(
    `REVEAL FAILURE: ${stranded.length}/${revealEls.length} elements never became visible:`,
    stranded.map((e) => e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : '')).join(', ')
  );
  process.exit(1);
}
console.log(`✓ all ${revealEls.length} [data-reveal] elements resolved to visible`);

const heroRevealed = Array.from(
  window.document.querySelectorAll('.masthead [data-reveal]')
).every((el) => el.classList.contains('in-view') || el.style.opacity === '1');
console.log(`✓ hero reveal group triggered: ${heroRevealed}`);
if (!heroRevealed) process.exit(1);

// sanity: the counters updated
const state = window.document.getElementById('ro-state').textContent;
const kv = window.document.getElementById('ro-kv').textContent;
console.log(`✓ readouts populated — state="${state}", kv="${kv}"`);
console.log('\nSMOKE TEST PASSED');
