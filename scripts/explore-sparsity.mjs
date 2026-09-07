/**
 * explore-sparsity.mjs — scratch exploration, not part of the artifact's claims.
 *
 * Question: under what conditions do sparse non-negative keys actually
 * interfere LESS than dense Gaussian keys?
 *
 * Back-of-envelope for random keys in R^d with m pairs stored:
 *
 *   dense, unit-norm Gaussian:
 *     E[k_i . k_j] = 0, sd ~ 1/sqrt(d)
 *     signs are random, so total crosstalk accumulates as a random walk:
 *         |total| ~ sqrt(m) / sqrt(d) = sqrt(m/d)
 *
 *   sparse non-negative, a of d units active, unit-norm:
 *     two keys interfere only via shared active units, ~a^2/d of them,
 *     each contributing ~1/a after normalisation, so
 *         E[k_i . k_j] ~ a/d,  and it is always >= 0
 *     no sign cancellation, so total crosstalk accumulates linearly:
 *         total ~ m * a / d
 *
 *   sparse wins when   m*a/d < sqrt(m/d)   <=>   a < sqrt(d/m)
 *
 * For d=256, m=16 that predicts a < 4 active units (~1.6% sparsity).
 * Below we check whether measurement agrees with that prediction.
 */

import { mulberry32, makeDenseKey, makeSparseKey, makeValueVocab, runTrial } from '../src/engine.js';

const DV = 32;
const SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function meanCrosstalk({ m, dk, active, sparse, seeds = 60 }) {
  let recall = 0;
  let margin = 0;
  let overlapAbsSum = 0;
  let overlapSignedSum = 0;
  let n = 0;

  for (let s = 0; s < seeds; s++) {
    const rng = mulberry32(1000 + s);
    const vocab = makeValueVocab(SYMBOLS, DV, rng);
    const pairs = [];
    for (let i = 0; i < m; i++) {
      const key = sparse ? makeSparseKey(dk, active, rng) : makeDenseKey(dk, rng);
      const e = vocab[i % vocab.length];
      pairs.push({ name: 'K' + i, key, symbol: e.symbol, valueVec: e.vec });
    }
    const r = runTrial({ pairs, vocab, dk, dv: DV });
    recall += r.recall;
    margin += r.meanMargin;

    // measure pairwise key overlap directly
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        let d = 0;
        for (let t = 0; t < dk; t++) d += pairs[i].key[t] * pairs[j].key[t];
        overlapAbsSum += Math.abs(d);
        overlapSignedSum += d;
        n++;
      }
    }
  }
  return {
    recall: recall / seeds,
    margin: margin / seeds,
    meanAbsOverlap: overlapAbsSum / n,
    meanSignedOverlap: overlapSignedSum / n,
  };
}

const pct = (x) => (100 * x).toFixed(1).padStart(6) + '%';
const f4 = (x) => x.toFixed(4).padStart(8);

console.log('d_k = 256, m = 16 pairs. Prediction: sparse beats dense when a < sqrt(d/m) = 4\n');
console.log('  regime                  │ recall  │ margin   │ mean|overlap| │ mean overlap');
console.log('  ────────────────────────┼─────────┼──────────┼───────────────┼─────────────');
{
  const d = meanCrosstalk({ m: 16, dk: 256, sparse: false });
  console.log(`  dense Gaussian          │ ${pct(d.recall)} │ ${f4(d.margin)} │ ${f4(d.meanAbsOverlap)}      │ ${f4(d.meanSignedOverlap)}`);
  for (const a of [128, 64, 26, 13, 8, 6, 4, 3, 2, 1]) {
    const s = meanCrosstalk({ m: 16, dk: 256, sparse: true, active: a });
    const label = `sparse a=${a} (${((100 * a) / 256).toFixed(1)}%)`;
    console.log(`  ${label.padEnd(23)} │ ${pct(s.recall)} │ ${f4(s.margin)} │ ${f4(s.meanAbsOverlap)}      │ ${f4(s.meanSignedOverlap)}`);
  }
}

console.log('\n\nHigher load: d_k = 256, m = 64 pairs. Prediction: a < sqrt(256/64) = 2\n');
console.log('  regime                  │ recall  │ margin   │ mean|overlap|');
console.log('  ────────────────────────┼─────────┼──────────┼──────────────');
{
  const d = meanCrosstalk({ m: 64, dk: 256, sparse: false });
  console.log(`  dense Gaussian          │ ${pct(d.recall)} │ ${f4(d.margin)} │ ${f4(d.meanAbsOverlap)}`);
  for (const a of [26, 13, 6, 4, 3, 2, 1]) {
    const s = meanCrosstalk({ m: 64, dk: 256, sparse: true, active: a });
    const label = `sparse a=${a} (${((100 * a) / 256).toFixed(1)}%)`;
    console.log(`  ${label.padEnd(23)} │ ${pct(s.recall)} │ ${f4(s.margin)} │ ${f4(s.meanAbsOverlap)}`);
  }
}

console.log('\n\nDoes mean|overlap| follow the predicted scaling?');
console.log('  dense  predicted ~ 1/sqrt(d) ; sparse predicted ~ a/d   (d_k = 256)\n');
console.log('  quantity          │ measured │ predicted');
console.log('  ──────────────────┼──────────┼──────────');
{
  const d = meanCrosstalk({ m: 8, dk: 256, sparse: false, seeds: 80 });
  // E|N(0,s)| = s*sqrt(2/pi)
  console.log(`  dense             │ ${f4(d.meanAbsOverlap)} │ ${f4(Math.sqrt(2 / Math.PI) / Math.sqrt(256))}`);
  for (const a of [13, 6, 3]) {
    const s = meanCrosstalk({ m: 8, dk: 256, sparse: true, active: a, seeds: 80 });
    console.log(`  sparse a=${String(a).padEnd(8)} │ ${f4(s.meanAbsOverlap)} │ ${f4(a / 256)}`);
  }
}
