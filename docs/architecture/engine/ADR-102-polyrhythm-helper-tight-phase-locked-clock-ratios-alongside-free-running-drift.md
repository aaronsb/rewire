---
status: Draft
date: 2026-06-07
deciders:
  - aaronsb
  - claude
related:
  - ADR-100
---

# ADR-102: Polyrhythm helper: tight phase-locked clock ratios alongside free-running drift

## Context

This ADR **scopes a problem; it does not yet decide.** Captured from the
clock-domain discussion around [ADR-100](ADR-100-clock-shaper-node-composable-swing-nudge-humanize-in-the-clock-domain.md)
and the existing roadmap item ("Polyrhythm helper for clocks").

Rewire supports multiple clocks today, and they are **free-running**: each voice
advances its own `node.cursor` at its own resolved tempo, with no shared phase
reference. Two clocks at 120 and 90 bpm drift against each other — the musical
"drunk" quality. That looseness is desirable and should stay.

What's missing is the *tight* counterpart: deliberate, **phase-locked**
cross-rhythms — a 3:2 or 4:3 polyrhythm that stays mathematically aligned to a
shared reference instead of drifting. `clockmult` (MULT) already multiplies a
clock's **rate** by a factor, but it does not establish a shared phase origin or
express a ratio *against a reference clock*; chained MULTs change tempo, not lock.

So the gap is a way to say "run this branch at ¾× (or 3:2 against) the reference
clock, and keep it locked," producing tight polyrhythm on demand while leaving the
free-running multi-clock drift available as the other mode.

This overlaps three things that must be reconciled when this is taken up:
- **MULT** (`clockmult`) — already does rate scaling; a ratio helper may extend it
  or sit beside it.
- The **master-clock-input / clock-slaving** idea raised in ADR-100 / scoped in
  [ADR-101](ADR-101-simplify-the-base-clock-externalize-swing-and-migrate-song-patch-json.md)
  — phase-locking implies a shared reference, which is exactly what slaving
  provides. These two may be the same mechanism.
- The shaper's **nudge** (ADR-100) — a static phase offset, related to but distinct
  from a maintained ratio lock.

## Decision

**Not yet decided.** To be debated. Open questions:

- Ratio expression: a `ratio` param (e.g. `3:2`, `4:3`) vs. reusing MULT's factor
  with an added phase-lock flag.
- The shared phase origin: is there a single reference (the primary clock / a
  master input), and how do locked branches derive their cursor from it rather
  than from `PB.t0` independently?
- Whether this is a new node, an extension of MULT, or a property unlocked by the
  clock-slaving work in ADR-101.
- Keep **both** modes: loose free-run drift (today) and tight lock (new), selectable.

## Consequences

### Positive

- Deliberate, reproducible polyrhythms (3:2, 4:3, 5:4) that stay aligned —
  expressive range the free-running model can't hit on purpose.

### Negative

- Phase-locking introduces a shared-reference concept into a currently
  independent per-voice cursor model; the scheduler change is non-trivial.

### Neutral

- Strongly coupled to the clock-slaving decision (ADR-101); likely sequenced with
  or after it so both share one phase-reference mechanism.

## Alternatives Considered

To be enumerated when taken up. Candidate axes: extend MULT vs. new node vs.
fall-out-of-slaving; ratio param vs. factor+lock flag; per-branch lock vs. a
global "tight/loose" clock mode.
