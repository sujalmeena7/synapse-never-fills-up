/**
 * app.js — the interaction layer.
 *
 * This file owns the DOM and the canvases. It contains NO memory math of its
 * own: every number it renders comes from src/engine.js, live, on each control
 * change. If you want to check a claim, read engine.js and run
 * scripts/verify.mjs — this file only draws what that math returns.
 */

import {
  mulberry32,
  makeDenseKey,
  makeSparseKey,
  makeValueVocab,
  SynapticMemory,
  runTrial,
  interferenceProfile,
  decode,
} from './engine.js';
import { initMotion, springCount, paintSlider } from './motion.js';

// ---- fixed configuration for the visible-state regime ----
const DK = 32;
const DV = 32;
const SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const NAMES = [
  'ARIA', 'BENN', 'CIRA', 'DEVI', 'ELOM', 'FARO', 'GITA', 'HOLT',
  'IVEN', 'JOSS', 'KAEL', 'LUMI', 'MIRA', 'NOOR', 'ODIN', 'PIRA',
  'QUIN', 'RAVI', 'SORA', 'TARN', 'USHA', 'VEDA', 'WREN', 'XION',
];

const CSS = getComputedStyle(document.documentElement);
const C = {
  ink: CSS.getPropertyValue('--ink').trim() || '#e8ecf4',
  dim: CSS.getPropertyValue('--ink-dim').trim() || '#9aa6bd',
  accent: CSS.getPropertyValue('--accent').trim() || '#6ea8ff',
  signal: CSS.getPropertyValue('--signal').trim() || '#37d39a',
  noise: CSS.getPropertyValue('--noise').trim() || '#ff7a7a',
  bdh: CSS.getPropertyValue('--bdh').trim() || '#c792ff',
  warn: CSS.getPropertyValue('--warn').trim() || '#ffcf6b',
  line: CSS.getPropertyValue('--line').trim() || '#2a3346',
  bg: CSS.getPropertyValue('--bg').trim() || '#0d1017',
};

const $ = (id) => document.getElementById(id);

// ---- shared state ----
let SEED = 42;

/** Build a fresh, deterministic corpus of pairs for the current seed. */
function buildCorpus(m, { sparse = false, activeFraction = 0.05 } = {}, dk = DK) {
  const rng = mulberry32(SEED);
  const vocab = makeValueVocab(SYMBOLS, DV, rng);
  const pairs = [];
  for (let i = 0; i < m; i++) {
    const key = sparse
      ? makeSparseKey(dk, Math.max(1, Math.round(dk * activeFraction)), rng)
      : makeDenseKey(dk, rng);
    const entry = vocab[i % vocab.length];
    pairs.push({ name: NAMES[i % NAMES.length], key, symbol: entry.symbol, valueVec: entry.vec });
  }
  return { pairs, vocab };
}

// ============================================================================
// STEP 0 — the substrate heatmap, scrubbable by write count
// ============================================================================

const matrixCanvas = $('matrix-canvas');
const mctx = matrixCanvas.getContext('2d');

function drawMatrix(nWrites) {
  const { pairs } = buildCorpus(8);
  const mem = new SynapticMemory(DK, DV);
  for (let i = 0; i < nWrites; i++) mem.write(pairs[i].key, pairs[i].valueVec);

  const W = matrixCanvas.width;
  const H = matrixCanvas.height;
  const cw = W / DK;
  const ch = H / DV;

  // symmetric colour scale around 0
  let peak = 1e-6;
  for (let i = 0; i < mem.S.length; i++) peak = Math.max(peak, Math.abs(mem.S[i]));

  mctx.fillStyle = C.bg;
  mctx.fillRect(0, 0, W, H);
  for (let i = 0; i < DK; i++) {
    for (let j = 0; j < DV; j++) {
      const v = mem.S[i * DV + j] / peak; // -1..1
      mctx.fillStyle = weightColor(v);
      mctx.fillRect(i * cw, j * ch, cw - 0.5, ch - 0.5);
    }
  }
  $('write-count').textContent = nWrites;
}

/** Diverging colour map: negative → blue, zero → dark, positive → green. */
function weightColor(v) {
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) {
    const a = 0.12 + 0.88 * t;
    return `rgba(55, 211, 154, ${a})`;
  }
  const a = 0.12 + 0.88 * -t;
  return `rgba(110, 168, 255, ${a})`;
}

$('write-scrub').addEventListener('input', (e) => drawMatrix(+e.target.value));

// ============================================================================
// STEP 1 — footprint: constant state vs growing KV cache
// ============================================================================

const fpCanvas = $('footprint-canvas');
const fctx = fpCanvas.getContext('2d');

