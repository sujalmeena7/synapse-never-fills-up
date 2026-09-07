# Evidence & reproduction record

Every claim the artifact makes about **its own substrate** is listed here with
the acceptance test that backs it and the command that regenerates the result.
The authority is `scripts/verify.mjs`, which imports the exact same
`src/engine.js` the web page runs. All numbers are deterministic at **seed 42**.

```bash
node scripts/verify.mjs
```

---

### Claim 1 — State size is constant in sequence length; the KV cache is not

- **Acceptance test:** store `m ∈ {1,4,8,16,32,64,128}` pairs; report state
  footprint `d_k·d_v` and KV footprint `m·(d_k+d_v)`.
- **Expected:** state column is identical (1024) for every `m`; KV grows
  linearly and crosses state at `m = 16`.
- **Result (seed 42):** state = 1024 for all m; KV = 64 → 8192; ratio 0.06× →
  8.00×. ✔
- **User-visible mirror:** Step 1 slider + the two readout tiles + the flat vs
  rising lines.

### Claim 2 — It forgets through interference, not eviction

- **Acceptance test:** dense keys, `d_k = d_v = 32`; sweep `m` from 2 to 48,
  40 seeds; report top-1 recall and mean margin.
- **Expected:** recall stays 100% for small `m`, then decays *smoothly* (no
  cliff), because nothing is deleted — crosstalk accumulates.
- **Result:** 100% at m≤12; 99.5% (16) → 89.8% (32) → 77.4% (48); margin falls
  0.689 → 0.194. ✔
- **User-visible mirror:** Step 2 signal-vs-crosstalk bars; Step 3 decode with
  expected answer beside the pick.

### Claim 3 — Capacity scales with key dimension, not a slot count

- **Acceptance test:** 16 pairs fixed; vary `d_k ∈ {8…256}`, 40 seeds.
- **Expected:** recall rises with `d_k` (more near-orthogonal directions),
  proving capacity is a dimensional property, not a slot budget.
- **Result:** 70.9% (8) → 91.4% (16) → 99.5% (32) → 100% (≥64). ✔

### Claim 4 — Non-negative codes are usable *because* they are sparse (BDH-facing)

- **Acceptance test:** `d_k = 256`, 16 pairs; compare dense signed keys against
  sparse non-negative keys at {50, 25, 10, 5, 1.6}% active; 40 seeds.
- **Expected:** at high active-fraction, loss of sign cancellation makes
  crosstalk add up and recall collapses; as sparsity increases, recall returns
  to dense level and then exceeds it once `a < √(d_k/m)`.
- **Result:** dense 100%/margin .689; 50% active → 47.0%/−.033; 5% active →
  100%/.612; 1.6% → 100%/.666. ✔
- **Mechanism check (Claim 4b):** measured mean |kᵢ·kⱼ| matches prediction —
  dense .0508 vs √(2/π)/√256 = .0499; sparse a=6 .0226 vs a/d = .0234; sparse
  signed mean equals its absolute value (no cancellation), dense signed mean ≈ 0.
  ✔
- **User-visible mirror:** Step 4 regime toggle + sparsity slider + dual recall
  curves.
- **Honesty:** random keys, toy substrate, no BDH checkpoint run. Learned sparse
  codes would store more. Stated in-page and in README.

### Claim 5 — A single read decomposes into signal + named crosstalk terms

- **Acceptance test:** 8 pairs; cue = pair 0; print `kᵢ·k_cue` for every stored
  pair and the resulting decode.
- **Expected:** self term exactly 1.0000 (unit-norm keys); other terms are the
  measured overlaps; decode = correct symbol.
- **Result:** ARIA self-term 1.0000; crosstalk terms as listed; signal 1.0000 vs
  Σ|crosstalk| 1.5773; probe returns "0" = expected. ✔
- **User-visible mirror:** Step 2 per-memory contribution bars.

---

## What is *not* evidenced here (and must not be quoted as if it were)

- No BDH/BDH-CQ checkpoint was executed. Published Pathway figures (BDH's ~97.4%
  Sudoku Extreme solve rate; BDH-CQ's 29.5% pass@2 on ARC-AGI-1 at ~$0.0007/task)
  are **developer-reported benchmarks** cited from primary sources, not results
  produced by this repo.
- The sparsity advantage shown is a property of *random* keys in this toy
  associative memory, not a measurement of BDH's learned representations.
