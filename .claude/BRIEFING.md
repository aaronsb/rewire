# Rewire — Project Briefing

A browser-based **modular synthesizer / node patcher**. You wire together blocks
(clock, scale, chords, voices, effects, modulators) with cables; the wiring is
**live Web Audio routing**, so unplugging a cable silences that path instantly.
It plays evolving, fully-synthesized music — no samples, no build step.

## Concept (short)

Each part of a compact "song spec" — bpm + scale + chords + note-index motifs
(every kick/snare/bassline/melody is synthesized at runtime) — becomes a
**wireable node**. You patch them together and the graph plays. 33 ready-made
tracks ship as loadable presets (`tracks.js`).

## Run it

No build step. Plain `<script>` tags sharing a `window.PB` global. Must be served
over HTTP (some browser APIs + tooling dislike `file://`):

```bash
python3 -m http.server 8731   # from the repo root
# open http://localhost:8731/index.html
```

## Files

| File | Role |
|------|------|
| `index.html` | Markup, all CSS (pixel-arcade theme), boot script, left palette |
| `engine.js` | AudioContext, voice synthesis, the scheduler, modulation, capture |
| `app.js` | Node/edge model, `NODE_DEFS`, live audio routing, spec loader, **patch save/load (serialize/deserialize)**, node+wire UI |
| `visual.js` | **Visual creator mode** — point-and-click editors (piano/chords/motif/arrange) registered as `PB.visual` |
| `help.js` | **Control help** — per-card `?` toggle + hover help cards; `HELP` registry + `PB.help` |
| `tracker.js` | ScreamTracker-style pattern view (draggable, scrolling) |
| `tracks.js` | `window.SS_TRACKS` — 33 song specs shipped as loadable presets |

All four scripts run in global scope and coordinate through `window.PB`
(`PB.nodes`, `PB.edges`, `PB.ctx`, `PB.clock`, `PB.engine`, `PB.app`, `PB.caps`,
`PB.events`).

## Core model

- **Nodes** (`PB.nodes`): `{id, type, x, y, collapsed, params, el, audioOut?, audioIn?, audioInMap?, muted?, solo?, cursor?, barIdx?}`. Defined in `NODE_DEFS` (app.js): title, css class, audio role (`voice`/`fx`/`out`/`select`/null), input/output ports, default params, and control schema.
- **Edges** (`PB.edges`): `{from, fromPort, to, toPort, type, _wired}`. `type` is the port type.
- **Port types** (and wire/dot colors): `clock` gold, `scale` cyan, `chords` green, `motif` pink, `audio` white, `mod` purple, `arrange` orange.
- **Connection rules** (`addEdge`): types must match; **data inputs are single-source** (a new wire evicts the old); **audio inputs allow fan-in** (multiple sources sum). Exact duplicates are rejected.

## Node catalog

**Sources / data**
- `clock` — `{bpm, swing, arrange:evolve|steady}`. out: `clock`. Drives tempo. Multiple clocks are allowed; each voice runs at *its* connected clock's tempo (true polytempo). The **primary** clock (first clock node, `PB.clock` via `recalcClock`) drives the master transport + tracker grid + global section.
- `scale` — `{scaleHz:[Hz,...]}`. out: `scale`. The pitch palette.
- `chords` — `{chords:[{r,t,f,o,s?,bars?}]}`. out: `chords`. r/t/f/o = root/3rd/5th/octave in Hz; optional `s`, optional `bars` (default 2).
- `motif` — `{leadMotif, busyRhythm, leadMotif{Busy,Var,VarBusy,Build,BuildBusy}?}`. out: `motif`. Motifs are **indices** into chord tones (or scale). Arrays may be flat or per-chord (array-of-arrays).
- `arrange` — `{steps:[section names]}`. out: `arrange`. A custom section sequence; wire into a voice's `arrange` port to override the global cycle.