function drawFootprint(m) {
  const stateSize = DK * DV;
  const kvMax = 200 * (DK + DV);
  const yMax = Math.max(stateSize, kvMax) * 1.05;

  const W = fpCanvas.width;
  const H = fpCanvas.height;
  const pad = 40;

  fctx.clearRect(0, 0, W, H);
  // axes
  fctx.strokeStyle = C.line;
  fctx.lineWidth = 1;
  fctx.beginPath();
  fctx.moveTo(pad, 10);
  fctx.lineTo(pad, H - pad);
  fctx.lineTo(W - 10, H - pad);
  fctx.stroke();

  const x = (pairs) => pad + (pairs / 200) * (W - pad - 15);
  const y = (val) => H - pad - (val / yMax) * (H - pad - 15);

  // constant state line
  fctx.strokeStyle = C.signal;
  fctx.lineWidth = 2.5;
  fctx.beginPath();
  fctx.moveTo(x(2), y(stateSize));
  fctx.lineTo(x(200), y(stateSize));
  fctx.stroke();

  // growing KV line
  fctx.strokeStyle = C.noise;
  fctx.beginPath();
  fctx.moveTo(x(2), y(2 * (DK + DV)));
  fctx.lineTo(x(200), y(200 * (DK + DV)));
  fctx.stroke();

  // current marker
  fctx.fillStyle = C.accent;
  fctx.beginPath();
  fctx.arc(x(m), y(m * (DK + DV)), 5, 0, 2 * Math.PI);
  fctx.fill();
  fctx.beginPath();
  fctx.arc(x(m), y(stateSize), 5, 0, 2 * Math.PI);
  fctx.fillStyle = C.signal;
  fctx.fill();

  // labels
  fctx.fillStyle = C.dim;
  fctx.font = '11px monospace';
  fctx.fillText('scalars in memory', pad, 22);
  fctx.fillText('pairs stored →', W - 90, H - pad + 22);
  fctx.fillStyle = C.signal;
  fctx.fillText('fast-weight state (flat)', x(60), y(stateSize) - 8);
  fctx.fillStyle = C.noise;
  fctx.fillText('KV cache', x(150), y(200 * (DK + DV)) + 4);

  // readouts (spring-animated counters)
  const kv = m * (DK + DV);
  springCount($('ro-state'), stateSize);
  springCount($('ro-kv'), kv);
  const ratio = (kv / stateSize).toFixed(2);
  const msg =
    kv <= stateSize
      ? `At ${m} pairs the KV cache is still smaller — but it is climbing while the state sits flat.`
      : `At ${m} pairs the KV cache is ${ratio}× the fixed state, and it keeps growing. The state has not moved one scalar.`;
  $('footprint-insight').textContent = msg;
}

$('npairs').addEventListener('input', (e) => {
  $('npairs-out').textContent = e.target.value;
  drawFootprint(+e.target.value);
});

// ============================================================================
// STEP 2 + 3 — interference decomposition and decode (shared cue/load)
// ============================================================================

const intCanvas = $('interference-canvas');
const ictx = intCanvas.getContext('2d');
const decCanvas = $('decode-canvas');
const dctx = decCanvas.getContext('2d');

