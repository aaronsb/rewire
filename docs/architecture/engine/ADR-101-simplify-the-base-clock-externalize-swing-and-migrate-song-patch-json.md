---
status: Draft
date: 2026-06-07
deciders:
  - aaronsb
  - claude
related:
  - ADR-100
  - ADR-102
  - ADR-200
---

# ADR-101: Simplify the base clock: externalize swing and migrate song/patch JSON

## Context

This ADR **scopes a problem; it does not yet decide.** It is the follow-on
deferred by [ADR-100](ADR-100-clock-shaper-node-composable-swing-nudge-humanize-in-the-clock-domain.md),
which added a composable `shaper` node (swing/nudge/humanize) but kept the base
`clock` node backward-compatible — `clock.params.swing` still exists and
`resolveClock` adds shaper swing on top of it.

The longer-term direction is a **simple clock**: a clock that carries only rate
(`bpm`) and gating (`enabled`), with *all* timing feel — swing included —
externalized into `shaper` nodes. Two structural changes follow, and the second
is the reason this can't be a quiet refactor:

1. **The base `clock` node loses `swing`.** Its params shrink to
   `{bpm, arrange, enabled}`; `resolveClock` no longer reads `clock.params.swing`.
   A clock with swing becomes `CLOCK → SHAPER(swing) → voices`.

2. **The song / patch JSON fundamentally changes.** This is the crux. Today:
   - `tracks.js` specs (`window.SS_TRACKS`, 33 of them) carry `swing` at the
     **spec** level, and `loadSpec` (app.js) maps it onto the clock node's param.
   - Serialized patches (`serialize`/`deserialize`, app.js) snapshot each node's
     params, so any saved patch with a swung clock has `swing` on the clock node.

   If swing moves to a `shaper` node, both formats change shape: the spec needs a
   way to express "this song swings" that the loader turns into a `shaper` node +
   wiring, and saved patches need either a migration or a deserialize-time
   shim that rewrites a legacy swung clock into `CLOCK → SHAPER`. Every shipped
   track is affected. This is also the canonical JSON the planned LLM live-agent
   edit protocol consumes, so the schema change ripples there too.

The related idea of giving clocks a **master clock input** (slaving / hierarchy)
was raised alongside this in the ADR-100 discussion. It may belong here or in its
own ADR; that boundary is itself part of what this ADR must decide.

## Decision

**Not yet decided.** To be debated. This ADR exists to hold the scope so it
isn't lost. The decision must at minimum settle:

- Whether `clock.params.swing` is removed outright, deprecated-but-read, or kept
  as sugar that auto-expands to a `shaper`.
- The new `tracks.js` spec shape for groove (e.g. a `shaper`/`groove` block) and
  the `loadSpec` changes to build + wire the node.
- A migration / back-compat path for the 33 shipped tracks **and** for
  already-saved user patches (serialize version bump + deserialize shim?).
- Whether the master-clock-input / slaving change rides along or splits out.
- Coordinating impact on the future LLM edit-protocol schema.

## Consequences

### Positive

- A clean, minimal clock primitive; all feel lives in one well-understood place
  (`shaper`), consistent with the audio-fx mental model.

### Negative

- Backward-incompatible with all 33 shipped tracks and every saved patch unless a
  migration/shim is provided — the bulk of the work is the migration, not the
  node change.

### Neutral

- Sequenced **after** ADR-100 ships and the `shaper` node is proven in use, so the
  migration targets a stable shaper schema.

## Alternatives Considered

To be enumerated when this ADR is taken up. Candidate axes already visible:
hard-remove vs. deprecate-and-shim `clock.swing`; spec-level `groove` block vs.
explicit node list in `tracks.js`; deserialize-time migration vs. a one-time
re-save of bundled patches; fold-in vs. split-out of the master-clock-input idea.
