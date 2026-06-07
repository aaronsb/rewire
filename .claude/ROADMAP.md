# Patchbay — Roadmap / Next Work

Ordered roughly by value × readiness. Each item notes the approach so a future
session can pick it up without re-deriving.

## ✅ Done (this work shipped)

- **Visual creator mode** (was #1) — `visual.js`: per-node text/visual header
  toggle with piano-keyboard scale editor, chord-progression builder (roman-numeral
  presets), motif step-grid + contour presets, arrange chip-builder. Writes back to
  the same params; loaded tracks reflected via inference. See BRIEFING.
- **Save / load patches** (was #2) — `serialize`/`deserialize` in `app.js`,
  localStorage named slots + file export/import, top-bar patches menu. Canonical
  JSON for the LLM-agent direction.
- **Filter node** (was #3) — `BiquadFilterNode` fx node, lowpass/highpass/bandpass,
  cutoff + reso as mod targets (LFO→cutoff sweep works).

## Generalize MULT beyond clocks

The `clockmult` node multiplies/divides a **clock** rate (built — feeds dividers
into SELECT/voices for slow, phase-locked switching). The same "multiply" idea
generalizes to other signal domains; consider sibling nodes (or one polymorphic
MULT that adapts to the wired type):
- **mod × factor** (or mod × mod) — scale/attenuate an LFO/const, or ring-mod two
  modulators. Trivial: multiply the 0..1 values in `modValue`/`applyMod`.
- **audio × mod = VCA** — multiply an audio signal by a mod source: tremolo,
  gating, sidechain-style ducking. Implement as an audio node whose `GainNode`
  gain is driven by the mod input each frame.

## Recording / export

`MediaStreamDestination` + `MediaRecorder` on the master to capture a take to
`.webm`/`.wav` for download. A record button in the transport.

## Polyrhythm helper for clocks

Multi-clock is free-running (the "drunk" drift). Add an optional per-clock
**ratio/mult** (½×, ¾×, 2×, 3× of a reference) so users can get *tight*
cross-rhythms on demand, alongside the loose drift. Keep both modes.

## Tracker as input (ambitious)

Let clicking a tracker cell add/remove a hit, turning the tracker from a
read-only display into a step editor that feeds a per-voice pattern override.
Tension: voices are currently algorithmic; this needs a "manual pattern" voice
mode or an override layer. Design before building.

## More node types

- `arp` node (arpeggiator over a chord input, rate/range/direction).
- noise/sample voice; sidechain (duck a voice on kick).
- MIDI in (Web MIDI) for external clock/notes.

## UX polish

- Touch support for port drag (mobile).
- Pan/zoom the canvas.
- A "tidy" button to auto-layout nodes.
- Snapshot/undo for graph edits.

## Macro layer: clocks as block routing / song sections (design direction)

A key realization: **clocks are the macro-arrangement layer.**
- Each clock can carry its own `arrange` node (wired into the clock's `arrange`
  input), so different blocks of the patch follow different song-maps
  simultaneously.
- A clock's **`enabled` toggle** gates every voice wired to it — so flipping
  clocks on/off is **block routing**: cut from "section A" (voices on clock A) to
  "section B" (voices on clock B) in one move. Disabled clocks keep their voices
  in phase (silent), so re-enabling resumes mid-song cleanly.

Implications / next steps for this layer:
- **Automate clock on/off over time** → true song-section sequencing. Options: a
  "song" / scene node that enables/disables clocks on a timeline; or make
  `enabled` a mod/trigger target so an LFO/square or a clock-divided trigger can
  switch sections; or a master "scene" arrange that maps section → which clocks
  are live.
- The visual arrange chip-builder (item 1) should target **both** a voice's
  `arrange` and a **clock's** `arrange` — the latter is how you author a whole
  song's section flow from one widget.
- Consider a visual indicator on disabled clocks + their downstream (dim the
  block) so the routing state is readable at a glance.

## North star: LLM as live-performance agent

The whole instrument is already **pure data** — `{nodes, edges, params}` with
imperative apply functions (`addNode`, `addEdge`, `setParam`, `removeEdge`). That
makes it directly drivable by a language model.

The vision: run an LLM in a **loop** that is handed the *configuration* (not the
notes — the patch graph + params + the current section/clock state) and asked to
generate the **next shift** of the music. It returns a small edit to the JSON
(change params, retune a voice, swap a style, flip a clock, rewire a cable). We
apply the edit through the existing functions, and **the wired UX redraws to
reflect it** automatically — Claude becomes a live performer re-patching the rig
in real time.

Why it's tractable here:
- State is small and semantic (node types, styles, BPMs, section names) — an LLM
  can reason about it without seeing raw audio or note streams.
- Edits are diffs against a stable schema; apply is already idempotent-ish.
- The tracker + graph give immediate visual feedback of the model's choices.

Prerequisites / build order:
1. ✅ **Patch serialization** — done (`PB.app.serialize`/`deserialize`). Canonical
   JSON in/out is the shared language between the model and the rig.
2. A small **edit protocol**: a structured "patch diff" the model emits
   (`set param`, `add/remove node`, `add/remove edge`, `toggle clock`) validated
   before apply. Mirror the `PB.app` API. **This is now the next big piece.**
3. A **loop driver**: every N bars (a divided clock!), snapshot state → ask the
   model for the next shift → apply on the bar boundary → repeat. The clock
   divider + `PB.onBar` hook are the timing substrate.
4. **Guardrails**: keep edits incremental (no full-graph rewrites), clamp param
   ranges, and keep a human "take the wheel" override.

Foundation is in place: save/load serialization is the shared language; the macro
clock layer (block routing) is how the agent moves between sections; the visual
creator is the human-side counterpart to the model's edits — all shipped. The
**edit protocol + loop driver** is the remaining path to the live-performance agent.

## Known limitations to revisit

- Per-voice arrangement vs. the single global section label in the tracker header
  (header shows the primary clock's section only).
- Off-tempo voices quantize to the master grid in the tracker (honest but can
  look irregular) — acceptable, document if it confuses.
