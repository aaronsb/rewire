# Patchbay — Roadmap / Next Work

Ordered roughly by value × readiness. Each item notes the approach so a future
session can pick it up without re-deriving.

## 1. Visual creator mode (the big one — next)

Goal: the typed-JSON entry nodes (`scale`, `chords`, `motif`, `arrange`) get a
**toggle** between "text" and "visual" editing so you can build musical content
without knowing Hz or JSON. Each visual editor writes back to the same `params`
the engine already reads, so the engine needs no changes.

Implementation sketch:
- Add a control type `t:"visual"` (or a per-node toggle button in the header) that
  swaps the node body between the existing textarea and a custom editor element.
- **Scale** — a 1–2 octave **piano keyboard** widget: click keys to toggle scale
  degrees; a **root** selector + **octave range**; a **preset dropdown** (major,
  natural/harmonic/melodic minor, dorian, phrygian, lydian, mixolydian, locrian,
  pentatonic major/minor, blues, whole-tone, chromatic). Generates `scaleHz`
  across the chosen octaves from `root * 2^(semitone/12)`.
- **Motif** — a **step sequencer grid** (steps × scale degrees) to draw the lead
  line; writes `leadMotif` as indices. Optional preset contours (ascending,
  arch, call-response). Could also drive the `+` variants.
- **Chords** — a **progression builder**: per slot pick root + quality
  (maj/min/maj7/min7/sus/dim); generate `{r,t,f,o}` from the key. Progression
  presets: I–IV–V–I, ii–V–I, I–V–vi–IV, vi–IV–I–V, 12-bar blues.
- **Arrange** — clickable **section chips** (`tonal var poly build …`); click to
  append, drag to reorder, click-to-remove; length control; presets
  (intro→build→drop, steady-loop). Writes `steps`.

Why first: the user explicitly can't intuit what to type into `arrange`/`scale`;
this unlocks the whole instrument for non-Hz-fluent use.

## 2. Save / load patches

Serialize `{nodes:[{id,type,x,y,collapsed,params}], edges:[{from,fromPort,to,toPort}]}`
to JSON. Save to `localStorage` (named slots) and export/import as a `.json` file.
Add a small "patches" menu in the top bar. Rebuild via existing `addNode`/`addEdge`.
This makes the woozy multi-clock accidents (and everything else) keepable.

## 2b. Generalize MULT beyond clocks

The `clockmult` node multiplies/divides a **clock** rate (built — feeds dividers
into SELECT/voices for slow, phase-locked switching). The same "multiply" idea
generalizes to other signal domains; consider sibling nodes (or one polymorphic
MULT that adapts to the wired type):
- **mod × factor** (or mod × mod) — scale/attenuate an LFO/const, or ring-mod two
  modulators. Trivial: multiply the 0..1 values in `modValue`/`applyMod`.
- **audio × mod = VCA** — multiply an audio signal by a mod source: tremolo,
  gating, sidechain-style ducking. Implement as an audio node whose `GainNode`
  gain is driven by the mod input each frame.

## 3. Filter node

A `filter` node (lowpass/highpass/bandpass via `BiquadFilterNode`) with
`cutoff` + `resonance`, both **mod targets**. Biggest single sonic upgrade —
LFO→cutoff is the classic move. Audio fx node (in/out), same pattern as reverb.

## 4. Recording / export

`MediaStreamDestination` + `MediaRecorder` on the master to capture a take to
`.webm`/`.wav` for download. A record button in the transport.

## 5. Polyrhythm helper for clocks

Multi-clock is free-running (the "drunk" drift). Add an optional per-clock
**ratio/mult** (½×, ¾×, 2×, 3× of a reference) so users can get *tight*
cross-rhythms on demand, alongside the loose drift. Keep both modes.

## 6. Tracker as input (ambitious)

Let clicking a tracker cell add/remove a hit, turning the tracker from a
read-only display into a step editor that feeds a per-voice pattern override.
Tension: voices are currently algorithmic; this needs a "manual pattern" voice
mode or an override layer. Design before building.

## 7. More node types

- `arp` node (arpeggiator over a chord input, rate/range/direction).
- noise/sample voice; sidechain (duck a voice on kick).
- MIDI in (Web MIDI) for external clock/notes.

## 8. UX polish

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
1. **Patch serialization** (roadmap #2) — canonical JSON in/out is the shared
   language between the model and the rig. Do this first.
2. A small **edit protocol**: a structured "patch diff" the model emits
   (`set param`, `add/remove node`, `add/remove edge`, `toggle clock`) validated
   before apply. Mirror the `PB.app` API.
3. A **loop driver**: every N bars (a divided clock!), snapshot state → ask the
   model for the next shift → apply on the bar boundary → repeat. The clock
   divider + `PB.onBar` hook are the timing substrate.
4. **Guardrails**: keep edits incremental (no full-graph rewrites), clamp param
   ranges, and keep a human "take the wheel" override.

This reframes earlier items: save/load (#2) is the foundation; the macro clock
layer (block routing) is how the agent moves between sections; the visual creator
(#1) is the human-side counterpart to the model's edits.

## Known limitations to revisit

- Per-voice arrangement vs. the single global section label in the tracker header
  (header shows the primary clock's section only).
- Off-tempo voices quantize to the master grid in the tracker (honest but can
  look irregular) — acceptable, document if it confuses.
