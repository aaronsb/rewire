/* =====================================================================
   Patchbay control HELP — a per-card "?" toggle that, when active, shows
   an offset help card (styled like the nodes) on hover over any control.
   Registry below is keyed by node type; "_" is the node-level description.
   PB.help.ctl/tag attach hover handlers; they only fire while the owning
   node has the pb-node--help class (set by the header "?" button in app.js).
   ===================================================================== */
(function(){
  const HELP={
    clock:{ _:"Master tempo & groove. Every voice follows the clock it's wired to — multiple clocks = polytempo.",
      enabled:"On/off gate for everything on this clock. Off keeps voices silently in phase, so re-enabling resumes mid-song — handy for cutting between sections.",
      bpm:"Tempo, in beats per minute.",
      swing:"Pushes every other 16th note late for a shuffle/groove. 0% = dead straight.",
      arrange:"evolve = auto-cycle the 8 sections; steady = stay in the 'var' section." },
    clockmult:{ _:"Multiplies or divides a clock's rate. Feed it a clock, get a faster/slower one — for phase-locked half/double-time voices or slow section switching.",
      factor:"Rate multiplier. <1 slows down (÷), >1 speeds up (×). 0.5 = half-time, 2 = double-time." },
    scale:{ _:"The pitch palette a lead can draw from (scale mode). A list of frequencies in Hz.",
      scaleHz:"Comma-separated frequencies (Hz). Switch to the visual editor (T) to pick notes on a keyboard instead." },
    chords:{ _:"The harmonic backbone. Each chord is root/third/fifth/octave in Hz; bass, pad and chord-mode leads read it.",
      chords:"JSON list of {r,t,f,o} chords in Hz. Switch to the visual editor (T) to build a progression by name." },
    motif:{ _:"The lead's melodic shape — indices into the current chord's tones (or scale). Wire it into a lead.",
      leadMotif:"Note index per step (0=root, 1=third…). Switch to the visual editor (T) to draw it on a grid.",
      busyRhythm:"Which 16th-note rhythm grid the busy (+) sections use." },
    drums:{ _:"Synth drum voice — kick / snare / hats with section-aware fills.",
      density:"How many hits per bar when no named pattern is set: sparse / normal / dense.",
      pattern:"A named groove (rock, disco, breakbeat…). Overrides density; '— none —' falls back to it.",
      kit:"Drum timbre & tuning preset.",
      fills:"Add end-of-section fills and build turnarounds. Off = steady groove.",
      clap:"Layer a handclap on the snare hits.",
      openHat:"Add open hi-hats on the off-beats.",
      gain:"Voice volume. Also a mod target — wire an LFO/const into the gain port." },
    bass:{ _:"Bass voice. Reads the chord; STYLE picks the bassline algorithm.",
      style:"Bassline pattern: sustain, pulse, walking, octaves, arp, offbeat, driving, sub.",
      wave:"Oscillator waveform / timbre.",
      octave:"Shift the bass up or down by octaves.",
      gain:"Voice volume. Also a mod target (gain port)." },
    lead:{ _:"Lead / melody voice. STYLE picks how it plays; needs chords (plus scale+motif for the motif style).",
      style:"motif (follow the motif node), arp (chord arpeggio), walk (scale walk), stab (held chord hits).",
      wave:"Oscillator waveform / timbre.",
      mode:"chord = motif indexes chord tones; scale = motif indexes the wired scale.",
      octave:"Shift the lead up or down by octaves.",
      gain:"Voice volume. Also a mod target (gain port)." },
    pad:{ _:"Sustained chord pad. Only sounds in non-'tonal' sections, filling harmony underneath.",
      style:"sustain (held), swell (slow fade-in), pulse (rhythmic), stab (short hits).",
      gain:"Voice volume. Also a mod target (gain port)." },
    reverb:{ _:"Convolution reverb. Wire audio through it (in → out) for space & ambience.",
      wetness:"Dry/wet mix — how much reverb. Also a mod target." },
    delay:{ _:"Feedback delay / echo. Wire audio through it (in → out).",
      feedback:"How much the echo feeds back on itself — higher = more repeats.",
      time:"Delay time in beats (tempo-synced)." },
    filter:{ _:"Resonant filter (biquad). Wire audio through it; sweep the cutoff with an LFO for the classic move.",
      ftype:"lowpass (cut highs), highpass (cut lows), bandpass (keep a band around cutoff).",
      cutoff:"Filter corner frequency (Hz). A mod target — wire an LFO here to sweep.",
      reso:"Resonance / Q — emphasis at the cutoff. High = whistly peak. Also a mod target." },
    output:{ _:"Master sink. Sum your audio here; it feeds the compressor → speakers.",
      volume:"Master output level. Also a mod target." },
    select:{ _:"Audio router — 4 inputs, 1 output, only the active one passes. Wire a clock to auto-switch every N bars.",
      active:"Which input (0–3) is currently passing through.",
      every:"With a clock wired, switch to the next input every N bars." },
    lfo:{ _:"Low-frequency oscillator — a moving value (0–1) to wire into any mod port.",
      shape:"Waveform: sine, triangle, saw, square, or s&h (random steps).",
      rate:"Cycle length in bars (tempo-synced).",
      depth:"How far it swings around the offset.",
      offset:"The center value it swings around." },
    const:{ _:"A fixed value (0–1) to wire into a mod port — for offsetting or setting a modulated control.",
      value:"The constant output value." },
    arrange:{ _:"A custom section sequence. Wire into a voice's (or a clock's) arrange port to override the default 8-section cycle. Each step lasts 8 bars.",
      steps:"Ordered section names. Switch to the visual editor (T) to build it from chips." },
  };
  function lookup(type,key){ const h=HELP[type]; return (h&&h[key])||""; }

  // ---- the floating help card (styled like a node) ------------------
  let card;
  function ensure(){ if(card) return card; card=document.createElement("div"); card.className="pb-help"; document.body.appendChild(card); return card; }
  function show(anchor,title,text){
    if(!text) return; const c=ensure();
    c.innerHTML=""; if(title){ const k=document.createElement("div"); k.className="pb-help__k"; k.textContent=title; c.appendChild(k); }
    const b=document.createElement("div"); b.className="pb-help__b"; b.textContent=text; c.appendChild(b);
    c.style.display="block";
    const r=anchor.getBoundingClientRect(), cw=c.getBoundingClientRect().width, ch=c.getBoundingClientRect().height;
    let x=r.right+12, y=r.top-2;
    if(x+cw>window.innerWidth-8) x=r.left-cw-12;          // not enough room right -> flip left
    if(x<8) x=8;
    if(y+ch>window.innerHeight-8) y=window.innerHeight-ch-8;
    if(y<8) y=8;
    c.style.left=Math.round(x)+"px"; c.style.top=Math.round(y)+"px";
  }
  function hide(){ if(card) card.style.display="none"; }

  // bind hover help to an element; only fires while inside an active (?-on) node
  function bind(elm,getTitle,getText){
    elm.addEventListener("mouseenter",()=>{ if(elm.closest(".pb-node--help")) show(elm,getTitle(),getText()); });
    elm.addEventListener("mouseleave",hide);
  }
  PB.help={
    ctl:(elm,type,key)=>bind(elm,()=>key,()=>lookup(type,key)),
    node:(elm,type)=>bind(elm,()=> (PB.app&&PB.app.NODE_DEFS[type]?PB.app.NODE_DEFS[type].title:type), ()=>lookup(type,"_")),
    tag:(elm,text,title)=>bind(elm,()=>title||"",()=>text),
    hide,
  };
})();
