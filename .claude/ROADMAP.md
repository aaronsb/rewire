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

## Known limitations to revisit

- Per-voice arrangement vs. the single global section label in the tracker header
  (header shows the primary clock's section only).
- Off-tempo voices quantize to the master grid in the tracker (honest but can
  look irregular) — acceptable, document if it confuses.
