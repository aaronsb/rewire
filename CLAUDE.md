# Patchbay — for Claude

Read **`.claude/BRIEFING.md`** first — it's the full architecture (the `PB`
global, node/edge model, port types, the per-voice-timeline scheduler, audio
routing, capture/tracker, modulation) and the conventions/gotchas.

**`.claude/ROADMAP.md`** has the prioritized next work (visual creator mode is
next).

Quick facts:
- Plain JS, no build step. Four scripts share `window.PB`: `engine.js` (audio +
  scheduler), `app.js` (graph model + routing + UI), `tracker.js`, `tracks.js`.
- Serve over HTTP to test: `python3 -m http.server 8731` → `localhost:8731`.
- Audio inputs sum (fan-in); data inputs are single-source.
- Verify changes in a browser (open the served page, click Play, check the
  console for errors) — there are no automated tests yet.
