// Track loader. Source of truth is tracks/*.json (one song per file) +
// tracks/manifest.json. Kept as separate data files so a future build step
// can concat/inline them; for now they are fetched at runtime. Requires HTTP
// serving (file:// blocks fetch) - the project already mandates that.
//
// window.SS_TRACKS  : populated map id -> spec (empty until ready)
// window.SS_TRACKS_READY : Promise that resolves to SS_TRACKS once loaded
window.SS_TRACKS = {};
window.SS_TRACKS_READY = (async function () {
  // Per-track resilience: one missing/malformed file is skipped (warned), not
  // fatal to the rest — preserves per-song isolation (ADR-200).
  async function loadTrack(id) {
    try {
      const r = await fetch("tracks/" + id + ".json");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return [id, await r.json()];
    } catch (err) {
      console.warn("track skipped:", id, err);
      return null;
    }
  }
  try {
    const r = await fetch("tracks/manifest.json");
    if (!r.ok) throw new Error("manifest HTTP " + r.status);
    const ids = await r.json();
    const specs = await Promise.all(ids.map(loadTrack));
    for (const entry of specs) if (entry) window.SS_TRACKS[entry[0]] = entry[1];
  } catch (err) {
    console.error("track load failed:", err);
  }
  return window.SS_TRACKS;
})();
