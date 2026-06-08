---
status: Accepted
date: 2026-06-07
deciders:
  - aaronsb
  - claude
related:
  - ADR-101
---

# ADR-200: Per-song track files: split SS_TRACKS into tracks/*.json with an async loader

## Context

`tracks.js` shipped as a single ~40KB **minified one-line literal** assigning
`window.SS_TRACKS = { ...33 song specs... }`. That format is hostile to
maintenance:

- It can't be paginated or read by line; line-oriented editing tools can't target
  it, so every change means wading through 40KB on one line.
- Every diff is one unreadable mega-line — useless for review or `git blame`.
- Touching one song risks the whole blob; merge conflicts are unresolvable.

The catalog only grows (34 songs and counting), and the project anticipates
**adopting a build step** at some point. So the song data should be stored in a
shape that is (a) editable per song, (b) diff-friendly, and (c) something a future
bundler can trivially consume — without forcing a build step *today* (the project
is currently plain `<script>` tags sharing `window.PB`, no build).

This is the *file/loading structure* of the song catalog. It is distinct from —
but will interact with — [ADR-101](../engine/ADR-101-simplify-the-base-clock-externalize-swing-and-migrate-song-patch-json.md),
which concerns the spec *schema* changing (externalizing swing). Per-song files
make that future migration easier: each song migrates independently.

## Decision

Split the catalog into **one pure JSON file per song**, loaded at runtime by a
thin loader.

- **`tracks/<id>.json`** — one song spec per file (e.g. `tracks/test-temple.json`).
  Pure JSON (the source of truth). Formatted **one field per line, arrays/objects
  inline** — editable and valid JSON, without exploding 36-element `scaleHz` arrays
  into 36 lines.
- **`tracks/manifest.json`** — a JSON array of song ids. Adding a song = drop a
  `.json` file + add one manifest line.
- **`tracks.js`** becomes a small **runtime loader**: fetch the manifest, then
  fetch every song JSON in parallel (`Promise.all`), populate `window.SS_TRACKS`,
  and expose `window.SS_TRACKS_READY` — a Promise resolving to the populated map.
- **`index.html` boot** becomes `async` and `await`s `window.SS_TRACKS_READY`
  before reading `SS_TRACKS` (building the dropdown / loading the boot track).

The pure-JSON files are deliberately the **build-supportive** choice: a future
build step can concat/inline them into a single bundle and drop the runtime fetch,
with no change to the data itself.

Requires HTTP serving (`file://` blocks `fetch`) — which the project already
mandates (`python3 -m http.server`).

## Consequences

### Positive

- Each song is an isolated, readable, diff-able file; line-oriented tools work;
  `git blame`/review/merge operate per song.
- Manifest-driven catalog — add/remove a song without touching a mega-literal.
- Pure JSON is the most build-tool-friendly source of truth; this structure
  *supports* adopting a build step later without forcing one now.
- Cleanly sets up ADR-101's schema migration (per-song migration, not one blob).

### Negative

- Track loading is now **async** (`fetch` + a ready-promise); the boot had to
  become `async`. A new failure mode (network/parse error) the loader logs.
- 35 files instead of 1; a `manifest.json` to keep in sync with the directory.
- Runtime fetch latency on load (small: parallel fetches over localhost), until a
  future build step inlines them.
- Hard dependency on HTTP serving (already required, now load-bearing).

### Neutral

- `window.SS_TRACKS` stays the in-memory contract the rest of the app reads, so
  `loadSpec`, the dropdown, save/load, and the future LLM agent are unchanged —
  only *how the map gets populated* changed.
- The `lofi-dusty-tape-loop` track added during this work lives as one of the
  per-song files.

## Alternatives Considered

- **Keep a single de-minified `tracks.js`.** Solves readability but not isolation —
  still one growing file, still merge-conflict-prone, still no per-song diff/blame.
  Rejected; the split is the point.
- **JS file per song that self-registers + a `<script>` tag each in `index.html`.**
  Synchronous (no async boot), matches the existing script-tag/global model. But it
  needs a `<script>` line per song (34 and growing) in `index.html`, wraps data in
  JS boilerplate, and is less build-friendly than pure JSON. Rejected for the
  index.html tag sprawl and weaker build story.
- **ES modules importing each song.** `<script type="module">` with static imports;
  needs an explicit import list somewhere (same sprawl) and shifts to the module
  graph. Rejected as more machinery for no extra benefit here.
- **Adopt a build/bundler now** and emit a single bundle from per-song sources.
  The cleanest long-term, but the project is intentionally buildless today. Deferred:
  this decision *supports* that step (pure-JSON sources) without requiring it now.
