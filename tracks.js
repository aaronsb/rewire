// Track loader. Source of truth is tracks/*.json (one song per file) +
// tracks/manifest.json. Kept as separate data files so a future build step
// can concat/inline them; for now they are fetched at runtime. Requires HTTP
// serving (file:// blocks fetch) - the project already mandates that.
//
// window.SS_TRACKS  : populated map id -> spec (empty until ready)
// window.SS_TRACKS_READY : Promise that resolves to SS_TRACKS once loaded
window.SS_TRACKS = {};
window.SS_TRACKS_READY = (async function () {
  try {
    const ids = await fetch("tracks/manifest.json").then(r => r.json());
    const specs = await Promise.all(ids.map(id =>
      fetch("tracks/" + id + ".json").then(r => r.json()).then(spec => [id, spec])
    ));
    for (const [id, spec] of specs) window.SS_TRACKS[id] = spec;
  } catch (err) {
    console.error("track load failed:", err);
  }
  return window.SS_TRACKS;
})();