function populateCueSelect(m) {
  const sel = $('cue-select');
  const prev = sel.value;
  sel.innerHTML = '';
  const { pairs } = buildCorpus(m);
  pairs.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.name} → ${p.symbol}`;
    sel.appendChild(opt);
  });
  if (prev && +prev < m) sel.value = prev;
}

function drawInterferenceAndDecode() {
  const m = +$('load-slider').value;
  const cueIndex = Math.min(+$('cue-select').value || 0, m - 1);
  const { pairs, vocab } = buildCorpus(m);

  // --- interference bars ---
  const prof = interferenceProfile(pairs, cueIndex);
  const W = intCanvas.width;
  const H = intCanvas.height;
  const pad = 30;
  const n = prof.terms.length;
  const bw = Math.max(3, (W - 2 * pad) / n - 2);
  const maxCoef = Math.max(1, ...prof.terms.map((t) => Math.abs(t.coefficient)));
  const mid = H / 2;

  ictx.clearRect(0, 0, W, H);
  ictx.strokeStyle = C.line;
  ictx.beginPath();
  ictx.moveTo(pad, mid);
  ictx.lineTo(W - pad, mid);
  ictx.stroke();

  prof.terms.forEach((t, i) => {
    const x = pad + i * ((W - 2 * pad) / n);
    const h = (Math.abs(t.coefficient) / maxCoef) * (mid - 20);
    ictx.fillStyle = t.isSignal ? C.signal : C.noise;
    if (t.coefficient >= 0) ictx.fillRect(x, mid - h, bw, h);
    else ictx.fillRect(x, mid, bw, h);
  });

  ictx.fillStyle = C.dim;
  ictx.font = '10px monospace';
  ictx.fillText('+ overlap', pad, 12);
  ictx.fillText('− overlap', pad, H - 4);

  // --- decode step 3 ---
  const mem = new SynapticMemory(DK, DV);
  for (const p of pairs) mem.write(p.key, p.valueVec);
  const r = mem.read(pairs[cueIndex].key);
  const ranked = decode(r, vocab);
  drawDecode(ranked, pairs[cueIndex].symbol);

  // --- verdict + expected badge ---
  const top = ranked[0];
  const hit = top.symbol === pairs[cueIndex].symbol;
  const trueScore = ranked.find((e) => e.symbol === pairs[cueIndex].symbol).score;
  $('expected-symbol').textContent = pairs[cueIndex].symbol;
  $('recall-verdict').innerHTML = hit
    ? `signal ${prof.signal.toFixed(2)} still beats crosstalk Σ|·| ${prof.crosstalk.toFixed(2)} → recalls "<b style="color:${C.signal}">${top.symbol}</b>" ✓`
    : `crosstalk Σ|·| ${prof.crosstalk.toFixed(2)} has overwhelmed signal ${prof.signal.toFixed(2)} → says "<b style="color:${C.noise}">${top.symbol}</b>", wanted "${pairs[cueIndex].symbol}" ✗`;

  const margin = trueScore - (ranked.find((e) => e.symbol !== pairs[cueIndex].symbol)?.score ?? 0);
  $('decode-insight').textContent = hit
    ? `Correct, but the margin to the runner-up is ${margin.toFixed(2)}. Push the load higher and watch it shrink toward zero.`
    : `The expected answer has been out-voted. Nothing was deleted from S — the correct memory is still in there, just buried.`;
}

function drawDecode(ranked, expected) {
  const W = decCanvas.width;
  const H = decCanvas.height;
  const pad = 28;
  const items = ranked.slice(0, 10);
  const bw = (W - 2 * pad) / items.length - 6;
  const maxScore = Math.max(0.001, ...items.map((i) => Math.abs(i.score)));

  dctx.clearRect(0, 0, W, H);
  dctx.strokeStyle = C.line;
  dctx.beginPath();
  dctx.moveTo(pad, H - pad);
  dctx.lineTo(W - pad, H - pad);
  dctx.stroke();

  items.forEach((it, i) => {
    const x = pad + i * ((W - 2 * pad) / items.length);
    const h = (it.score / maxScore) * (H - 2 * pad);
    const isExpected = it.symbol === expected;
    const isTop = i === 0;
    dctx.fillStyle = isExpected ? C.signal : isTop ? C.warn : C.dim;
    dctx.globalAlpha = isExpected || isTop ? 1 : 0.5;
    dctx.fillRect(x, H - pad - Math.max(0, h), bw, Math.max(0, h));
    dctx.globalAlpha = 1;
    dctx.fillStyle = isExpected ? C.signal : C.dim;
    dctx.font = '11px monospace';
    dctx.fillText(it.symbol, x + bw / 2 - 3, H - pad + 14);
  });

  dctx.fillStyle = C.signal;
  dctx.font = '10px monospace';
  dctx.fillText('■ expected', pad, 14);
  dctx.fillStyle = C.warn;
  dctx.fillText('■ memory pick', pad + 80, 14);
}

$('load-slider').addEventListener('input', (e) => {
  $('load-out').textContent = e.target.value;
  populateCueSelect(+e.target.value);
  drawInterferenceAndDecode();
});
$('cue-select').addEventListener('change', drawInterferenceAndDecode);

// ============================================================================
// STEP 4 — BDH regime toggle: dense vs sparse non-negative, recall vs load
// ============================================================================

const regCanvas = $('regime-canvas');
const rctx = regCanvas.getContext('2d');
let regime = 'dense';

function recallCurve({ sparse, activeFraction, dk }) {
  const loads = [2, 4, 6, 8, 12, 16, 20, 28, 36, 48, 64];
  const seeds = 12;
  return loads.map((m) => {
    let acc = 0;
    for (let s = 0; s < seeds; s++) {
      const savedSeed = SEED;
      SEED = 1000 + s;
      const { pairs, vocab } = buildCorpus(m, { sparse, activeFraction }, dk);
      SEED = savedSeed;
      acc += runTrial({ pairs, vocab, dk, dv: DV }).recall;
    }
    return { m, recall: acc / seeds };
  });
}

function drawRegime() {
  const dk = 128; // more headroom so both regimes are legible
  const activeFraction = (+$('sparsity').value) / 100;
  const dense = recallCurve({ sparse: false, activeFraction: 0, dk });
  const active = recallCurve({ sparse: regime === 'sparse', activeFraction, dk });

  const W = regCanvas.width;
  const H = regCanvas.height;
  const pad = 38;
  const maxM = 64;

  rctx.clearRect(0, 0, W, H);
  rctx.strokeStyle = C.line;
  rctx.beginPath();
  rctx.moveTo(pad, 12);
  rctx.lineTo(pad, H - pad);
  rctx.lineTo(W - 12, H - pad);
  rctx.stroke();

  const x = (m) => pad + (m / maxM) * (W - pad - 15);
  const y = (r) => H - pad - r * (H - pad - 15);

  const plot = (curve, color, dash) => {
    rctx.strokeStyle = color;
    rctx.lineWidth = 2.2;
    rctx.setLineDash(dash || []);
    rctx.beginPath();
    curve.forEach((pt, i) => (i ? rctx.lineTo(x(pt.m), y(pt.recall)) : rctx.moveTo(x(pt.m), y(pt.recall))));
    rctx.stroke();
    rctx.setLineDash([]);
  };

  plot(dense, C.dim, [4, 4]);
  plot(active, regime === 'sparse' ? C.bdh : C.dim, []);

  rctx.fillStyle = C.dim;
  rctx.font = '11px monospace';
  rctx.fillText('recall', pad - 26, 20);
  rctx.fillText('pairs →', W - 60, H - pad + 20);
  rctx.fillText('1.0', pad - 26, y(1) + 4);
  rctx.fillText('0', pad - 14, y(0) + 4);

  const label = regime === 'sparse'
    ? `sparse ${$('sparsity').value}% active`
    : 'dense';
  rctx.fillStyle = regime === 'sparse' ? C.bdh : C.ink;
  rctx.fillText(label, x(40), y(active[active.length - 3].recall) - 8);
  rctx.fillStyle = C.dim;
  rctx.fillText('dense ref', x(20), y(dense[dense.length - 4].recall) + 16);

  // verdict at a fixed load
  const at = 20;
  const dR = dense.find((p) => p.m === at).recall;
  const aR = active.find((p) => p.m === at).recall;
  if (regime === 'dense') {
    $('bdh-verdict').textContent =
      `Dense signed keys: crosstalk cancels on average, so recall holds until load is high. At ${at} pairs: ${(100 * dR).toFixed(0)}%.`;
  } else {
    const verb = aR >= dR - 0.02 ? 'matches or beats' : 'trails';
    $('bdh-verdict').innerHTML =
      `At ${$('sparsity').value}% active, sparse non-negative recall at ${at} pairs is <b>${(100 * aR).toFixed(0)}%</b> vs dense <b>${(100 * dR).toFixed(0)}%</b> — it ${verb} dense here. Lower the % and interference keeps dropping; raise it past ~25% and non-negativity (no cancellation) wins and recall collapses.`;
  }
}

$('regime-dense').addEventListener('click', () => {
  regime = 'dense';
  $('regime-dense').classList.add('active');
  $('regime-sparse').classList.remove('active');
  $('sparsity-row').style.opacity = 0.4;
  drawRegime();
});
$('regime-sparse').addEventListener('click', () => {
  regime = 'sparse';
  $('regime-sparse').classList.add('active');
  $('regime-dense').classList.remove('active');
  $('sparsity-row').style.opacity = 1;
  drawRegime();
});
$('sparsity').addEventListener('input', (e) => {
  $('sparsity-out').textContent = e.target.value + '%';
  if (regime === 'sparse') drawRegime();
});

// ============================================================================
// seed control + initial paint
// ============================================================================

$('reseed').addEventListener('click', () => {
  SEED = (Math.random() * 1e9) | 0;
  $('seed-display').textContent = SEED;
  renderAll();
});

function renderAll() {
  $('write-scrub').value = 8;
  drawMatrix(8);
  drawFootprint(+$('npairs').value);
  populateCueSelect(+$('load-slider').value);
  drawInterferenceAndDecode();
  $('sparsity-row').style.opacity = 0.4;
  // keep custom slider fills in sync after any programmatic value change
  document.querySelectorAll('input[type="range"]').forEach(paintSlider);
  // drawRegime() runs a multi-seed sweep (~250 trials). Defer it so it never
  // blocks the hero entrance animation on first load.
  requestAnimationFrame(() => requestAnimationFrame(drawRegime));
}

// Motion first: the hero entrance starts immediately instead of waiting behind
// the initial render's math.
initMotion();
renderAll();
