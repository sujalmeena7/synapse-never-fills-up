/**
 * engine.js — the computational substrate.
 *
 * Pure math, no DOM. Everything the artifact claims is computed here, live,
 * in the browser. Nothing in this file is animated or faked.
 *
 * THE MECHANISM
 * -------------
 * Softmax attention answers a query by comparing it against every stored key:
 *
 *     out_t = sum_i  softmax(q_t . k_i) * v_i
 *
 * That requires keeping every (k_i, v_i) around — the KV cache — so memory
 * grows with sequence length.
 *
 * Drop the softmax and the sum reassociates:
 *
 *     out_t = sum_{i<=t} (q_t . k_i) v_i
 *           = q_t^T ( sum_{i<=t} k_i v_i^T )
 *           = q_t^T S_t
 *
 * S_t is a fixed-size d_k x d_v matrix. In recurrent form:
 *
 *     WRITE:  S_t = lambda * S_{t-1} + k_t v_t^T      <- Hebbian outer product
 *     READ:   r_t = S_t^T q_t
 *
 * The write is a co-activation update: it strengthens the connection between
 * whatever was active in the key space and whatever was active in the value
 * space. This is the "fast weight" / associative-memory reading of linear
 * attention, and it is the view BDH-CQ's report relates its contextual memory
 * to (arXiv:2608.09888).
 *
 * WHY IT DEGRADES INSTEAD OF FILLING UP
 * -------------------------------------
 * Read the memory back with a cue equal to a stored key k_j:
 *
 *     r = S^T k_j
 *       = v_j (k_j . k_j)          <- signal
 *       + sum_{i != j} v_i (k_i . k_j)   <- crosstalk
 *
 * With unit-norm keys the signal term is exactly 1.0 * v_j. Every other stored
 * pair leaks in proportional to how much its key overlaps the cue. Nothing is
 * ever evicted and no slot is ever allocated; recall fails when accumulated
 * crosstalk outgrows the signal. Capacity is set by the key dimension d_k and
 * by how close to orthogonal the keys are — not by a slot count.
 *
 * That last point is what makes sparsity load-bearing rather than decorative.
 * Two sparse non-negative vectors that share few active units have small inner
 * product, so sparse keys interfere less. BDH reports roughly 5% of neurons
 * active with non-negative (ReLU) activations; this file lets you toggle that
 * regime and measure the difference.
 */

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32). Seeded so every figure and number in the
// artifact is reproducible from the seed shown in the UI.
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller. */
function gauss(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export function norm(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s);
}

