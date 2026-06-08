---
status: Accepted
date: 2026-06-07
deciders:
  - aaronsb
  - claude
related:
  - ADR-101
  - ADR-102
---

# ADR-100: Clock shaper node: composable swing/nudge/humanize in the clock domain

## Context

Rewire has three audio effects (`reverb`, `delay`, `filter`) — inline nodes that
process an **audio** signal on its way to the output. We have no equivalent for
the **clock** domain: a node that processes *timing feel* on its way to a voice.

A key property of the engine makes this tractable. A "clock" here is **not** a
pulse train. A clock wire carries an abstract tempo descriptor that is resolved
lazily by `resolveClock(src)` (engine.js), which walks the wire **through any
`clockmult` nodes**, accumulating a rate `factor`, until it reaches the real
`clock` node, then returns:

```js
{ bpm, swing, enabled }
```

So `clockmult` (MULT) is already *the one inline clock processor we have* — it
shapes `bpm`. The per-voice scheduler calls `resolveClock` once per voice per
tick and builds an env `{spb, bar, halfBeat, swing}`; each voice advances its own
`node.cursor` at its own tempo (this is what makes polytempo work). Swing reaches
the synth via `swingOff(step, spb, amt)`, which today delays only the off-eighth
(`step % 4 === 2`).

Two consequences of this model frame the decision:

1. **Per-branch shaping is already free.** Because each voice resolves its *own*
   clock branch, branching a clock wire to two voices and inserting a processor
   on one branch shapes only that branch. No voice-isolation machinery is needed
   — the resolver already gives it to us.
2. **A shaper can only shape what the descriptor carries** (or what the scheduler
   / emitters can read). A hardware-style pulse-width / gate-length shaper has
   nothing to map onto, because there is no pulse to widen.

The motivating need: give voices distinct grooves off a shared clock — swing the
drums but not the bass; lay the bass *behind* the beat; humanize a mechanical
line — without baking groove into each voice's params or forking the clock.

Two adjacent ideas surfaced while scoping this and are deliberately **out of
scope** here (see Alternatives): (a) *simplifying* the base `clock` node by
pulling its `swing` param out into shapers, and (b) giving `clock` nodes a
**master clock input** so clocks can slave to one another instead of free-running.
Both are larger, partly backward-incompatible changes that overlap with existing
roadmap items (Polyrhythm helper, Macro clock layer). They warrant their own ADR.

## Decision

Add **one composable `shaper` node** in the clock domain: `clock` in → `clock`
out, a sibling of `clockmult`. It carries three timing-feel parameters applied
together, any of which can be dialled to zero (a "pass-through" / simplified
clock for that branch):

- **swing** (0–100%) — shuffle amount. Additive with the base clock's swing and
  with any upstream shaper, then fed to the existing `swingOff`.
- **nudge** (± ms, e.g. −30..+30) — constant phase offset: push the branch ahead
  of or behind the beat (lay-back groove).
- **humanize** (0–100%) — per-hit random timing + velocity jitter for a less
  mechanical feel.

**Resolution.** Extend `resolveClock` to walk `shaper` nodes alongside
`clockmult`, accumulating into an extended descriptor:

```js
{ bpm, swing, enabled, phase, humanize }
//   ×factor  +sum             +sum(s)  max
```

