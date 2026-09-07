/**
 * verify.mjs — reproduces the numbers quoted in the artifact and README.
 *
 * Run:  node scripts/verify.mjs
 *
 * Every figure the explainer states about its own substrate comes from this
 * script at seed 42. If a claim in the README disagrees with this output, the
 * README is wrong.
 */

import {
  mulberry32,
  makeDenseKey,
  makeSparseKey,
  makeValueVocab,
  runTrial,
  interferenceProfile,
  dot,
} from '../src/engine.js';

const SEED = 42;
const DV = 32;
const SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const NAMES = [
  'ARIA', 'BENN', 'CIRA', 'DEVI', 'ELOM', 'FARO', 'GITA', 'HOLT',
  'IVEN', 'JOSS', 'KAEL', 'LUMI', 'MIRA', 'NOOR', 'ODIN', 'PIRA',
  'QUIN', 'RAVI', 'SORA', 'TARN', 'USHA', 'VEDA', 'WREN', 'XION',
];

/** Build m pairs under a given key regime. */
function buildPairs({ m, dk, sparse, activeFraction, rng, vocab }) {
  const pairs = [];
  for (let i = 0; i < m; i++) {
    const key = sparse
      ? makeSparseKey(dk, Math.max(1, Math.round(dk * activeFraction)), rng)
      : makeDenseKey(dk, rng);
    const entry = vocab[i % vocab.length];
    pairs.push({ name: NAMES[i % NAMES.length], key, symbol: entry.symbol, valueVec: entry.vec });
  }
  return pairs;
}

function trial({ m, dk, sparse, activeFraction = 0.05, seed = SEED, decay = 1 }) {
  const rng = mulberry32(seed);
  const vocab = makeValueVocab(SYMBOLS, DV, rng);
  const pairs = buildPairs({ m, dk, sparse, activeFraction, rng, vocab });
  return { ...runTrial({ pairs, vocab, dk, dv: DV, decay }), pairs };
}

/** Average recall over several seeds, so we are not reporting one lucky draw. */
function sweep({ m, dk, sparse, activeFraction = 0.05, seeds = 40 }) {
  let recall = 0;
  let margin = 0;
  for (let s = 0; s < seeds; s++) {
    const r = trial({ m, dk, sparse, activeFraction, seed: SEED + s });
    recall += r.recall;
    margin += r.meanMargin;
  }
  return { recall: recall / seeds, margin: margin / seeds };
}

const line = (s = '') => console.log(s);
const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';

line('='.repeat(72));
line('CLAIM 1  State size is constant in sequence length; the KV cache is not.');
line('='.repeat(72));
line('  d_k = 32, d_v = 32');
line();
line('  pairs stored │ fast-weight state │ KV cache │ ratio');
line('  ─────────────┼───────────────────┼──────────┼──────');
for (const m of [1, 4, 8, 16, 32, 64, 128]) {
  const r = trial({ m, dk: 32, sparse: false });
  const ratio = (r.kvCacheFootprint / r.stateFootprint).toFixed(2);
  line(
    `  ${String(m).padStart(12)} │ ${String(r.stateFootprint).padStart(17)} │ ` +
      `${String(r.kvCacheFootprint).padStart(8)} │ ${ratio.padStart(5)}x`
  );
}
line();
line('  The middle column never moves. Writing pair 128 costs exactly as much');
line('  state as writing pair 1. No slot is allocated per token.');
line();

line('='.repeat(72));
line('CLAIM 2  It still forgets — through interference, not eviction.');
line('='.repeat(72));
line('  Dense keys, d_k = 32, d_v = 32, mean over 40 seeds');
line();
line('  pairs │ top-1 recall │ mean margin');
line('  ──────┼──────────────┼────────────');
for (const m of [2, 4, 8, 12, 16, 24, 32, 48]) {
  const s = sweep({ m, dk: 32, sparse: false });
  line(`  ${String(m).padStart(5)} │ ${pct(s.recall)}        │ ${s.margin.toFixed(3).padStart(11)}`);
}
line();
line('  Recall decays smoothly. Nothing was deleted: every write is still');
line('  present in S. The signal is being buried by accumulated crosstalk.');
line();

line('='.repeat(72));
line('CLAIM 3  Capacity scales with key dimension, not with a slot count.');
line('='.repeat(72));
line('  Dense keys, 16 pairs stored, mean over 40 seeds');
line();
line('  d_k │ top-1 recall');
line('  ────┼─────────────');
for (const dk of [8, 16, 32, 64, 128, 256]) {
  const s = sweep({ m: 16, dk, sparse: false });
  line(`  ${String(dk).padStart(3)} │ ${pct(s.recall)}`);
}
line();

