# The synapse that never fills up

**An interactive explainer for DataForge 2026 — Pathway Track.**
**Concept: Synaptic Plasticity as Short-Term Memory.**

A learner-controllable substrate that makes one frontier idea click: how a
fixed-size Hebbian synaptic-weight matrix stores a sequence of *unbounded*
length without a per-token slot, and why it forgets through **interference**
rather than eviction. The concept is the mechanism at the core of Pathway's
**Dragon Hatchling (BDH)**, which reformulates attention as synaptic memory.

### Links

| | |
|---|---|
| **Live artifact** (no sign-in) | **https://sujalmeena7.github.io/synapse-never-fills-up/** |
| **One-page concept summary (PDF)** | [ONE_PAGE_SUMMARY.pdf](https://sujalmeena7.github.io/synapse-never-fills-up/ONE_PAGE_SUMMARY.pdf) |
| **Source repository** | https://github.com/sujalmeena7/synapse-never-fills-up |
| **Reproduce every number** | `npm run verify` |
| **Engine (all the math)** | [`src/engine.js`](src/engine.js) |

No build step, no sign-in, no runtime dependencies.

---

## The one-sentence claim (falsifiable, written before any code)

> A fixed-size synaptic weight matrix, written by co-activation and read by a
> cue, can hold a sequence of unbounded length without allocating a slot per
> token — and it forgets through **interference** between stored associations,
> not by running out of room.

The artifact lets a learner try to break this sentence: store more pairs, probe
any cue, watch recall degrade while the state size stays pinned. If storing more
pairs *grew* the state, or if recall failed by "running out of slots" instead of
by crosstalk, the interaction would show it. It doesn't — it shows smooth
interference-driven decay over a constant-size matrix.

## Intended learner and prerequisites

- **Audience:** a data scientist or ML student comfortable with vectors, dot
  products, and the idea of attention, who has *not* necessarily seen linear
  attention, fast weights, or BDH.
- **Prerequisites:** matrix–vector multiply; cosine similarity; a one-line
  intuition for softmax attention and the KV cache.
- **Sixty-second test:** open the page (a preset is already running), drag
  "pairs stored" up, and read the verdict line. That alone conveys the claim.

## Learning objectives

After using the artifact a learner can:

1. State why linear/fast-weight attention has a **fixed-size** state where
   softmax attention has a growing KV cache, and derive `S = Σ kᵢvᵢᵀ`.
2. Decompose a single read into **signal + crosstalk** and predict when recall
   flips.
3. Explain that the memory **degrades**, it does not delete — capacity is set by
   key dimension and key overlap, not a slot count.
4. Explain why BDH's **sparse, non-negative** activations matter: non-negativity
   removes sign cancellation, and sparsity keeps the resulting linear crosstalk
   growth survivable.
5. Name one limitation: within-session synaptic memory is not durable
   cross-session learning.

## The guided narrative (what the page walks through)

| Step | Concept variable the learner changes | Immediate consequence shown |
|---|---|---|
| 0 · Substrate | scrub write count 0→8 | the fixed `S` matrix fills with structure |
| 1 · Fixed state | pairs stored 2→200 | state stays flat while KV cache climbs past it |
| 2 · Interference | cue + load | signal bar vs summed crosstalk bars |
| 3 · Truth beside estimate | (same load) | memory's pick shown next to the correct answer |
| 4 · BDH module | dense ↔ sparse non-negative, % active | recall-vs-load curve shifts; scaling law made visible |
| 5 · Recap + misconception | — | one-breath summary and the durability caveat |

## Architecture of the artifact

```
index.html          structure + narrative copy + the one-sentence claim
src/styles.css       presentation only (no logic) — design system, glass panels, reveal states
src/engine.js        ALL the mathematics — pure, DOM-free, the single source of truth
src/app.js           interaction layer: reads controls, calls engine, draws canvases
src/motion.js        presentation motion only: hero particle field, scroll reveal,
                     scroll-progress bar, animated slider fill, spring counters
vendor/motion.js     Motion (motion@11.11.13) vendored locally — no runtime CDN dependency
summary.html         print-optimised build of the one-page summary (source of the PDF)
ONE_PAGE_SUMMARY.pdf the submitted concept summary — verified to render on ONE A4 page
ONE_PAGE_SUMMARY.md  markdown source of the same summary text
EVIDENCE.md          claim → acceptance test → command → result
scripts/verify.mjs        reproduces every quoted number, deterministic at seed 42
scripts/smoke.mjs         jsdom DOM smoke test: element IDs, initial render, controls, reveals
scripts/make-summary-pdf.mjs   renders summary.html → ONE_PAGE_SUMMARY.pdf and reports page count
scripts/explore-sparsity.mjs   scratch exploration behind the sparsity claim (not user-facing)
```

**A note on the animation layer.** `src/motion.js` is strictly cosmetic —
scroll reveals, the hero synapse-network canvas, spring-animated counters. It
contains no concept math and can be deleted without changing a single number the
artifact reports. The animation library ([Motion](https://motion.dev),
`motion@11.11.13`) is **vendored into `vendor/motion.js`** rather than loaded
from a CDN, so the artifact has zero external runtime dependencies and renders
identically offline or behind a firewall during judging. Every motion effect is
disabled under `prefers-reduced-motion`, and the spring counters fall back to an
instant value if the library ever fails to load.

**Role of every major component**

- `engine.js` — builds keys/values, runs the Hebbian write `S ← λS + kvᵀ`, the
  read `r = Sᵀq`, decoding, and the interference decomposition. Nothing numeric
  lives anywhere else.
- `app.js` — owns the DOM and five canvases. Contains **no memory math**; on
  each control change it calls `engine.js` and renders the result.
- `verify.mjs` — the acceptance test. Imports the *same* `engine.js` the page
  uses and prints the numbers the page and this README assert.

## Live vs precomputed vs animated — the honesty ledger

- **Live (all of it):** every matrix cell, bar, curve, and number is computed in
  the browser from `engine.js` at the displayed seed. Change a control → the
  math reruns.
- **Precomputed:** none. The recall-vs-load curves average ~12 seeds on the fly.
- **Animated / illustrative:** none presented as model behavior. Colour maps and
  layout are presentation; the values they encode are real.
- **Reproduce:** `node scripts/verify.mjs` regenerates every figure at seed 42.

## How BDH and BDH-CQ actually connect (evidence discipline)

- **BDH** ([arXiv:2509.26507](https://arxiv.org/abs/2509.26507)) reformulates
  attention as synaptic memory: the fast-weight state *is* the working memory,
  updated as the model reads. That is exactly the write/read rule this artifact
  makes tangible. BDH reports roughly **5% active** neurons with **non-negative**
  activations — the regime the Step-4 toggle explores.
- **BDH-CQ** ([arXiv:2608.09888](https://arxiv.org/abs/2608.09888)) relates its
  contextual memory to fast-weight / linear-attention views of association, with
  a special case where state accumulates additively per demonstration. Its role
  here is smaller than BDH's, and we say so rather than inflating it.
- **Gated DeltaNet** ([arXiv:2412.06464](https://arxiv.org/abs/2412.06464),
  ICLR 2025) is an independent, recent comparator in the same fixed-state
  fast-weight lineage. It replaces purely additive writes with a gated delta
  rule, directly addressing the interference/capacity problem this artifact
  exposes and showing that learned recurrent matrix memory remains an active
  architectural direction beyond Pathway.
- **Not claimed:** we did **not** run any BDH or BDH-CQ checkpoint. Every number
  is from this toy substrate with *random* keys. BDH *learns* its keys, so
  learned sparse codes are closer to orthogonal and store more than random ones
  do here — this substrate understates achievable capacity. Reported BDH results
  (e.g. Sudoku Extreme) and BDH-CQ's 29.5% pass@2 on ARC-AGI-1 are
  **developer-reported benchmark** figures, not independent reproductions or
  deployments.

## Four correctness guardrails (things we deliberately do not say)

1. BDH is **not** an SSM in the Mamba sense; BDH-GPU is a distinct ReLU-low-rank
   + linear-attention formulation.
2. Any toy reimplementation (this one) is labelled as such, never as official BDH.
3. Within-session synaptic memory ≠ durable cross-session learning.
4. Developer-reported benchmark ≠ independent reproduction ≠ deployment.

## Run it

```bash
# view the artifact
python -m http.server 8123    # then open http://localhost:8123
# (or open index.html directly; it is a static ES-module page)

# reproduce every number quoted in this README and in the artifact
npm run verify

# DOM + reveal regression test (element IDs, initial render, all controls)
npm run smoke

# both of the above
npm run check

# regenerate ONE_PAGE_SUMMARY.pdf from summary.html (verified to be 1 page)
npm install && npm run pdf
```

The artifact itself has **no runtime dependencies** — `index.html` loads only
local files (`src/*` and the vendored `vendor/motion.js`). The packages in
`devDependencies` are tooling only: `jsdom` runs the smoke test, `puppeteer`
renders the summary PDF, and `pdf-lib` verifies its page count. None is needed
to view or grade the artifact. Node ≥ 18 runs the verifier via native ES modules.

## Primary sources (2022–2026)

The first three entries satisfy the track's requirement for at least three
recent primary papers. The fourth is retained only as foundational background.

1. Kosowski et al., [*The Dragon Hatchling: The Missing Link between the
   Transformer and Models of the Brain*](https://arxiv.org/abs/2509.26507),
   arXiv:2509.26507 (2025). — synaptic-memory reformulation of attention and the
   reported sparsity/non-negativity regime.
2. Pathway, [*BDH-CQ: In-Context Learning with Recurrent Latent
   Reasoning*](https://arxiv.org/abs/2608.09888), arXiv:2608.09888 (2026). —
   fast-weight/linear-attention view of contextual association and additive
   per-demonstration state.
3. Yang, Kautz, and Hatamizadeh, [*Gated Delta Networks: Improving Mamba2 with
   Delta Rule*](https://arxiv.org/abs/2412.06464), arXiv:2412.06464 (2024;
   ICLR 2025). — a recent independent fixed-state fast-weight architecture that
   uses gated delta-rule writes to reduce interference and improve retrieval.

**Foundational background (outside the required date window):** Katharopoulos et
al., [*Transformers are RNNs: Fast Autoregressive Transformers with Linear
Attention*](https://arxiv.org/abs/2006.16236), ICML 2020 / arXiv:2006.16236 —
the `S = Σ kvᵀ` reassociation implemented by this artifact.

## AI-assistance, code, data, and license disclosure

- **AI assistance:** the scaffolding, prose drafting, and initial code were
  produced with AI coding assistance (Kiro). The team understands and can defend
  every equation, the interference decomposition, and every number; all figures
  are regenerated by `scripts/verify.mjs`, which is the authority.
- **Code:** original, written for this submission. No forks.
- **Data:** none external. All keys/values are synthetic, generated from a seeded
  RNG (`mulberry32`).
- **Third-party code:** [Motion](https://motion.dev) `motion@11.11.13` (MIT),
  vendored at `vendor/motion.js`, used only for spring-animated counters. No
  other libraries.
- **Fonts:** Inter and JetBrains Mono via Google Fonts (SIL Open Font License),
  loaded in `<head>`; system fonts as fallback. No third-party images or graphics.
- **License:** MIT (see `LICENSE`).

## Known limitations & failure behavior

- `d_k`, `d_v`, and store sizes are capped small so state stays visible on
  screen. Larger dims store far more; this is a teaching scale, stated in-page.
- Keys are random, not learned — a deliberate simplification, disclosed in the
  Step-4 caveat.
- On a slow device the multi-seed recall curves may take a beat to redraw; there
  is no spinner. Everything else responds under a second.
