# Rewire — for Claude

Read **`.claude/BRIEFING.md`** first — it's the full architecture (the `PB`
global, node/edge model, port types, the per-voice-timeline scheduler, audio
routing, capture/tracker, modulation, visual creator mode, control help, patch
save/load) and the conventions/gotchas.

**`.claude/ROADMAP.md`** has the prioritized next work (MULT generalization and
the LLM live-performance agent are next).

Quick facts:
- Plain JS, no build step. Scripts share `window.PB`: `engine.js` (audio +
  scheduler), `app.js` (graph model + routing + serialization + UI),
  `visual.js` (visual editors), `help.js` (control help), `tracker.js`, plus
  `tracks.js` (the preset specs on `window.SS_TRACKS`).
- Serve over HTTP to test: `./serve.sh` (wraps `python3 -m http.server 8731`,
  binds localhost, opens a browser) → `localhost:8731`.
- Audio inputs sum (fan-in); data inputs are single-source.
- Verify changes in a browser (open the served page, click Play, check the
  console for errors) — there are no automated tests yet.