export function normalize(x) {
  const n = norm(x);
  if (n === 0) return x;
  for (let i = 0; i < x.length; i++) x[i] /= n;
  return x;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function cosine(a, b) {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

// ---------------------------------------------------------------------------
// Key construction — the one control that changes the interference regime
// ---------------------------------------------------------------------------

/**
 * Dense key: every unit carries signal. Gaussian, then unit-normalised.
 * Expected |k_i . k_j| for independent dense keys is ~1/sqrt(d_k).
 */
export function makeDenseKey(dk, rng) {
  const k = new Float64Array(dk);
  for (let i = 0; i < dk; i++) k[i] = gauss(rng);
  return normalize(k);
}

/**
 * Sparse non-negative key, BDH-style: only `active` of `dk` units fire, and
 * they fire positively. Two such keys can only interfere through units they
 * both activate, so expected overlap falls sharply with sparsity.
 *
 * Non-negativity matters and cuts both ways: overlaps can no longer cancel by
 * sign, so every collision adds. Sparsity has to do the work of keeping
 * collisions rare. The artifact measures this rather than asserting it.
 */
export function makeSparseKey(dk, active, rng) {
  const k = new Float64Array(dk);
  const a = Math.max(1, Math.min(dk, Math.round(active)));
  // Partial Fisher-Yates over an index pool: unbiased sample without replacement.
  const pool = new Int32Array(dk);
  for (let i = 0; i < dk; i++) pool[i] = i;
  for (let i = 0; i < a; i++) {
    const j = i + Math.floor(rng() * (dk - i));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
    k[pool[i]] = 0.5 + rng(); // positive magnitudes only
  }
  return normalize(k);
}

/**
 * Fixed value vocabulary. Each symbol gets one unit vector in R^{d_v}, drawn
 * once and reused. d_v is fixed and independent of how many pairs get stored,
 * which is what keeps the state matrix a constant size.
 */
export function makeValueVocab(symbols, dv, rng) {
  return symbols.map((sym) => {
    const v = new Float64Array(dv);
    for (let i = 0; i < dv; i++) v[i] = gauss(rng);
    return { symbol: sym, vec: normalize(v) };
  });
}

// ---------------------------------------------------------------------------
// The memory itself
// ---------------------------------------------------------------------------

export class SynapticMemory {
  /**
   * @param {number} dk key/query dimension
   * @param {number} dv value dimension
   */
  constructor(dk, dv) {
    this.dk = dk;
    this.dv = dv;
    // Row-major d_k x d_v. Allocated once at construction: the whole point is
    // that this never grows as more pairs arrive.
    this.S = new Float64Array(dk * dv);
    this.writes = 0;
  }

  reset() {
    this.S.fill(0);
    this.writes = 0;
  }

  /** Number of scalars held in state. Constant by construction. */
  get footprint() {
    return this.dk * this.dv;
  }

  /**
   * Hebbian write with optional multiplicative decay.
   *   S <- lambda * S + k v^T
   * decay = 1 is pure accumulation (no forgetting).
   */
  write(k, v, decay = 1) {
    const { S, dk, dv } = this;
    if (decay !== 1) {
      for (let i = 0; i < S.length; i++) S[i] *= decay;
    }
    for (let i = 0; i < dk; i++) {
      const ki = k[i];
      if (ki === 0) continue; // sparse keys touch few rows — real savings
      const row = i * dv;
      for (let j = 0; j < dv; j++) S[row + j] += ki * v[j];
    }
    this.writes++;
  }

  /**
   * Read: r = S^T q, returning a d_v vector.
   */
  read(q) {
    const { S, dk, dv } = this;
    const r = new Float64Array(dv);
    for (let i = 0; i < dk; i++) {
      const qi = q[i];
      if (qi === 0) continue;
      const row = i * dv;
      for (let j = 0; j < dv; j++) r[j] += qi * S[row + j];
    }
    return r;
  }
}

// ---------------------------------------------------------------------------
// Decoding and measurement
// ---------------------------------------------------------------------------

/**
 * Score a retrieved vector against the value vocabulary.
 * Returns entries sorted by descending cosine similarity.
 */
export function decode(r, vocab) {
  return vocab
    .map((entry, index) => ({
      index,
      symbol: entry.symbol,
      score: cosine(r, entry.vec),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Decompose a read into the exact terms of the crosstalk equation:
 *
 *     r = v_j (k_j . k_j) + sum_{i != j} v_i (k_i . k_j)
 *
 * The returned coefficients are the (k_i . k_j) values, so the caller can show
 * the learner the signal term and every interfering term separately. These are
 * measured from the actual key set, not estimated.
 */
export function interferenceProfile(pairs, cueIndex) {
  const cue = pairs[cueIndex].key;
  const terms = pairs.map((p, i) => ({
    index: i,
    name: p.name,
    symbol: p.symbol,
    coefficient: dot(p.key, cue),
    isSignal: i === cueIndex,
  }));
  const signal = Math.abs(terms[cueIndex].coefficient);
  let crosstalk = 0;
  for (let i = 0; i < terms.length; i++) {
    if (i !== cueIndex) crosstalk += Math.abs(terms[i].coefficient);
  }
  return { terms, signal, crosstalk, ratio: crosstalk === 0 ? Infinity : signal / crosstalk };
}

/**
 * Build a memory, write every pair, then probe with each key in turn.
 *
 * This is the acceptance test behind the central claim. It reports top-1
 * recall, mean margin between the correct symbol and the best distractor, and
 * the state footprint next to the KV-cache footprint for the same sequence.
 */
export function runTrial({
  pairs,
  vocab,
  dk,
  dv,
  decay = 1,
}) {
  const mem = new SynapticMemory(dk, dv);
  for (const p of pairs) mem.write(p.key, p.valueVec, decay);

  let correct = 0;
  let marginSum = 0;
  const probes = [];

  for (let j = 0; j < pairs.length; j++) {
    const r = mem.read(pairs[j].key);
    const ranked = decode(r, vocab);
    const top = ranked[0];
    const trueScore = ranked.find((e) => e.symbol === pairs[j].symbol).score;
    const bestOther = ranked.find((e) => e.symbol !== pairs[j].symbol);
    const margin = trueScore - (bestOther ? bestOther.score : 0);
    const hit = top.symbol === pairs[j].symbol;
    if (hit) correct++;
    marginSum += margin;
    probes.push({ cue: pairs[j].name, expected: pairs[j].symbol, got: top.symbol, hit, margin, ranked });
  }

  return {
    probes,
    recall: pairs.length ? correct / pairs.length : 0,
    meanMargin: pairs.length ? marginSum / pairs.length : 0,
    stateFootprint: mem.footprint,          // constant: d_k * d_v
    kvCacheFootprint: pairs.length * (dk + dv), // grows with sequence length
    memory: mem,
  };
}