- `swing`: summed across shapers (and added to the base clock's `swing`), clamped
  to 0–100.
- `phase`: summed nudges, in seconds.
- `humanize`: `max` across shapers (jitter doesn't meaningfully stack).
- `enabled` / `bpm` / `factor`: unchanged.

**Application — chosen for minimal surface area:**

- **swing** flows through the existing path unchanged: `env.swing = C.swing`,
  consumed by `swingOff`. Free.
- **nudge** is applied at emit time, not by mutating cursor state:
  `emitVoiceBar(node, node.cursor + C.phase, node.barIdx, env)`. No new per-node
  state, survives live edits, and the tracker honestly shows the nudged timing
  (capture uses absolute time).
- **humanize** is the only invasive piece: it must perturb individual note times
  and gains inside the emit functions (`emitDrums/Bass/Lead/Pad`), the nearest
  existing hook being `swingOff`. To keep this ADR shippable, **humanize lands in
  a second step** behind swing+nudge; the node ships with the control present and
  a no-op until that step lands, or we gate the control until then.

**Node shape (graph domain).** `NODE_DEFS.shaper`: `cls:"clock"`, `audio:null`,
`ins:[{name:"clock",type:"clock"}]`, `outs:[{name:"clock",type:"clock"}]`,
`params:{swing:0, nudge:0, humanize:0}`, range controls. Help registry entry.
Add to the left palette. It serializes for free (params-only node).

**One polymorphic node, not three.** Swing/nudge/humanize are independent scalar
contributions to one descriptor — they don't interact order-dependently the way
audio fx do — so a single node carrying all three is simpler than three sibling
nodes and matches the user's "shaper card" framing. Chaining multiple `shaper`
nodes still works (sums accumulate), preserving composability.

**Backward compatibility.** The base `clock` keeps its `swing` param and behavior;
`resolveClock` *adds* shaper swing on top. None of the 33 shipped tracks or saved
patches change behavior. The "simplify the clock" idea (removing `clock.swing`) is
explicitly deferred.

## Consequences

### Positive

- Per-voice groove off a shared clock with no voice-level params and no clock
  forking — drums swing, bass lays back, both stay phase-locked to one clock.
- Mirrors the audio-fx mental model ("inline processor") in the clock domain,
  which users already understand from reverb/delay/filter and from `clockmult`.
- Small, mostly-additive blast radius: swing + nudge reuse existing paths
  (`swingOff`, emit-time offset); the resolver change is one loop extension.
- Pure-data node — serialization, save/load, and the future LLM-agent edit
  protocol get it for free.

### Negative

- `resolveClock` now walks two node types; the chain-resolution surface grows and
  must stay guarded (the existing `guard++ < 16` cap).
- **humanize** reaches into all four emit functions — the one place this isn't a
  clean clock-domain change — so it's split into a follow-up step, meaning the
  node briefly ships with a control that does nothing (or is gated).
- Another palette entry and `cls:"clock"` node to teach in help.
- Nudge can push a voice's first events before `PB.t0`; needs a clamp / guard so
  a large negative nudge can't schedule in the past.

### Neutral

- Sets a precedent for clock-domain processors; future ideas (probability gate,
  ratchet, per-branch enable) would slot in the same way.
- Does **not** address clock slaving or simplifying the base clock — those remain
  open and are the subject of a future ADR.
- The swing model is still the existing off-eighth-only `swingOff`; widening it to
  triplet/16th shuffle is a possible companion change but not required here.

## Alternatives Considered

- **Three separate nodes (SWING / NUDGE / HUMANIZE).** Clearer single-purpose
  cards, but triples the palette/NODE_DEFS/help surface for contributions that
  are independent scalars into one descriptor. Rejected for bloat; the single
  node still chains for composition.
- **Extend `clockmult` to also carry swing/nudge.** Overloads the "MULT"
  (rate) concept with feel parameters, muddying both. Rejected — keep MULT about
  rate, SHAPER about feel.
- **Add the params to the base `clock` node.** `clock` already has `swing`; piling
  nudge/humanize on it makes feel global to every voice on that clock and removes
  the per-branch capability that is the whole point. Rejected.
- **Simplify the base clock (remove `clock.swing`) + give clocks a master clock
  input (slaving).** The user raised both. They're attractive (a "simple clock"
  with all feel externalized; a clock hierarchy that keeps multiple clocks
  coherent), but: removing `clock.swing` breaks 33 tracks and saved patches; a
  master clock input is a hierarchy refactor that overlaps `clockmult` and two
  roadmap items — and removing `clock.swing` reshapes the `tracks.js` song specs
  and the saved-patch JSON, affecting all 33 shipped tracks. Deferred to
  [ADR-101](ADR-101-simplify-the-base-clock-externalize-swing-and-migrate-song-patch-json.md)
  so this shaper ships clean and backward-compatible. The shaper does **not**
  depend on either — per-branch
  shaping already works via `resolveClock` on each voice's own branch.
- **Pulse-width / gate-length shaper (hardware analogy).** No pulse train exists
  to widen; the descriptor is abstract tempo. Not applicable to this engine.
