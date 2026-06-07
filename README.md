# Rewire

A browser-based **modular synthesizer**. Wire blocks together — clock, scale,
chords, voices, effects, modulators — with cables, and hear it play. The wiring
is **live Web Audio routing**: unplug a cable and that path goes silent. No
samples, no build step — every sound is synthesized at runtime.

Drag a port dot to another to wire · click a wire to cut · double-click a port to
unplug · drag node headers to move · the left palette adds nodes · the tracker
panel shows what's playing (and adds/mutes voices).

![types: clock · scale · chords · motif · audio · mod · arrange](#)

## Run

No bundler. Serve the folder over HTTP and open it:

```bash
python3 -m http.server 8731
# http://localhost:8731/index.html
```

## What's inside

- **Voices** with multiple style algorithms (the bass alone has 8: walking, arp,
  octaves, sub, …).
- **Multiple clocks** → true polytempo (related BPMs lock into cross-rhythms;
  unrelated ones drift, pleasantly).
- **LFO / Const** modulators you patch into any knob (gain, wetness, feedback…).
- **Arrange** node for custom song-section sequences.
- **Select** router to A/B between effects, optionally clock-triggered.
- A scrolling **tracker** view of the live pattern.
- **Visual creator mode** — build scales/chords/motifs/arrangements by clicking
  (piano keyboard, progression builder, step grid) instead of typing Hz or JSON.
- **Save / load patches** — localStorage slots + `.json` export/import.
- Per-card **`?` help** — hover any control for an explanation.
- **33 preset tracks** (`tracks.js`) loadable from the top bar.

## Docs

- `.claude/BRIEFING.md` — architecture & how it all works.
- `.claude/ROADMAP.md` — what's next (MULT generalization, LLM live-performance
  agent, recording/export, …).
