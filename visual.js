/* =====================================================================
   Patchbay VISUAL creator mode — point-and-click editors for the typed
   entry nodes (scale / chords / motif / arrange). Each editor writes back
   to the SAME params the engine already reads (scaleHz, chords, leadMotif,
   steps), so the engine needs zero changes. A per-node header toggle
   (app.js) swaps the node body between these editors and the raw textareas.

   No Hz, no JSON: pick a root + a scale preset, build a chord progression
   from roman-numeral presets, draw a melody on a step grid, arrange song
   sections as draggable chips.
   ===================================================================== */
(function(){
  // ---- music theory helpers -----------------------------------------
  const PC=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const BLACK=new Set([1,3,6,8,10]);
  const r2=x=>Math.round(x*100)/100;
  const mtof=m=>440*Math.pow(2,(m-69)/12);            // midi -> Hz
  const ftom=f=>Math.round(69+12*Math.log2(f/440));   // Hz -> midi (nearest)
  const midiOf=(pc,oct)=>(oct+1)*12+pc;               // C4 = 60

  const SCALE_PRESETS={
    major:[0,2,4,5,7,9,11], "natural minor":[0,2,3,5,7,8,10],
    "harmonic minor":[0,2,3,5,7,8,11], "melodic minor":[0,2,3,5,7,9,11],
    dorian:[0,2,3,5,7,9,10], phrygian:[0,1,3,5,7,8,10],
    lydian:[0,2,4,6,7,9,11], mixolydian:[0,2,4,5,7,9,10],
    locrian:[0,1,3,5,6,8,10], "pentatonic major":[0,2,4,7,9],
    "pentatonic minor":[0,3,5,7,10], blues:[0,3,5,6,7,10],
    "whole tone":[0,2,4,6,8,10], chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],
  };
  const CHORD_QUAL={
    maj:[0,4,7], min:[0,3,7], dim:[0,3,6], aug:[0,4,8], sus2:[0,2,7], sus4:[0,5,7],
    maj7:[0,4,7,11], min7:[0,3,7,10], dom7:[0,4,7,10], m7b5:[0,3,6,10], dim7:[0,3,6,9],
  };
  // diatonic triad qualities per scale degree, for roman-numeral presets
  const DIATONIC={
    major:{deg:[0,2,4,5,7,9,11], qual:["maj","min","min","maj","maj","min","dim"]},
    minor:{deg:[0,2,3,5,7,8,10], qual:["min","dim","maj","min","min","maj","maj"]},
  };
  // each preset = [scale-degree-index, ...]; rendered against the chosen key
  const PROG_PRESETS={
    "I–IV–V–I":[0,3,4,0], "ii–V–I":[1,4,0], "I–V–vi–IV":[0,4,5,3],
    "vi–IV–I–V":[5,3,0,4], "I–vi–IV–V":[0,5,3,4], "blues (8-bar)":[0,3,0,4],
  };
  const SECTIONS=(window.PB&&PB.engine&&PB.engine.DEFAULT_ARRANGE)||
    ["tonal","var","poly","build","tonal+","var+","poly+","build+"];
  const ARRANGE_PRESETS={
    "full cycle":SECTIONS.slice(),
    "intro→build→drop":["tonal","var","build","poly+","poly+","var+","build","build+"],
    "steady loop":["var"],
    "swell":["tonal","tonal","var","build","build+"],
  };

  // ---- generators (vis-state -> engine params) ----------------------
  function genScale(s){
    const out=[], degs=s.degrees.slice().sort((a,b)=>a-b);
    for(let o=0;o<s.octN;o++) for(const d of degs) out.push(r2(mtof(midiOf(s.root,s.oct0+o)+d)));
    return out;
  }
  function chordFromRow(row){
    const iv=CHORD_QUAL[row.quality]||CHORD_QUAL.maj, base=mtof(midiOf(row.root,row.oct));
    const c={ r:r2(base), t:r2(base*Math.pow(2,iv[1]/12)), f:r2(base*Math.pow(2,iv[2]/12)), o:r2(base*2) };
    if(iv.length>3) c.s=r2(base*Math.pow(2,iv[3]/12));
    if(row.bars&&row.bars!==2) c.bars=row.bars;
    return c;
  }
  const genChords=rows=>rows.map(chordFromRow);

  // ---- inference (engine params -> vis-state, best-effort) -----------
  function inferScale(hz){
    if(!hz||!hz.length) return null;
    const ms=hz.map(ftom).filter(isFinite).sort((a,b)=>a-b); if(!ms.length) return null;
    const lo=ms[0], hi=ms[ms.length-1];
    const degrees=[...new Set(ms.map(m=>(((m-lo)%12)+12)%12))].sort((a,b)=>a-b);
    return { root:((lo%12)+12)%12, oct0:Math.floor(lo/12)-1,
      octN:Math.max(1,(Math.floor(hi/12)-Math.floor(lo/12))+1), degrees };
  }
  function rowFromChord(c){
    const m=ftom(c.r), ivs=[0, Math.round(12*Math.log2(c.t/c.r)), Math.round(12*Math.log2(c.f/c.r))];
    if(typeof c.s==="number") ivs.push(Math.round(12*Math.log2(c.s/c.r)));
    let quality="maj", best=1e9;
    for(const q in CHORD_QUAL){ const t=CHORD_QUAL[q]; if(t.length!==ivs.length) continue;
      let d=0; for(let i=0;i<t.length;i++) d+=Math.abs(t[i]-ivs[i]); if(d<best){best=d;quality=q;} }
    return { root:((m%12)+12)%12, oct:Math.floor(m/12)-1, quality, bars:(typeof c.bars==="number"?c.bars:2) };
  }
  function presetName(degs){
    const k=degs.slice().sort((a,b)=>a-b).join(",");
    for(const p in SCALE_PRESETS) if(SCALE_PRESETS[p].join(",")===k) return p;
    return "custom";
  }

  // ---- tiny DOM helpers ---------------------------------------------
  function el(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function sel(opts,val,on){
    const s=el("select");
    opts.forEach(o=>{ const v=Array.isArray(o)?o[0]:o, t=Array.isArray(o)?o[1]:o;
      const op=el("option",null,t); op.value=v; if(String(v)===String(val)) op.selected=true; s.appendChild(op); });
    s.addEventListener("change",()=>on(s.value)); return s;
  }
  function btn(txt,on,cls){ const b=el("button",(cls||"")+" pb-vis__btn",txt); b.type="button";
    b.addEventListener("click",e=>{ e.stopPropagation(); on(); }); return b; }
  // a one-shot "apply preset" dropdown: a sticky placeholder is always the shown
  // value, so picking ANY preset always fires change (and re-picking the same one
  // works too). Plain sel() with value "" desyncs — the browser shows option[0]
  // while state is elsewhere, so re-selecting that option is a silent no-op.
  function presetSel(label,opts,on){
    const s=el("select"); const ph=el("option",null,label); ph.value=""; ph.disabled=true; s.appendChild(ph);
    opts.forEach(o=>{ const op=el("option",null,o); op.value=o; s.appendChild(op); });
    s.value="";
    s.addEventListener("change",()=>{ const v=s.value; s.value=""; if(v) on(v); });
    return s;
  }
  const set=(n,k,v)=>PB.app.setParam(n,k,v);
  // attach hover-help to a visual control (fires only while the node's "?" is on)
  const H=(elm,text)=>{ if(window.PB.help){ elm.setAttribute("data-h",""); PB.help.tag(elm,text); } return elm; };

  // ---- SCALE editor: piano + root + octaves + presets ---------------
  function scaleEditor(node){
    const wrap=el("div","pb-vis pb-vis--scale");
    node.vis=node.vis||{};
    let s=node.vis.scale || inferScale(node.params.scaleHz) ||
      {root:0,oct0:3,octN:2,degrees:SCALE_PRESETS.major.slice()};
    node.vis.scale=s;
    const commit=()=>{ node.vis.scale=s; set(node,"scaleHz",genScale(s)); };
    if(!node.params.scaleHz||!node.params.scaleHz.length) commit();   // fresh node -> playable

    function draw(){
      wrap.innerHTML="";
      const top=H(el("div","pb-vis__row"),"Root note, starting octave, and how many octaves to generate.");
      top.appendChild(sel(PC.map((n,i)=>[i,n]), s.root, v=>{ s.root=+v; commit(); draw(); }));
      top.appendChild(sel([1,2,3,4,5,6].map(o=>[o,"oct "+o]), s.oct0, v=>{ s.oct0=+v; commit(); draw(); }));
      top.appendChild(sel([1,2,3].map(n=>[n,"×"+n]), s.octN, v=>{ s.octN=+v; commit(); draw(); }));
      wrap.appendChild(top);

      const pre=H(el("div","pb-vis__row"),"Pick a named scale; it fills the keyboard for you.");
      pre.appendChild(sel(Object.keys(SCALE_PRESETS).concat("custom"), presetName(s.degrees), v=>{
        if(v!=="custom"){ s.degrees=SCALE_PRESETS[v].slice(); commit(); draw(); } }));
      wrap.appendChild(pre);

      const piano=H(el("div","pb-piano"),"Click keys to toggle which notes are in the scale. Gold outline = root.");
      for(let pc=0;pc<12;pc++){
        const deg=((pc-s.root)%12+12)%12, on=s.degrees.includes(deg);
        const k=el("div","pb-key"+(BLACK.has(pc)?" pb-key--blk":"")+(on?" pb-key--on":"")+(pc===s.root?" pb-key--root":""), PC[pc]);
        k.addEventListener("click",e=>{ e.stopPropagation();
          if(s.degrees.includes(deg)) s.degrees=s.degrees.filter(d=>d!==deg); else s.degrees.push(deg);
          commit(); draw(); });
        piano.appendChild(k);
      }
      wrap.appendChild(piano);
      wrap.appendChild(el("div","pb-vis__note", node.params.scaleHz.length+" notes · "+PC[s.root]+" "+presetName(s.degrees)));
    }
    draw(); return wrap;
  }

  // ---- CHORDS editor: progression builder ---------------------------
  function chordsEditor(node){
    const wrap=el("div","pb-vis pb-vis--chords");
    node.vis=node.vis||{};
    let rows=node.vis.chords ||
      (node.params.chords&&node.params.chords.length ? node.params.chords.map(rowFromChord) : null) ||
      [{root:0,oct:3,quality:"maj",bars:2},{root:5,oct:3,quality:"maj",bars:2},
       {root:7,oct:3,quality:"maj",bars:2},{root:0,oct:3,quality:"maj",bars:2}];
    node.vis.chords=rows;
    const commit=()=>{ node.vis.chords=rows; set(node,"chords",genChords(rows)); };
    if(!node.params.chords||!node.params.chords.length) commit();

    function draw(){
      wrap.innerHTML="";
      const key=H(el("div","pb-vis__row"),"The key that progression presets are built from.");
      const keyRoot=node.vis.keyRoot==null?0:node.vis.keyRoot, keyMode=node.vis.keyMode||"major";
      key.appendChild(sel(PC.map((n,i)=>[i,n]), keyRoot, v=>{ node.vis.keyRoot=+v; }));
      key.appendChild(sel(["major","minor"], keyMode, v=>{ node.vis.keyMode=v; }));
      key.appendChild(presetSel("progression…", Object.keys(PROG_PRESETS), v=>{
        const dia=DIATONIC[node.vis.keyMode||"major"], kr=node.vis.keyRoot||0;
        rows=PROG_PRESETS[v].map(di=>({ root:(kr+dia.deg[di])%12, oct:3, quality:dia.qual[di], bars:2 }));
        commit(); draw(); }));
      const kl=el("span","pb-vis__lbl","key"); key.insertBefore(kl,key.firstChild);
      wrap.appendChild(key);

      rows.forEach((row,i)=>{
        const r=H(el("div","pb-vis__row pb-chordrow"),"Root note · chord quality · how many bars this chord lasts. ✕ removes it.");
        r.appendChild(sel(PC.map((n,j)=>[j,n]), row.root, v=>{ row.root=+v; commit(); draw(); }));
        r.appendChild(sel(Object.keys(CHORD_QUAL), row.quality, v=>{ row.quality=v; commit(); draw(); }));
        r.appendChild(sel([1,2,3,4].map(b=>[b,b+"b"]), row.bars||2, v=>{ row.bars=+v; commit(); }));
        r.appendChild(btn("✕",()=>{ rows.splice(i,1); commit(); draw(); },"pb-vis__x"));
        wrap.appendChild(r);
      });
      wrap.appendChild(btn("+ chord",()=>{ const last=rows[rows.length-1]||{root:0,oct:3};
        rows.push({root:last.root,oct:last.oct,quality:"maj",bars:2}); commit(); draw(); },"pb-vis__add"));
      const span=rows.reduce((a,r)=>a+(r.bars||2),0);
      wrap.appendChild(el("div","pb-vis__note", rows.length+" chords · "+span+" bars"+(span>8?" (8-bar section caps it)":"")));
    }
    draw(); return wrap;
  }

  // ---- MOTIF editor: step-sequencer grid ----------------------------
  const ROWS=8;
  function contour(name,n){
    const M=4, out=[];
    for(let i=0;i<n;i++){ const x=n>1?i/(n-1):0; let v;
      switch(name){
        case "ascending": v=x*M; break;
        case "descending": v=(1-x)*M; break;
        case "arch": v=(1-Math.abs(2*x-1))*M; break;
        case "valley": v=Math.abs(2*x-1)*M; break;
        case "zigzag": v=(i%2)?M*.75:0; break;
        case "random": v=Math.floor(Math.random()*(M+1)); break;
        default: v=x*M;
      }
      out.push(Math.max(0,Math.min(M,Math.round(v)))); }
    return out;
  }
  function motifEditor(node){
    const wrap=el("div","pb-vis pb-vis--motif");
    let m=(node.params.leadMotif&&node.params.leadMotif.length&&!Array.isArray(node.params.leadMotif[0]))
      ? node.params.leadMotif.slice() : [0,1,2,3,2,1,0,1];
    const commit=()=>set(node,"leadMotif",m.slice());
    function setLen(n){ const out=m.slice(0,n); while(out.length<n) out.push(out.length?out[out.length-1]:0); m=out; }

    function draw(){
      wrap.innerHTML="";
      const ctl=H(el("div","pb-vis__row"),"Motif length (steps), and the 16th-note rhythm used in busy (+) sections.");
      ctl.appendChild(el("span","pb-vis__lbl","len"));
      ctl.appendChild(sel([4,6,8,12,16].map(n=>[n,n+""]), m.length, v=>{ setLen(+v); commit(); draw(); }));
      ctl.appendChild(sel(["chunky","galloping","syncopated","flurry","driving"], node.params.busyRhythm||"chunky",
        v=>set(node,"busyRhythm",v)));
      wrap.appendChild(ctl);

      const grid=H(el("div","pb-seq"),"Each column is a step; click a cell to set that step's note. Row = chord-tone index (bottom = root).");
      for(let r=ROWS-1;r>=0;r--){
        const row=el("div","pb-seq__row");
        for(let c=0;c<m.length;c++){
          const on=m[c]===r, cell=el("div","pb-cell"+(on?" pb-cell--on":"")+(c%4===0?" pb-cell--beat":""));
          cell.addEventListener("click",e=>{ e.stopPropagation(); m[c]=r; commit(); draw(); });
          row.appendChild(cell);
        }
        grid.appendChild(row);
      }
      wrap.appendChild(grid);

      const con=H(el("div","pb-vis__row pb-vis__cons"),"Generate a melodic shape — overwrites the grid above.");
      ["ascending","arch","valley","zigzag","descending","random"].forEach(name=>
        con.appendChild(btn(name,()=>{ m=contour(name,m.length); commit(); draw(); })));
      wrap.appendChild(con);
      wrap.appendChild(el("div","pb-vis__note","cells = chord-tone index per step"));
    }
    draw(); return wrap;
  }

  // ---- ARRANGE editor: section chip builder -------------------------
  let dragI=-1;
  function arrangeEditor(node){
    const wrap=el("div","pb-vis pb-vis--arrange");
    let steps=(node.params.steps&&node.params.steps.length)?node.params.steps.slice():SECTIONS.slice();
    const commit=()=>set(node,"steps",steps.slice());
    const move=(a,b)=>{ if(a<0||b<0||a===b) return; const x=steps.splice(a,1)[0]; steps.splice(b,0,x); };

    function draw(){
      wrap.innerHTML="";
      wrap.appendChild(el("div","pb-vis__lbl","sequence (drag to reorder · click to remove)"));
      const seq=H(el("div","pb-chips pb-chips--seq"),"Your section order — each step lasts 8 bars. Drag chips to reorder, click one to remove it.");
      steps.forEach((s,i)=>{
        const c=el("div","pb-chip pb-chip--"+(s.replace("+","")) ,s); c.draggable=true; c.title="remove";
        c.addEventListener("click",e=>{ e.stopPropagation(); steps.splice(i,1); commit(); draw(); });
        c.addEventListener("dragstart",()=>dragI=i);
        c.addEventListener("dragover",e=>e.preventDefault());
        c.addEventListener("drop",e=>{ e.preventDefault(); move(dragI,i); commit(); draw(); });
        seq.appendChild(c);
      });
      if(!steps.length) seq.appendChild(el("span","pb-vis__note","(empty — add sections below)"));
      wrap.appendChild(seq);

      wrap.appendChild(el("div","pb-vis__lbl","add section"));
      const pal=H(el("div","pb-chips"),"Click a section to append it to the sequence. + variants are the busy versions.");
      SECTIONS.forEach(s=>{ const c=el("div","pb-chip pb-chip--add pb-chip--"+(s.replace("+","")),s);
        c.addEventListener("click",e=>{ e.stopPropagation(); steps.push(s); commit(); draw(); }); pal.appendChild(c); });
      wrap.appendChild(pal);

      const pre=el("div","pb-vis__row");
      pre.appendChild(presetSel("preset…", Object.keys(ARRANGE_PRESETS), v=>{ steps=ARRANGE_PRESETS[v].slice(); commit(); draw(); }));
      wrap.appendChild(pre);
    }
    draw(); return wrap;
  }

  const EDITORS={ scale:scaleEditor, chords:chordsEditor, motif:motifEditor, arrange:arrangeEditor };
  PB.visual={ has:t=>!!EDITORS[t], build:n=>EDITORS[n.type](n) };
})();