**Voices** (audio out; need a `clock`; pitched ones need `chords`)
- `drums` — `{density(sparse/normal/dense), pattern(named groove|""), kit, clap, openHat, gain}`. ins: clock, arrange, gain(mod).
- `bass` — `{style, wave, octave, gain}`. styles: `sustain, pulse, walking, octaves, arp, offbeat, driving, sub`. ins: clock, chords, arrange, gain(mod).
- `lead` — `{style, wave, mode(chord/scale), octave, gain}`. styles: `motif, arp, walk, stab`. ins: clock, scale, chords, motif, arrange, gain(mod).
- `pad` — `{style, gain}`. styles: `sustain, swell, pulse, stab`. Only sounds in non-`tonal` sections. ins: clock, chords, arrange, gain(mod).

**Effects / routing / sink**
- `reverb` — convolution (synth impulse). `{wetness}`. in: audio + wetness(mod). out: audio.
- `delay` — feedback delay. `{feedback, time(beats)}`. in: audio + feedback(mod). out: audio.
- `filter` — `BiquadFilterNode`. `{ftype(lowpass/highpass/bandpass), cutoff, reso}`. in: audio + cutoff(mod) + reso(mod). out: audio. Fully filtered (no dry path). LFO→cutoff is the classic sweep.
- `select` — audio router: 4 audio ins (`in0..in3`) → 1 out. `{active, every(bars)}`. Wire a `clock` in to auto-cycle `active` every N bars (rhythmic switcher / A-B bypass).
- `output` — `{volume}`. in: audio + volume(mod). Feeds the master compressor → gate → speakers.

**Modulators** (out: `mod`)
- `lfo` — `{shape(sine/triangle/saw/square/s&h), rate(bars), depth, offset}`.
- `const` — `{value}`.

Mod targets (the `mod` input ports): voice `gain`, reverb `wetness`, delay `feedback`, filter `cutoff`/`reso`, output `volume`, clock `swing`. A mod value is 0..1, mapped to the target control's `[min,max]`.

## Visual creator mode (visual.js)

The typed entry nodes (`scale`/`chords`/`motif`/`arrange`) have a **text/visual
toggle** in the node header (the `T`/`▦` button). `PB.visual` registers one editor
per type; `renderBody` (app.js) swaps the node body per `node.editMode`. Editors
write back to the **same params** the engine reads (`scaleHz`, `chords`,
`leadMotif`, `steps`) via `setParam`, so the engine needs no changes. Editor
state lives on `node.vis` (and is serialized). Loaded tracks are reflected via
best-effort inference (scale pitch classes; chord interval→quality matching).
- **scale** — piano keyboard (toggle degrees) + root, octave range, scale presets.
- **chords** — progression builder (root+quality+bars per slot) + roman-numeral
  presets generated from a chosen key.
- **motif** — step grid (steps × chord-tone index) + contour presets + busy rhythm.
- **arrange** — draggable section chips + arrangement presets.

## Control help (help.js)

Each node header has a `?` button that toggles `pb-node--help` on the node el.
`PB.help.ctl(el,type,key)` / `.node(el,type)` / `.tag(el,text)` attach hover
handlers that only fire while inside an active node, showing a floating `.pb-help`
card (styled like a node) with text from the `HELP` registry (keyed by node type;
`_` is the node-level description). app.js tags the title + every standard control;
visual.js tags its editor controls. New control text lives in the `HELP` registry.

## Patch save/load (app.js)

`serialize()` snapshots `{v,t,nodes:[{id,type,x,y,collapsed,editMode,vis,params}],
edges:[{from,fromPort,to,toPort}]}`; `deserialize()` clears + rebuilds via
`addNode`/`addEdge`, remapping saved ids → rebuilt ids (PB.seq differs after
`clearGraph`). localStorage named slots (`pb:patch:<name>`) via
`savePatch`/`loadPatch`/`listPatches`/`deletePatch`; file `exportPatch` (download)
/ `importPatch` (FileReader). Top-bar patches menu wires it all. This JSON is the
canonical in/out format for the planned LLM-agent direction.