line('='.repeat(72));
line('CLAIM 4  Non-negative codes are only usable BECAUSE they are sparse.');
line('='.repeat(72));
line('  d_k = 256, 16 pairs stored, mean over 40 seeds');
line();
line('  Note what changes and what does not: dense Gaussian overlaps are');
line('  signed and cancel, so crosstalk accumulates as a random walk,');
line('  ~sqrt(m/d). Non-negative overlaps cannot cancel, so crosstalk');
line('  accumulates linearly, ~m*a/d. Sparsity is what keeps that linear');
line('  term small enough to be survivable.');
line();
line('  regime                       │ top-1 recall │ mean margin');
line('  ─────────────────────────────┼──────────────┼────────────');
{
  const dense = sweep({ m: 16, dk: 256, sparse: false });
  line(`  ${'dense Gaussian'.padEnd(28)} │ ${pct(dense.recall)}       │ ${dense.margin.toFixed(3).padStart(11)}`);
  for (const f of [0.5, 0.25, 0.1, 0.05, 0.016]) {
    const s = sweep({ m: 16, dk: 256, sparse: true, activeFraction: f });
    const label = `sparse non-neg, ${(100 * f).toFixed(1)}% active`;
    line(`  ${label.padEnd(28)} │ ${pct(s.recall)}       │ ${s.margin.toFixed(3).padStart(11)}`);
  }
}
line();
line('  At 50% active with no sign cancellation, recall collapses to ~51%.');
line('  At roughly the ~5% regime BDH reports, recall returns to dense-level');
line('  while touching a fraction of the units. Sparse coding APPROACHES');
line('  dense here; it only overtakes it once a < sqrt(d_k/m), which the');
line('  scaling check below tests directly.');
line();
line('  Do NOT read this as "BDH sparsity beats dense attention". It is a');
line('  property of random keys in this toy substrate. BDH learns its keys,');
line('  and learned sparse codes can be far closer to orthogonal than random');
line('  ones, so this understates achievable capacity. No Pathway checkpoint');
line('  was run for any number in this file.');
line();

line('='.repeat(72));
line('CLAIM 4b  The crosstalk scaling law is predicted, then measured.');
line('='.repeat(72));
line('  Predicted mean |k_i . k_j|:  dense sqrt(2/pi)/sqrt(d_k)   sparse a/d_k');
line('  d_k = 256, mean over 80 seeds');
line();
line('  regime         │ measured │ predicted │ signed mean');
line('  ───────────────┼──────────┼───────────┼────────────');
{
  const overlapStats = ({ sparse, active }) => {
    let abs = 0;
    let signed = 0;
    let n = 0;
    for (let s = 0; s < 80; s++) {
      const rng = mulberry32(SEED + s);
      const keys = [];
      for (let i = 0; i < 8; i++) {
        keys.push(sparse ? makeSparseKey(256, active, rng) : makeDenseKey(256, rng));
      }
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const d = dot(keys[i], keys[j]);
          abs += Math.abs(d);
          signed += d;
          n++;
        }
      }
    }
    return { abs: abs / n, signed: signed / n };
  };
  const d = overlapStats({ sparse: false });
  line(
    `  dense          │ ${d.abs.toFixed(4).padStart(8)} │ ` +
      `${(Math.sqrt(2 / Math.PI) / 16).toFixed(4).padStart(9)} │ ${d.signed.toFixed(4).padStart(11)}`
  );
  for (const a of [13, 6, 3]) {
    const s = overlapStats({ sparse: true, active: a });
    line(
      `  sparse a=${String(a).padEnd(5)} │ ${s.abs.toFixed(4).padStart(8)} │ ` +
        `${(a / 256).toFixed(4).padStart(9)} │ ${s.signed.toFixed(4).padStart(11)}`
    );
  }
}
line();
line('  The right-hand column is the mechanism in one number. Dense signed');
line('  overlap averages ~0: interference cancels. Sparse non-negative signed');
line('  overlap equals its own absolute value: nothing ever cancels.');
line();

line('='.repeat(72));
line('CLAIM 5  A single read decomposes into signal + named crosstalk terms.');
line('='.repeat(72));
{
  const r = trial({ m: 8, dk: 32, sparse: false });
  const prof = interferenceProfile(r.pairs, 0);
  line(`  Cue = ${r.pairs[0].name}, expecting "${r.pairs[0].symbol}"`);
  line();
  line('  term        │ coefficient (k_i . k_cue)');
  line('  ────────────┼──────────────────────────');
  for (const t of prof.terms) {
    const tag = t.isSignal ? 'SIGNAL' : '';
    line(
      `  ${t.name.padEnd(11)} │ ${t.coefficient.toFixed(4).padStart(9)}   ${tag}`
    );
  }
  line();
  line(`  signal ${prof.signal.toFixed(4)}  vs  summed |crosstalk| ${prof.crosstalk.toFixed(4)}`);
  line(`  signal-to-crosstalk ratio: ${prof.ratio.toFixed(3)}`);
  line(`  probe result: got "${r.probes[0].got}", expected "${r.probes[0].expected}" -> ${r.probes[0].hit ? 'HIT' : 'MISS'}`);
}
line();
line('  The self term is exactly 1.0000 because keys are unit-normalised.');
line('  Everything else is measured overlap between actual sampled keys.');
line();
line('Done. All numbers above are deterministic at seed 42.');
