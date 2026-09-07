# Live-defense sheet

Internal prep for the final presentation round. Judges score **technical
ownership and live defense (15 pts)**: whether the team understands every major
component, can trace the system, can predict the result of changes, and can
distinguish real behaviour from precomputation or animation.

Rule for the room: **never guess a number.** Open `scripts/verify.mjs` or move
the slider and read it off. "I don't know, let me measure it" scores better than
a confident wrong figure.

---

## 1. The 45-second walkthrough

> Softmax attention compares a query against a stored key for every past token,
> so the KV cache grows with the sequence. Drop the softmax and the sum
> reassociates into one fixed matrix — that's linear attention, and the update
> rule is literally a Hebbian outer product. So the memory is fixed-size. But it
> still forgets: reading a cue returns the value you wanted *plus* crosstalk from
> every other memory whose key overlaps. Nothing is deleted; the signal gets
> buried. That's the claim, and every panel on the page lets you push it until it
> breaks.

## 2. Derive it on a whiteboard (be ready to do this cold)

```
softmax attention:   out_t = Σ_i softmax(q_t · k_i) v_i        ← needs all k_i, v_i
drop the softmax:    out_t = Σ_{i≤t} (q_t · k_i) v_i
reassociate:               = q_tᵀ ( Σ_{i≤t} k_i v_iᵀ )
define state:              = q_tᵀ S_t                  S_t is d_k × d_v, FIXED

recurrent form:      WRITE  S_t = λ S_{t-1} + k_t v_tᵀ      ← Hebbian outer product
                     READ   r_t = S_tᵀ q_t
```

Then the interference decomposition — the heart of the artifact:

```
read with a stored key k_j:
  r = Sᵀ k_j
    = v_j (k_j · k_j)              ← signal.  = 1.0 · v_j for unit-norm keys
    + Σ_{i≠j} v_i (k_i · k_j)      ← crosstalk, one term per other memory
```

**Why capacity is not a slot count:** the failure mode is the second term
outgrowing the first. That depends on `d_k` and on how near-orthogonal the keys
are. Never on a number of slots — no slot is ever allocated or freed.

## 3. Predict-the-change questions (they will ask these)

| If they change… | Predict | Why |
|---|---|---|
| pairs stored 8 → 64 | recall falls, state unchanged | more crosstalk terms; `S` is allocated once |
| `d_k` 32 → 128 | recall rises | more near-orthogonal directions available |
| λ (decay) 1.0 → 0.9 | recent memories win, old ones fade | old writes are geometrically down-weighted |
| sparsity 5% → 50% (non-neg) | recall collapses to ~50% | non-negative overlaps can't cancel; crosstalk adds linearly |
| a new seed | numbers shift slightly, trends identical | keys are random draws; the scaling law is not |

**Quantities worth memorising** (all from `npm run verify`, seed 42):

- state `d_k·d_v` = **1024 scalars, constant**; KV cache crosses it at **m = 16**
- dense recall: **100%** at m ≤ 12 → **89.8%** at 32 → **77.4%** at 48
- capacity vs `d_k` (16 pairs): **70.9%** at 8 → **99.5%** at 32 → **100%** at 64
- sparsity at `d_k`=256, 16 pairs: dense **100%/0.689 margin**; 50% active
  **47%/−0.033**; 5% active **100%/0.612**
- overlap scaling: dense measured **0.0508** vs predicted √(2/π)/√256 = **0.0499**;
  sparse a=6 measured **0.0226** vs a/d = **0.0234**

## 4. Hostile questions, and honest answers

**"Isn't this just Mamba / an SSM?"**
No. BDH-GPU is a ReLU-low-rank formulation with linear attention, and the paper
explicitly distinguishes it from Mamba-style selective SSMs. Mamba's fixed state
is gated and input-selective; this update is a Hebbian outer product. Our page
says this, and the PS itself warns against the conflation.

**"Did you run BDH?"**
No, and we never claim to. The substrate is our own toy associative memory with
random keys. The BDH connection is at the level of published equations and
reported properties, cited to the primary sources. The PS explicitly permits
this and says teams aren't expected to run an unavailable checkpoint.

**"Then why should we believe the sparsity result says anything about BDH?"**
It doesn't claim to measure BDH. It demonstrates a *mechanism*: non-negative
codes lose sign cancellation, so crosstalk accumulates linearly (`m·a/d`) instead
of as a random walk (`√(m/d)`). We derived the crossover at `a < √(d_k/m)` and
then measured it — prediction and measurement agree to ~3 decimal places. That
mechanism is why sparsity is load-bearing for a non-negative synaptic code, and
BDH reports operating in that regime.

**"Does sparsity beat dense attention?"**
Not in our substrate at BDH's ~5% regime — dense keys hold a slightly better
margin (0.689 vs 0.612 at 16 pairs). Sparse only overtakes dense once
`a < √(d_k/m)`. We corrected this mid-build; an earlier draft overclaimed it.
The real finding is narrower and more interesting: **non-negativity is only
viable because of sparsity.** At 50% active, recall collapses to 47%.

**"Isn't the toy so simplified it's misleading?"**
The simplifications are stated in-page and in the README. The most important one:
BDH *learns* its keys, and learned sparse codes can be far closer to orthogonal
than random draws — so our substrate **understates** achievable capacity. We're
pessimistic, not flattering.

**"Which parts are animated versus real?"**
Every matrix cell, bar, curve, and number is computed in-browser from
`src/engine.js` at the displayed seed. Nothing is precomputed. `src/motion.js` is
purely cosmetic — scroll reveals, the hero particle field, spring counters — and
deleting it changes no reported number. That separation is deliberate and is why
we can answer this cleanly.

**"Show us it reproduces."**
`npm run verify` — same `engine.js` the page imports, deterministic at seed 42.
`npm run smoke` also asserts the DOM renders and no reveal is stranded hidden.

## 5. The four things we deliberately never say

1. BDH is an SSM in the Mamba sense.
2. Our toy is an official BDH model.
3. Within-session synaptic memory is durable cross-session learning.
4. A developer-reported benchmark is an independent reproduction or a deployment.
   (BDH's ~97.4% Sudoku Extreme and BDH-CQ's 29.5% pass@2 on ARC-AGI-1 at
   ~$0.0007/task are Pathway-reported figures, cited as such.)

## 6. Weakest points — name them before a judge does

- Random keys, not learned. Biggest gap between toy and real BDH.
- `d_k`, `d_v` capped small so state stays visible on screen; a teaching scale.
- Recall curves average ~12 seeds in-browser; small-sample, and labelled as
  exploratory rather than precise.
- We have not user-tested the sixty-second comprehension claim on a stranger.
- No BDH checkpoint was run, so the BDH module rests on published evidence only.

## 7. If a demo breaks live

The page has no backend and no network calls after load, so the realistic
failures are small. Fallbacks: everything renders without `vendor/motion.js`
(reveals have a `<noscript>` override, a per-element `try/catch`, and a 4s
force-reveal sweep); `prefers-reduced-motion` disables all animation. If the
hosted page is unreachable, run `npm run serve` and present locally, or show
`npm run verify` in a terminal — the numbers are the substance.
