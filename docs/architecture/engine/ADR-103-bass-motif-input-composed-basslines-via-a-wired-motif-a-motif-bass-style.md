---
status: Accepted
date: 2026-06-07
deciders:
  - aaronsb
  - claude
related: []
---

# ADR-103: Bass motif input: composed basslines via a wired motif + a 'motif' bass style

## Context

The `lead` voice has a `motif` input port: when its style is `motif`, it plays the
wired MOTIF node's note-index sequence (`leadMotif`) as the melody, interpreting
each index into the current chord's tones (`pool[idx]`, via `motifPool`/`pickRow`
in `emitLead`). The `bass` voice has **no** motif input — it is purely algorithmic
(the 8 styles in `emitBass`: sustain/pulse/walking/octaves/arp/offbeat/driving/sub),
all derived from the chord tones.

That means you can author a *melody* but not a *bassline*. Lots of music is built on
a composed bass riff/hook, not a generic walking or pulse pattern. The MOTIF node and
its note-index abstraction already exist and are exactly the right tool — they just
aren't wired to the bass.

This generalizes a pattern Rewire already has rather than inventing a new one: "a
MOTIF drives a voice." Extending it to bass also unlocks a nice composability — wiring
**one MOTIF into both lead and bass** yields an octave-locked unison riff, while
separate MOTIF nodes give independent composed lines.

## Decision

Give the bass a motif input and a style that plays it, mirroring the lead.

1. **Add a `motif` input port** to the `bass` node (`NODE_DEFS.bass.ins`), type `motif`.
2. **Add a `"motif"` bass style** to `BASS_STYLES` and the style control. When selected
   *and* a MOTIF is wired, `emitBass` reads the motif and plays its indices in the bass
   register; otherwise the bass behaves exactly as today.
3. **Interpretation** (reuse the lead's machinery): `pool = chordTones(chord)`; row =
   `pickRow(motif.leadMotif, chordIdx)` (per-chord rows supported, like the lead);
   each step plays `pool[idx]` passed through the bass's existing octave divisor
   (`lo()`/`div`, which already drops it into the bass register and honors the
   `octave` knob).
4. **Rhythm — root-locked eighths, NOT the busy 16th grids.** Step the motif as a
   steady 8-per-bar eighth feel (reusing the bass's `N(...)`/`osc` `pluck`/`sustain`
   shaping). This is the deliberate choice: the lead's busy/section grids
   (`leadMotifBusy`, `BUSY` 16th grids, var/build variants) make melodic sense up top
   but turn to mud in the low register. The bass reads the **base `leadMotif`** across
   all sections and ignores the busy/var/build variants — a clean, steady composed
   bassline.
5. **Fallbacks:** style `"motif"` with no MOTIF wired (or an empty motif) → fall back
   to the current default bass behavior (`walking`/root) so the bass is never silent.
   Any other style → unchanged. New port unwired by default → unchanged.

Backward-compatible: existing songs don't set bass style to `"motif"` and have nothing
wired, so they are unaffected.

## Consequences

### Positive

- Composed basslines/riffs become possible — the bass joins the "MOTIF drives a voice"
  model instead of being algorithm-only.
- Wiring one MOTIF into lead + bass gives octave-locked riffs for free; separate MOTIFs
  give independent lines. More expressive patches, in the modular spirit.
- Reuses existing primitives (`pickRow`, `chordTones`, the bass octave divisor, `osc`)
  — small, low-risk addition; no new abstractions.

### Negative

- A motif drawn for a *lead* (wide, melodic) can sound awkward an octave or two down;
  shared-motif unison is a creative choice that won't always flatter the bass. Mitigated
  by the steady-eighths rendering and by letting users give bass its own MOTIF.
- `emitBass` grows a branch; `BASS_STYLES` and the style dropdown gain an option to
  explain (help text).
- Two voices can now consume the same `motif` wire — fine (data inputs fan out to
  multiple readers; only *audio* inputs are single-source), but worth a test.

### Neutral

- Section variants (`leadMotifBusy`/`Var`/`Build`) are intentionally unused by the bass
  for now; revisiting that (an opt-in "busy bass") is a future tweak, not part of this.
- No change to the MOTIF node, the visual motif editor, or serialization — the bass
  just reads the same params the lead already reads.

## Alternatives Considered

- **Reuse the lead's full busy-grid + section machinery for the bass.** Rejected as the
  default: the 16th-note busy grids and var/build rows muddy the low end. The steady
  base-motif eighths are cleaner; busy-bass can be a later opt-in.
- **Make the bass always read a wired motif (no dedicated style).** Rejected: implicit
  and collides with the algorithmic styles. A `"motif"` style is explicit and mirrors
  the lead, so the UI/behavior is consistent across voices.
- **A new dedicated "riff"/bass-sequencer node type.** Rejected: the MOTIF node and its
  note-index abstraction already exist and are the right tool; a parallel node would
  duplicate it.
- **Quarter-note (root-locked half-time) rendering instead of eighths.** A reasonable
  alternative feel; eighths chosen as the default for groove, but the step rate is a
  small knob we can expose later if wanted.