## Engine (engine.js)

- **Scheduler** `tick()`: a **master timeline** (primary clock) emits master bars into `PB.caps` (for the tracker grid + global section + `PB.onBar`). Then a **per-voice loop** advances each voice on its own clock's tempo via `node.cursor` / `node.barIdx`, lookahead 1.5 master bars, re-armed with `setTimeout` ~half a master bar out. This is what makes polytempo work.
- **Sections / arrangement**: 8 sections cycle every `SECT_BARS` (8) bars when the clock is `evolve` — `tonal, var, poly, build` and their `+` (busy) variants (`SECTION_DEFS`). `steady` = always `var`. An `arrange` node wired to a voice overrides its section sequence (`sectionFor`).
- **Synthesis**: per-voice emit functions (`emitDrums/emitBass/emitLead/emitPad`) build oscillators + noise buffers with gain envelopes into `node.audioOut`. Tables: `KITS`, `DENSITY`, `NAMED_DRUMS`, `BUSY` (16th grids), plus the style switches in each emitter.
- **Capture**: emit functions call `capNote/capDrum`, which push `{t, g, drum}` **absolute-time** events to `PB.events[nodeId]`. Absolute time (not step index) is what lets the tracker bin polytempo voices onto the master grid.
- **Modulation** `modLoop()` (rAF): for each `mod` edge, compute the source value and apply to the target param (`applyMod` → voice gain writes `audioOut.gain` directly for smoothness; others go through `PB.app.setParam` + `reflect` to animate the slider).

## Audio routing (app.js)

- `ensureCtx()` builds the master chain: `compressor → gate → destination`.
- `buildAudio(node)`: voices get an `audioOut` gain; fx get `audioIn`/`audioOut` with their effect graph; `select` gets an `audioInMap{in0..in3}` of gains (only the active one open) summing into `audioOut`; output gets a volume gain into the master. `audioInMap` generalizes multi-input nodes.
- `wireAudio(e)` / `unwireAudio(e)`: real `connect`/`disconnect` for `audio` edges (`audioInOf` resolves the right input gain). Mod/arrange/clock/scale/chords/motif edges are **not** audio connections — they're resolved by the scheduler / modLoop.

## Tracker (tracker.js)

- Draggable window. Columns = voice nodes; rows = the 16 sixteenth-steps of the master bar. Cells are **binned from `PB.events`** by absolute time (`binBar`), so any voice (even off-tempo) shows up.
- **Continuous smooth scroll**: builds a multi-bar buffer from `PB.caps`, sets `scrollTop` each frame so the playing row stays centered. Themed pixel scrollbar.
- Column controls: **M**ute / **S**olo (flags on the node, honored by the scheduler), **✕** remove, and `+DR/BA/LE/PA` add an auto-wired voice (clock + chords, plus scale/motif for leads, + audio→output).

## Conventions & gotchas

- **Serve over HTTP** — `file://` is unreliable (and broke the browser-automation navigate). `python3 -m http.server`.
- **Audio inputs sum (fan-in); data inputs are single-source.** This was an early bug — all voices into Output's one input were evicting each other.
- `<select autocomplete="off">` on the track loader, or the browser restores the old selection across reloads and overrides boot.
- Voice `gain` modulation writes `audioOut.gain` directly (kept off the base `params.gain` knob to avoid double-scaling).
- Everything is plain JS in global scope — no modules, no bundler. Keep it that way unless we adopt a dev server.

## Data format (`tracks.js`)

`window.SS_TRACKS` maps id → spec: `{bpm, scaleHz, chords, leadMotif(+variants), leadWaveform, drumDensity, bassDensity, drumPattern?, drumKit?, vibe?, reverbWetness?, delayFeedback?, ...}`. The spec loader (`loadSpec`) builds the canonical node graph and auto-wires it; `bassDensity` maps to a bass *style* so loaded tracks aren't monotonic.
