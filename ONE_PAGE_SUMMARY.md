# Synaptic Plasticity as Short-Term Memory

**One-page concept summary — DataForge 2026, Pathway Track.**
*Audience: a data scientist meeting this concept and our submission for the first time. Export to PDF for submission.*

## The concept and why it is timely

Softmax attention answers a query by comparing it against a stored key–value
pair for every prior token. That store — the KV cache — grows linearly with
sequence length, and it is the dominant memory and latency cost of long-context
Transformers. **Synaptic plasticity as short-term memory** is the alternative
that recurs across recent architectures: instead of keeping every token, write
each association into a *single fixed-size weight matrix* using a Hebbian rule —
units that co-activate strengthen their connection — and read it back with a
cue. Memory becomes a property of the wiring, updated as the model reads, rather
than a growing list of past states.

## The mechanism, precisely

Remove the softmax and the attention sum reassociates:
`outₜ = Σ_{i≤t}(qₜ·kᵢ)vᵢ = qₜᵀ(Σ kᵢvᵢᵀ) = qₜᵀ S`. The state `S` is a fixed
`d_k×d_v` matrix with a recurrent update — **write** `S ← λS + kvᵀ` (a Hebbian
outer product), **read** `r = Sᵀq`. This is the *fast-weight* / *linear-attention*
view of associative memory. The technical change from a Transformer: state size
is decoupled from sequence length. The trade-off it introduces: reading a cue
`kⱼ` yields `vⱼ(kⱼ·kⱼ) + Σ_{i≠j} vᵢ(kᵢ·kⱼ)` — the intended value plus
**crosstalk** from every other memory that overlaps the cue. Nothing is evicted;
recall fails when accumulated crosstalk outgrows the signal. Capacity is set by
`d_k` and by how near-orthogonal the keys are, **not** by a slot count.

## Where BDH and BDH-CQ fit

**Dragon Hatchling (BDH)** [1] makes this the architecture, not an add-on:
attention is reformulated as synaptic memory over a scale-free network of
locally interacting neurons, so reasoning and memory share one computational
fabric. Its GPU form, **BDH-GPU**, is built from ReLU-low-rank transformations
with linear attention — importantly *not* a Mamba-style SSM. Two reported
properties bear directly on the mechanism above: roughly **5% of neurons are
active**, and activations are **non-negative**. Non-negativity removes sign
cancellation, so crosstalk that averaged out for signed keys now always adds;
sparsity is what keeps that linear growth survivable. **BDH-CQ** [2] is a later
family member for in-context reasoning; it relates its contextual memory to the
same fast-weight/linear-attention view, with a special case where state
accumulates additively per demonstration. BDH's role here is central; BDH-CQ's
is a supporting reference, and we do not inflate it.

## Comparison to the landscape

| Approach | State vs length | Interference | Interpretability | Note |
|---|---|---|---|---|
| Softmax Transformer (KV cache) | grows linearly | none (exact recall) | low | strong recall, costly at length |
| Linear attention / fast weights [3] | **fixed** | crosstalk-limited | medium | the substrate here |
| State-space models (Mamba) | fixed | selective decay | medium | gated, not Hebbian; BDH is not this |
| **BDH / BDH-CQ** [1,2] | **fixed**, synaptic | sparsity-mitigated | high (monosemantic synapses reported) | reasoning + memory unified |

## Evidence, correctly labelled

Our interactive artifact *demonstrates the mechanism* on a toy associative
memory with random keys, and every number is reproducible (`node
scripts/verify.mjs`, seed 42): state stays constant while the KV cache grows;
recall decays smoothly with load (100%→77% from 2→48 pairs at `d_k=32`); the
measured key-overlap scaling matches theory (dense ≈ √(2/π)/√d_k; sparse ≈
a/d_k). We did **not** run any BDH checkpoint. Pathway's headline results —
BDH's ~97.4% solve rate on Sudoku Extreme without chain-of-thought, and BDH-CQ's
29.5% pass@2 on public ARC-AGI-1 at ~$0.0007/task — are **developer-reported
benchmarks** cited from primary sources, not independent reproductions or
deployments, and BDH's pretraining-scaling from 1B toward 600B parameters is an
early reported experiment.

## Strengths, and the most important limitation

The fixed-state view buys constant memory and cheap updates, and — in BDH's case
— an interpretable substrate where synapses can encode identifiable concepts.
The honest limitation: **within-session synaptic memory is not durable
cross-session learning.** The matrix resets when context ends; consolidating
useful fast state into slow trained weights is an open problem BDH frames rather
than solves. The open question worth watching is whether learned sparse synaptic
codes keep this crosstalk manageable at production scale, where our random-key
substrate is deliberately pessimistic.

---

**Primary sources.** [1] Kosowski et al., *The Dragon Hatchling*, arXiv:2509.26507 (2025). [2] Pathway, *BDH-CQ: In-Context Learning with Recurrent Latent Reasoning*, arXiv:2608.09888 (2026). [3] Katharopoulos et al., *Transformers are RNNs*, arXiv:2006.16236 (2020).

*Word count target 500–950. AI assistance used for drafting; every sentence, number, and citation is defensible and reproducible via the linked verifier.*
